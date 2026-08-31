'use strict';

const fs = require('fs');
const os = require('os');
const { EventEmitter } = require('events');
const { Client } = require('ssh2');

const { fingerprintOf, keyTypeOf } = require('./fingerprint');
const knownHosts = require('../store/known-hosts');
const keygen = require('./keygen');

const READY_TIMEOUT_MS = 20000;

function defaultAgent() {
  if (process.platform === 'win32') {
    return fs.existsSync('\\.\pipe\openssh-ssh-agent')
      ? '\\.\pipe\openssh-ssh-agent'
      : 'pageant';
  }
  return process.env.SSH_AUTH_SOCK || null;
}

function describeError(err) {
  const message = err && err.message ? err.message : String(err);
  switch (err && err.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'Host could not be resolved. Check the address.';
    case 'ECONNREFUSED':
      return 'Connection refused. Is the SSH service listening on that port?';
    case 'ETIMEDOUT':
      return 'Connection timed out.';
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return 'Host unreachable from this network.';
    default:
      break;
  }
  if (err && err.level === 'client-authentication') {
    return 'Authentication failed. Check the credentials or key for this host.';
  }
  if (/All configured authentication methods failed/i.test(message)) {
    return 'Authentication failed. Check the credentials or key for this host.';
  }
  if (/Timed out while waiting for handshake/i.test(message)) {
    return 'Timed out during the SSH handshake.';
  }
  return message;
}

class SshConnection extends EventEmitter {

  constructor(profile, handlers) {
    super();
    this.profile = profile;
    this.handlers = handlers;
    this.client = new Client();
    this.closed = false;
    this.rejectedHostKey = false;

    this.on('error', () => {});
  }

  buildAuth(credentials) {
    const auth = {};
    switch (this.profile.auth) {
      case 'key': {
        let material = credentials.privateKey;

        if (!material) {
          if (!this.profile.privateKeyPath) {
            throw new Error('This host uses key authentication but no key is selected.');
          }
          try {
            material = fs.readFileSync(this.profile.privateKeyPath, 'utf8');
          } catch (err) {
            throw new Error(`Private key could not be read: ${err.message}`);
          }
        }

        const prepared = keygen.loadForAuth(material, credentials.passphrase);
        auth.privateKey = prepared.privateKey;
        if (prepared.passphrase) auth.passphrase = prepared.passphrase;
        break;
      }
      case 'agent': {
        const agent = defaultAgent();
        if (!agent) throw new Error('No SSH agent was found on this machine.');
        auth.agent = agent;
        break;
      }
      default: {
        if (credentials.password) auth.password = credentials.password;
        break;
      }
    }
    return auth;
  }

  hostVerifier(keyBlob, callback) {
    const fingerprint = fingerprintOf(keyBlob);
    const keyType = keyTypeOf(keyBlob);
    const { host, port } = this.profile;
    const status = knownHosts.verify(host, port, fingerprint);

    if (status === 'trusted') {
      callback(true);
      return;
    }

    this.handlers
      .confirmHostKey({ host, port, fingerprint, keyType, status })
      .then((accepted) => {
        if (accepted) knownHosts.trust(host, port, fingerprint, keyType);
        else this.rejectedHostKey = true;
        callback(Boolean(accepted));
      })
      .catch((err) => {
        console.error('[ssh] host key prompt failed:', err.message);
        this.rejectedHostKey = true;
        callback(false);
      });
  }

  connect(credentials = {}, sock = null) {
    const auth = this.buildAuth(credentials);

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      this.client
        .on('ready', () => settle(resolve, this))
        .on('banner', (message) => this.emit('banner', message))
        .on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
          this.handlers
            .requestAnswers({ name, instructions, prompts: prompts.map((p) => p.prompt) })
            .then((answers) => finish(answers || []))
            .catch(() => finish([]));
        })
        .on('error', (err) => {
          const error = new Error(
            this.rejectedHostKey ? 'Host key was rejected, connection aborted.' : describeError(err)
          );
          settle(reject, error);
          if (!this.closed) this.emit('error', error);
        })
        .on('close', () => {
          if (this.closed) return;
          this.closed = true;
          this.emit('close');
          settle(reject, new Error('Connection closed before the session was ready.'));
        })
        .connect({
          host: this.profile.host,
          port: this.profile.port,
          username: this.profile.username,
          readyTimeout: READY_TIMEOUT_MS,
          keepaliveInterval: (this.profile.keepaliveSeconds || 0) * 1000,
          keepaliveCountMax: 3,
          tryKeyboard: true,
          hostVerifier: (keyBlob, cb) => this.hostVerifier(keyBlob, cb),
          ident: `LuwanTerm (${os.platform()})`,
          ...(sock ? { sock } : {}),
          ...auth,
        });
    });
  }

  end() {
    this.closed = true;
    try {
      this.client.end();
    } catch {  }
  }
}

module.exports = { SshConnection };
