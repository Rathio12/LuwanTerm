'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Small synchronous JSON store with atomic writes.
 * Config files here are tiny, so sync IO keeps call sites simple and
 * removes a whole class of write-ordering bugs.
 */
class JsonStore {
  /**
   * @param {() => string} resolveFile lazy path resolver (userData is not ready at require time)
   * @param {object} fallback value used when the file is missing or corrupt
   */
  constructor(resolveFile, fallback) {
    this.resolveFile = resolveFile;
    this.fallback = fallback;
    this.cache = null;
  }

  read() {
    if (this.cache) return this.cache;
    const file = this.resolveFile();
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      this.cache = Object.assign(structuredClone(this.fallback), parsed);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`[store] ${path.basename(file)} unreadable, using defaults:`, err.message);
        this.backupCorrupt(file);
      }
      this.cache = structuredClone(this.fallback);
    }
    return this.cache;
  }

  write(data) {
    const file = this.resolveFile();
    const tmp = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    this.cache = data;
    return data;
  }

  update(mutator) {
    const data = structuredClone(this.read());
    const result = mutator(data);
    this.write(data);
    return result === undefined ? data : result;
  }

  backupCorrupt(file) {
    try {
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch { /* nothing recoverable, defaults win */ }
  }
}

module.exports = { JsonStore };
