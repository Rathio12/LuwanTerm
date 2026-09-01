'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('audit');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-audit-'));
installElectronStub(dir);

const root = path.join(__dirname, '..');
const audit = require(path.join(root, 'src', 'main', 'audit'));

const entry = audit.record('session.open', { host: 'db.example.com', port: 22, username: 'ops' });
check('an event is recorded', entry.event === 'session.open');
check('it is timestamped', !Number.isNaN(Date.parse(entry.at)));
check('the details are kept', entry.host === 'db.example.com' && entry.username === 'ops');

audit.record('sftp.download', { name: 'nginx.conf' });
audit.record('tunnel.open', { localPort: 8080 });

const lines = audit.read();
check('every event lands in the log', lines.length === 3, `${lines.length} lines`);
check('the log is one JSON object per line', lines.every((line) => typeof line.event === 'string'));
check('order is preserved', lines[0].event === 'session.open' && lines[2].event === 'tunnel.open');

const file = audit.file();
check('the file is under the logs directory', file.includes('logs') && file.endsWith('audit.jsonl'));
check('and every line parses on its own',
  fs.readFileSync(file, 'utf8').trim().split('\n').every((line) => JSON.parse(line).at));

const secret = audit.record('auth', {
  username: 'ops',
  password: 'hunter2',
  passphrase: 'correct horse',
  privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----',
  nested: { token: 'abc123', safe: 'keep me' },
});
check('a password never reaches the log', secret.password === '[redacted]');
check('nor a passphrase', secret.passphrase === '[redacted]');
check('nor key material', secret.privateKey === '[redacted]');
check('nor a nested token', secret.nested.token === '[redacted]');
check('while the rest survives', secret.username === 'ops' && secret.nested.safe === 'keep me');
check('and none of it is on disk',
  !fs.readFileSync(file, 'utf8').includes('hunter2') && !fs.readFileSync(file, 'utf8').includes('correct horse'));

const long = audit.record('note', { text: 'x'.repeat(2000) });
check('a very long value is truncated', long.text.length < 600, `${long.text.length} characters`);

const deep = audit.record('note', { a: { b: { c: { d: { e: { f: 'too far' } } } } } });
check('a deeply nested value is cut off rather than recursing forever',
  JSON.stringify(deep).includes('[deep]'));

const wide = audit.record('note', { list: Array.from({ length: 200 }, (unused, index) => index) });
check('a very long array is capped', wide.list.length === 50, `${wide.list.length} items`);

check('redact leaves a plain value alone', audit.redact(42) === 42 && audit.redact(null) === null);
check('redact handles a bare string', audit.redact('hello') === 'hello');

const policyPath = path.join(root, 'src', 'main', 'policy');
fs.writeFileSync(path.join(dir, 'policy.json'), JSON.stringify({ auditEnabled: false }));
delete require.cache[require.resolve(policyPath)];
delete require.cache[require.resolve(path.join(root, 'src', 'main', 'audit'))];
const quiet = require(path.join(root, 'src', 'main', 'audit'));
const before = quiet.read().length;
check('policy can switch auditing off', quiet.record('session.open', {}) === null);
check('and nothing more is written', quiet.read().length === before, `${before} lines`);

const retention = require(path.join(root, 'src', 'main', 'audit'));
const rotated = `${retention.file()}.1`;
fs.mkdirSync(path.dirname(rotated), { recursive: true });
fs.writeFileSync(rotated, JSON.stringify({ event: 'old' }) + String.fromCharCode(10));
const old8 = Date.now() - 400 * 24 * 60 * 60 * 1000;
fs.utimesSync(rotated, new Date(old8), new Date(old8));

fs.writeFileSync(path.join(dir, 'policy.json'), JSON.stringify({ auditRetentionDays: 90 }));
delete require.cache[require.resolve(policyPath)];
delete require.cache[require.resolve(path.join(root, 'src', 'main', 'audit'))];
const pruner = require(path.join(root, 'src', 'main', 'audit'));
pruner.prune();
check('a rotated file past its retention is deleted', !fs.existsSync(rotated));

fs.writeFileSync(rotated, JSON.stringify({ event: 'old' }) + String.fromCharCode(10));
fs.utimesSync(rotated, new Date(old8), new Date(old8));
fs.writeFileSync(path.join(dir, 'policy.json'), JSON.stringify({ auditRetentionDays: 0 }));
delete require.cache[require.resolve(policyPath)];
delete require.cache[require.resolve(path.join(root, 'src', 'main', 'audit'))];
require(path.join(root, 'src', 'main', 'audit')).prune();
check('a retention of zero keeps everything', fs.existsSync(rotated));

quiet.close();
fs.rmSync(dir, { recursive: true, force: true });
done();
