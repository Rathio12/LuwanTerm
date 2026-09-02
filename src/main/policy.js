'use strict';

const fs = require('fs');
const dns = require('dns');
const net = require('net');
const paths = require('./paths');

const DEFAULTS = {
  requireKnownHost: false,
  allowPasswordAuth: true,
  allowKeyboardInteractive: true,
  allowAgentAuth: true,
  allowSftp: true,
  allowTunnels: true,
  allowMonitoring: true,
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
  'allowSftp', 'allowTunnels', 'allowMonitoring', 'requireSessionLogging', 'auditEnabled',
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
    // Only keys this file declares. Without that, a policy naming __proto__
    // reaches NUMBERS[key], which resolves to Object.prototype - truthy, and
    // not iterable - and the destructuring below throws. Policy is read during
    // boot, so that crash is the application refusing to start.
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;

    if (BOOLEANS.has(key)) {
      out[key] = Boolean(value);
    } else if (Object.prototype.hasOwnProperty.call(NUMBERS, key)) {
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

const RESOLVE_TIMEOUT_MS = 3000;

function normaliseHost(host) {
  let name = String(host || '').trim().toLowerCase();
  if (name.startsWith('[') && name.endsWith(']')) name = name.slice(1, -1);
  while (name.endsWith('.')) name = name.slice(0, -1);
  return name;
}

function ipToBytes(ip) {
  if (net.isIPv4(ip)) return ip.split('.').map(Number);
  if (!net.isIPv6(ip)) return null;

  const halves = ip.split('::');
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const gap = 8 - head.length - tail.length;
  if (halves.length > 1 && gap < 0) return null;

  const groups = halves.length > 1
    ? [...head, ...Array(gap).fill('0'), ...tail]
    : head;
  if (groups.length !== 8) return null;

  const bytes = [];
  for (const group of groups) {
    const value = parseInt(group || '0', 16);
    if (Number.isNaN(value)) return null;
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

function withinCidr(pattern, ip) {
  const slash = pattern.lastIndexOf('/');
  if (slash === -1) return false;

  const bits = Number(pattern.slice(slash + 1));
  const network = ipToBytes(pattern.slice(0, slash));
  const address = ipToBytes(ip);
  if (!network || !address || network.length !== address.length) return false;
  if (!Number.isInteger(bits) || bits < 0 || bits > network.length * 8) return false;

  for (let i = 0; i < network.length; i += 1) {
    const remaining = bits - i * 8;
    if (remaining <= 0) return true;
    const mask = remaining >= 8 ? 0xff : (0xff << (8 - remaining)) & 0xff;
    if ((network[i] & mask) !== (address[i] & mask)) return false;
  }
  return true;
}

function hits(patterns, name, addresses, names) {
  for (const pattern of patterns) {
    if (matches(pattern, name)) return true;
    if (names.some((candidate) => matches(pattern, candidate))) return true;
    if (addresses.some((address) => matches(pattern, address) || withinCidr(pattern, address))) return true;
  }
  return false;
}

function timed(promise, fallback) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(fallback), RESOLVE_TIMEOUT_MS);
      if (timer.unref) timer.unref();
    }),
  ]);
}

async function expand(name) {
  if (net.isIP(name)) {
    const names = await timed(dns.promises.reverse(name), []);
    return { addresses: [name], names: names.map(normaliseHost), resolved: names.length > 0 };
  }

  const records = await timed(dns.promises.lookup(name, { all: true }), []);
  const addresses = records.map((record) => record.address);

  // A different name pointing at the same machine is the same machine. Ask what
  // each address calls itself, so a rule written against one name still holds.
  const canonical = await Promise.all(
    addresses.slice(0, 8).map((address) => timed(dns.promises.reverse(address), []))
  );

  return {
    addresses,
    names: [...new Set(canonical.flat().map(normaliseHost))],
    resolved: addresses.length > 0,
  };
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
    const name = normaliseHost(host);
    if (!name) return false;

    const current = load();
    if (hits(current.blockedHosts, name, [], [])) return false;
    if (!current.allowedHosts.length) return true;
    return hits(current.allowedHosts, name, [], []);
  },

  async checkHost(host) {
    const name = normaliseHost(host);
    if (!name) return { allowed: false, reason: 'no host given' };

    const current = load();
    if (!current.blockedHosts.length && !current.allowedHosts.length) {
      return { allowed: true, reason: 'no host rules' };
    }

    const { addresses, names, resolved } = await expand(name);

    if (hits(current.blockedHosts, name, addresses, names)) {
      return { allowed: false, reason: 'on the blocklist', addresses, names };
    }

    if (!current.allowedHosts.length) return { allowed: true, reason: 'not blocked', addresses, names };

    if (hits(current.allowedHosts, name, addresses, names)) {
      return { allowed: true, reason: 'on the allowlist', addresses, names };
    }

    // An allowlist that cannot be checked must not be assumed satisfied: a name
    // that will not resolve is exactly what someone routing around one looks like.
    return {
      allowed: false,
      reason: resolved ? 'not on the allowlist' : 'not on the allowlist, and it could not be resolved',
      addresses,
      names,
    };
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
