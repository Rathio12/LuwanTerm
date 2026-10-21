'use strict';

const fs = require('fs');
const { JsonStore } = require('./json-store');
const paths = require('../paths');
const hosts = require('./hosts');
const settings = require('./settings');

const KEEP = 30;

const store = new JsonStore(paths.recentFile, { entries: [], totals: {} });

const enabled = () => settings.get().recentSessions !== false;

function fromAudit(lines, known) {
  const match = (event) => known.find((host) =>
    host.host === event.host && Number(host.port) === Number(event.port) && host.username === event.username);
  const bySession = new Map();
  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || !event.sessionId) continue;
    if (event.event === 'session.open') {
      const host = match(event);
      if (host) bySession.set(event.sessionId, { sessionId: event.sessionId, hostId: host.id, openedAt: Date.parse(event.at) || 0, closedAt: 0 });
    } else if (event.event === 'session.close' && bySession.has(event.sessionId)) {
      bySession.get(event.sessionId).closedAt = Date.parse(event.at) || 0;
    }
  }
  const all = [...bySession.values()].sort((a, b) => b.openedAt - a.openedAt);
  const totals = {};
  for (const entry of all) totals[entry.hostId] = (totals[entry.hostId] || 0) + 1;
  return { entries: all.slice(0, KEEP), totals };
}

let seeded = false;

function seed() {
  if (seeded) return;
  seeded = true;
  if (fs.existsSync(paths.recentFile())) return;
  const file = paths.auditFile();
  const lines = [];
  for (const name of [4, 3, 2, 1].map((index) => `${file}.${index}`).concat(file)) {
    try {
      lines.push(...fs.readFileSync(name, 'utf8').split('\n').filter(Boolean));
    } catch {
      continue;
    }
  }
  store.write(fromAudit(lines, hosts.list()));
}

function opened(sessionId, hostId) {
  if (!enabled() || !hostId) return;
  seed();
  store.update((data) => {
    data.entries = [
      { sessionId: String(sessionId), hostId: String(hostId), openedAt: Date.now(), closedAt: 0 },
      ...(Array.isArray(data.entries) ? data.entries : []),
    ].slice(0, KEEP);
    data.totals = data.totals && typeof data.totals === 'object' ? data.totals : {};
    data.totals[hostId] = (Number(data.totals[hostId]) || 0) + 1;
    return data;
  });
}

function closed(sessionId) {
  const entries = store.read().entries || [];
  if (!entries.some((entry) => entry.sessionId === sessionId && !entry.closedAt)) return;
  store.update((data) => {
    for (const entry of data.entries) {
      if (entry.sessionId === sessionId && !entry.closedAt) entry.closedAt = Date.now();
    }
    return data;
  });
}

function list(limit = 8) {
  if (!enabled()) return [];
  seed();
  const { entries = [], totals = {} } = store.read();
  const counts = new Map();
  for (const entry of entries) counts.set(entry.hostId, (counts.get(entry.hostId) || 0) + 1);

  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    if (seen.has(entry.hostId)) continue;
    const host = hosts.get(entry.hostId);
    if (!host) continue;
    seen.add(entry.hostId);
    const port = host.port && host.port !== 22 ? `:${host.port}` : '';
    out.push({
      hostId: host.id,
      name: host.name || host.host,
      target: `${host.username}@${host.host}${port}`,
      color: host.color || '',
      openedAt: entry.openedAt,
      closedAt: entry.closedAt,
      count: Math.max(Number(totals[entry.hostId]) || 0, counts.get(entry.hostId)),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function clear() {
  seeded = true;
  store.write({ entries: [], totals: {} });
  return [];
}

module.exports = { opened, closed, list, clear, fromAudit, KEEP };
