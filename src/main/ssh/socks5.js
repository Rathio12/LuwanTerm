'use strict';

/**
 * Minimal SOCKS5 server logic for dynamic port forwarding (`ssh -D`).
 * Supports the no-auth method and the CONNECT command, which is what
 * browsers and CLI tools use in practice.
 */

const VERSION = 0x05;
const CMD_CONNECT = 0x01;
const ATYP = { IPV4: 0x01, DOMAIN: 0x03, IPV6: 0x04 };
const REPLY = {
  SUCCESS: 0x00,
  GENERAL_FAILURE: 0x01,
  HOST_UNREACHABLE: 0x04,
  REFUSED: 0x05,
  CMD_UNSUPPORTED: 0x07,
  ATYP_UNSUPPORTED: 0x08,
};

function reply(socket, code) {
  // BND.ADDR/BND.PORT are advisory; 0.0.0.0:0 is accepted by every client.
  socket.write(Buffer.from([VERSION, code, 0x00, ATYP.IPV4, 0, 0, 0, 0, 0, 0]));
}

/** Parses a CONNECT request, returning null while more bytes are still needed. */
function parseRequest(buffer) {
  if (buffer.length < 5) return null;
  if (buffer[0] !== VERSION) throw new Error('bad-version');
  if (buffer[1] !== CMD_CONNECT) throw new Error('cmd-unsupported');

  const type = buffer[3];
  let host;
  let cursor;

  if (type === ATYP.IPV4) {
    if (buffer.length < 10) return null;
    host = Array.from(buffer.subarray(4, 8)).join('.');
    cursor = 8;
  } else if (type === ATYP.DOMAIN) {
    const length = buffer[4];
    if (buffer.length < 7 + length) return null;
    host = buffer.subarray(5, 5 + length).toString('utf8');
    cursor = 5 + length;
  } else if (type === ATYP.IPV6) {
    if (buffer.length < 22) return null;
    const parts = [];
    for (let i = 4; i < 20; i += 2) parts.push(buffer.readUInt16BE(i).toString(16));
    host = parts.join(':');
    cursor = 20;
  } else {
    throw new Error('atyp-unsupported');
  }

  return { host, port: buffer.readUInt16BE(cursor), consumed: cursor + 2 };
}

/**
 * Drives one client socket through the SOCKS5 exchange.
 * @param {import('net').Socket} socket
 * @param {(host: string, port: number) => Promise<import('stream').Duplex>} connect
 */
function serveSocks5(socket, connect) {
  let stage = 'greeting';
  let buffer = Buffer.alloc(0);

  const fail = (code) => {
    if (stage !== 'closed') reply(socket, code);
    stage = 'closed';
    socket.end();
  };

  socket.on('data', (chunk) => {
    if (stage !== 'greeting' && stage !== 'request') return;
    buffer = Buffer.concat([buffer, chunk]);

    if (stage === 'greeting') {
      if (buffer.length < 2) return;
      const methodCount = buffer[1];
      if (buffer.length < 2 + methodCount) return;
      if (buffer[0] !== VERSION) {
        stage = 'closed';
        socket.end();
        return;
      }
      buffer = buffer.subarray(2 + methodCount);
      socket.write(Buffer.from([VERSION, 0x00]));
      stage = 'request';
    }

    if (stage !== 'request') return;

    let request;
    try {
      request = parseRequest(buffer);
    } catch (err) {
      fail(err.message === 'cmd-unsupported' ? REPLY.CMD_UNSUPPORTED : REPLY.ATYP_UNSUPPORTED);
      return;
    }
    if (!request) return;

    const rest = buffer.subarray(request.consumed);
    buffer = Buffer.alloc(0);
    stage = 'connecting';
    socket.pause();

    connect(request.host, request.port)
      .then((stream) => {
        if (socket.destroyed) {
          stream.destroy();
          return;
        }
        stage = 'piping';
        reply(socket, REPLY.SUCCESS);
        if (rest.length) stream.write(rest);
        socket.resume();
        socket.pipe(stream).pipe(socket);
        stream.on('error', () => socket.destroy());
        socket.on('error', () => stream.destroy());
        stream.on('close', () => socket.destroy());
      })
      .catch(() => fail(REPLY.HOST_UNREACHABLE));
  });

  socket.on('error', () => {
    stage = 'closed';
    socket.destroy();
  });
}

module.exports = { serveSocks5 };
