'use strict';

const fs = require('fs');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');

suite('policy-wired');

const root = path.join(__dirname, '..');
const policyFile = path.join(root, 'src', 'main', 'policy.js');
const source = fs.readFileSync(policyFile, 'utf8');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.js') && full !== policyFile) files.push(full);
  }
  return files;
}

const elsewhere = walk(path.join(root, 'src')).map((file) => fs.readFileSync(file, 'utf8')).join('\n');

const keys = (/DEFAULTS\s*=\s*\{([\s\S]*?)\n\};/.exec(source)[1].match(/^\s*([a-zA-Z]+):/gm) || [])
  .map((line) => line.trim().replace(':', ''));

check('the policy declares keys', keys.length >= 10, `${keys.length} keys`);

const ACCESSORS = {
  allowPasswordAuth: ["allows('allowPasswordAuth')"],
  allowKeyboardInteractive: ["allows('allowKeyboardInteractive')"],
  allowAgentAuth: ["allows('allowAgentAuth')"],
  allowSftp: ["allows('allowSftp')"],
  allowTunnels: ["allows('allowTunnels')"],
  allowMonitoring: ["allows('allowMonitoring')"],
  requireKnownHost: ["requires('requireKnownHost')"],
  requireSessionLogging: ["requires('requireSessionLogging')"],
  auditEnabled: ['auditEnabled'],
  auditRetentionDays: ['auditRetentionDays', 'prune('],
  idleTimeoutMinutes: ['idleTimeoutMs('],
  allowedHosts: ['checkHost(', 'hostAllowed('],
  blockedHosts: ['checkHost(', 'hostAllowed('],
  allowedKeyTypes: ['keyTypeAllowed('],
};

const unwired = [];
for (const key of keys) {
  const ways = ACCESSORS[key];
  if (!ways) {
    unwired.push(`${key} (no accessor declared in this test)`);
    continue;
  }
  if (!ways.some((needle) => elsewhere.includes(needle))) unwired.push(key);
}

check('every policy key is consulted somewhere in src/', unwired.length === 0,
  unwired.length ? unwired.join(', ') : `${keys.length} keys wired`);

const wiredIn = (needle) => walk(path.join(root, 'src'))
  .filter((file) => fs.readFileSync(file, 'utf8').includes(needle))
  .map((file) => path.relative(root, file).split(path.sep).join('/'));

check('the idle timeout is read by the session manager',
  wiredIn('idleTimeoutMs(').some((file) => file.includes('manager')), wiredIn('idleTimeoutMs(').join(', '));
check('the retention is applied by something that deletes',
  /fs\.rmSync/.test(fs.readFileSync(path.join(root, 'src', 'main', 'audit.js'), 'utf8')));
check('the audit prune is called at startup',
  fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8').includes('audit.prune()'));
check('the idle sweep is started at startup',
  fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8').includes('startIdleSweep()'));
check('host rules are checked with resolution, not just the typed name',
  wiredIn('checkHost(').some((file) => file.includes('manager')), wiredIn('checkHost(').join(', '));

check('keyboard-interactive is gated before it is offered',
  /tryKeyboard: policy\.allows/.test(fs.readFileSync(path.join(root, 'src', 'main', 'ssh', 'connection.js'), 'utf8')));

done();
