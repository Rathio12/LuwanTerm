'use strict';

const crypto = require('crypto');
const { Session } = require('./session');
const hosts = require('../store/hosts');
const vault = require('../store/vault');
const keys = require('../store/keys');

const PROMPT_TIMEOUT_MS = 180000;

const secretKey = (hostId, kind) => `host:${hostId}:${kind}`;

/**
 * Owns every live session and is the only place that talks to the renderer
 * about SSH. Interactive prompts (passwords, host-key trust, 2FA challenges)
 * are round-tripped through the renderer as request/response pairs.
 */
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.prompts = new Map();
    this.target = null;
    /** @type {(() => void)|null} notified whenever the live session set changes */
    this.onChange = null;
  }

  /** @param {import('electron').WebContents} webContents */
  attach(webContents) {
    this.target = webContents;
  }

  send(channel, payload) {
    if (!this.target || this.target.isDestroyed()) return;
    this.target.send(channel, payload);
  }

  /** Sends a question to the renderer and waits for the user's answer. */
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

  /** Collects whatever secret the profile's auth mode needs before dialing. */
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

  async create({ hostId, size }) {
    const profile = hosts.get(hostId);
    if (!profile) throw new Error('Host profile no longer exists.');

    let credentials = await this.resolveCredentials(profile);
    const id = `sess_${crypto.randomBytes(6).toString('hex')}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const session = new Session(id, profile, this.handlers());
      session.on('event', (event) => this.dispatch(event));

      try {
        const info = await session.start(credentials, size);
        this.sessions.set(id, session);
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

  /**
   * Appends a managed public key to the remote account's authorized_keys,
   * creating ~/.ssh with the permissions sshd insists on.
   */
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
