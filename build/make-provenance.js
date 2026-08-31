'use strict';

/**
 * Stamps the build with where it came from.
 *
 * Writes src/main/provenance.generated.json, which ships inside the asar. It
 * records the commit, the moment it was built, and a random id unique to this
 * one build. That last part is the useful bit: two binaries built from the same
 * commit still differ, so a leaked or repackaged build can be traced back to
 * the exact run that produced it.
 *
 * This is provenance, not protection. Anyone can delete the file. What it does
 * is make an unmodified copy self-identifying, and make a modified one show
 * that somebody chose to strip it.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const target = path.join(root, 'src', 'main', 'provenance.generated.json');
const pkg = require(path.join(root, 'package.json'));

const { SIGNED_FIELDS, canonical, digestTree } = require(path.join(root, 'src', 'main', 'provenance'));

function signingKey() {
  const file = path.join(root, '.provenance-key');

  const material =
    process.env.PROVENANCE_KEY !== undefined
      ? process.env.PROVENANCE_KEY
      : (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

  if (!material.trim()) return null;

  try {
    return crypto.createPrivateKey({
      key: Buffer.from(material.trim(), 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  } catch (err) {
    console.error(`provenance: the signing key could not be read (${err.message})`);
    process.exit(1);
  }
}

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const commit = git('rev-parse', 'HEAD');
const provenance = {
  name: pkg.name,
  version: pkg.version,
  origin: 'https://github.com/Rathio12/LuwanTerm',
  licence: 'LuwanTerm Licence 1.0 - source-available, not for sale',
  commit,
  commitShort: commit.slice(0, 12),

  clean: git('status', '--porcelain') === '',
  builtAt: new Date().toISOString(),
  buildId: crypto.randomUUID(),
};

const digest = digestTree(path.join(root, 'src'));
provenance.tree = digest.tree;
provenance.files = digest.files;

const key = signingKey();
if (key) {
  provenance.signature = crypto.sign(null, Buffer.from(canonical(provenance), 'utf8'), key).toString('base64');
}

if (SIGNED_FIELDS.some((field) => provenance[field] === undefined)) {
  console.error('provenance: a signed field is missing from the record');
  process.exit(1);
}

fs.writeFileSync(target, `${JSON.stringify(provenance, null, 2)}
`, 'utf8');

const state = key ? 'signed' : 'unsigned';
console.log(
  `provenance: ${provenance.version} ${provenance.commitShort}${provenance.clean ? '' : '+dirty'} ` +
    `build ${provenance.buildId} (${state}, ${digest.files} files)`
);
if (!key) {
  console.log('  no PROVENANCE_KEY: this build cannot be told apart from one a fork made');
}
