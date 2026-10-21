'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');
const { installElectronStub } = require('./helpers/electron-stub');

suite('themes');

const dir = installElectronStub();
const themes = require(path.join(__dirname, '..', 'src', 'main', 'themes'));
const settings = require(path.join(__dirname, '..', 'src', 'main', 'store', 'settings'));
const folder = path.join(dir, 'themes');

const shipped = themes.list();
check('the app ships themes', shipped.themes.length >= 6, `${shipped.themes.length} themes`);
check('every shipped theme is valid', shipped.broken.length === 0, JSON.stringify(shipped.broken));
check('each one has a name and a description', shipped.themes.every((theme) => theme.name && theme.description));
check('shipped themes are marked as built in', shipped.themes.every((theme) => theme.source === 'built-in'));
check('shipped themes cover every animated background',
  ['constellation', 'flow', 'rain', 'dots', 'horizon'].every((effect) =>
    shipped.themes.some((theme) => theme.settings.backgroundEffect === effect)));

const night = shipped.themes.find((theme) => theme.id === 'built-in:luwan-night');
check('a theme fills in every look setting it leaves out', night.settings.effectOpacity === 100 && night.settings.uiCorners === 'default');
check('but not the font you chose', !('fontFamily' in night.settings));
check('and not the background image you chose', !('backgroundImage' in night.settings));

const valid = (raw) => themes.validate(raw, 'yours:test', folder);
check('a theme needs a name', valid({ settings: {} }).problems.some((p) => p.includes('name')));
check('a theme needs settings', valid({ name: 'x' }).problems.some((p) => p.includes('settings')));
check('a setting outside the look is refused, by name',
  valid({ name: 'x', settings: { discordEnabled: true } }).problems.some((p) => p.includes('discordEnabled')));
check('a value the setting cannot take is refused, by name',
  valid({ name: 'x', settings: { backgroundEffect: 'fireworks' } }).problems.some((p) => p.includes('backgroundEffect')));
check('an out-of-range number is clamped rather than refused',
  valid({ name: 'x', settings: { effectDensity: 9999 } }).theme.settings.effectDensity === 220);
check('an image path that climbs out of the folder is refused',
  valid({ name: 'x', settings: { backgroundImage: '../../secret.png' } }).problems.some((p) => p.includes('backgroundImage')));
check('an absolute image path is refused',
  valid({ name: 'x', settings: { backgroundImage: 'C:\\Windows\\win.png' } }).problems.length > 0);
check('an image that is not there is refused',
  valid({ name: 'x', settings: { backgroundImage: 'missing.png' } }).problems.some((p) => p.includes('missing.png')));
check('a file that is not an image is refused',
  valid({ name: 'x', settings: { backgroundImage: 'notes.txt' } }).problems.length > 0);

const image = path.join(os.tmpdir(), `luwan-theme-test-${process.pid}.png`);
fs.writeFileSync(image, Buffer.from([137, 80, 78, 71]));
const saved = themes.save({
  name: 'My Night',
  look: { ...settings.DEFAULTS, accentColor: '#ff0000', backgroundEffect: 'horizon', backgroundImage: image, discordEnabled: true },
});
const written = JSON.parse(fs.readFileSync(path.join(folder, saved.file), 'utf8'));
check('saving writes a theme file', saved.file === 'my-night.json' && written.name === 'My Night');
check('it keeps the look', written.settings.accentColor === '#ff0000' && written.settings.backgroundEffect === 'horizon');
check('and nothing that is not part of a look', !('discordEnabled' in written.settings) && !('fontSize' in written.settings));
check('the background image is copied in beside it', fs.existsSync(path.join(folder, written.settings.backgroundImage)));
check('and referred to by name only', !written.settings.backgroundImage.includes(path.sep));

const listed = themes.list();
const mine = listed.themes.find((theme) => theme.id === saved.id);
check('a saved theme is listed as yours', mine && mine.source === 'yours');
check('its image resolves to the file in the themes folder', mine.settings.backgroundImage === path.join(folder, written.settings.backgroundImage));
check('saving the same name twice keeps both', themes.save({ name: 'My Night', look: {} }).file === 'my-night-2.json');

fs.writeFileSync(path.join(folder, 'broken.json'), '{"name": "Broken", "settings": {"accentColor": 5, "nope": 1}}');
const withBroken = themes.list();
check('a broken file is listed, not swallowed', withBroken.broken.some((entry) => entry.file === 'broken.json'));
check('with what is wrong in words', withBroken.broken.find((entry) => entry.file === 'broken.json').problems.some((p) => p.includes('nope')));

const outside = path.join(os.tmpdir(), `luwan-shared-theme-${process.pid}.json`);
fs.writeFileSync(outside, JSON.stringify({ name: 'Shared', settings: { terminalTheme: 'nord' } }));
const installed = themes.install(outside);
check('a theme file can be added from anywhere', installed.name === 'Shared' && fs.existsSync(path.join(folder, installed.file)));
const junk = path.join(os.tmpdir(), `luwan-junk-theme-${process.pid}.json`);
fs.writeFileSync(junk, JSON.stringify({ name: 'Junk', settings: { webgl: false } }));
let refused = '';
try {
  themes.install(junk);
} catch (err) {
  refused = err.message;
}
check('an invalid one is refused with the reason', refused.includes('webgl'));

let builtInDelete = '';
try {
  themes.remove('built-in:luwan-night');
} catch (err) {
  builtInDelete = err.message;
}
check('a built-in theme cannot be deleted', builtInDelete.length > 0);
check('your own one can', themes.remove(saved.id) === true && !fs.existsSync(path.join(folder, saved.file)));

for (const file of [image, outside, junk]) fs.rmSync(file, { force: true });

done();
