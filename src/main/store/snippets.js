'use strict';

const crypto = require('crypto');
const { JsonStore } = require('./json-store');
const paths = require('../paths');

const store = new JsonStore(paths.snippetsFile, { snippets: [] });

module.exports = {
  list() {
    return store.read().snippets;
  },

  save(input) {
    const command = String(input.command || '').trim();
    if (!command) throw new Error('Snippet command cannot be empty.');

    return store.update((data) => {
      const record = {
        id: input.id || `s_${crypto.randomBytes(6).toString('hex')}`,
        label: String(input.label || '').trim() || command.slice(0, 40),
        command,
        runOnInsert: Boolean(input.runOnInsert),
        updatedAt: Date.now(),
      };
      const index = data.snippets.findIndex((s) => s.id === record.id);
      if (index >= 0) data.snippets[index] = record;
      else data.snippets.push(record);
      return record;
    });
  },

  remove(id) {
    return store.update((data) => {
      const before = data.snippets.length;
      data.snippets = data.snippets.filter((s) => s.id !== id);
      return before !== data.snippets.length;
    });
  },
};
