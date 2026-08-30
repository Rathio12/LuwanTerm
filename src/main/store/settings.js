'use strict';

const { JsonStore } = require('./json-store');
const paths = require('../paths');

const DEFAULTS = {
  fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
  fontSize: 14,
  cursorBlink: true,
  cursorStyle: 'bar',
  scrollback: 5000,
  copyOnSelect: true,
  confirmOnClose: true,
  webgl: true,
  discordEnabled: true,
  // Host names stay off by default: an SSH client should not announce which
  // machines you are logged into. Opt in explicitly if you want that.
  discordShowHost: false,
};

const store = new JsonStore(paths.settingsFile, DEFAULTS);

const CLAMP = {
  fontSize: [9, 28],
  scrollback: [200, 200000],
};

function coerce(patch) {
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULTS) || value === undefined || value === null) continue;
    if (typeof DEFAULTS[key] === 'boolean') {
      out[key] = Boolean(value);
    } else if (typeof DEFAULTS[key] === 'number') {
      const num = Number(value);
      if (!Number.isFinite(num)) continue;
      const [min, max] = CLAMP[key] || [-Infinity, Infinity];
      out[key] = Math.min(max, Math.max(min, Math.round(num)));
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

module.exports = {
  DEFAULTS,

  get() {
    return store.read();
  },

  set(patch) {
    return store.update((data) => Object.assign(data, coerce(patch)));
  },

  reset() {
    return store.write(structuredClone(DEFAULTS));
  },
};
