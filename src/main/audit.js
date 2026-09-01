'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const policy = require('./policy');

const MAX_BYTES = 8 * 1024 * 1024;
const KEEP_FILES = 5;
const SECRET_KEYS = new Set([
  'password', 'passphrase', 'privatekey', 'private_key', 'key', 'secret',
  'token', 'credentials', 'signature', 'blob',
]);

let dropped = 0;

function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[deep]';

  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));

  if (typeof value === 'object') {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = SECRET_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(inner, depth + 1);
    }
    return out;
  }

  if (typeof value === 'string') return value.length > 512 ? `${value.slice(0, 512)}...` : value;
  return value;
}

function rotate(file) {
  for (let index = KEEP_FILES - 1; index >= 1; index -= 1) {
    const from = index === 1 ? file : `${file}.${index - 1}`;
    const to = `${file}.${index}`;
    try {
      if (fs.existsSync(from)) fs.renameSync(from, to);
    } catch {
      return;
    }
  }
}

function prune() {
  const days = policy.get().auditRetentionDays;
  if (!days) return;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const file = paths.auditFile();
  for (let index = 1; index < KEEP_FILES; index += 1) {
    const old = `${file}.${index}`;
    try {
      if (fs.existsSync(old) && fs.statSync(old).mtimeMs < cutoff) fs.rmSync(old);
    } catch {
      return;
    }
  }
}

module.exports = {
  redact,
  MAX_BYTES,

  record(event, details = {}) {
    if (!policy.get().auditEnabled) return null;

    const entry = { at: new Date().toISOString(), event: String(event), ...redact(details) };
    const file = paths.auditFile();

    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size >= MAX_BYTES) rotate(file);
      fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch {
      dropped += 1;
    }
    return entry;
  },

  read(limit = 200) {
    const file = paths.auditFile();
    try {
      if (!fs.existsSync(file)) return [];
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      return lines.slice(-limit).map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { at: '', event: 'unreadable', line };
        }
      });
    } catch {
      return [];
    }
  },

  file: () => paths.auditFile(),
  dropped: () => dropped,
  prune,
  close() {},
};
