'use strict';

const crypto = require('crypto');
const path = require('path');
const { generateKeyPairSync } = require('ssh2').utils;
const { Reader, Writer } = require(path.join(__dirname, '..', '..', 'src', 'main', 'ssh', 'wire'));

const MAC_SALT = 'putty-private-key-file-mac-key';

function decodeOpenSsh(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const buf = Buffer.from(body, 'base64');
  const reader = new Reader(buf);
  reader.offset = 15;
  reader.text();
  reader.text();
  reader.string();
  reader.uint32();

  const publicBlob = reader.string();
  const section = new Reader(reader.string());
  section.uint32();
  section.uint32();
  const algorithm = section.text();

  let privateBlob;
  if (algorithm === 'ssh-rsa') {
    const n = section.mpint();
    const e = section.mpint();
    const d = section.mpint();
    const iqmp = section.mpint();
    const p = section.mpint();
    const q = section.mpint();
    privateBlob = new Writer().mpint(d).mpint(p).mpint(q).mpint(iqmp).done();
  } else if (algorithm.startsWith('ecdsa-sha2-')) {
    section.string();
    section.string();
    privateBlob = new Writer().mpint(section.mpint()).done();
  } else if (algorithm === 'ssh-ed25519') {
    section.string();
    const secret = section.string();
    privateBlob = new Writer().string(secret.subarray(0, 32)).done();
  } else {
    throw new Error(`fixture builder does not handle ${algorithm}`);
  }

  return { algorithm, publicBlob, privateBlob };
}

function deriveV2(passphrase) {
  const halves = [0, 1].map((sequence) => {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(sequence, 0);
    return crypto.createHash('sha1').update(counter).update(passphrase, 'utf8').digest();
  });

  return {
    cipherKey: Buffer.concat(halves).subarray(0, 32),
    iv: Buffer.alloc(16),
    macKey: crypto.createHash('sha1').update(MAC_SALT).update(passphrase, 'utf8').digest(),
  };
}

function deriveV3(passphrase, salt, params) {
  const tag = Buffer.from(
    crypto.argon2Sync(params.flavour, {
      message: Buffer.from(passphrase, 'utf8'),
      nonce: salt,
      parallelism: params.parallelism,
      memory: params.memory,
      passes: params.passes,
      tagLength: 80,
    })
  );

  return {
    cipherKey: tag.subarray(0, 32),
    iv: tag.subarray(32, 48),
    macKey: tag.subarray(48, 80),
  };
}

const chunk = (text) => text.match(/.{1,64}/g) || [''];

function writePpk(spec) {
  const { version, algorithm, comment, publicBlob, privateBlob, passphrase = '' } = spec;
  const encrypted = Boolean(passphrase);
  const encryption = encrypted ? 'aes256-cbc' : 'none';

  let plain = privateBlob;
  if (encrypted) {
    const padding = (16 - (plain.length % 16)) % 16;
    plain = Buffer.concat([plain, crypto.randomBytes(padding)]);
  }

  const argon = { flavour: 'argon2id', memory: 8192, passes: 8, parallelism: 1 };
  const salt = crypto.randomBytes(16);

  let material;
  if (!encrypted && version === 3) material = { macKey: Buffer.alloc(0) };
  else if (version === 3) material = deriveV3(passphrase, salt, argon);
  else material = deriveV2(encrypted ? passphrase : '');

  let stored = plain;
  if (encrypted) {
    const cipher = crypto.createCipheriv('aes-256-cbc', material.cipherKey, material.iv);
    cipher.setAutoPadding(false);
    stored = Buffer.concat([cipher.update(plain), cipher.final()]);
  }

  const preimage = new Writer()
    .string(algorithm)
    .string(encryption)
    .string(comment)
    .string(publicBlob)
    .string(plain)
    .done();

  const mac = crypto
    .createHmac(version === 3 ? 'sha256' : 'sha1', material.macKey)
    .update(preimage)
    .digest('hex');

  const publicLines = chunk(publicBlob.toString('base64'));
  const privateLines = chunk(stored.toString('base64'));

  const lines = [
    `PuTTY-User-Key-File-${version}: ${algorithm}`,
    `Encryption: ${encryption}`,
    `Comment: ${comment}`,
    `Public-Lines: ${publicLines.length}`,
    ...publicLines,
  ];

  if (encrypted && version === 3) {
    lines.push(
      'Key-Derivation: Argon2id',
      `Argon2-Memory: ${argon.memory}`,
      `Argon2-Passes: ${argon.passes}`,
      `Argon2-Parallelism: ${argon.parallelism}`,
      `Argon2-Salt: ${salt.toString('hex')}`
    );
  }

  lines.push(`Private-Lines: ${privateLines.length}`, ...privateLines, `Private-MAC: ${mac}`);
  return lines.join('\r\n') + '\r\n';
}

const CANONICAL = {
  'ssh-ed25519': (parts) => parts.publicBlob.length === 51 && parts.privateBlob.length === 36,
};

function generateUsable(type, options, attempts = 8) {
  let last = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const pair = generateKeyPairSync(type, options);
    let parts;

    try {
      parts = decodeOpenSsh(pair.private);
    } catch (err) {
      last = err;
      continue;
    }

    const canonical = CANONICAL[parts.algorithm];
    if (!canonical || canonical(parts)) return { pair, parts };
    last = new Error(`the generator returned a ${parts.publicBlob.length}-byte public blob`);
  }

  throw last || new Error(`could not generate a usable ${type} key in ${attempts} attempts`);
}

const MAGIC = Buffer.from('openssh-key-v1' + String.fromCharCode(0), 'binary');

function mangleEd25519(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const reader = new Reader(Buffer.from(body, 'base64'));
  reader.offset = 15;

  const cipher = reader.text();
  const kdf = reader.text();
  const kdfOptions = reader.string();
  const count = reader.uint32();
  reader.string();
  const section = new Reader(reader.string());

  if (cipher !== 'none') throw new Error('mangleEd25519 only handles unencrypted keys');

  const checkA = section.uint32();
  const checkB = section.uint32();
  const algorithm = section.text();
  section.string();
  const secret = section.string();
  const comment = section.text();

  const seed = secret.subarray(0, 32);
  const short = secret.subarray(33);

  const inner = new Writer()
    .uint32(checkA)
    .uint32(checkB)
    .string(algorithm)
    .string(short)
    .string(Buffer.concat([seed, short]))
    .string(comment)
    .done();

  const padding = [];
  for (let i = 1; (inner.length + padding.length) % 8 !== 0; i += 1) padding.push(i);

  const out = new Writer()
    .raw(MAGIC)
    .string(cipher)
    .string(kdf)
    .string(kdfOptions)
    .uint32(count)
    .string(new Writer().string(algorithm).string(short).done())
    .string(Buffer.concat([inner, Buffer.from(padding)]))
    .done()
    .toString('base64');

  const lines = out.match(/.{1,70}/g) || [''];
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines.join('\n')}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

module.exports = { decodeOpenSsh, writePpk, generateUsable, mangleEd25519 };
