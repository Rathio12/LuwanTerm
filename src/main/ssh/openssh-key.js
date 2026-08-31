'use strict';

const { randomBytes } = require('crypto');
const { Reader, Writer } = require('./wire');

const MAGIC = Buffer.from('openssh-key-v1\0', 'binary');
const BLOCK = 8;

function privateFields(algorithm, publicBlob, privateBlob) {
  const pub = new Reader(publicBlob);
  const priv = new Reader(privateBlob);
  const out = new Writer();

  const declared = pub.text();
  if (declared !== algorithm) {
    throw new Error(`Key blob says "${declared}" but the file says "${algorithm}".`);
  }

  if (algorithm === 'ssh-rsa') {
    const e = pub.mpint();
    const n = pub.mpint();
    const d = priv.mpint();
    const p = priv.mpint();
    const q = priv.mpint();
    const iqmp = priv.mpint();
    return out.string(algorithm).mpint(n).mpint(e).mpint(d).mpint(iqmp).mpint(p).mpint(q).done();
  }

  if (algorithm === 'ssh-dss') {
    const p = pub.mpint();
    const q = pub.mpint();
    const g = pub.mpint();
    const y = pub.mpint();
    const x = priv.mpint();
    return out.string(algorithm).mpint(p).mpint(q).mpint(g).mpint(y).mpint(x).done();
  }

  if (algorithm.startsWith('ecdsa-sha2-')) {
    const curve = pub.string();
    const point = pub.string();
    const scalar = priv.mpint();
    return out.string(algorithm).string(curve).string(point).mpint(scalar).done();
  }

  if (algorithm === 'ssh-ed25519') {
    const publicPart = pub.string();
    const seed = priv.string();
    if (publicPart.length !== 32 || seed.length !== 32) {
      throw new Error('Malformed Ed25519 key material.');
    }

    return out
      .string(algorithm)
      .string(publicPart)
      .string(Buffer.concat([seed, publicPart]))
      .done();
  }

  throw new Error(`Key type "${algorithm}" is not supported.`);
}

function wrapPem(body) {
  const base64 = body.toString('base64');
  const lines = base64.match(/.{1,70}/g) || [''];
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines.join('\n')}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

function encodePrivateKey({ algorithm, comment = '', publicBlob, privateBlob }) {
  const check = randomBytes(4).readUInt32BE(0);

  const section = new Writer()
    .uint32(check)
    .uint32(check)
    .raw(privateFields(algorithm, publicBlob, privateBlob))
    .string(comment);

  let body = section.done();

  const padding = [];
  for (let i = 1; (body.length + padding.length) % BLOCK !== 0; i += 1) padding.push(i);
  body = Buffer.concat([body, Buffer.from(padding)]);

  const file = new Writer()
    .raw(MAGIC)
    .string('none')
    .string('none')
    .string(Buffer.alloc(0))
    .uint32(1)
    .string(publicBlob)
    .string(body)
    .done();

  return wrapPem(file);
}

module.exports = { encodePrivateKey };
