'use strict';

const crypto = require('crypto');
const { Session } = require('./session');
const { SshConnection } = require('./connection');
const hosts = require('../store/hosts');
const vault = require('../store/vault');
const keys = require('../store/keys');
const policy = require('../policy');
const audit = require('../audit');

const PROMPT_TIMEOUT_MS = 180000;

const secretKey = (hostId, kind) => `host:${hostId}:${kind}`;

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.prompts = new Map();
    this.target = null;

    this.onChange = null;
  }

  attach(webContents) {
    this.target = webContents;
  }

  send(channel, payload) {
    if (!this.target || this.target.isDestroyed()) return;
    this.target.send(channel, payload);
  }

  ask(payload) {
    if (!this.target || this.target.isDestroyed()) {
      return Promise.reject(new Error('No window available to prompt in.'));
    }
    const requestId = `p_${crypto.randomBytes(6).toString('hex')}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.prompts.delete(requestId);
        reject(new Error('Prompt timed out.'));
      }, PROMPT_TIMEOUT_MS);

      this.prompts.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          this.prompts.delete(requestId);
          resolve(value);
        },
      });
      this.send('ssh:prompt', { requestId, ...payload });
    });
  }

  answerPrompt(requestId, value) {
    const pending = this.prompts.get(requestId);
    if (!pending) return false;
    pending.resolve(value);
    return true;
  }

  handlers() {
    return {
      confirmHostKey: (info) => this.ask({ kind: 'hostkey', ...info }).then(Boolean),
      requestAnswers: (info) =>
        this.ask({ kind: 'keyboard', ...info }).then((answers) =>
          Array.isArray(answers) ? answers : null
        ),
    };
  }

  askSecret(profile, secretKind, extra = {}) {
    return this.ask({
      kind: 'secret',
      secretKind,
      hostName: profile.name,
      username: profile.username,
      host: profile.host,
      canSave: vault.available(),
      ...extra,
    });
  }

  async resolveCredentials(profile) {
    if (profile.auth === 'agent') return {};
    if (profile.auth === 'key') return this.resolveKeyCredentials(profile);

    const stored = vault.get(secretKey(profile.id, 'password'));
    if (stored) return { password: stored, fromVault: true };

    const answer = await this.askSecret(profile, 'password');
    if (!answer || !answer.value) throw new Error('Connection cancelled.');
    return { password: answer.value, save: Boolean(answer.save) };
  }

  async resolveKeyCredentials(profile) {

    if (!profile.keyId) {
      const stored = vault.get(secretKey(profile.id, 'passphrase'));
      return stored ? { passphrase: stored, fromVault: true } : {};
    }

    const meta = keys.get(profile.keyId);
    if (!meta) throw new Error('The key this host uses is no longer in the key store.');

    const credentials = { privateKey: keys.privateKey(profile.keyId) };
    if (!meta.encrypted) return credentials;

    const stored = keys.passphrase(profile.keyId);
    if (stored) return { ...credentials, passphrase: stored, fromVault: true };

    const answer = await this.askSecret(profile, 'passphrase', { keyName: meta.name });
    if (!answer || !answer.value) throw new Error('Connection cancelled.');
    return {
      ...credentials,
      passphrase: answer.value,
      save: Boolean(answer.save),
      secretSlot: `key:${profile.keyId}:passphrase`,
    };
  }

  resolveJumpProfile(value, target) {
    const saved = hosts.get(value);
    if (saved) return saved;

    const match = /^(?:([^@]+)@)?([^:]+)(?::(\d+))?$/.exec(String(value).trim());
    if (!match) throw new Error(`"${value}" is not a usable jump host.`);

    const port = Number.parseInt(match[3], 10);
    return {
      id: `jump:${value}`,
      name: value,
      host: match[2],
      port: Number.isInteger(port) ? port : 22,
      username: match[1] || target.username,
      auth: 'agent',
      keepaliveSeconds: 30,
    };
  }

  async openJump(profile) {
    const jumpProfile = this.resolveJumpProfile(profile.jumpHost, profile);
    const credentials = await this.resolveCredentials(jumpProfile);

    const connection = new SshConnection(jumpProfile, this.handlers());
    try {
      await connection.connect(credentials);
    } catch (err) {
      throw new Error(`Jump host ${jumpProfile.name}: ${err.message}`);
    }

    const sock = await new Promise((resolve, reject) => {
      connection.client.forwardOut('127.0.0.1', 0, profile.host, profile.port, (err, stream) => {
        if (err) reject(new Error(`Jump host could not reach ${profile.host}:${profile.port} - ${err.message}`));
        else resolve(stream);
      });
    }).catch((err) => {
      connection.end();
      throw err;
    });

    return { connection, sock };
  }

  async create({ hostId, size }) {
    const profile = hosts.get(hostId);
    if (!profile) throw new Error('Host profile no longer exists.');

    const verdict = await policy.checkHost(profile.host);
    if (!verdict.allowed) {
      audit.record('connect.refused', {
        host: profile.host,
        port: profile.port,
        reason: verdict.reason,
        resolved: verdict.addresses || [],
      });
      throw new Error(`Connecting to ${profile.host} is not permitted by policy - ${verdict.reason}.`);
    }

    let credentials = await this.resolveCredentials(profile);
    const id = `sess_${crypto.randomBytes(6).toString('hex')}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const session = new Session(id, profile, this.handlers());
      session.on('event', (event) => this.dispatch(event));

      try {
        let sock = null;
        if (profile.jumpHost) {
          const jump = await this.openJump(profile);
          session.useJump(jump.connection);
          sock = jump.sock;
        }

        const info = await session.start(credentials, size, sock);
        this.sessions.set(id, session);
        audit.record('session.open', {
          sessionId: id,
          host: profile.host,
          port: profile.port,
          username: profile.username,
          auth: profile.auth,
          jumpHost: profile.jumpHost || '',
        });
        this.persistSecret(profile, credentials);
        this.notifyChange();
        return info;
      } catch (err) {
        session.dispose();
        const needsPassphrase =
          attempt === 0 && profile.auth === 'key' && /passphrase/i.test(err.message);
        if (!needsPassphrase) throw err;

        const answer = await this.askSecret(profile, 'passphrase');
        if (!answer || !answer.value) throw new Error('Connection cancelled.');
        credentials = {
          ...credentials,
          passphrase: answer.value,
          save: Boolean(answer.save),
          fromVault: false,
          secretSlot: profile.keyId ? `key:${profile.keyId}:passphrase` : undefined,
        };
      }
    }

    throw new Error('Authentication failed.');
  }

  persistSecret(profile, credentials) {
    if (!credentials.save || credentials.fromVault) return;
    const kind = credentials.passphrase ? 'passphrase' : 'password';
    vault.set(credentials.secretSlot || secretKey(profile.id, kind), credentials[kind]);
  }

  async deployKey(sessionId, keyId) {
    const session = this.get(sessionId);
    const meta = keys.get(keyId);
    if (!meta) throw new Error('That key is no longer in the key store.');
    if (!meta.publicKey) {
      throw new Error(
        `The public half of "${meta.name}" is not known. Unlock the key or place its .pub file beside it, then try again.`
      );
    }

    const quoted = `'${meta.publicKey.replace(/'/g, "'\\''")}'`;
    const script = [
      'set -e',
      'mkdir -p ~/.ssh',
      'chmod 700 ~/.ssh',
      'touch ~/.ssh/authorized_keys',
      'chmod 600 ~/.ssh/authorized_keys',
      `if grep -qxF ${quoted} ~/.ssh/authorized_keys; then`,
      '  echo LUWAN_ALREADY',
      'else',
      `  printf '%s\\n' ${quoted} >> ~/.ssh/authorized_keys`,
      '  echo LUWAN_ADDED',
      'fi',
    ].join('\n');

    const result = await session.exec(script);
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || `The remote shell exited with code ${result.code}.`);
    }

    return {
      added: result.stdout.includes('LUWAN_ADDED'),
      account: `${session.profile.username}@${session.profile.host}`,
      keyName: meta.name,
    };
  }

  startIdleSweep(everyMs = 30000) {
    clearInterval(this.idleTimer);
    if (!policy.idleTimeoutMs()) return;

    this.idleTimer = setInterval(() => this.dropIdleSessions(), everyMs);
    if (this.idleTimer.unref) this.idleTimer.unref();
  }

  stopIdleSweep() {
    clearInterval(this.idleTimer);
    this.idleTimer = null;
  }

  dropIdleSessions(now = Date.now()) {
    const limit = policy.idleTimeoutMs();
    if (!limit) return 0;

    let dropped = 0;
    for (const [id, session] of [...this.sessions]) {
      if (typeof session.idleFor !== 'function') continue;
      const idle = now - (session.lastActivity || now);
      if (idle < limit) continue;

      audit.record('session.idle-timeout', {
        sessionId: id,
        host: session.profile ? session.profile.host : '',
        idleSeconds: Math.round(idle / 1000),
      });
      dropped += 1;
      try {
        this.close(id);
      } catch {
        this.sessions.delete(id);
      }
    }
    return dropped;
  }

  notifyChange() {
    if (!this.onChange) return;
    try {
      this.onChange();
    } catch (err) {
      console.error('[manager] session change hook failed:', err.message);
    }
  }

  dispatch(event) {
    if (event.type === 'disposed') {
      const closing = this.sessions.get(event.sessionId);
      audit.record('session.close', {
        sessionId: event.sessionId,
        host: closing && closing.profile ? closing.profile.host : '',
      });
      this.sessions.delete(event.sessionId);
      this.send('ssh:event', { type: 'status', sessionId: event.sessionId, status: 'closed' });
      this.notifyChange();
      return;
    }
    this.send('ssh:event', event);
  }

  get(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('That session is no longer connected.');
    return session;
  }

  list() {
    return [...this.sessions.values()].map((session) => session.describe());
  }

  async close(id) {
    const session = this.sessions.get(id);
    if (!session) return false;
    await session.close();
    this.sessions.delete(id);
    this.notifyChange();
    return true;
  }

  closeAll() {
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
    for (const pending of this.prompts.values()) pending.resolve(null);
    this.prompts.clear();
  }
}

module.exports = { SessionManager, secretKey };
