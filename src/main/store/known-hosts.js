'use strict';

const { JsonStore } = require('./json-store');
const paths = require('../paths');

const store = new JsonStore(paths.knownHostsFile, { entries: {} });

const keyOf = (host, port) => `${host}:${port}`;

module.exports = {
  keyOf,

  /**
   * @returns {'trusted'|'unknown'|'changed'}
   */
  verify(host, port, fingerprint) {
    const entry = store.read().entries[keyOf(host, port)];
    if (!entry) return 'unknown';
    return entry.fingerprint === fingerprint ? 'trusted' : 'changed';
  },

  get(host, port) {
    return store.read().entries[keyOf(host, port)] || null;
  },

  trust(host, port, fingerprint, keyType) {
    return store.update((data) => {
      data.entries[keyOf(host, port)] = {
        host,
        port,
        fingerprint,
        keyType,
        addedAt: Date.now(),
      };
    });
  },

  list() {
    return Object.values(store.read().entries).sort((a, b) => a.host.localeCompare(b.host));
  },

  remove(host, port) {
    return store.update((data) => {
      const key = keyOf(host, port);
      const existed = key in data.entries;
      delete data.entries[key];
      return existed;
    });
  },
};
