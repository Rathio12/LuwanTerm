'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { JsonStore } = require('./json-store');
const paths = require('../paths');
const vault = require('./vault');
const keygen = require('../ssh/keygen');
const discovery = require('../ssh/discovery');

const store = new JsonStore(paths.keysFile, { keys: [] });

const secretKey = (id) => `key:${id}:passphrase`;
const newId = () => `k_${crypto.randomBytes(6).toString('hex')}`;

function keyFile(id) {
  return path.join(paths.keysDir(), id);
}

function writeKeyFile(id, contents) {
  fs.mkdirSync(paths.keysDir(), { recursive: true });
  fs.writeFileSync(keyFile(id), contents, { encoding: 'utf8', mode: 0o600 });
}

function record(details, { id, name, source, encrypted, bits }) {
  return {
    id,
    name,
    source,
    type: details.type,
    bits: bits || null,
    comment: details.comment,
    publicKey: details.publicKey,
    fingerprint: details.fingerprint,
    encrypted: Boolean(encrypted),
    createdAt: Date.now(),
  };
}

function ensureName(name, fallback) {
  const trimmed = String(name || '').trim();
  if (trimmed) return trimmed;
  return fallback;
}

module.exports = {
  list() {
    return store.read().keys.map((key) => ({
      ...key,
      hasStoredPassphrase: vault.has(secretKey(key.id)),
    }));
  },

  get(id) {
    if (discovery.isDiscoveredId(id)) {
      const found = discovery.describePath(discovery.pathForId(id));
      return found ? { ...found, hasStoredPassphrase: vault.has(secretKey(id)) } : null;
    }
    return store.read().keys.find((key) => key.id === id) || null;
  },

  async candidates() {
    const known = new Set(this.list().filter((key) => key.path).map((key) => key.path));
    const found = await discovery.scan();
    return found.filter((key) => !known.has(key.path));
  },

  privateKey(id) {
    const meta = this.get(id);
    if (!meta) throw new Error('That key is no longer available.');

    const file = meta.path || keyFile(id);
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      throw new Error(`Key file for "${meta.name}" could not be read: ${err.message}`);
    }
  },

  linkFile({ filePath, name, passphrase, savePassphrase }) {
    let contents;
    try {
      contents = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new Error(`Could not read ${filePath}: ${err.message}`);
    }

    let details;
    let encrypted = Boolean(passphrase);
    try {
      details = keygen.inspect(contents, passphrase);
    } catch (err) {
      if (!err.needsPassphrase) throw err;
      const found = discovery.describePath(filePath);
      if (!found) throw err;
      details = found;
      encrypted = true;
    }

    const id = newId();
    if (passphrase && savePassphrase) vault.set(secretKey(id), passphrase);

    const meta = {
      ...record(details, {
        id,
        name: ensureName(name, path.basename(filePath)),
        source: 'linked',
        encrypted,
      }),
      path: filePath,
    };

    store.update((data) => data.keys.push(meta));
    return { ...meta, hasStoredPassphrase: vault.has(secretKey(id)) };
  },

  passphrase(id) {
    return vault.get(secretKey(id));
  },

  create({ name, type, bits, comment, passphrase, savePassphrase }) {
    const generated = keygen.generate({ type, bits, comment, passphrase });
    const id = newId();
    writeKeyFile(id, generated.privateKey);

    if (passphrase && savePassphrase) vault.set(secretKey(id), passphrase);

    const meta = record(generated, {
      id,
      name: ensureName(name, `${type}-${id.slice(2, 8)}`),
      source: 'generated',
      encrypted: generated.encrypted,
      bits: generated.bits,
    });

    store.update((data) => data.keys.push(meta));
    return { ...meta, hasStoredPassphrase: vault.has(secretKey(id)) };
  },

  importFile({ filePath, name, passphrase, savePassphrase }) {
    let contents;
    try {
      contents = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new Error(`Could not read ${filePath}: ${err.message}`);
    }

    const details = keygen.inspect(contents, passphrase);
    const encrypted = Boolean(passphrase);
    const id = newId();
    writeKeyFile(id, contents);

    if (encrypted && savePassphrase) vault.set(secretKey(id), passphrase);

    const meta = record(details, {
      id,
      name: ensureName(name, path.basename(filePath)),
      source: 'imported',
      encrypted,
    });

    store.update((data) => data.keys.push(meta));
    return { ...meta, hasStoredPassphrase: vault.has(secretKey(id)) };
  },

  rename(id, name) {
    return store.update((data) => {
      const meta = data.keys.find((key) => key.id === id);
      if (!meta) throw new Error('Key not found.');
      meta.name = ensureName(name, meta.name);
      return meta;
    });
  },

  setPassphrase(id, passphrase) {
    if (!this.get(id)) throw new Error('Key not found.');
    if (!passphrase) return vault.clear(secretKey(id));

    keygen.inspect(this.privateKey(id), passphrase);
    return vault.set(secretKey(id), passphrase);
  },

  remove(id) {
    const meta = this.get(id);
    if (!meta) return false;
    if (discovery.isDiscoveredId(id)) {
      throw new Error('This key was found on your system. Remove the file yourself if you want it gone.');
    }

    store.update((data) => {
      data.keys = data.keys.filter((key) => key.id !== id);
    });
    vault.clear(secretKey(id));

    if (meta.source !== 'linked') {
      try {
        fs.rmSync(keyFile(id), { force: true });
      } catch (err) {
        console.error('[keys] could not delete key file:', err.message);
      }
    }
    return true;
  },
};
