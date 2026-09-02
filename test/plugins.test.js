'use strict';

/**
 * Plugins are files on disk that somebody else may have written, so the loader
 * is a parser: it must accept the good ones, explain the bad ones, and never
 * throw - a broken plugin that stopped the app starting would be a worse bug
 * than the feature is worth.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('plugins');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-plugins-'));
installElectronStub(dir);

const root = path.join(__dirname, '..');
const plugins = require(path.join(root, 'src', 'main', 'plugins'));
const folder = plugins.folder();

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

fs.rmSync(dir, { recursive: true, force: true });
done();
