'use strict';

const fs = require('fs');
const paths = require('./paths');

const DEFAULTS = {
  requireKnownHost: false,
  allowPasswordAuth: true,
  allowKeyboardInteractive: true,
  allowAgentAuth: true,
  allowSftp: true,
  allowTunnels: true,
  requireSessionLogging: false,
  idleTimeoutMinutes: 0,
  allowedHosts: [],
  blockedHosts: [],
  allowedKeyTypes: [],
  auditEnabled: true,
  auditRetentionDays: 90,
};

const BOOLEANS = new Set([
  'requireKnownHost', 'allowPasswordAuth', 'allowKeyboardInteractive', 'allowAgentAuth',
  'allowSftp', 'allowTunnels', 'requireSessionLogging', 'auditEnabled',
]);
const NUMBERS = { idleTimeoutMinutes: [0, 1440], auditRetentionDays: [0, 3650] };
const LISTS = new Set(['allowedHosts', 'blockedHosts', 'allowedKeyTypes']);

let cached = null;
let sources = [];

function readFile(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function coerce(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;

  for (const [key, value] of Object.entries(raw)) {
    if (BOOLEANS.has(key)) {
      out[key] = Boolean(value);
    } else if (NUMBERS[key]) {
      const [low, high] = NUMBERS[key];
      const number = Number(value);
      if (Number.isFinite(number)) out[key] = Math.min(high, Math.max(low, Math.round(number)));
    } else if (LISTS.has(key)) {
      if (Array.isArray(value)) out[key] = value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
    }
  }
  return out;
}

function tighten(user, machine) {
  const out = { ...user };

  for (const key of BOOLEANS) {
    if (key.startsWith('allow')) out[key] = user[key] && machine[key];
    else out[key] = user[key] || machine[key];
  }
  for (const key of Object.keys(NUMBERS)) {
    const both = [user[key], machine[key]].filter((value) => value > 0);
    out[key] = both.length ? Math.min(...both) : 0;
  }
  out.allowedHosts = machine.allowedHosts.length ? machine.allowedHosts : user.allowedHosts;
  out.blockedHosts = [...new Set([...user.blockedHosts, ...machine.blockedHosts])];
  out.allowedKeyTypes = machine.allowedKeyTypes.length ? machine.allowedKeyTypes : user.allowedKeyTypes;
  return out;
}

function matches(pattern, host) {
  let p = 0;
  let h = 0;
  let star = -1;
  let mark = 0;

  while (h < host.length) {
    if (p < pattern.length && (pattern[p] === '?' || pattern[p] === host[h])) {
      p += 1;
      h += 1;
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p;
      mark = h;
      p += 1;
    } else if (star >= 0) {
      p = star + 1;
      mark += 1;
      h = mark;
    } else {
      return false;
    }
  }

  while (p < pattern.length && pattern[p] === '*') p += 1;
  return p === pattern.length;
}

function load() {
  if (cached) return cached;

  sources = [];
  const userRaw = readFile(paths.userPolicyFile());
  if (userRaw) sources.push({ scope: 'user', file: paths.userPolicyFile() });

  let machineRaw = null;
  try {
    machineRaw = readFile(paths.machinePolicyFile());
    if (machineRaw) sources.push({ scope: 'machine', file: paths.machinePolicyFile() });
  } catch {
    machineRaw = null;
  }

  const user = coerce(userRaw);
  cached = machineRaw ? tighten(user, coerce(machineRaw)) : user;
  return cached;
}

module.exports = {
  DEFAULTS,

  get() {
    return { ...load() };
  },

  sources() {
    return sources.slice();
  },

  reload() {
    cached = null;
    return this.get();
  },

  allows(capability) {
    return Boolean(load()[capability]);
  },

  requires(rule) {
    return Boolean(load()[rule]);
  },

  hostAllowed(host) {
    const name = String(host || '').trim().toLowerCase();
    if (!name) return false;

    const current = load();
    if (current.blockedHosts.some((pattern) => matches(pattern, name))) return false;
    if (!current.allowedHosts.length) return true;
    return current.allowedHosts.some((pattern) => matches(pattern, name));
  },

  keyTypeAllowed(type) {
    const current = load();
    if (!current.allowedKeyTypes.length) return true;
    return current.allowedKeyTypes.includes(String(type || '').trim().toLowerCase());
  },

  idleTimeoutMs() {
    return load().idleTimeoutMinutes * 60 * 1000;
  },
};
