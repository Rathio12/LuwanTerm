'use strict';

const net = require('net');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { serveSocks5 } = require(path.join(__dirname, '..', 'src', 'main', 'ssh', 'socks5'));

suite('socks5');

/**
 * Runs one client exchange against the SOCKS5 handler.
 *
 * @param {Buffer[]} writes what the client sends, in order, one per tick
 * @param {(host: string, port: number) => Promise<import('stream').Duplex>} connect
 */
function exchange(writes, connect) {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => serveSocks5(socket, connect));
    server.listen(0, '127.0.0.1', () => {
      const client = net.connect(server.address().port, '127.0.0.1');
      const received = [];

      client.on('data', (chunk) => received.push(chunk));
      client.on('connect', () => {
        let index = 0;
        const pump = () => {
          if (index >= writes.length) return;
          client.write(writes[index]);
          index += 1;
          setTimeout(pump, 60);
        };
        pump();
      });

      setTimeout(() => {
        client.destroy();
        server.close();
        resolve(Buffer.concat(received));
      }, 500);
    });
  });
}

/** A stand-in for a forwarded SSH channel that echoes what it receives. */
function echoTarget() {
  const { PassThrough } = require('stream');
  const stream = new PassThrough();
  return stream;
}

(async () => {
  const greeting = Buffer.from([0x05, 0x01, 0x00]);

  {
    const reply = await exchange([greeting], async () => echoTarget());
    check('it offers the no-auth method', reply.length >= 2 && reply[0] === 0x05 && reply[1] === 0x00, reply.toString('hex'));
  }

  {
    let asked = null;
    const request = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x01, 93, 184, 216, 34]),
      Buffer.from([0x01, 0xbb]),
    ]);
    const reply = await exchange([greeting, request], async (host, port) => {
      asked = `${host}:${port}`;
      return echoTarget();
    });
    check('an IPv4 CONNECT is parsed', asked === '93.184.216.34:443', String(asked));
    check('it succeeds', reply.length >= 4 && reply[2] === 0x05 && reply[3] === 0x00, reply.toString('hex'));
  }

  {
    let asked = null;
    const host = 'example.com';
    const request = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
      Buffer.from(host, 'ascii'),
      Buffer.from([0x00, 0x50]),
    ]);
    await exchange([greeting, request], async (h, p) => {
      asked = `${h}:${p}`;
      return echoTarget();
    });
    check('a hostname CONNECT is parsed', asked === 'example.com:80', String(asked));
  }

  {
    let asked = null;
    const request = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x04]),
      Buffer.from('20010db8000000000000000000000001', 'hex'),
      Buffer.from([0x1f, 0x90]),
    ]);
    await exchange([greeting, request], async (h, p) => {
      asked = `${h}:${p}`;
      return echoTarget();
    });
    check('an IPv6 CONNECT is parsed', asked !== null && asked.endsWith(':8080'), String(asked));
  }

  {
    // BIND is not implemented and must be refused rather than half-handled.
    const bind = Buffer.from([0x05, 0x02, 0x00, 0x01, 127, 0, 0, 1, 0x00, 0x50]);
    const reply = await exchange([greeting, bind], async () => echoTarget());
    check('an unsupported command is refused', reply.length >= 4 && reply[3] === 0x07, reply.toString('hex'));
  }

  {
    const request = Buffer.from([0x05, 0x01, 0x00, 0x01, 10, 0, 0, 1, 0x00, 0x16]);
    const reply = await exchange([greeting, request], async () => {
      throw new Error('refused');
    });
    check('a failed forward reports host unreachable', reply.length >= 4 && reply[3] === 0x04, reply.toString('hex'));
  }

  {
    // Split across packets: the parser must wait rather than misread a partial.
    const request = Buffer.from([0x05, 0x01, 0x00, 0x01, 8, 8, 8, 8, 0x00, 0x35]);
    let asked = null;
    await exchange(
      [greeting, request.subarray(0, 4), request.subarray(4, 7), request.subarray(7)],
      async (h, p) => {
        asked = `${h}:${p}`;
        return echoTarget();
      }
    );
    check('a request split across packets is reassembled', asked === '8.8.8.8:53', String(asked));
  }

  done();
})();
