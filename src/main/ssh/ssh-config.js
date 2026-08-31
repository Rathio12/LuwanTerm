'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const WANTED = new Set([
  'hostname', 'user', 'port', 'identityfile', 'proxyjump', 'proxycommand', 'serveraliveinterval',
]);

function configPath() {
  return path.join(os.homedir(), '.ssh', 'config');
}

function expandHome(value) {
  if (!value.startsWith('~')) return value;
  return path.join(os.homedir(), value.slice(1).replace(/^[\/]/, ''));
}

function parse(text) {
  const entries = [];

  let current = [];

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

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

      if (entry.settings[key] === undefined) entry.settings[key] = value;
    }
  }

  return entries;
}

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
