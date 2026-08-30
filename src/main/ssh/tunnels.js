'use strict';

const net = require('net');
const crypto = require('crypto');
const { serveSocks5 } = require('./socks5');

const TYPES = ['local', 'remote', 'dynamic'];

function validPort(value, { allowZero = false } = {}) {
  const port = Number.parseInt(value, 10);
  const min = allowZero ? 0 : 1;
  return Number.isInteger(port) && port >= min && port <= 65535 ? port : null;
}

function normalize(config) {
  const type = TYPES.includes(config.type) ? config.type : null;
  if (!type) throw new Error('Unknown tunnel type.');

  const localHost = String(config.localHost || '127.0.0.1').trim() || '127.0.0.1';
  const localPort = validPort(config.localPort, { allowZero: type !== 'remote' });
  if (localPort === null) throw new Error('Local port must be between 1 and 65535.');

  const record = { type, localHost, localPort };

  if (type === 'dynamic') return record;

  const remoteHost = String(config.remoteHost || '').trim();
  const remotePort = validPort(config.remotePort);
  if (type === 'local') {
    if (!remoteHost) throw new Error('Destination host is required.');
    if (remotePort === null) throw new Error('Destination port must be between 1 and 65535.');
  }
  // For -R the "remote" pair is what the server binds and local* is the target.
  if (type === 'remote' && remotePort === null) {
    throw new Error('Remote bind port must be between 1 and 65535.');
  }

  return { ...record, remoteHost: remoteHost || '127.0.0.1', remotePort };
}

/**
 * Port forwarding for one SSH connection.
 *
 * - `local`   : listen locally, forward each connection out through the server (`-L`)
 * - `remote`  : ask the server to listen, forward what arrives back here (`-R`)
 * - `dynamic` : listen locally as a SOCKS5 proxy (`-D`)
 */
class TunnelManager {
  /**
   * @param {import('ssh2').Client} client
   * @param {(event: string, payload: object) => void} emit
   */
  constructor(client, emit) {
    this.client = client;
    this.emit = emit;
    this.tunnels = new Map();

    // One shared listener dispatches every server-initiated channel by bound port.
    this.client.on('tcp connection', (info, accept, reject) => {
      const tunnel = [...this.tunnels.values()].find(
        (t) => t.type === 'remote' && t.boundPort === info.destPort
      );
      if (!tunnel) {
        reject();
        return;
      }
      this.pipeToLocal(tunnel, accept());
    });
  }

  list() {
    return [...this.tunnels.values()].map((tunnel) => ({
      id: tunnel.id,
      type: tunnel.type,
      localHost: tunnel.localHost,
      localPort: tunnel.boundLocalPort ?? tunnel.localPort,
      remoteHost: tunnel.remoteHost,
      remotePort: tunnel.boundPort ?? tunnel.remotePort,
      connections: tunnel.connections,
      openedAt: tunnel.openedAt,
    }));
  }

  async open(config) {
    const normalized = normalize(config);
    const tunnel = {
      ...normalized,
      id: `t_${crypto.randomBytes(5).toString('hex')}`,
      connections: 0,
      openedAt: Date.now(),
      server: null,
      boundPort: null,
      boundLocalPort: null,
    };

    if (tunnel.type === 'remote') await this.openRemote(tunnel);
    else await this.openListener(tunnel);

    this.tunnels.set(tunnel.id, tunnel);
    return this.describe(tunnel);
  }

  describe(tunnel) {
    return this.list().find((t) => t.id === tunnel.id);
  }

  /** Local and dynamic forwards both need a local TCP listener. */
  openListener(tunnel) {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        tunnel.connections += 1;
        this.emit('tunnel:activity', { id: tunnel.id, connections: tunnel.connections });
        socket.on('close', () => {
          tunnel.connections = Math.max(0, tunnel.connections - 1);
          this.emit('tunnel:activity', { id: tunnel.id, connections: tunnel.connections });
        });

        if (tunnel.type === 'dynamic') {
          serveSocks5(socket, (host, port) => this.forwardOut(socket, host, port));
          return;
        }

        this.forwardOut(socket, tunnel.remoteHost, tunnel.remotePort)
          .then((stream) => {
            socket.pipe(stream).pipe(socket);
            stream.on('error', () => socket.destroy());
            stream.on('close', () => socket.destroy());
          })
          .catch(() => socket.destroy());
      });

      server.on('error', (err) => {
        server.close();
        reject(
          new Error(
            err.code === 'EADDRINUSE'
              ? `Local port ${tunnel.localPort} is already in use.`
              : `Could not listen on ${tunnel.localHost}:${tunnel.localPort} - ${err.message}`
          )
        );
      });

      server.listen(tunnel.localPort, tunnel.localHost, () => {
        tunnel.server = server;
        tunnel.boundLocalPort = server.address().port;
        server.removeAllListeners('error');
        server.on('error', (err) => this.emit('tunnel:error', { id: tunnel.id, message: err.message }));
        resolve();
      });
    });
  }

  openRemote(tunnel) {
    return new Promise((resolve, reject) => {
      this.client.forwardIn(tunnel.remoteHost, tunnel.remotePort, (err, boundPort) => {
        if (err) {
          reject(new Error(`Server refused the remote forward: ${err.message}`));
          return;
        }
        tunnel.boundPort = boundPort || tunnel.remotePort;
        resolve();
      });
    });
  }

  /** Bridges an incoming server channel to the configured local target. */
  pipeToLocal(tunnel, channel) {
    tunnel.connections += 1;
    this.emit('tunnel:activity', { id: tunnel.id, connections: tunnel.connections });

    const socket = net.connect(tunnel.localPort, tunnel.localHost, () => {
      channel.pipe(socket).pipe(channel);
    });

    const teardown = () => {
      tunnel.connections = Math.max(0, tunnel.connections - 1);
      this.emit('tunnel:activity', { id: tunnel.id, connections: tunnel.connections });
      socket.destroy();
      channel.destroy();
    };

    socket.once('error', teardown);
    socket.once('close', teardown);
    channel.once('error', teardown);
  }

  forwardOut(socket, host, port) {
    return new Promise((resolve, reject) => {
      const srcPort = socket.remotePort || 0;
      this.client.forwardOut('127.0.0.1', srcPort, host, port, (err, stream) => {
        if (err) reject(err);
        else resolve(stream);
      });
    });
  }

  async close(id) {
    const tunnel = this.tunnels.get(id);
    if (!tunnel) return false;
    this.tunnels.delete(id);

    if (tunnel.server) {
      await new Promise((resolve) => tunnel.server.close(resolve));
    } else if (tunnel.type === 'remote') {
      await new Promise((resolve) => {
        try {
          this.client.unforwardIn(tunnel.remoteHost, tunnel.boundPort, () => resolve());
        } catch {
          resolve();
        }
      });
    }
    return true;
  }

  async closeAll() {
    await Promise.all([...this.tunnels.keys()].map((id) => this.close(id).catch(() => {})));
  }
}

module.exports = { TunnelManager };
