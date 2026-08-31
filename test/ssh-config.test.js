'use strict';

const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { parse, toProfiles } = require(path.join(__dirname, '..', 'src', 'main', 'ssh', 'ssh-config'));

suite('ssh-config');

const SAMPLE = `
# a comment
Host *
  ServerAliveInterval 60
  StrictHostKeyChecking no

Host prod web
    HostName 10.0.0.5
    User root
    Port 2222
    IdentityFile ~/.ssh/id_ed25519

Host db
  hostname=10.0.0.9
  user = postgres

Host behind-bastion
  HostName 10.10.0.4
  User deploy
  ProxyJump bastion

Host bastion
  HostName gate.example.com
  User jump

Host weird
  ProxyCommand ssh -W %h:%p gateway

Host noname
  User someone
`;

const entries = parse(SAMPLE);
const byAlias = Object.fromEntries(entries.map((e) => [e.alias, e.settings]));

check('every Host block is found', entries.length === 8, entries.map((e) => e.alias).join(', '));
check('one Host line can declare several aliases', Boolean(byAlias.prod && byAlias.web));
check('directives are read', byAlias.prod.hostname === '10.0.0.5' && byAlias.prod.port === '2222');
check('keys are case-insensitive', byAlias.db.hostname === '10.0.0.9');
check('the equals form is understood', byAlias.db.user === 'postgres');
check('comments are skipped', !('stricthostkeychecking' in (byAlias.db || {})));
check('ProxyJump is captured', byAlias['behind-bastion'].proxyjump === 'bastion');

const { usable, skipped } = toProfiles(entries);
const profiles = Object.fromEntries(usable.map((p) => [p.name, p]));

check('a pattern is not offered as a host', !profiles['*']);
check('and is reported as skipped', skipped.some((s) => s.alias === '*'));
check('a ProxyCommand host is skipped', !profiles.weird && skipped.some((s) => s.alias === 'weird'));

check('a profile carries its address and port', profiles.prod.host === '10.0.0.5' && profiles.prod.port === 2222);
check('an identity file selects key auth', profiles.prod.auth === 'key' && profiles.prod.privateKeyPath.includes('id_ed25519'));
check('~ in a key path is expanded', !profiles.prod.privateKeyPath.startsWith('~'), profiles.prod.privateKeyPath);
check('a host with no identity file uses the agent', profiles.db.auth === 'agent');
check('a missing port defaults to 22', profiles.db.port === 22);
check('an alias with no HostName connects to the alias', profiles.noname.host === 'noname');
check('ProxyJump becomes a jump host', profiles['behind-bastion'].jumpHost === 'bastion');
check('imported hosts are grouped', profiles.db.group === 'ssh config');

check('an empty config yields nothing', parse('').length === 0);
check('junk lines do not throw', parse('!!!! nonsense\nHost ok\n  HostName x').length === 1);

done();
