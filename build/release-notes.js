'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const REPO = 'Rathio12/LuwanTerm';

function sectionFor(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return '';

  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) break;
    body.push(lines[i]);
  }
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body[body.length - 1].trim()) body.pop();
  return body.join('\n');
}

function previousTag(changelog, version) {
  const versions = [...changelog.matchAll(/^## (\d+\.\d+\.\d+)$/gm)].map((m) => m[1]);
  const index = versions.indexOf(version);
  return index >= 0 && versions[index + 1] ? `v${versions[index + 1]}` : '';
}

function build(version) {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const section = sectionFor(changelog, version);
  const previous = previousTag(changelog, version);

  const parts = [];
  if (section) parts.push(section);
  else parts.push(`No changelog entry for ${version}.`);

  parts.push('---');

  const downloads = [
    '**Download**',
    '',
    `- [LuwanTerm-${version}-setup.exe](https://github.com/${REPO}/releases/download/v${version}/LuwanTerm-${version}-setup.exe)` +
      ' - installer, adds a Start Menu entry and updates itself',
    `- [LuwanTerm-${version}-portable.exe](https://github.com/${REPO}/releases/download/v${version}/LuwanTerm-${version}-portable.exe)` +
      ' - single file, nothing installed',
  ];
  parts.push(downloads.join('\n'));

  if (previous) {
    parts.push(`**Full changelog:** [${previous}...v${version}](https://github.com/${REPO}/compare/${previous}...v${version})`);
  }

  return `${parts.join('\n\n')}\n`;
}

if (require.main === module) {
  const version = process.argv[2] || require(path.join(root, 'package.json')).version;
  process.stdout.write(build(version.replace(/^v/, '')));
}

module.exports = { build, sectionFor, previousTag };
