'use strict';

const fs = require('fs');
const path = require('path');

const ESC = 27;
const BEL = 7;
const BACKSLASH = 92;
const NEWLINE = String.fromCharCode(10);

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const safe = (text) => String(text).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'session';

function clean(text) {
  const input = String(text);
  let out = '';
  let i = 0;

  while (i < input.length) {
    const code = input.charCodeAt(i);

    if (code === ESC) {
      const next = input[i + 1];

      if (next === '[') {
        i += 2;
        while (i < input.length) {
          const c = input.charCodeAt(i);
          i += 1;
          if (c >= 0x40 && c <= 0x7e) break;
        }
        continue;
      }

      if (next === ']' || next === 'P' || next === 'X' || next === '^' || next === '_') {
        i += 2;
        while (i < input.length) {
          const c = input.charCodeAt(i);
          if (c === BEL) {
            i += 1;
            break;
          }
          if (c === ESC && input.charCodeAt(i + 1) === BACKSLASH) {
            i += 2;
            break;
          }
          i += 1;
        }
        continue;
      }

      i += next === undefined ? 1 : 2;
      continue;
    }

    if (code === 13) {

      if (input.charCodeAt(i + 1) === 10) i += 1;
      out += NEWLINE;
      i += 1;
      continue;
    }

    if ((code === 10 || code === 9 || code >= 32) && code !== 127) out += input[i];
    i += 1;
  }

  return out;
}

class SessionLog {

  constructor(directory, profile, options = {}) {
    this.keepAnsi = Boolean(options.keepAnsi);
    this.stream = null;
    this.file = path.join(directory, safe(profile.name) + '_' + stamp() + '.log');

    try {
      fs.mkdirSync(directory, { recursive: true });
      this.stream = fs.createWriteStream(this.file, { flags: 'a' });

      this.stream.on('error', (err) => {
        console.error('[session-log] writing stopped:', err.message);
        this.stream = null;
      });

      this.writeLine(
        '==== ' + profile.username + '@' + profile.host + ':' + profile.port +
          ' - ' + new Date().toISOString() + ' ===='
      );
    } catch (err) {
      console.error('[session-log] could not open a log file:', err.message);
      this.stream = null;
    }
  }

  writeLine(text) {
    if (this.stream) this.stream.write(text + NEWLINE);
  }

  write(chunk) {
    if (!this.stream) return;
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    this.stream.write(this.keepAnsi ? text : clean(text));
  }

  close(reason) {
    const stream = this.stream;
    if (!stream) return Promise.resolve();

    this.writeLine(NEWLINE + '==== closed: ' + (reason || 'session ended') + ' - ' + new Date().toISOString() + ' ====');
    this.stream = null;

    return new Promise((resolve) => {
      stream.end(() => resolve());
    });
  }
}

SessionLog.clean = clean;

module.exports = { SessionLog, clean };
