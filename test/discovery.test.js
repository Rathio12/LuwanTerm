'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');
const { decodeOpenSsh, writePpk } = require('./helpers/ppk-fixtures');

suite('discovery');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-home-'));
const ssh = path.join(home, '.ssh');
fs.mkdirSync(ssh, { recursive: true });

installElectronStub(home);
// discovery reads os.homedir() at scan time, so this has to be in place first.
os.homedir = () => home;

const keygen = require(path.join(__dirname, '..', 'src', 'main', 'ssh', 'keygen'));
const discovery = require(path.join(__dirname, '..', 'src', 'main', 'ssh', 'discovery'));

const plain = keygen.generate({ type: 'ed25519', comment: 'plain@box' });
fs.writeFileSync(path.join(ssh, 'id_ed25519'), plain.privateKey);
fs.writeFileSync(path.join(ssh, 'id_ed25519.pub'), `${plain.publicKey}\n`);

const encrypted = keygen.generate({ type: 'rsa', bits: 2048, comment: 'enc@box', passphrase: 'pw' });
fs.writeFileSync(path.join(ssh, 'id_rsa'), encrypted.privateKey);
fs.writeFileSync(path.join(ssh, 'id_rsa.pub'), `${encrypted.publicKey}\n`);

const lonely = keygen.generate({ type: 'ecdsa', bits: 256, comment: 'lonely@box', passphrase: 'pw' });
fs.writeFileSync(path.join(ssh, 'id_ecdsa_nopub'), lonely.privateKey);

const ppk3 = decodeOpenSsh(keygen.generate({ type: 'ed25519', comment: 'ppk3@box' }).privateKey);
fs.writeFileSync(
  path.join(ssh, 'work.ppk'),
  writePpk({ version: 3, algorithm: ppk3.algorithm, comment: 'ppk3@box', publicBlob: ppk3.publicBlob, privateBlob: ppk3.privateBlob, passphrase: 'pw' })
);

const ppk2 = decodeOpenSsh(keygen.generate({ type: 'rsa', bits: 2048, comment: 'ppk2@box' }).privateKey);
fs.writeFileSync(
  path.join(ssh, 'legacy.ppk'),
  writePpk({ version: 2, algorithm: ppk2.algorithm, comment: 'ppk2@box', publicBlob: ppk2.publicBlob, privateBlob: ppk2.privateBlob })
);

// Things that live in .ssh but are never private keys.
fs.writeFileSync(path.join(ssh, 'known_hosts'), 'github.com ssh-ed25519 AAAA\n');
fs.writeFileSync(path.join(ssh, 'config'), 'Host *\n  User root\n');
fs.writeFileSync(path.join(ssh, 'authorized_keys'), `${plain.publicKey}\n`);
fs.writeFileSync(path.join(ssh, 'notes.txt'), 'just some notes\n');
fs.mkdirSync(path.join(ssh, 'subdir'), { recursive: true });

discovery.scan().then((found) => {
  const by = Object.fromEntries(found.map((k) => [k.name, k]));

  check('it finds exactly the key files', found.length === 5, found.map((k) => k.name).join(', '));
  check(
    'it ignores known_hosts, config, authorized_keys, notes, .pub and directories',
    !by.known_hosts && !by.config && !by.authorized_keys && !by['notes.txt'] && !by['id_ed25519.pub'] && !by.subdir
  );

  check('a plain key is identified', by.id_ed25519?.type === 'ssh-ed25519' && by.id_ed25519.encrypted === false);
  check('and its public half matches', by.id_ed25519?.publicKey === plain.publicKey);

  check('an encrypted key is flagged', by.id_rsa?.encrypted === true);
  check('and is identified from its .pub file', by.id_rsa?.type === 'ssh-rsa' && Boolean(by.id_rsa.fingerprint));

  check('an encrypted key with no .pub is still listed', by.id_ecdsa_nopub?.encrypted === true);
  check('and is marked unknown rather than dropped', by.id_ecdsa_nopub?.type === 'unknown');

  check(
    'an encrypted ppk is identified without its passphrase',
    by['work.ppk']?.type === 'ssh-ed25519' && by['work.ppk'].format === 'ppk-v3'
  );
  check('a v2 ppk is identified', by['legacy.ppk']?.type === 'ssh-rsa' && by['legacy.ppk'].encrypted === false);

  const id = by.id_ed25519.id;
  check('an id round-trips to its path', discovery.pathForId(id) === by.id_ed25519.path);
  check('discovered ids are distinguishable', discovery.isDiscoveredId(id) && !discovery.isDiscoveredId('k_abc'));

  done();
});
