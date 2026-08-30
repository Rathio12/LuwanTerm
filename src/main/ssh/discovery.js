'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const ppk = require('./ppk');
const keygen = require('./keygen');
const { fingerprintOf } = require('./fingerprint');

/**
 * Finds SSH keys already present on this machine so they can be used without
 * being imported or copied anywhere.
 *
 * Sources: the user's ~/.ssh directory, and on Windows the key files referenced
 * by PuTTY's saved sessions.
 */

const MAX_KEY_BYTES = 128 * 1024;

const IGNORED = new Set([
  'authorized_keys',
  'authorized_keys2',
  'config',
  'environment',
  'known_hosts',
  'known_hosts.old',
  'rc',
  'agent.env',
]);

const PRIVATE_HEADER = /^\s*(-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|PuTTY-User-Key-File-\d+\s*:)/;

/** Stable id for a key referenced by path rather than stored in the app. */
const idForPath = (file) => `disc:${Buffer.from(file, 'utf8').toString('base64url')}`;
const pathForId = (id) => Buffer.from(id.slice(5), 'base64url').toString('utf8');
const isDiscoveredId = (id) => typeof id === 'string' && id.startsWith('disc:');

function readIfKey(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_KEY_BYTES) return null;

  let contents;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  return PRIVATE_HEADER.test(contents) ? contents : null;
}

/**
 * Describes a key file without needing its passphrase.
 *
 * PPK files carry their public half in the clear. For an encrypted OpenSSH key
 * we fall back to the sibling .pub file, and if that is missing the entry is
 * still listed, just without a fingerprint.
 */
function describe(file, contents) {
  const base = { id: idForPath(file), path: file, name: path.basename(file), source: 'discovered' };

  if (ppk.looksLikePpk(contents)) {
    try {
      const info = ppk.readPublic(contents);
      const comment = info.comment || '';
      return {
        ...base,
        type: info.algorithm,
        comment,
        fingerprint: fingerprintOf(info.publicBlob),
        publicKey: `${info.algorithm} ${info.publicBlob.toString('base64')}${comment ? ` ${comment}` : ''}`,
        encrypted: info.encrypted,
        format: `ppk-v${info.version}`,
      };
    } catch {
      return { ...base, type: 'unknown', comment: '', encrypted: true, format: 'ppk' };
    }
  }

  try {
    const info = keygen.inspect(contents);
    return { ...base, ...info, encrypted: false, format: 'openssh' };
  } catch (err) {
    if (!err.needsPassphrase) return null;
    return { ...base, ...fromSiblingPublicKey(file), encrypted: true, format: 'openssh' };
  }
}

/** Recovers metadata for an encrypted key from its matching .pub file. */
function fromSiblingPublicKey(file) {
  try {
    const line = fs.readFileSync(`${file}.pub`, 'utf8').trim();
    const [type, blob, ...rest] = line.split(/\s+/);
    if (!type || !blob) return { type: 'unknown', comment: '' };
    return {
      type,
      comment: rest.join(' '),
      fingerprint: fingerprintOf(Buffer.from(blob, 'base64')),
      publicKey: line,
    };
  } catch {
    return { type: 'unknown', comment: '' };
  }
}

function scanSshDirectory(found) {
  const dir = path.join(os.homedir(), '.ssh');
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }

  for (const name of names) {
    if (IGNORED.has(name) || name.endsWith('.pub')) continue;
    const file = path.join(dir, name);
    if (found.has(file)) continue;
    const contents = readIfKey(file);
    if (!contents) continue;
    const entry = describe(file, contents);
    if (entry) found.set(file, { ...entry, origin: 'ssh-dir' });
  }
}

/** Reads PublicKeyFile out of PuTTY's saved sessions in the registry. */
function scanPuttySessions() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve([]);
      return;
    }
    execFile(
      'reg',
      ['query', 'HKCU\Software\SimonTatham\PuTTY\Sessions', '/s', '/v', 'PublicKeyFile'],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }
        const files = new Set();
        for (const line of stdout.split(/\r?\n/)) {
          const match = /PublicKeyFile\s+REG_[A-Z_]+\s+(.+?)\s*$/.exec(line);
          if (match && match[1]) files.add(match[1]);
        }
        resolve([...files]);
      }
    );
  });
}

/**
 * @returns {Promise<object[]>} discovered keys, newest sources last
 */
async function scan() {
  const found = new Map();
  scanSshDirectory(found);

  for (const file of await scanPuttySessions()) {
    if (found.has(file)) continue;
    const contents = readIfKey(file);
    if (!contents) continue;
    const entry = describe(file, contents);
    if (entry) found.set(file, { ...entry, origin: 'putty' });
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Describes a single key file by path, for keys referenced rather than stored.
 * @returns {object|null} null when the file is missing or is not a private key
 */
function describePath(file) {
  const contents = readIfKey(file);
  if (!contents) return null;
  const entry = describe(file, contents);
  return entry ? { ...entry, origin: 'ssh-dir' } : null;
}

module.exports = { scan, describePath, idForPath, pathForId, isDiscoveredId };
