'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, throws, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('keys');

const dir = installElectronStub(fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-keys-')));
const keys = require(path.join(__dirname, '..', 'src', 'main', 'store', 'keys'));
const hosts = require(path.join(__dirname, '..', 'src', 'main', 'store', 'hosts'));

const ed = keys.create({ name: 'laptop', type: 'ed25519', comment: 'david@luwan' });
check('a generated key is stored', ed.type === 'ssh-ed25519' && ed.source === 'generated');
check('its private half is written', fs.existsSync(path.join(dir, 'keys', ed.id)));
check('its public half is an authorized_keys line', /^ssh-ed25519 AAAA\S+ david@luwan$/.test(ed.publicKey));

const rsa = keys.create({
  name: 'deploy', type: 'rsa', bits: 2048, comment: 'ci',
  passphrase: 'pw', savePassphrase: true,
});
check('an encrypted key is marked as such', rsa.encrypted === true);
check('its passphrase reaches the vault', keys.passphrase(rsa.id) === 'pw');
check('the key material reads back', keys.privateKey(rsa.id).includes('OPENSSH PRIVATE KEY'));

throws(
  'a passphrase that does not open the key is refused',
  () => keys.setPassphrase(rsa.id, 'nope'),
  (err) => /does not open/.test(err.message)
);
check('the right passphrase is accepted', keys.setPassphrase(rsa.id, 'pw') === true);

// Adding a key you already have, both ways round.
const loose = path.join(dir, 'loose.key');
fs.writeFileSync(loose, keys.privateKey(ed.id));

const copied = keys.importFile({ filePath: loose, name: 'copied' });
check('an imported key is copied in', copied.source === 'imported' && !copied.path);
check('and matches the original', copied.fingerprint === ed.fingerprint);

const linked = keys.linkFile({ filePath: loose, name: 'linked' });
check('a linked key keeps its path', linked.source === 'linked' && linked.path === loose);
check('and is read from where it lives', keys.privateKey(linked.id).includes('OPENSSH PRIVATE KEY'));

// An encrypted key can be registered without unlocking it now.
const lockedFile = path.join(dir, 'locked.key');
fs.writeFileSync(lockedFile, keys.privateKey(rsa.id));
const locked = keys.linkFile({ filePath: lockedFile, name: 'locked' });
check('an encrypted key links without its passphrase', locked.encrypted === true, locked.type);

check('every key is listed', keys.list().length === 5, String(keys.list().length));
check('a stored passphrase is reported', keys.list().find((k) => k.id === rsa.id).hasStoredPassphrase === true);

const host = hosts.save({
  name: 'web', host: '10.0.0.5', port: 22, username: 'root', auth: 'key', keyId: ed.id,
});
check('a host can point at a key', host.keyId === ed.id);

// Removing must never delete a file the app did not create.
keys.remove(linked.id);
check('removing a linked key leaves the file alone', fs.existsSync(loose));
keys.remove(rsa.id);
check('removing a generated key erases it', !fs.existsSync(path.join(dir, 'keys', rsa.id)));
check('and clears its passphrase', keys.passphrase(rsa.id) === null);

throws('an invalid port is rejected', () => hosts.save({ host: 'a', username: 'b', port: 70000 }));
throws('a missing host is rejected', () => hosts.save({ username: 'b', port: 22 }));
throws('a missing username is rejected', () => hosts.save({ host: 'a', port: 22 }));

done();
