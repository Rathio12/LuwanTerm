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

const fresh = settings.reset();
check('a new install looks exactly as before',
  fresh.terminalTheme === 'luwan' && fresh.lineHeight === 100 && fresh.letterSpacing === 0
  && fresh.terminalPadding === 12 && fresh.uiScale === 100 && fresh.sidebarWidth === 268
  && fresh.uiCorners === 'default' && fresh.rightClick === 'paste' && fresh.bell === 'none'
  && fresh.fontWeight === 'normal' && fresh.uiFontFamily === '' && fresh.reduceMotion === false);

check('a colour scheme round-trips', settings.set({ terminalTheme: 'nord' }).terminalTheme === 'nord');
check('an unknown colour scheme is ignored', settings.set({ terminalTheme: 'matrix' }).terminalTheme === 'nord');
check('an unknown right-click action is ignored', settings.set({ rightClick: 'format-disk' }).rightClick === 'paste');
check('an unknown font weight is ignored', settings.set({ fontWeight: '950' }).fontWeight === 'normal');
check('interface scale is clamped up', settings.set({ uiScale: 10 }).uiScale === 75);
check('and down', settings.set({ uiScale: 900 }).uiScale === 150);
check('line height is clamped', settings.set({ lineHeight: 500 }).lineHeight === 200);
check('sidebar width is clamped', settings.set({ sidebarWidth: 5 }).sidebarWidth === 200);
check('a free-text setting is capped in length',
  settings.set({ uiFontFamily: 'x'.repeat(5000) }).uiFontFamily.length === 400);

check('the animated background is off for a new install', settings.get().backgroundEffect === 'none');
check('the constellation can be chosen', settings.set({ backgroundEffect: 'constellation' }).backgroundEffect === 'constellation');
check('an old effect name moves to its replacement', settings.set({ backgroundEffect: 'aurora' }).backgroundEffect === 'horizon');
check('as do the others', settings.set({ backgroundEffect: 'starfield' }).backgroundEffect === 'flow'
  && settings.set({ backgroundEffect: 'waves' }).backgroundEffect === 'dots');
settings.set({ backgroundEffect: 'constellation' });
check('an unknown effect is ignored', settings.set({ backgroundEffect: 'fireworks' }).backgroundEffect === 'constellation');
check('effect density is clamped', settings.set({ effectDensity: 9999 }).effectDensity === 220);
check('effect speed can be zero', settings.set({ effectSpeed: 0 }).effectSpeed === 0);
check('link distance is clamped', settings.set({ effectLinks: 1 }).effectLinks === 60);
check('nodes glow out of the box', settings.get().effectNodeGlow === 60 && settings.get().effectPulse === true);
check('glow is clamped', settings.set({ effectNodeGlow: 500 }).effectNodeGlow === 100);
check('node size is clamped', settings.set({ effectNodeSize: 1 }).effectNodeSize === 50);
check('an unknown mouse force is ignored', settings.set({ effectMouseForce: 'explode' }).effectMouseForce === 'none');
check('the mouse can push nodes away', settings.set({ effectMouseForce: 'repel' }).effectMouseForce === 'repel');
settings.set({ backgroundEffect: 'none', effectDensity: 90, effectSpeed: 30, effectLinks: 130,
  effectNodeGlow: 60, effectNodeSize: 100, effectMouseForce: 'none' });

settings.set({ enabledPlugins: ['disk'], betaUpdates: true, terminalTheme: 'dracula', uiScale: 120 });
const partial = settings.reset(['terminalTheme', 'uiScale', 'notASetting']);
check('a partial reset restores the keys it names', partial.terminalTheme === 'luwan' && partial.uiScale === 100);
check('and leaves the rest alone', partial.enabledPlugins.join() === 'disk' && partial.betaUpdates === true);
check('and cannot invent a key', !('notASetting' in partial));

done();
