'use strict';

const crypto = require('crypto');
const { createHmac, createHash, createDecipheriv, timingSafeEqual } = crypto;
const { Reader, Writer } = require('./wire');

/**
 * Reader for PuTTY private key files (.ppk), versions 2 and 3, covering every
 * key type PuTTY writes and both encrypted and unencrypted files.
 *
 * The file on disk is never modified. To authenticate, the parsed key is
 * marshalled into an in-memory OpenSSH blob, which is the format ssh2 speaks.
 *
 * Format reference: PuTTY manual, appendix C.
 */

const MAC_KEY_SALT = 'putty-private-key-file-mac-key';
const AES_BLOCK = 16;

class PpkError extends Error {
  constructor(message, { needsPassphrase = false, wrongPassphrase = false } = {}) {
    super(message);
    this.name = 'PpkError';
    this.needsPassphrase = needsPassphrase;
    this.wrongPassphrase = wrongPassphrase;
  }
}

/** Cheap sniff so callers can route a file to this parser. */
function looksLikePpk(text) {
  return /^PuTTY-User-Key-File-\d+\s*:/.test(String(text).trimStart());
}

/** Splits the file into headers plus the two base64 blobs. */
function readFields(text) {
  const lines = String(text).split(/\r?\n/);
  const headers = new Map();
  const blobs = {};
  let version = null;
  let algorithm = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    index += 1;
    if (!line.trim()) continue;

    const match = /^([A-Za-z0-9-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, name, value] = match;

    const versionMatch = /^PuTTY-User-Key-File-(\d+)$/.exec(name);
    if (versionMatch) {
      version = Number.parseInt(versionMatch[1], 10);
      algorithm = value.trim();
      continue;
    }

    if (name === 'Public-Lines' || name === 'Private-Lines') {
      const count = Number.parseInt(value, 10);
      if (!Number.isInteger(count) || count < 0) {
        throw new PpkError(`Malformed ${name} count in the PPK file.`);
      }
      const body = lines.slice(index, index + count).join('');
      index += count;
      blobs[name === 'Public-Lines' ? 'public' : 'private'] = Buffer.from(body, 'base64');
      continue;
    }

    headers.set(name, value);
  }

  if (version === null) throw new PpkError('This does not look like a PuTTY key file.');
  if (version !== 2 && version !== 3) {
    throw new PpkError(`PPK version ${version} is not supported.`);
  }
  if (!blobs.public || !blobs.private) {
    throw new PpkError('The PPK file is missing its key data.');
  }

  return { version, algorithm, headers, blobs };
}

/** PPK v2: SHA-1 based key schedule, all-zero IV. */
function deriveV2(passphrase) {
  const parts = [0, 1].map((sequence) => {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(sequence, 0);
    return createHash('sha1').update(counter).update(passphrase, 'utf8').digest();
  });

  return {
    cipherKey: Buffer.concat(parts).subarray(0, 32),
    iv: Buffer.alloc(AES_BLOCK),
    macKey: createHash('sha1').update(MAC_KEY_SALT).update(passphrase, 'utf8').digest(),
  };
}

/** PPK v3: one Argon2 run yields cipher key, IV and MAC key back to back. */
function deriveV3(passphrase, headers) {
  const flavour = String(headers.get('Key-Derivation') || 'Argon2id').toLowerCase();
  if (!['argon2i', 'argon2d', 'argon2id'].includes(flavour)) {
    throw new PpkError(`Unsupported PPK key derivation "${flavour}".`);
  }

  const number = (name) => {
    const value = Number.parseInt(headers.get(name), 10);
    if (!Number.isInteger(value) || value <= 0) {
      throw new PpkError(`The PPK file has a bad ${name} value.`);
    }
    return value;
  };

  const salt = Buffer.from(String(headers.get('Argon2-Salt') || ''), 'hex');
  if (!salt.length) throw new PpkError('The PPK file has no Argon2 salt.');

  if (typeof crypto.argon2Sync !== 'function') {
    throw new PpkError(
      'Encrypted PPK version 3 files need Argon2, which requires Node 24 or newer. ' +
        'Unencrypted files and version 2 files still work.'
    );
  }

  const tag = Buffer.from(
    crypto.argon2Sync(flavour, {
      message: Buffer.from(passphrase, 'utf8'),
      nonce: salt,
      parallelism: number('Argon2-Parallelism'),
      memory: number('Argon2-Memory'),
      passes: number('Argon2-Passes'),
      tagLength: 80,
    })
  );

  return {
    cipherKey: tag.subarray(0, 32),
    iv: tag.subarray(32, 48),
    macKey: tag.subarray(48, 80),
  };
}

/**
 * Parses a PPK file.
 * @param {string} text file contents
 * @param {string} [passphrase]
 * @returns {{algorithm: string, comment: string, publicBlob: Buffer, privateBlob: Buffer, version: number, encrypted: boolean}}
 */
function parse(text, passphrase = '') {
  const { version, algorithm, headers, blobs } = readFields(text);
  const encryption = (headers.get('Encryption') || 'none').trim();
  const comment = headers.get('Comment') || '';
  const encrypted = encryption !== 'none';

  if (encrypted && encryption !== 'aes256-cbc') {
    throw new PpkError(`Unsupported PPK encryption "${encryption}".`);
  }
  if (encrypted && !passphrase) {
    throw new PpkError('This PuTTY key is encrypted. Enter its passphrase.', {
      needsPassphrase: true,
    });
  }

  let material;
  if (!encrypted && version === 3) {
    material = { cipherKey: null, iv: null, macKey: Buffer.alloc(0) };
  } else if (version === 3) {
    material = deriveV3(passphrase, headers);
  } else {
    material = deriveV2(encrypted ? passphrase : '');
  }

  let privateBlob = blobs.private;
  if (encrypted) {
    if (privateBlob.length % AES_BLOCK !== 0) {
      throw new PpkError('The encrypted section of this PPK file is truncated.');
    }
    const decipher = createDecipheriv('aes-256-cbc', material.cipherKey, material.iv);
    decipher.setAutoPadding(false);
    privateBlob = Buffer.concat([decipher.update(privateBlob), decipher.final()]);
  }

  const preimage = new Writer()
    .string(algorithm)
    .string(encryption)
    .string(comment)
    .string(blobs.public)
    .string(privateBlob)
    .done();

  const expected = Buffer.from(String(headers.get('Private-MAC') || '').trim(), 'hex');
  const actual = createHmac(version === 3 ? 'sha256' : 'sha1', material.macKey)
    .update(preimage)
    .digest();

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new PpkError(
      encrypted
        ? 'That passphrase does not open this PuTTY key.'
        : 'This PuTTY key failed its integrity check.',
      { needsPassphrase: encrypted, wrongPassphrase: encrypted }
    );
  }

  return { version, algorithm, comment, publicBlob: blobs.public, privateBlob, encrypted };
}

/**
 * Reads only the public half of a PPK. PuTTY stores the public blob in the
 * clear, so an encrypted key can still be identified without its passphrase.
 */
function readPublic(text) {
  const { version, algorithm, headers, blobs } = readFields(text);
  return {
    version,
    algorithm,
    comment: headers.get('Comment') || '',
    publicBlob: blobs.public,
    encrypted: (headers.get('Encryption') || 'none').trim() !== 'none',
  };
}

module.exports = { looksLikePpk, parse, readPublic, PpkError };
