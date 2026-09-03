'use strict';

const path = require('path');
const ssh2 = require('ssh2');
const { parseKey } = ssh2.utils;
const { mangleEd25519 } = require('./helpers/ppk-fixtures');
const { suite, check, throws, done } = require('./helpers/harness');
const keygen = require(path.join(__dirname, '..', 'src', 'main', 'ssh', 'keygen'));

suite('keygen');

{
  const key = keygen.generate({ type: 'ed25519', comment: 'david@luwan' });
  check('ed25519 is generated', key.type === 'ssh-ed25519');
  check('the public half is an authorized_keys line', /^ssh-ed25519 AAAA\S+ david@luwan$/.test(key.publicKey));
  check('a fingerprint is reported', /^SHA256:[A-Za-z0-9+/]+$/.test(key.fingerprint), key.fingerprint);
  check('it is not marked encrypted', key.encrypted === false);
}

{
  const key = keygen.generate({ type: 'rsa', bits: 2048, comment: 'ci', passphrase: 'pw' });
  check('rsa honours its size', key.bits === 2048 && key.type === 'ssh-rsa');
  check('a passphrase marks it encrypted', key.encrypted === true);
  check('it reopens with the right passphrase', keygen.inspect(key.privateKey, 'pw').type === 'ssh-rsa');

  throws(
    'it refuses to open without one',
    () => keygen.inspect(key.privateKey),
    (err) => err.needsPassphrase === true && err.wrongPassphrase !== true
  );
  throws(
    'it refuses to open with the wrong one',
    () => keygen.inspect(key.privateKey, 'nope'),
    (err) => err.wrongPassphrase === true
  );
}

{
  const key = keygen.generate({ type: 'ecdsa', bits: 256, comment: 'e' });
  check('ecdsa is generated', key.type === 'ecdsa-sha2-nistp256');
}

throws('an unknown type is rejected', () => keygen.generate({ type: 'rot13' }));
throws('an impossible rsa size is rejected', () => keygen.generate({ type: 'rsa', bits: 123 }));

{
  const SAMPLE = 400;
  let broken = 0;
  for (let i = 0; i < SAMPLE; i += 1) {
    const key = keygen.generate({ type: 'ed25519', comment: 'x' });
    const parsed = parseKey(key.privateKey);
    if (parsed instanceof Error || parsed.getPublicSSH().length !== 51) broken += 1;
  }
  check(`${SAMPLE} generated ed25519 keys are all usable`, broken === 0, `${broken} unusable`);
}

{
  const openssh = keygen.generate({ type: 'ed25519', comment: 'p' });
  const passthrough = keygen.loadForAuth(openssh.privateKey, undefined);
  check('an openssh key passes through untouched', passthrough.privateKey === openssh.privateKey);
  check('and carries no passphrase', passthrough.passphrase === undefined);
}

{
  const real = ssh2.utils.generateKeyPairSync;
  const keygenPath = require.resolve(path.join(__dirname, '..', 'src', 'main', 'ssh', 'keygen'));

  const hand = (badFirst) => {
    let calls = 0;
    ssh2.utils.generateKeyPairSync = (type, options) => {
      calls += 1;
      const pair = real(type, options);
      if (calls <= badFirst) pair.private = mangleEd25519(pair.private);
      return pair;
    };
    delete require.cache[keygenPath];
    return { attempts: () => calls, keygen: require(keygenPath) };
  };

  const sample = mangleEd25519(real('ed25519', { comment: 'shape' }).private);
  check('the shape ssh2 sometimes emits really is unreadable', parseKey(sample) instanceof Error,
    String(parseKey(sample).message));

  const recovering = hand(2);
  const key = recovering.keygen.generate({ type: 'ed25519', comment: 'retry' });
  check('a malformed key from the generator never reaches the caller', key.type === 'ssh-ed25519');
  check('it kept generating until one was usable', recovering.attempts() === 3,
    `${recovering.attempts()} attempts`);
  check('and what it returned parses', !(parseKey(key.privateKey) instanceof Error));

  const hopeless = hand(Infinity);
  throws(
    'a generator that only ever returns rubbish gives up rather than handing it over',
    () => hopeless.keygen.generate({ type: 'ed25519', comment: 'never' }),
    (err) => /not a usable private key/i.test(err.message)
  );
  check('it did not try forever', hopeless.attempts() === 8, `${hopeless.attempts()} attempts`);

  ssh2.utils.generateKeyPairSync = real;
  delete require.cache[keygenPath];
}

done();
