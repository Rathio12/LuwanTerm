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
  backgroundImage: '',
  backgroundOpacity: 60,
  backgroundBlur: 0,
  terminalOpacity: 100,
  accentColor: '#7c5cff',
  discordEnabled: true,

  discordShowHost: false,
};

const store = new JsonStore(paths.settingsFile, DEFAULTS);

const CLAMP = {
  fontSize: [9, 28],
  scrollback: [200, 200000],
  backgroundOpacity: [0, 100],
  backgroundBlur: [0, 40],
  terminalOpacity: [20, 100],
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

let migrated = false;

/**
 * Brings a settings file written by an older build up to date: missing keys get
 * their default, out-of-range values are clamped, and keys that no longer exist
 * are dropped so a removed setting cannot come back from disk.
 *
 * Runs once per launch, and only writes when something actually changed.
 */
function migrate() {
  const stored = store.read();
  const clean = { ...DEFAULTS, ...coerce(stored) };

  const before = JSON.stringify(stored, Object.keys(stored).sort());
  const after = JSON.stringify(clean, Object.keys(clean).sort());
  if (before !== after) {
    const removed = Object.keys(stored).filter((key) => !(key in DEFAULTS));
    if (removed.length) console.log(`[settings] dropping keys from an older build: ${removed.join(', ')}`);
    store.write(clean);
  }
  return clean;
}

module.exports = {
  DEFAULTS,

  get() {
    if (!migrated) {
      migrated = true;
      return migrate();
    }
    return store.read();
  },

  set(patch) {
    return store.update((data) => Object.assign(data, coerce(patch)));
  },

  reset() {
    return store.write(structuredClone(DEFAULTS));
  },
};
