'use strict';

const { generateKeyPairSync, parseKey } = require('ssh2').utils;
const { fingerprintOf } = require('./fingerprint');
const ppk = require('./ppk');
const { encodePrivateKey } = require('./openssh-key');

const CIPHER = 'aes256-ctr';
const GENERATE_ATTEMPTS = 8;

const KEY_TYPES = {
  ed25519: { label: 'Ed25519', bits: null },
  ecdsa: { label: 'ECDSA', bits: [256, 384, 521], defaultBits: 256 },
  rsa: { label: 'RSA', bits: [2048, 3072, 4096], defaultBits: 4096 },
};

class PassphraseError extends Error {
  constructor(message, { wrong = false } = {}) {
    super(message);
    this.name = 'PassphraseError';
    this.needsPassphrase = true;
    this.wrongPassphrase = wrong;
  }
}

function describe(parsed) {
  const blob = parsed.getPublicSSH();
  const comment = parsed.comment || '';
  return {
    type: parsed.type,
    comment,
    publicKey: `${parsed.type} ${blob.toString('base64')}${comment ? ` ${comment}` : ''}`,
    fingerprint: fingerprintOf(blob),
  };
}

function inspect(privateKey, passphrase) {
  if (ppk.looksLikePpk(privateKey)) return inspectPpk(privateKey, passphrase);

  const parsed = parseKey(privateKey, passphrase || undefined);

  if (parsed instanceof Error) {
    if (/no passphrase given/i.test(parsed.message)) {
      throw new PassphraseError('This key is encrypted. Enter its passphrase to import it.');
    }
    if (/bad passphrase|integrity check/i.test(parsed.message)) {
      throw new PassphraseError('That passphrase does not open this key.', { wrong: true });
    }
    throw new Error(`Not a usable private key: ${parsed.message}`);
  }

  return describe(Array.isArray(parsed) ? parsed[0] : parsed);
}

function inspectPpk(contents, passphrase) {
  const parsed = ppk.parse(contents, passphrase);
  const comment = parsed.comment || '';
  return {
    type: parsed.algorithm,
    comment,
    publicKey: `${parsed.algorithm} ${parsed.publicBlob.toString('base64')}${comment ? ` ${comment}` : ''}`,
    fingerprint: fingerprintOf(parsed.publicBlob),
    format: `ppk-v${parsed.version}`,
  };
}

function loadForAuth(contents, passphrase) {
  if (!ppk.looksLikePpk(contents)) {
    return { privateKey: contents, passphrase: passphrase || undefined };
  }
  return { privateKey: encodePrivateKey(ppk.parse(contents, passphrase)), passphrase: undefined };
}

function generate({ type, bits, comment = '', passphrase = '' }) {
  const spec = KEY_TYPES[type];
  if (!spec) throw new Error(`Unsupported key type "${type}".`);

  const options = { comment: String(comment).trim() };

  if (spec.bits) {
    const size = Number.parseInt(bits, 10) || spec.defaultBits;
    if (!spec.bits.includes(size)) {
      throw new Error(`${spec.label} keys must be ${spec.bits.join(', ')} bits.`);
    }
    options.bits = size;
  }

  if (passphrase) {
    options.passphrase = passphrase;
    options.cipher = CIPHER;
  }

  for (let attempt = 1; attempt <= GENERATE_ATTEMPTS; attempt += 1) {
    const pair = generateKeyPairSync(type, options);
    try {
      return {
        privateKey: pair.private,
        encrypted: Boolean(passphrase),
        bits: options.bits || null,
        ...inspect(pair.private, passphrase),
      };
    } catch (err) {
      if (err.needsPassphrase || attempt === GENERATE_ATTEMPTS) throw err;
    }
  }

  throw new Error('Could not generate a usable key pair.');
}

module.exports = { KEY_TYPES, generate, inspect, loadForAuth, PassphraseError };
