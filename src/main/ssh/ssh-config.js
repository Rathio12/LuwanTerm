'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Reads OpenSSH's own client config so hosts already defined there can be
 * imported rather than retyped.
 *
 * This understands the directives that map onto a LuwanTerm host profile and
 * ignores the rest. It is deliberately not a full implementation of
 * ssh_config: Match blocks, canonicalisation and token expansion are out of
 * scope, and a wildcard pattern is not a host you can connect to.
 */

const WANTED = new Set([
  'hostname', 'user', 'port', 'identityfile', 'proxyjump', 'proxycommand', 'serveraliveinterval',
]);

function configPath() {
  return path.join(os.homedir(), '.ssh', 'config');
}

/** Expands a leading ~ the way ssh does. */
function expandHome(value) {
  if (!value.startsWith('~')) return value;
  return path.join(os.homedir(), value.slice(1).replace(/^[\/]/, ''));
}

/**
 * @param {string} text contents of an ssh config file
 * @returns {Array<{alias: string, settings: object}>} in file order
 */
function parse(text) {
  const entries = [];
  // One Host line can name several aliases, and everything that follows applies
  // to all of them, so this tracks a group rather than a single entry.
  let current = [];

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Directives are "Key value" or "Key=value", and keys are case-insensitive.
    const match = /^([A-Za-z][A-Za-z0-9-]*)[\s=]+(.+)$/.exec(line);
    if (!match) continue;

    const key = match[1].toLowerCase();
    const value = match[2].trim().replace(/^["']|["']$/g, '');

    if (key === 'host') {
      current = value.split(/\s+/).map((alias) => {
        const entry = { alias, settings: {} };
        entries.push(entry);
        return entry;
      });
      continue;
    }

    if (!current.length || !WANTED.has(key)) continue;
    for (const entry of current) {
      // First occurrence wins, which is how ssh itself resolves duplicates.
      if (entry.settings[key] === undefined) entry.settings[key] = value;
    }
  }

  return entries;
}

/**
 * Turns parsed entries into things that can become host profiles.
 *
 * Patterns (`Host *`), entries with no hostname to connect to, and anything
 * driven by ProxyCommand are left out: none of them describe a single machine
 * this app could dial.
 */
function toProfiles(entries) {
  const usable = [];
  const skipped = [];

  for (const { alias, settings } of entries) {
    if (/[*?!]/.test(alias)) {
      skipped.push({ alias, reason: 'pattern, not a host' });
      continue;
    }
    if (settings.proxycommand) {
      skipped.push({ alias, reason: 'uses ProxyCommand' });
      continue;
    }

    const host = settings.hostname || alias;
    const port = Number.parseInt(settings.port, 10);
    const keepalive = Number.parseInt(settings.serveraliveinterval, 10);

    usable.push({
      name: alias,
      host,
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 22,
      username: settings.user || '',
      privateKeyPath: settings.identityfile ? expandHome(settings.identityfile) : '',
      auth: settings.identityfile ? 'key' : 'agent',
      jumpHost: settings.proxyjump || '',
      keepaliveSeconds: Number.isInteger(keepalive) && keepalive >= 0 ? keepalive : 30,
      group: 'ssh config',
    });
  }

  return { usable, skipped };
}

/**
 * Reads and interprets ~/.ssh/config.
 * @returns {{path: string, exists: boolean, usable: object[], skipped: object[]}}
 */
function read() {
  const file = configPath();
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { path: file, exists: false, usable: [], skipped: [] };
  }
  return { path: file, exists: true, ...toProfiles(parse(text)) };
}

module.exports = { read, parse, toProfiles, configPath };
