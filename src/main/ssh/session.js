'use strict';

const { EventEmitter } = require('events');
const { SshConnection } = require('./connection');
const { SftpClient } = require('./sftp');
const { TunnelManager } = require('./tunnels');
const { SessionLog } = require('./session-log');
const settings = require('../store/settings');
const paths = require('../paths');

const TERM_NAME = 'xterm-256color';

class Session extends EventEmitter {
  constructor(id, profile, handlers) {
    super();
    this.id = id;
    this.profile = profile;
    this.status = 'connecting';
    this.lastActivity = Date.now();
    this.connection = new SshConnection(profile, handlers);

    this.jump = null;

    this.log = null;
    this.stream = null;
    this.sftp = null;
    this.tunnels = null;
    this.startedAt = Date.now();
  }

  emitEvent(type, payload = {}) {
    this.emit('event', { type, sessionId: this.id, ...payload });
  }

  setStatus(status, detail) {
    if (this.status === status) return;
    this.status = status;
    this.emitEvent('status', { status, detail });
  }

  openLog() {
    const current = settings.get();
    if (!current.sessionLogging) return;

    try {
      this.log = new SessionLog(paths.logsDir(), this.profile, {
        keepAnsi: current.sessionLogKeepAnsi,
      });
      this.emitEvent('logging', { file: this.log.file });
    } catch (err) {
      console.error('[session] logging unavailable:', err.message);
      this.log = null;
    }
  }

  useJump(connection) {
    this.jump = connection;
  }

  async start(credentials, size = {}, sock = null) {
    this.connection.on('banner', (message) => this.emitEvent('banner', { message }));
    this.connection.on('error', (err) => {
      this.setStatus('error', err.message);
      this.dispose();
    });
    this.connection.on('close', () => {
      this.setStatus('closed', 'Connection closed.');
      this.dispose();
    });

    await this.connection.connect(credentials, sock);

    this.sftp = new SftpClient(this.connection.client);
    this.tunnels = new TunnelManager(this.connection.client, (type, payload) =>
      this.emitEvent(type, payload)
    );

    this.openLog();
    await this.openShell(size);
    this.setStatus('ready');

    if (this.profile.initialCommand) {
      this.write(`${this.profile.initialCommand}\n`);
    }
    return this.describe();
  }

  openShell({ cols = 80, rows = 24 } = {}) {
    return new Promise((resolve, reject) => {
      this.connection.client.shell({ term: TERM_NAME, cols, rows }, (err, stream) => {
        if (err) {
          reject(new Error(`Could not open a shell: ${err.message}`));
          return;
        }
        this.stream = stream;
        stream.on('data', (chunk) => {
          this.touch();
          this.emitEvent('data', { chunk });
          if (this.log) this.log.write(chunk);
        });
        stream.stderr.on('data', (chunk) => {
          this.emitEvent('data', { chunk });
          if (this.log) this.log.write(chunk);
        });
        stream.on('close', () => {
          this.stream = null;
          this.setStatus('closed', 'Shell session ended.');
          this.dispose();
        });
        resolve(stream);
      });
    });
  }

  exec(command) {
    return new Promise((resolve, reject) => {
      this.connection.client.exec(command, (err, stream) => {
        if (err) {
          reject(new Error(`Command could not be started: ${err.message}`));
          return;
        }
        let stdout = '';
        let stderr = '';
        stream.on('data', (chunk) => {
          stdout += chunk;
        });
        stream.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        stream.once('error', (streamErr) => reject(streamErr));
        stream.once('close', (code) => resolve({ code, stdout, stderr }));
      });
    });
  }

  write(data) {
    if (!this.stream) return false;
    this.touch();
    this.stream.write(data);
    return true;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  idleFor() {
    return Date.now() - (this.lastActivity || 0);
  }

  resize(cols, rows) {
    if (!this.stream) return false;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return false;
    this.stream.setWindow(rows, cols, 0, 0);
    return true;
  }

  describe() {
    return {
      id: this.id,
      hostId: this.profile.id,
      name: this.profile.name,
      host: this.profile.host,
      port: this.profile.port,
      username: this.profile.username,
      color: this.profile.color,
      defaultPath: this.profile.defaultPath,
      status: this.status,
      startedAt: this.startedAt,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    if (this.tunnels) this.tunnels.closeAll().catch(() => {});
    if (this.sftp) this.sftp.dispose();
    if (this.stream) {
      try {
        this.stream.end();
      } catch {  }
    }
    if (this.log) {
      this.log.close(this.status);
      this.log = null;
    }
    this.connection.end();
    if (this.jump) {
      try {
        this.jump.end();
      } catch {  }
      this.jump = null;
    }
    this.emitEvent('disposed');
  }

  async close() {
    this.setStatus('closed', 'Disconnected.');
    this.dispose();
    return true;
  }
}

module.exports = { Session };
