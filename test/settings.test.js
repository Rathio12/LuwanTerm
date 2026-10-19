'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('settings');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-settings-'));

fs.writeFileSync(
  path.join(dir, 'settings.json'),
  JSON.stringify({
    fontFamily: 'Cascadia Code',
    fontSize: 16,
    cursorStyle: 'underline',
    scrollback: 12000,
    copyOnSelect: false,
    webgl: true,
    discordShowHost: true,
    discordClientId: '111111111111',
  })
);

installElectronStub(dir);
const settings = require(path.join(__dirname, '..', 'src', 'main', 'store', 'settings'));

const loaded = settings.get();

check('a chosen font size survives an upgrade', loaded.fontSize === 16);
check('a chosen cursor style survives', loaded.cursorStyle === 'underline');
check('a chosen scrollback survives', loaded.scrollback === 12000);
check('a false boolean is not overwritten by its default', loaded.copyOnSelect === false);

check('settings added since gain their default', loaded.backgroundOpacity === 60 && loaded.terminalOpacity === 100);
check('an accent colour appears', loaded.accentColor === '#7c5cff');
check('a removed setting is dropped', !('discordClientId' in loaded));

const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
check('the migration is written back to disk', 'backgroundOpacity' in onDisk && !('discordClientId' in onDisk));

check('an unknown key cannot be introduced', !('nonsense' in settings.set({ nonsense: 1 })));
check('an out-of-range number is clamped', settings.set({ fontSize: 999 }).fontSize === 28);
check('a below-range number is clamped', settings.set({ fontSize: 1 }).fontSize === 9);
check('a non-numeric value is ignored', settings.set({ fontSize: 'huge' }).fontSize === 9);
check('booleans are coerced', settings.set({ webgl: 0 }).webgl === false);

check('a list setting starts empty', settings.get().enabledPlugins.length === 0);
check('a list setting round-trips', settings.set({ enabledPlugins: ['disk', 'docker'] }).enabledPlugins.join() === 'disk,docker');
check('the same id twice is stored once', settings.set({ enabledPlugins: ['disk', 'disk'] }).enabledPlugins.length === 1);
check('a list survives being written and read back',
  JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).enabledPlugins.join() === 'disk');

check('reset restores the defaults', settings.reset().fontSize === 14);
check('and empties the list again', settings.get().enabledPlugins.length === 0);

check('the host toggle of an older build is dropped', !('discordShowHost' in settings.get()));
check('rich presence is off until you turn it on', settings.get().discordEnabled === false);
check('the label source defaults to the provider', settings.get().discordLabel === 'provider');
check('the connection timer is on by default', settings.get().discordTimer === true);
check('the session count is off by default', settings.get().discordShowCount === false);
check('presence hides behind the away screen by default', settings.get().discordClearOnAway === true);

const labelBefore = settings.get().discordLabel;
check('an unknown label source is ignored',
  settings.set({ discordLabel: 'address' }).discordLabel === labelBefore);
check('a label source round-trips',
  settings.set({ discordLabel: 'name' }).discordLabel === 'name');
check('a label source is written back',
  JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).discordLabel === 'name');

done();
