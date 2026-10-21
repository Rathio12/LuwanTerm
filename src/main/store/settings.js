'use strict';

const { JsonStore } = require('./json-store');
const paths = require('../paths');
const policy = require('../policy');

const DEFAULTS = {
  fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
  fontSize: 14,
  fontWeight: 'normal',
  lineHeight: 100,
  letterSpacing: 0,
  terminalTheme: 'luwan',
  terminalPadding: 12,
  scrollSensitivity: 1,
  ctrlWheelZoom: true,
  rightClick: 'paste',
  bell: 'none',
  cursorBlink: true,
  cursorStyle: 'bar',
  scrollback: 5000,
  copyOnSelect: true,
  confirmOnClose: true,
  webgl: true,
  backgroundImage: '',
  backgroundOpacity: 60,
  backgroundBlur: 0,
  backgroundEffect: 'none',
  effectDensity: 90,
  effectSpeed: 30,
  effectLinks: 130,
  effectGrid: true,
  effectGlow: true,
  effectAccent: true,
  effectMouse: true,
  effectMouseForce: 'none',
  effectNodeGlow: 60,
  effectPulse: true,
  effectNodeSize: 100,
  effectLineWidth: 7,
  effectLineOpacity: 70,
  effectGridSize: 64,
  effectColor: '#4a7cff',
  effectOpacity: 100,
  terminalOpacity: 100,
  accentColor: '#7c5cff',
  uiScale: 100,
  uiFontFamily: '',
  uiCorners: 'default',
  sidebarWidth: 268,
  reduceMotion: false,
  recentSessions: true,
  startClock: true,
  clockSeconds: false,
  clock12h: false,
  sessionLogging: false,
  sessionLogKeepAnsi: false,
  autoReconnect: false,
  autoReconnectAttempts: 3,
  autoReconnectDelaySeconds: 5,
  idleLockMinutes: 5,
  idleDisconnectMinutes: 10,
  betaUpdates: false,
  betaNoticeSeen: '',
  starPromptState: 'pending',
  starPromptSessions: 0,
  starPromptFirstRunAt: 0,
  discordEnabled: false,
  discordLabel: 'provider',
  discordTimer: true,
  discordShowIdle: true,
  discordShowCount: false,
  discordClearOnAway: true,
  enabledPlugins: [],
};

const OPTIONS = {
  discordLabel: ['provider', 'name', 'none'],
  cursorStyle: ['bar', 'block', 'underline'],
  fontWeight: ['300', 'normal', '500', '600', 'bold'],
  terminalTheme: [
    'luwan', 'dracula', 'nord', 'gruvbox', 'one-dark', 'tokyo-night',
    'catppuccin', 'solarized-dark', 'solarized-light', 'github-light',
  ],
  rightClick: ['paste', 'copy-paste', 'none'],
  bell: ['none', 'flash'],
  uiCorners: ['square', 'subtle', 'default', 'round'],
  backgroundEffect: ['none', 'constellation', 'flow', 'rain', 'dots', 'horizon'],
  effectMouseForce: ['none', 'repel', 'attract'],
};

const MAX_TEXT = 400;

const COLOURS = new Set(['accentColor', 'effectColor']);

const RENAMED = {
  backgroundEffect: { starfield: 'flow', aurora: 'horizon', waves: 'dots' },
};
const HEX = new RegExp('^#[0-9a-f]{6}$', 'i');

/* A list setting holds ids, so it is capped in both directions: how many, and
   how long each one may be. The renderer sends this array back verbatim. */
const MAX_LIST = 50;
const MAX_LIST_ITEM = 60;

const store = new JsonStore(paths.settingsFile, DEFAULTS);

const CLAMP = {
  fontSize: [9, 28],
  lineHeight: [100, 200],
  letterSpacing: [0, 6],
  terminalPadding: [0, 40],
  scrollSensitivity: [1, 10],
  uiScale: [75, 150],
  sidebarWidth: [200, 440],
  scrollback: [200, 200000],
  backgroundOpacity: [0, 100],
  backgroundBlur: [0, 40],
  effectDensity: [10, 220],
  effectSpeed: [0, 100],
  effectLinks: [60, 240],
  effectNodeGlow: [0, 100],
  effectNodeSize: [50, 250],
  effectLineWidth: [3, 20],
  effectLineOpacity: [0, 100],
  effectGridSize: [24, 160],
  effectOpacity: [10, 100],
  terminalOpacity: [20, 100],
  autoReconnectAttempts: [1, 20],
  autoReconnectDelaySeconds: [1, 300],
  idleLockMinutes: [0, 240],
  idleDisconnectMinutes: [0, 1440],
};

function coerce(patch) {
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    // hasOwnProperty, not `in`: '__proto__' and 'constructor' are in every
    // object through the prototype chain, so `in` waves them straight past.
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
    if (value === undefined || value === null) continue;
    if (Object.prototype.hasOwnProperty.call(OPTIONS, key)) {
      const allowed = OPTIONS[key];
      const renamed = RENAMED[key] && Object.prototype.hasOwnProperty.call(RENAMED[key], String(value));
      const chosen = renamed ? RENAMED[key][String(value)] : String(value);
      if (!allowed.includes(chosen)) continue;
      out[key] = chosen;
    } else if (Array.isArray(DEFAULTS[key])) {
      if (!Array.isArray(value)) continue;
      out[key] = [...new Set(value.map((item) => String(item).slice(0, MAX_LIST_ITEM)).filter(Boolean))]
        .slice(0, MAX_LIST);
    } else if (typeof DEFAULTS[key] === 'boolean') {
      out[key] = Boolean(value);
    } else if (typeof DEFAULTS[key] === 'number') {
      const num = Number(value);
      if (!Number.isFinite(num)) continue;
      const [min, max] = Object.prototype.hasOwnProperty.call(CLAMP, key) ? CLAMP[key] : [-Infinity, Infinity];
      out[key] = Math.min(max, Math.max(min, Math.round(num)));
    } else if (COLOURS.has(key)) {
      const colour = String(value).trim();
      if (!HEX.test(colour)) continue;
      out[key] = colour.toLowerCase();
    } else {
      out[key] = String(value).slice(0, MAX_TEXT);
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
  OPTIONS,
  CLAMP,
  clean: coerce,

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

  reset(keys) {
    if (!Array.isArray(keys)) return store.write(structuredClone(DEFAULTS));
    const chosen = keys.filter((key) => Object.prototype.hasOwnProperty.call(DEFAULTS, key));
    return store.update((data) => {
      for (const key of chosen) data[key] = structuredClone(DEFAULTS[key]);
      return data;
    });
  },
};
