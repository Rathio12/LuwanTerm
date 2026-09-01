'use strict';

const { JsonStore } = require('./json-store');
const paths = require('../paths');
const policy = require('../policy');

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
  sessionLogging: false,
  sessionLogKeepAnsi: false,
  autoReconnect: false,
  autoReconnectAttempts: 3,
  autoReconnectDelaySeconds: 5,
  starPromptState: 'pending',
  starPromptSessions: 0,
  starPromptFirstRunAt: 0,
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
  autoReconnectAttempts: [1, 20],
  autoReconnectDelaySeconds: [1, 300],
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

function enforce(current) {
  if (!policy.requires('requireSessionLogging')) return current;
  return { ...current, sessionLogging: true };
}

module.exports = {
  DEFAULTS,

  get() {
    if (!migrated) {
      migrated = true;
      return enforce(migrate());
    }
    return enforce(store.read());
  },

  set(patch) {
    return store.update((data) => Object.assign(data, coerce(patch)));
  },

  reset() {
    return store.write(structuredClone(DEFAULTS));
  },
};
