'use strict';

/**
 * Plugins are files on disk that somebody else may have written, so the loader
 * is a parser: it must accept the good ones, explain the bad ones, and never
 * throw - a broken plugin that stopped the app starting would be a worse bug
 * than the feature is worth.
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, throws, rejects, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('plugins');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-plugins-'));
installElectronStub(dir);

const root = path.join(__dirname, '..');
const plugins = require(path.join(root, 'src', 'main', 'plugins'));
const folder = plugins.folder();
const NL = String.fromCharCode(10);

const write = (name, contents) => {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, name), typeof contents === 'string' ? contents : JSON.stringify(contents));
};

/* ---------- Nothing installed is the normal case ---------- */

check('no folder means no plugins, and no complaint',
  plugins.load().plugins.length === 0 && plugins.load().broken.length === 0);

/* ---------- A good one ---------- */

write('recent-logins.json', {
  name: 'Recent logins',
  description: 'Who has been on this box',
  icon: 'server',
  command: 'last -n 20',
  columns: ['user', 'from', 'when'],
  refreshSeconds: 60,
});

const good = plugins.load();
check('a valid manifest loads', good.plugins.length === 1, good.plugins.map((p) => p.name).join(', '));
check('its id comes from the file name', good.plugins[0].id === 'recent-logins');
check('the command is kept exactly', good.plugins[0].command === 'last -n 20');
check('the columns are kept', good.plugins[0].columns.join() === 'user,from,when');
check('columns imply whitespace splitting', good.plugins[0].split === 'whitespace');

/* ---------- Bad ones are explained, not thrown ---------- */

write('no-name.json', { command: 'uptime' });
write('no-command.json', { name: 'Nothing to run' });
write('not-json.json', '{ this is not json');
write('an-array.json', [1, 2, 3]);
write('a-string.json', '"just a string"');

const mixed = plugins.load();
check('the good one still loads alongside broken ones', mixed.plugins.length === 1);
check('every broken one is reported', mixed.broken.length === 5, `${mixed.broken.length} reported`);
check('each says why', mixed.broken.every((entry) => entry.problems.length > 0));
check('a missing name is named as the problem',
  mixed.broken.find((entry) => entry.file === 'no-name.json').problems[0].includes('name'));

/* ---------- Hostile values are clamped, not trusted ---------- */

write('hostile.json', {
  name: 'x'.repeat(500),
  command: 'uptime',
  icon: '../../evil',
  refreshSeconds: 1e9,
  columns: Array.from({ length: 100 }, (unused, i) => `c${i}`),
  split: 'exec',
  extra: { nested: true },
});
const hostile = plugins.load().broken.find((entry) => entry.file === 'hostile.json');
check('an absurd name is refused rather than truncated', Boolean(hostile), hostile && hostile.problems[0]);

write('hostile.json', {
  name: 'Clamped',
  command: 'uptime',
  icon: '../../evil',
  refreshSeconds: 1e9,
  columns: Array.from({ length: 100 }, (unused, i) => `c${i}`),
  split: 'exec',
  extra: { nested: true },
});
const clamped = plugins.load().plugins.find((entry) => entry.id === 'hostile');
check('an unknown icon falls back rather than being used', clamped.icon === 'activity');
check('an absurd refresh is clamped', clamped.refreshSeconds === 3600, `${clamped.refreshSeconds}s`);
check('too many columns are cut', clamped.columns.length === 8, `${clamped.columns.length}`);
check('an unknown split falls back', clamped.split === 'whitespace');
check('unrecognised keys are dropped, not carried', clamped.extra === undefined);

write('proto.json', '{"__proto__":{"polluted":1},"name":"P","command":"uptime"}');
plugins.load();
check('a manifest naming __proto__ pollutes nothing', ({}).polluted === undefined);

const big = 'x'.repeat(70 * 1024);
write('huge.json', `{"name":"Huge","command":"echo ${big}"}`);
const huge = plugins.load().broken.find((entry) => entry.file === 'huge.json');
check('an oversized file is refused before it is parsed', Boolean(huge), huge && huge.problems[0]);

/* ---------- Enabling is separate from being present ---------- */

check('nothing is enabled just by existing', plugins.enabled([]).length === 0);
check('enabling one selects it', plugins.enabled(['recent-logins']).length === 1);
check('an id that is not there is ignored', plugins.enabled(['nope']).length === 0);

/* ---------- The manifest the documentation shows ---------- */

write('roadmap.json', {
  name: 'Recent logins',
  icon: 'server',
  command: 'last -n 20',
  columns: ['user', 'from', 'when'],
  every: 60,
});
const roadmap = plugins.load().plugins.find((entry) => entry.id === 'roadmap');
check('the manifest printed in the roadmap loads as written', Boolean(roadmap));
check('"every" is accepted as the interval', roadmap && roadmap.refreshSeconds === 60);

/* ---------- Output into a table ---------- */

const lines = plugins.table(`one${NL}two${NL}${NL}three`, { split: 'lines' });
check('lines mode keeps whole lines', lines.rows.length === 3 && lines.rows[2][0] === 'three');
check('lines mode names its one column', lines.columns.join() === 'Output');
check('blank lines are not rows', lines.rows.every((row) => row[0]));

const shaped = { columns: ['user', 'from', 'when'], split: 'whitespace' };
const logins = plugins.table(`alice 10.0.0.4 Mon Sep  1 09:12${NL}bob 10.0.0.9 Mon Sep  1 09:14`, shaped);
check('whitespace mode fills the declared columns', logins.rows[0].length === 3);
check('the last column keeps the rest of the line', logins.rows[0][2] === 'Mon Sep 1 09:12', logins.rows[0][2]);
check('every row is the same width', logins.rows.every((row) => row.length === 3));

const short = plugins.table('alice', shaped);
check('a short line is padded rather than ragged', short.rows[0].length === 3 && short.rows[0][2] === '');

const wide = { columns: ['name', 'status'], split: 'columns' };
const docker = plugins.table(`web server   Up 3 days${NL}db worker    Exited (1)`, wide);
check('columns mode splits on two spaces, not one', docker.rows[0][0] === 'web server', docker.rows[0][0]);
check('columns mode keeps the second field whole', docker.rows[0][1] === 'Up 3 days');

const skipped = plugins.table(`NAME STATUS${NL}web up`, { columns: ['name', 'status'], skipLines: 1 });
check('skipLines drops the header the server printed', skipped.rows.length === 1 && skipped.rows[0][0] === 'web');

const undeclared = plugins.table('a b c d', { split: 'whitespace' });
check('with no declared columns the fields stand alone', undeclared.rows[0].length === 4);
check('and there is no header to draw', undeclared.columns.length === 0);

/* ---------- A server that controls what comes back ---------- */

const ESC = String.fromCharCode(27);
const painted = plugins.table(`${ESC}[31mred${ESC}[0m ${ESC}[2Jclear`, { split: 'whitespace' });
check('escape sequences are stripped, not drawn', painted.rows[0].join(' ') === 'red clear', painted.rows[0].join(' '));

const sneaky = plugins.table(`a${String.fromCharCode(0)}b${String.fromCharCode(7)}c`, { split: 'lines' });
check('control characters are dropped', sneaky.rows[0][0] === 'abc', sneaky.rows[0][0]);

const flood = Array.from({ length: 5000 }, (unused, i) => `row${i}`).join(NL);
const flooded = plugins.table(flood, { split: 'lines' });
check('a flood of lines is cut to a panel-sized table', flooded.rows.length === plugins.MAX_ROWS);
check('and says so', flooded.truncated === true);

const long = plugins.table('x'.repeat(5000), { split: 'lines' });
check('one enormous field is cut', long.rows[0][0].length <= plugins.MAX_CELL + 3, `${long.rows[0][0].length}`);

const many = plugins.table(Array.from({ length: 40 }, (unused, i) => `f${i}`).join(' '), { split: 'whitespace' });
check('a line of forty fields does not become forty columns', many.rows[0].length === 8);

check('no output at all is an empty table, not a throw', plugins.table('', {}).rows.length === 0);
check('undefined output is an empty table too', plugins.table(undefined, {}).rows.length === 0);

/* ---------- The examples the guide ships ---------- */

const examples = path.join(root, 'guides', 'plugins');
const shipped = fs.readdirSync(examples).filter((name) => name.endsWith('.json'));
const guide = fs.readFileSync(path.join(root, 'guides', 'plugins.md'), 'utf8');

check('the guide ships examples', shipped.length >= 4, shipped.join(', '));

for (const name of shipped) {
  const parsed = plugins.validate(JSON.parse(fs.readFileSync(path.join(examples, name), 'utf8')), name);
  check(`the ${name} example is a plugin`, Boolean(parsed.plugin),
    parsed.problems && parsed.problems.join('; '));
  check(`and the guide links to ${name}`, guide.includes(`plugins/${name}`));
}

/* ---------- Running one ---------- */

function fakeSession(behaviour = {}) {
  const { pieces = [''], stderr = '', code = 0, silent = false, failWith = null } = behaviour;
  const seen = [];

  const session = {
    seen,
    connection: {
      client: {
        exec(command, options, callback) {
          seen.push(command);
          if (failWith) {
            callback(new Error(failWith));
            return true;
          }

          const channel = new EventEmitter();
          channel.stderr = new EventEmitter();
          channel.closed = false;
          channel.close = () => {
            channel.closed = true;
          };
          session.channel = channel;
          callback(null, channel);

          setImmediate(() => {
            for (const piece of pieces) channel.emit('data', Buffer.from(piece));
            if (stderr) channel.stderr.emit('data', Buffer.from(stderr));
            if (!silent) channel.emit('close', code);
          });
          return true;
        },
      },
    },
  };

  return session;
}

const uptimePlugin = { id: 'p', command: 'uptime', columns: ['a', 'b'], split: 'whitespace' };

(async () => {
  const session = fakeSession({ pieces: [`one two${NL}`, `three four${NL}`] });
  const result = await plugins.run(session, uptimePlugin);
  check('a run returns the parsed table', result.rows.length === 2 && result.rows[1][1] === 'four');
  check('the command sent is the one in the manifest', session.seen[0] === 'uptime');
  check('a clean run reports no error', result.error === '');

  const noisy = fakeSession({ pieces: ['x'.repeat(plugins.MAX_OUTPUT_BYTES + 5000)] });
  const bounded = await plugins.run(noisy, { id: 'p', command: 'yes', split: 'lines' });
  check('a server that answers forever is cut off', bounded.truncated === true);
  check('and what it did say is still a row', bounded.rows.length === 1);

  const angry = fakeSession({ pieces: [''], stderr: 'command not found', code: 127 });
  const failed = await plugins.run(angry, { id: 'p', command: 'nope', split: 'lines' });
  check('a command that failed explains itself', failed.error.includes('command not found'), failed.error);
  check('and carries the exit status', failed.code === 127);

  const quiet = fakeSession({ silent: true });
  await rejects('a command that never finishes is given up on',
    plugins.run(quiet, uptimePlugin, { timeoutMs: 50 }));
  check('and the channel it left behind is closed', quiet.channel.closed === true);

  const broken = fakeSession({ failWith: 'no channels left' });
  await rejects('a channel that will not open is reported', plugins.run(broken, uptimePlugin),
    (err) => err.message.includes('no channels left'));

  throws('running on a session that is not connected refuses',
    () => plugins.run({}, uptimePlugin),
    (err) => err.message.includes('not connected'));

  /* ---------- Installing and removing ---------- */

  const incoming = path.join(dir, 'incoming.json');
  fs.writeFileSync(incoming, JSON.stringify({ name: 'Disk use', command: 'df -h', columns: ['fs', 'use'] }));

  const installed = plugins.install(incoming);
  check('a chosen manifest is copied in', fs.existsSync(path.join(folder, 'incoming.json')));
  check('and comes back with the id it will have', installed.id === 'incoming');

  const second = plugins.install(incoming);
  check('installing the same file twice does not overwrite the first', second.file === 'incoming-2.json');

  const rubbish = path.join(dir, 'rubbish.json');
  fs.writeFileSync(rubbish, '{"name":"No command"}');
  throws('a manifest that could never load is refused at the picker',
    () => plugins.install(rubbish),
    (err) => err.message.includes('command'));
  check('and nothing is copied in', !fs.existsSync(path.join(folder, 'rubbish.json')));

  throws('a folder is not a plugin', () => plugins.install(dir), (err) => err.message.includes('not a file'));
  throws('a file that is not there is not a plugin',
    () => plugins.install(path.join(dir, 'ghost.json')),
    (err) => err.message.includes('could not be read'));

  check('a broken one can still be removed', plugins.remove('not-json') === true);
  check('and it is gone from the folder', !fs.existsSync(path.join(folder, 'not-json.json')));
  check('removing something that is not there is not an error', plugins.remove('never-existed') === false);
  check('an id that tries to walk out of the folder finds nothing',
    plugins.remove(`..${path.sep}..${path.sep}settings`) === false);

  fs.rmSync(dir, { recursive: true, force: true });
  done();
})();
