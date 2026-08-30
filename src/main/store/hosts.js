'use strict';

const crypto = require('crypto');
const { JsonStore } = require('./json-store');
const paths = require('../paths');

const store = new JsonStore(paths.hostsFile, { hosts: [] });

const ACCENTS = ['#7c5cff', '#3ea8ff', '#22c58b', '#f2a33c', '#ff5c8a', '#8b5cf6'];

const newId = () => `h_${crypto.randomBytes(6).toString('hex')}`;

function normalize(input, existing = {}) {
  const port = Number.parseInt(input.port, 10);
  const keepalive = Number.parseInt(input.keepaliveSeconds, 10);
  const host = String(input.host || '').trim();
  const username = String(input.username || '').trim();

  if (!host) throw new Error('Host address is required.');
  if (!username) throw new Error('Username is required.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Port must be between 1 and 65535.');
  }

  return {
    id: existing.id || newId(),
    name: String(input.name || '').trim() || host,
    host,
    port,
    username,
    auth: ['password', 'key', 'agent'].includes(input.auth) ? input.auth : 'password',
    keyId: String(input.keyId || '').trim(),
    privateKeyPath: String(input.privateKeyPath || '').trim(),
    group: String(input.group || '').trim(),
    color: ACCENTS.includes(input.color) ? input.color : existing.color || ACCENTS[0],
    keepaliveSeconds: Number.isInteger(keepalive) && keepalive >= 0 ? keepalive : 30,
    initialCommand: String(input.initialCommand || ''),
    defaultPath: String(input.defaultPath || '').trim(),
    createdAt: existing.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

module.exports = {
  ACCENTS,

  list() {
    return store.read().hosts;
  },

  get(id) {
    return store.read().hosts.find((h) => h.id === id) || null;
  },

  save(input) {
    return store.update((data) => {
      const index = data.hosts.findIndex((h) => h.id === input.id);
      const record = normalize(input, index >= 0 ? data.hosts[index] : {});
      if (index >= 0) data.hosts[index] = record;
      else data.hosts.push(record);
      return record;
    });
  },

  remove(id) {
    return store.update((data) => {
      const before = data.hosts.length;
      data.hosts = data.hosts.filter((h) => h.id !== id);
      return before !== data.hosts.length;
    });
  },

  duplicate(id) {
    return store.update((data) => {
      const source = data.hosts.find((h) => h.id === id);
      if (!source) throw new Error('Host not found.');
      const copy = { ...source, id: newId(), name: `${source.name} copy`, createdAt: Date.now() };
      data.hosts.push(copy);
      return copy;
    });
  },
};
