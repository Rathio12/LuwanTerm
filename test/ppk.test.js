'use strict';

const path = require('path');
const { parseKey } = require('ssh2').utils;
const { suite, check, done } = require('./helpers/harness');
const { writePpk, generateUsable } = require('./helpers/ppk-fixtures');

const root = path.join(__dirname, '..', 'src', 'main', 'ssh');
const ppk = require(path.join(root, 'ppk'));
const { encodePrivateKey } = require(path.join(root, 'openssh-key'));

suite('ppk');

const MESSAGE = Buffer.from('luwanterm ppk verification payload');

const TYPES = [
  ['ed25519', { comment: 'ed@luwan' }],
  ['rsa', { bits: 2048, comment: 'rsa@luwan' }],
  ['ecdsa', { bits: 256, comment: 'ec@luwan' }],
];

for (const [type, options] of TYPES) {
  const { pair: original, parts } = generateUsable(type, options);
  const truth = parseKey(original.private);

  for (const version of [2, 3]) {
    for (const passphrase of ['', 'hunter2']) {
      const label = `${type} v${version}${passphrase ? ' encrypted' : ''} round-trips`;
      const file = writePpk({
        version,
        algorithm: parts.algorithm,
        comment: options.comment,
        publicBlob: parts.publicBlob,
        privateBlob: parts.privateBlob,
        passphrase,
      });

      try {
        const parsed = ppk.parse(file, passphrase);
        const recovered = parseKey(
          encodePrivateKey({
            algorithm: parsed.algorithm,
            comment: parsed.comment,
            publicBlob: parsed.publicBlob,
            privateBlob: parsed.privateBlob,
          })
        );
        if (recovered instanceof Error) throw recovered;

        const samePublic = recovered.getPublicSSH().equals(truth.getPublicSSH());

        const verified = truth.verify(MESSAGE, recovered.sign(MESSAGE)) === true;
        check(label, samePublic && verified && parsed.comment === options.comment);
      } catch (err) {
        check(label, false, err.message);
      }
    }
  }
}

{
  const { pair: original, parts } = generateUsable('rsa', { bits: 2048, comment: 'anchor' });
  const truth = parseKey(original.private);

  for (const passphrase of ['', 'hunter2']) {
    const file = writePpk({
      version: 2,
      algorithm: parts.algorithm,
      comment: 'anchor',
      publicBlob: parts.publicBlob,
      privateBlob: parts.privateBlob,
      passphrase,
    });
    const viaSsh2 = parseKey(file, passphrase || undefined);
    check(
      `ssh2 accepts our v2 RSA${passphrase ? ' encrypted' : ''} file`,
      !(viaSsh2 instanceof Error) && viaSsh2.getPublicSSH().equals(truth.getPublicSSH())
    );
  }
}

{
  const { parts } = generateUsable('ed25519', { comment: 'neg' });
  const common = { algorithm: parts.algorithm, comment: 'neg', publicBlob: parts.publicBlob, privateBlob: parts.privateBlob };
  const encrypted = writePpk({ ...common, version: 3, passphrase: 'right' });
  const plain = writePpk({ ...common, version: 3 });

  try {
    ppk.parse(encrypted, '');
    check('encrypted file without a passphrase is refused', false);
  } catch (err) {
    check('encrypted file without a passphrase is refused', err.needsPassphrase === true);
  }

  try {
    ppk.parse(encrypted, 'wrong');
    check('wrong passphrase is refused', false);
  } catch (err) {
    check('wrong passphrase is refused', err.wrongPassphrase === true);
  }

  try {
    ppk.parse(plain.replace('Comment: neg', 'Comment: hacked'));
    check('a tampered file fails its MAC', false);
  } catch (err) {
    check('a tampered file fails its MAC', /integrity/i.test(err.message));
  }

  check('the public half reads without a passphrase', ppk.readPublic(encrypted).algorithm === 'ssh-ed25519');
  check('a ppk is recognised', ppk.looksLikePpk(plain) === true);
  check('an openssh key is not mistaken for one', ppk.looksLikePpk(common.publicBlob.toString()) === false);
}

{
  const crypto = require('crypto');
  const { parts } = generateUsable('ed25519', { comment: 'argon' });
  const encrypted = writePpk({
    version: 3,
    algorithm: parts.algorithm,
    comment: 'argon',
    publicBlob: parts.publicBlob,
    privateBlob: parts.privateBlob,
    passphrase: 'pw',
  });

  const real = crypto.argon2Sync;
  delete crypto.argon2Sync;
  try {
    ppk.parse(encrypted, 'pw');
    check('a runtime without Argon2 explains itself', false, 'it parsed anyway');
  } catch (err) {
    check(
      'a runtime without Argon2 explains itself',
      /Node 24/.test(err.message) && !/not a function/.test(err.message),
      err.message
    );
  } finally {
    crypto.argon2Sync = real;
  }

  check('and works again once it is back', ppk.parse(encrypted, 'pw').algorithm === 'ssh-ed25519');
}

done();
