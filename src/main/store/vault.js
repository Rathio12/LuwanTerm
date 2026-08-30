'use strict';

const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const paths = require('../paths');

/**
 * Secret storage backed by the OS keychain (DPAPI on Windows, Keychain on macOS,
 * libsecret on Linux) through Electron's safeStorage.
 *
 * If the platform cannot encrypt, we deliberately store nothing rather than
 * writing plaintext credentials to disk. Callers check `available()` and fall
 * back to prompting the user on every connect.
 */

let cache = null;

function available() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(paths.vaultFile(), 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

function persist() {
  const file = paths.vaultFile();
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(cache), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

module.exports = {
  available,

  has(key) {
    return Boolean(load()[key]);
  },

  get(key) {
    if (!available()) return null;
    const blob = load()[key];
    if (!blob) return null;
    try {
      return safeStorage.decryptString(Buffer.from(blob, 'base64'));
    } catch (err) {
      console.error('[vault] failed to decrypt secret, dropping it:', err.message);
      delete cache[key];
      persist();
      return null;
    }
  },

  set(key, value) {
    if (!available()) return false;
    if (!value) return this.clear(key);
    load()[key] = safeStorage.encryptString(String(value)).toString('base64');
    persist();
    return true;
  },

  clear(key) {
    if (!load()[key]) return false;
    delete cache[key];
    persist();
    return true;
  },

  /** Drops every secret belonging to a host that was deleted. */
  clearPrefix(prefix) {
    const data = load();
    let changed = false;
    for (const key of Object.keys(data)) {
      if (key.startsWith(prefix)) {
        delete data[key];
        changed = true;
      }
    }
    if (changed) persist();
    return changed;
  },
};
