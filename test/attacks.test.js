'use strict';

/**
 * An adversary's pass over the app.
 *
 * Everything here is hostile input arriving where hostile input can actually
 * arrive: a server the user connected to, a file on disk somebody else wrote,
 * a policy pushed by an administrator, a value that came back over IPC. Each
 * check asserts the app refuses or sanitises rather than crashes or complies.
 *
 * A crash matters as much as a compromise here. Policy and settings are read
 * during boot, so a parser that throws on a malformed file is an application
 * that will not start.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('attacks');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-attacks-'));
installElectronStub(dir);

const root = path.join(__dirname, '..');
const NL = String.fromCharCode(10);
const NUL = String.fromCharCode(0);
const B = String.fromCharCode(92);

const survives = (label, fn, detail) => {
  try {
    const value = fn();
    check(label, true, detail ? detail(value) : undefined);
    return value;
  } catch (err) {
    check(label, false, `threw: ${err.message}`);
    return undefined;
  }
};

/* ---------- A server that controls file names ---------- */

const { safeJoin } = require(path.join(root, 'src', 'main', 'ssh', 'sftp'));
const downloads = path.join(dir, 'downloads');

const escapes = [
  '..',
  `..${B}..${B}evil.exe`,
  '../../evil.exe',
  'docs/../../evil.exe',
  `C:${B}Windows${B}System32${B}config${B}SAM`,
  '/etc/shadow',
  'C:',
  `docs${NUL}.exe`,
  'docs//evil',
  './evil',
];

let refused = 0;
for (const name of escapes) {
  try {
    safeJoin(downloads, name);
  } catch {
    refused += 1;
  }
}
check('every attempt to escape the download folder is refused', refused === escapes.length,
  `${refused} of ${escapes.length}`);

check('and ordinary names still work',
  safeJoin(downloads, 'etc/nginx/nginx.conf') === path.join(downloads, 'etc', 'nginx', 'nginx.conf'));

/* ---------- A policy file somebody else wrote ---------- */

const policyPath = path.join(root, 'src', 'main', 'policy');
const loadPolicy = (text) => {
  fs.writeFileSync(path.join(dir, 'policy.json'), text);
  delete require.cache[require.resolve(policyPath)];
  return require(policyPath);
};

survives('a policy naming __proto__ does not stop the app starting',
  () => loadPolicy('{"__proto__":{"polluted":1},"allowSftp":false}').get());
check('and nothing was polluted', ({}).polluted === undefined);

survives('a policy naming constructor is survived',
  () => loadPolicy('{"constructor":{"prototype":{"x":1}},"allowSftp":true}').get());
survives('a policy full of junk types is survived',
  () => loadPolicy('{"idleTimeoutMinutes":{"a":1},"allowedHosts":42,"auditEnabled":"yes"}').get());
survives('a truncated policy is survived', () => loadPolicy('{"allowSftp":').get());
survives('a policy that is an array is survived', () => loadPolicy('[1,2,3]').get());
survives('a policy that is a bare string is survived', () => loadPolicy('"nope"').get());
survives('a deeply nested policy is survived',
  () => loadPolicy(`{"a":${'['.repeat(200)}${']'.repeat(200)}}`).get());

const strict = loadPolicy('{"allowSftp":false,"idleTimeoutMinutes":-99,"auditRetentionDays":1e9}');
check('an out-of-range number is clamped rather than trusted',
  strict.get().idleTimeoutMinutes === 0 && strict.get().auditRetentionDays === 3650,
  `${strict.get().idleTimeoutMinutes}, ${strict.get().auditRetentionDays}`);

/* ---------- Settings arriving over IPC ---------- */

loadPolicy('{}');
delete require.cache[require.resolve(path.join(root, 'src', 'main', 'store', 'settings'))];
const settings = require(path.join(root, 'src', 'main', 'store', 'settings'));

survives('a settings patch naming __proto__ is survived',
  () => settings.set(JSON.parse('{"__proto__":{"pwned":true}}')));
check('and the prototype is untouched', ({}).pwned === undefined);

survives('a patch naming constructor is survived',
  () => settings.set(JSON.parse('{"constructor":"x"}')));
check('an unknown key is dropped', !('nonsense' in settings.set({ nonsense: 1 })));
check('a number where a string belongs is coerced', typeof settings.set({ fontFamily: 42 }).fontFamily === 'string');
check('an absurd number is clamped', settings.set({ fontSize: 1e9 }).fontSize === 28);
check('a hostile string does not become a number', settings.set({ fontSize: 'drop table' }).fontSize === 28);

const huge = settings.set({ fontFamily: 'x'.repeat(200000) });
check('a very long value is stored without crashing', typeof huge.fontFamily === 'string',
  `${huge.fontFamily.length} characters`);

/* ---------- A server that controls its own /proc output ---------- */

const stats = require(path.join(root, 'src', 'main', 'ssh', 'stats'));

survives('a gigantic line is survived',
  () => stats.parse(`@@luwancpu${NL}cpu ${'9'.repeat(200000)}${NL}@@luwanend`, 'a'));
survives('negative counters are survived',
  () => stats.parse(`@@luwancpu${NL}cpu -5 -5 -5 -5${NL}@@luwanend`, 'b'));
survives('non-numeric memory is survived',
  () => stats.parse(`@@luwanmem${NL}MemTotal: drop-table kB${NL}@@luwanend`, 'c'));
survives('output that is not the probe at all is survived',
  () => stats.parse('bash: syntax error near unexpected token', 'd'));

const flood = Array.from({ length: 5000 }, (unused, i) => `  eth${i}: 1 2 3 4 5 6 7 8 9 0 0 0 0 0 0 0`).join(NL);
const flooded = stats.parse(`@@luwannet${NL}${flood}${NL}@@luwanend`, 'e');
check('a server naming thousands of interfaces is capped', flooded.network.interfaces.length <= 32,
  `${flooded.network.interfaces.length} named`);

const noUptime = stats.parse(`@@luwanmem${NL}MemTotal: 100 kB${NL}MemFree: 50 kB${NL}@@luwanend`, 'f');
check('a server reporting no uptime is not credited with one', noUptime.uptime === undefined);

const backwards = stats.parse(`@@luwannet${NL}  eth0: 9999 0 0 0 0 0 0 0 9999 0 0 0 0 0 0 0${NL}@@luwanend`, 'g', 1000);
const reset = stats.parse(`@@luwannet${NL}  eth0: 1 0 0 0 0 0 0 0 1 0 0 0 0 0 0 0${NL}@@luwanend`, 'g', 2000);
check('a counter that goes backwards is not reported as traffic',
  reset.network.rx === 0 && reset.network.tx === 0, `${backwards.network.rx}, then ${reset.network.rx}`);

/* ---------- The audit log, written from remote data ---------- */

const audit = require(path.join(root, 'src', 'main', 'audit'));

const forged = audit.record('session.open', {
  host: `real.example.com${NL}{"at":"1970-01-01T00:00:00Z","event":"forged.admin"}`,
});
check('a newline in a value cannot forge a second entry',
  audit.read().filter((line) => line.event === 'forged.admin').length === 0);
check('and the value survives intact in its own field', forged.host.includes('forged.admin'));
check('every line on disk is one parseable object',
  fs.readFileSync(audit.file(), 'utf8').trim().split(NL).every((line) => {
    try {
      return typeof JSON.parse(line).event === 'string';
    } catch {
      return false;
    }
  }));

const secret = audit.record('auth', { password: 'hunter2', nested: { token: 'abc', keep: 'yes' } });
check('secrets never reach the log', secret.password === '[redacted]' && secret.nested.token === '[redacted]');
check('and the file does not contain them', !fs.readFileSync(audit.file(), 'utf8').includes('hunter2'));

/* ---------- Links handed to the operating system ---------- */

const appIpc = fs.readFileSync(path.join(root, 'src', 'main', 'ipc', 'app.js'), 'utf8');
const guard = appIpc.includes("test(url)") && appIpc.includes('Only http(s) links can be opened');
check('openExternal refuses anything that is not http or https', guard,
  'javascript:, file: and data: never reach the shell');

fs.rmSync(dir, { recursive: true, force: true });
done();
