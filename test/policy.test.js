'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('policy');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-policy-'));
installElectronStub(dir);

const root = path.join(__dirname, '..');
const policyPath = path.join(root, 'src', 'main', 'policy');
const userFile = path.join(dir, 'policy.json');

const load = (contents) => {
  if (contents === null) fs.rmSync(userFile, { force: true });
  else fs.writeFileSync(userFile, JSON.stringify(contents));
  delete require.cache[require.resolve(policyPath)];
  return require(policyPath);
};

let policy = load(null);
check('with no policy file everything is permitted', policy.allows('allowSftp') && policy.allows('allowTunnels'));
check('and nothing is demanded', !policy.requires('requireKnownHost'));
check('any host is reachable', policy.hostAllowed('anything.example.com'));
check('auditing is on by default', policy.get().auditEnabled);
check('there is no idle timeout', policy.idleTimeoutMs() === 0);

policy = load({ allowSftp: false, allowTunnels: false, requireKnownHost: true, idleTimeoutMinutes: 15 });
check('a capability can be withdrawn', !policy.allows('allowSftp') && !policy.allows('allowTunnels'));
check('a requirement can be imposed', policy.requires('requireKnownHost'));
check('the idle timeout is read in milliseconds', policy.idleTimeoutMs() === 15 * 60 * 1000);

policy = load({ idleTimeoutMinutes: 99999, auditRetentionDays: -5 });
check('an out-of-range timeout is clamped', policy.get().idleTimeoutMinutes === 1440);
check('a negative retention is clamped to zero', policy.get().auditRetentionDays === 0);

policy = load({ allowSftp: 'no', requireKnownHost: 1, allowedHosts: 'not-a-list' });
check('a string is coerced to a boolean', policy.allows('allowSftp') === true, 'a non-empty string is truthy');
check('a number is coerced to a boolean', policy.requires('requireKnownHost') === true);
check('a non-list is ignored rather than crashing', policy.get().allowedHosts.length === 0);

policy = load({ allowedHosts: ['*.prod.example.com', 'bastion'] });
check('a host on the allowlist is reachable', policy.hostAllowed('web1.prod.example.com'));
check('an exact entry works too', policy.hostAllowed('bastion'));
check('anything else is refused', !policy.hostAllowed('web1.staging.example.com'));
check('the match is case-insensitive', policy.hostAllowed('WEB1.PROD.EXAMPLE.COM'));
check('an empty host is refused', !policy.hostAllowed(''));

policy = load({ blockedHosts: ['*.internal'] });
check('a blocklist without an allowlist still permits the rest', policy.hostAllowed('example.com'));
check('but not what it names', !policy.hostAllowed('db.internal'));

policy = load({ allowedHosts: ['*.example.com'], blockedHosts: ['secret.example.com'] });
check('the blocklist wins over the allowlist', !policy.hostAllowed('secret.example.com'));
check('while the rest of the allowlist stands', policy.hostAllowed('web.example.com'));

policy = load({ allowedKeyTypes: ['ed25519'] });
check('a permitted key type passes', policy.keyTypeAllowed('ed25519'));
check('and an excluded one does not', !policy.keyTypeAllowed('rsa'));
policy = load({});
check('with no list every key type passes', policy.keyTypeAllowed('rsa') && policy.keyTypeAllowed('ed25519'));

fs.writeFileSync(userFile, '{ this is not json');
delete require.cache[require.resolve(policyPath)];
policy = require(policyPath);
check('an unreadable policy falls back to the defaults rather than failing to start',
  policy.allows('allowSftp') && !policy.requires('requireKnownHost'));

policy = load({ allowSftp: false });
check('reload picks up a change', policy.allows('allowSftp') === false);
fs.writeFileSync(userFile, JSON.stringify({ allowSftp: true }));
check('and only when asked', policy.allows('allowSftp') === false, 'still the cached value');
check('until reload is called', policy.reload().allowSftp === true);

check('the file it read is reported', policy.sources().some((source) => source.scope === 'user'));

fs.rmSync(dir, { recursive: true, force: true });
done();
