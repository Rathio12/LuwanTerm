'use strict';

const DEFAULT_TYPE = 'SSH';
const IDLE = 'Idle';
const VIEW_TYPE = { files: 'SFTP', tunnels: 'Tunnel' };
const LABEL_MAX = 32;
const MIN_INTERVAL_MS = 15000;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function clean(value, limit = LABEL_MAX) {
  return String(value || '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function looksLikeAddress(value) {
  const text = value.toLowerCase();
  if (IPV4.test(text)) return true;
  if (text.includes(':')) return true;
  if (text.includes('/') || text.includes('\\')) return true;
  return HOSTNAME.test(text);
}

function labelFor(host, settings) {
  if (!host || !host.discordShow) return '';
  const source = settings.discordLabel;
  const raw = source === 'name' ? host.name : source === 'provider' ? host.provider : '';
  const label = clean(raw);
  if (!label || looksLikeAddress(label)) return '';
  return label;
}

function buildPresence({ sessions = [], hostOf = () => null, settings = {}, focus = null } = {}) {
  const count = sessions.length;
  if (!count) return settings.discordShowIdle === false ? null : { details: IDLE };

  const focused =
    focus && focus.sessionId ? sessions.find((session) => session.id === focus.sessionId) : null;
  const active = focused || sessions[count - 1];
  const view = focused && focus.view ? focus.view : '';
  const type = VIEW_TYPE[view] || DEFAULT_TYPE;

  const label = labelFor(hostOf(active.hostId), settings);
  const details = label ? `${type} · ${label}` : type;

  const state = settings.discordShowCount
    ? `${count} session${count === 1 ? '' : 's'}`
    : undefined;

  return { details, state };
}

function imageFor(image, version) {
  const value = String(image || '').trim();
  if (!/^https?:\/\//i.test(value) || !version) return value;
  try {
    const url = new URL(value);
    url.searchParams.set('v', String(version));
    return url.toString();
  } catch {
    return value;
  }
}

function createScheduler(options = {}) {
  const now = options.now || Date.now;
  const delay = options.delay || ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.cancel || ((timer) => clearTimeout(timer));
  const intervalMs = options.intervalMs === undefined ? MIN_INTERVAL_MS : options.intervalMs;
  const send = options.send;

  let lastKey;
  let lastSentAt = -Infinity;
  let timer = null;
  let queued = null;

  const deliver = (entry) => {
    cancel(timer);
    timer = null;
    queued = null;
    lastKey = entry.key;
    lastSentAt = now();
    send(entry.payload);
  };

  const later = () => {
    timer = null;
    if (queued) deliver(queued);
  };

  return {
    push(payload) {
      const key = JSON.stringify(payload === undefined ? null : payload);
      if (key === lastKey) return false;

      const wait = intervalMs - (now() - lastSentAt);
      if (wait <= 0) {
        deliver({ key, payload: payload === undefined ? null : payload });
        return true;
      }

      queued = { key, payload: payload === undefined ? null : payload };
      if (!timer) timer = delay(later, wait);
      return false;
    },

    stop() {
      cancel(timer);
      timer = null;
      queued = null;
    },
  };
}

module.exports = { buildPresence, imageFor, labelFor, looksLikeAddress, clean, createScheduler, DEFAULT_TYPE, IDLE };
