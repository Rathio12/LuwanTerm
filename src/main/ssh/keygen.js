'use strict';

const { generateKeyPairSync, parseKey } = require('ssh2').utils;
const { fingerprintOf } = require('./fingerprint');
const ppk = require('./ppk');
const { encodePrivateKey } = require('./openssh-key');

const CIPHER = 'aes256-ctr';
const GENERATE_ATTEMPTS = 8;

/** Key types this app can create, with the bit sizes each one accepts. */
const KEY_TYPES = {
  ed25519: { label: 'Ed25519', bits: null },
  ecdsa: { label: 'ECDSA', bits: [256, 384, 521], defaultBits: 256 },
  rsa: { label: 'RSA', bits: [2048, 3072, 4096], defaultBits: 4096 },
};

/** Thrown when a private key is encrypted and the passphrase is missing or wrong. */
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

/**
 * Reads a private key, returning its public half and fingerprint.
 * @throws {PassphraseError} when the key is encrypted and cannot be opened
 */
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

  // parseKey yields an array for formats that can hold several keys.
  return describe(Array.isArray(parsed) ? parsed[0] : parsed);
}

/** PuTTY files carry the same information in a different container. */
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

/**
 * Prepares stored key material for ssh2.
 *
 * PuTTY files are decoded in memory only - the file itself is never rewritten,
 * and its passphrase is consumed here rather than being handed to ssh2.
 *
 * @returns {{privateKey: string|Buffer, passphrase: string|undefined}}
 */
function loadForAuth(contents, passphrase) {
  if (!ppk.looksLikePpk(contents)) {
    return { privateKey: contents, passphrase: passphrase || undefined };
  }
  return { privateKey: encodePrivateKey(ppk.parse(contents, passphrase)), passphrase: undefined };
}

/**
 * Creates a new key pair in OpenSSH format.
 * @param {{type: string, bits?: number, comment?: string, passphrase?: string}} options
 */
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

  // ssh2 1.17 strips a leading zero byte from Ed25519 public keys, so roughly
  // one generated key in 256 comes back 31 bytes long and cannot be parsed -
  // by ssh2 or anything else. Verify what we produced and discard a bad draw.
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
