'use strict';

const fs = require('fs');
const path = require('path');
const { suite, check, done } = require('./helpers/harness');

suite('release-notes');

const root = path.join(__dirname, '..');
const { build, sectionFor, previousTag } = require(path.join(root, 'build', 'release-notes'));
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

const sample = [
  '# Changelog',
  '',
  '## 2.0.0',
  '',
  'The new one.',
  '',
  '## 1.9.0',
  '',
  'The old one.',
  '',
].join('\n');

check('a section stops at the next version', sectionFor(sample, '2.0.0') === 'The new one.');
check('an earlier section is found too', sectionFor(sample, '1.9.0') === 'The old one.');
check('an unknown version yields nothing', sectionFor(sample, '3.0.0') === '');
check('the previous tag is the next heading down', previousTag(sample, '2.0.0') === 'v1.9.0');
check('the oldest version has no previous tag', previousTag(sample, '1.9.0') === '');

const version = require(path.join(root, 'package.json')).version;
const notes = build(version);

check('the notes carry this version\'s changelog', notes.includes(sectionFor(changelog, version).split('\n')[0]));
check('they link the installer', notes.includes(`LuwanTerm-${version}-setup.exe`));
check('and the portable build', notes.includes(`LuwanTerm-${version}-portable.exe`));
check('they do not offer the blockmap', !notes.includes('blockmap'));
check('they link a comparison against the previous tag', /compare\/v\d+\.\d+\.\d+\.\.\.v/.test(notes));
check('every download link points at this tag', (notes.match(new RegExp(`download/v${version.replace(/\./g, '\.')}/`, 'g')) || []).length === 2);

const unknown = build('99.0.0');
check('an unreleased version still produces notes', unknown.includes('No changelog entry for 99.0.0'));
check('and still links its downloads', unknown.includes('LuwanTerm-99.0.0-setup.exe'));

check('every version in the changelog can be rendered',
  [...changelog.matchAll(/^## (\d+\.\d+\.\d+)$/gm)].every((m) => build(m[1]).length > 100),
  `${[...changelog.matchAll(/^## (\d+\.\d+\.\d+)$/gm)].length} versions`);

done();
