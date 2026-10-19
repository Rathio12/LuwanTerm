'use strict';

const fs = require('fs');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');

suite('rebrand');

const root = path.join(__dirname, '..');
const brand = require(path.join(root, 'src', 'main', 'brand'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

check('the product has one name, and it is Luwan Shell', brand.productName === 'Luwan Shell');
check('the build config agrees with it', pkg.build.productName === brand.productName);
check('the data folder keeps its old name, so an upgrade finds its data',
  brand.userDataFolder === 'luwan-term' && brand.userDataFolder === pkg.name);
check('the app id is unchanged, so auto-update still matches this install',
  brand.appId === 'io.luwan.term' && pkg.build.appId === brand.appId);
check('the repository it publishes to is unchanged',
  pkg.build.publish[0].owner === 'Rathio12' && pkg.build.publish[0].repo === 'LuwanTerm');
check('the installer file carries no spaces', pkg.build.nsis.artifactName.startsWith('LuwanShell-'));
check('neither does the portable file', pkg.build.portable.artifactName.startsWith('LuwanShell-'));
check('nor the executable', pkg.build.win.executableName === 'LuwanShell');
check('the Start Menu entry uses the full name', pkg.build.nsis.shortcutName === brand.productName);

const shipped = [];
const walk = (folder) => {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|html|css)$/.test(entry.name)) shipped.push(full);
  }
};
walk(path.join(root, 'src'));

const stale = [];
for (const file of shipped) {
  const text = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (relative === 'src/main/brand.js') continue;
  for (const match of text.matchAll(/LuwanTerm/g)) {
    const line = text.slice(0, match.index).split('\n').length;
    stale.push(`${relative}:${line}`);
  }
}
check('no screen still says LuwanTerm', stale.length === 0,
  stale.length ? stale.join(', ') : `${shipped.length} shipped files checked`);

const index = read('docs/index.html');
check('the website says Luwan Shell', index.includes('Luwan Shell'));
const visible = index
  .replace(/https?:\/\/[^\s"'<>)]+/g, '')
  .replace(/\bcd LuwanTerm\b/g, '');
check('no old name is left anywhere a visitor would read it', !/LuwanTerm/.test(visible));

const splash = read('src/renderer/splash.html');
const windowPage = read('src/renderer/index.html');
check('the window title is the product name', windowPage.includes(`<title>${brand.productName}</title>`));
check('the splash screen greets by the product name', splash.includes(brand.productName));

const provenance = read('src/main/provenance.js');
check('a build stamps itself with the product name', provenance.includes('Luwan Shell'));

done();
