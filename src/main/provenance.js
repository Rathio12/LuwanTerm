'use strict';

/**
 * Build provenance.
 *
 * Every build carries a record of where it came from - version, commit, the
 * moment it was built, and an id unique to that one run - signed with a key
 * only the project holds. The public half is below, so any copy of the app can
 * work out for itself whether it is a genuine build, a fork's own build, or a
 * record somebody edited.
 *
 * This is a mark on the software, not on the person running it. It records
 * nothing about you, reads nothing from your machine and sends nothing
 * anywhere. The record is written once at build time and only ever read.
 *
 * `luwanterm --provenance` prints it. `node build/check-copy.js <path>` is the
 * other half: it finds this project's writing inside something that no longer
 * carries the record at all.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** The public half of the project's signing key. Verification only. */
const PUBLIC_KEY = 'MCowBQYDK2VwAyEAz7m8IeF6TRPj/QQHI5L0EjiE7fWRGeyRa/Tx6fcNkV8=';

/**
 * The fields the signature covers, in this order. The order is part of the
 * format: a field added later cannot silently change what an older signature
 * was taken over.
 */
const SIGNED_FIELDS = ['name', 'version', 'origin', 'commit', 'clean', 'builtAt', 'buildId', 'tree'];

/** The exact bytes that get signed. */
function canonical(record) {
  return SIGNED_FIELDS.map((field) => `${field}=${record[field] === undefined ? '' : record[field]}`).join('\n');
}

/**
 * A digest over the source that ships inside the asar.
 *
 * Shared with build/make-provenance.js so both sides measure the same thing:
 * every .js, .html, .css and .json under src/, by sorted path, hashed with its
 * contents. The generated files are left out - they are written after this runs.
 */
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

/**
 * Checks the record against the embedded public key.
 *
 * @returns {{state: string, detail: string}}
 *   `verified` - a genuine build of this project.
 *   `unsigned` - stamped, but built without the signing key. A fork's own build
 *                looks like this, and so does a local `npm run dist`.
 *   `forged`   - the record has been edited since it was signed.
 *   `absent`   - no record at all: a development tree, or somebody removed it.
 */
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

/**
 * Recomputes the digest over the files actually present and compares it with
 * the one that was signed. Catches a genuine build whose code was edited after
 * the fact - the signature still checks out, but the files no longer match it.
 */
function checkTree(root = path.join(__dirname, '..')) {
  if (!record || !record.tree) return { ok: false, detail: 'nothing to compare against' };
  const digest = digestTree(root);
  return digest.tree === record.tree
    ? { ok: true, detail: `${digest.files} files match the signed digest` }
    : { ok: false, detail: `the files no longer match the signed digest (${digest.files} scanned)` };
}

/** One line, short enough for a log header or a bug report. */
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

  /** Whether this build was stamped at all. */
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
