'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUBLIC_KEY = 'MCowBQYDK2VwAyEAz7m8IeF6TRPj/QQHI5L0EjiE7fWRGeyRa/Tx6fcNkV8=';

const SIGNED_FIELDS = ['name', 'version', 'origin', 'commit', 'clean', 'builtAt', 'buildId', 'tree'];

function canonical(record) {
  return SIGNED_FIELDS.map((field) => `${field}=${record[field] === undefined ? '' : record[field]}`).join('\n');
}

function digestTree(root) {
  const names = [];

  const walk = (dir, prefix) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relative);
      else if (/\.(js|html|css|json)$/.test(entry.name) && !entry.name.endsWith('.generated.json')) names.push(relative);
    }
  };
  walk(root, '');

  const hash = crypto.createHash('sha256');
  for (const name of names) {
    hash.update(name);
    hash.update(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest());
  }
  return { tree: `sha256:${hash.digest('hex')}`, files: names.length };
}

let record = null;
try {
  record = require('./provenance.generated.json');
} catch {

  record = null;
}

function verify() {
  if (!record) return { state: 'absent', detail: 'this build carries no provenance record' };
  if (!record.signature) return { state: 'unsigned', detail: 'built without the project signing key' };

  try {
    const ok = crypto.verify(
      null,
      Buffer.from(canonical(record), 'utf8'),
      crypto.createPublicKey({ key: Buffer.from(PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' }),
      Buffer.from(record.signature, 'base64')
    );
    return ok
      ? { state: 'verified', detail: 'signed by the project' }
      : { state: 'forged', detail: 'the record does not match its signature' };
  } catch (err) {
    return { state: 'forged', detail: `the signature could not be checked: ${err.message}` };
  }
}

function checkTree(root = path.join(__dirname, '..')) {
  if (!record || !record.tree) return { ok: false, detail: 'nothing to compare against' };
  const digest = digestTree(root);
  return digest.tree === record.tree
    ? { ok: true, detail: `${digest.files} files match the signed digest` }
    : { ok: false, detail: `the files no longer match the signed digest (${digest.files} scanned)` };
}

function line() {
  if (!record) return 'LuwanTerm (unstamped build)';
  const { state } = verify();
  const dirty = record.clean ? '' : '+dirty';
  return `LuwanTerm ${record.version} ${record.commitShort}${dirty} build ${record.buildId} [${state}] from ${record.origin}`;
}

module.exports = {
  toString: line,

  PUBLIC_KEY,
  SIGNED_FIELDS,
  canonical,
  digestTree,
  verify,
  checkTree,
  line,

  stamped: Boolean(record),
  record,

  name: record ? record.name : '',
  version: record ? record.version : '',
  origin: record ? record.origin : '',
  licence: record ? record.licence : '',
  commit: record ? record.commit : '',
  commitShort: record ? record.commitShort : '',
  clean: record ? record.clean : undefined,
  builtAt: record ? record.builtAt : '',
  buildId: record ? record.buildId : '',
  tree: record ? record.tree : '',
};
