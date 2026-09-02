'use strict';

const fs = require('fs');
const path = require('path');
const posix = path.posix;

const PERM_BITS = ['x', 'w', 'r'];

/**
 * Joins a server-supplied relative path under a local root, and refuses anything
 * that would land outside it.
 *
 * Every segment here came from a remote directory listing, which means it came
 * from whoever runs that server. A name like `..\..\evil.exe` is a single
 * segment to split('/') but two levels up to path.join, so a hostile server
 * could write anywhere the user can. Segments are checked one at a time and the
 * result is confirmed to still be inside the root.
 */
function safeJoin(root, relative) {
  const base = path.resolve(root);
  const segments = String(relative).split('/');

  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new Error(`The server sent a file name that is not usable: ${relative}`);
    }
    if (segment.includes(String.fromCharCode(92)) || segment.includes('/') || segment.includes(String.fromCharCode(0))) {
      throw new Error(`The server sent a file name containing a path separator: ${relative}`);
    }
    if (/^[A-Za-z]:$/.test(segment) || segment !== path.basename(segment)) {
      throw new Error(`The server sent a file name that looks like a path: ${relative}`);
    }
  }

  const target = path.resolve(base, ...segments);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`The server tried to write outside the download folder: ${relative}`);
  }
  return target;
}

class TransferCancelled extends Error {
  constructor() {
    super('Transfer cancelled.');
    this.name = 'TransferCancelled';
    this.cancelled = true;
  }
}

function rightsOf(mode) {
  let out = '';
  for (let group = 2; group >= 0; group -= 1) {
    for (let bit = 2; bit >= 0; bit -= 1) {
      out += (mode >> (group * 3 + bit)) & 1 ? PERM_BITS[bit] : '-';
    }
  }
  return out;
}

function typeOf(attrs) {
  if (attrs.isDirectory()) return 'dir';
  if (attrs.isSymbolicLink()) return 'link';
  return 'file';
}

function throttle(onProgress) {
  if (typeof onProgress !== 'function') return () => {};
  let last = 0;
  return (payload, force) => {
    const now = Date.now();
    if (!force && now - last < 120) return;
    last = now;
    onProgress(payload);
  };
}

class SftpClient {
  constructor(client) {
    this.client = client;
    this.sftp = null;
    this.pending = null;
    this.transfers = new Map();
  }

  openChannel() {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) reject(new Error(`SFTP subsystem unavailable: ${err.message}`));
        else resolve(sftp);
      });
    });
  }

  ready() {
    if (this.sftp) return Promise.resolve(this.sftp);
    if (this.pending) return this.pending;

    this.pending = this.openChannel()
      .then((sftp) => {
        sftp.once('close', () => {
          if (this.sftp === sftp) this.sftp = null;
        });
        this.sftp = sftp;
        this.pending = null;
        return sftp;
      })
      .catch((err) => {
        this.pending = null;
        throw err;
      });

    return this.pending;
  }

  invoke(sftp, method, args) {
    return new Promise((resolve, reject) => {
      sftp[method](...args, (err, result) => {
        if (err) reject(new Error(`${err.message} (${method})`));
        else resolve(result);
      });
    });
  }

  async call(method, ...args) {
    return this.invoke(await this.ready(), method, args);
  }

  async home() {
    return this.call('realpath', '.');
  }

  async resolve(dir) {
    return this.call('realpath', dir);
  }

  async list(dir) {
    const target = await this.resolve(dir || '.');
    const raw = await this.call('readdir', target);

    const entries = raw.map((item) => ({
      name: item.filename,
      path: posix.join(target, item.filename),
      type: typeOf(item.attrs),
      size: item.attrs.size,
      mtime: item.attrs.mtime * 1000,
      mode: item.attrs.mode,
      rights: rightsOf(item.attrs.mode),
      owner: item.attrs.uid,
      group: item.attrs.gid,
    }));

    await Promise.all(
      entries
        .filter((entry) => entry.type === 'link')
        .map(async (entry) => {
          try {
            const attrs = await this.call('stat', entry.path);
            entry.linkType = attrs.isDirectory() ? 'dir' : 'file';
          } catch {
            entry.linkType = 'broken';
          }
        })
    );

    entries.sort((a, b) => {
      const aDir = a.type === 'dir' || a.linkType === 'dir';
      const bDir = b.type === 'dir' || b.linkType === 'dir';
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return { path: target, entries };
  }

  async readText(target, limit = 2 * 1024 * 1024) {
    const attrs = await this.call('stat', target);
    if (attrs.isDirectory()) throw new Error('That is a folder, not a file.');
    if (attrs.size > limit) {
      throw new Error(
        `That file is ${(attrs.size / 1048576).toFixed(1)} MB. Comparing is limited to ${limit / 1048576} MB.`
      );
    }

    const sftp = await this.ready();
    return new Promise((resolve, reject) => {
      const chunks = [];
      const stream = sftp.createReadStream(target);
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', (err) => reject(new Error(`Could not read ${target}: ${err.message}`)));
      stream.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }

  async mkdir(dir) {
    await this.call('mkdir', dir);
    return true;
  }

  async rename(from, to) {
    await this.call('rename', from, to);
    return true;
  }

  async chmod(target, mode) {
    await this.call('chmod', target, mode);
    return true;
  }

  async stat(target) {
    const attrs = await this.call('stat', target);
    return { size: attrs.size, mode: attrs.mode, isDirectory: attrs.isDirectory() };
  }

  async remove(target) {
    const attrs = await this.call('lstat', target);
    if (!attrs.isDirectory()) {
      await this.call('unlink', target);
      return true;
    }

    const children = await this.call('readdir', target);
    for (const child of children) {
      await this.remove(posix.join(target, child.filename));
    }
    await this.call('rmdir', target);
    return true;
  }

  async begin(id) {
    if (this.transfers.has(id)) throw new Error('That transfer is already running.');

    const context = { id, cancelled: false, sftp: null };
    context.cancel = () => {
      context.cancelled = true;
      try {
        context.sftp?.end();
      } catch {  }
    };

    this.transfers.set(id, context);
    try {
      context.sftp = await this.openChannel();
    } catch (err) {
      this.transfers.delete(id);
      throw err;
    }

    if (context.cancelled) {
      this.finish(context);
      throw new TransferCancelled();
    }
    return context;
  }

  finish(context) {
    this.transfers.delete(context.id);
    try {
      context.sftp?.end();
    } catch {  }
  }

  cancel(id) {
    const context = this.transfers.get(id);
    if (!context) return false;
    context.cancel();
    return true;
  }

  static rethrow(context, err) {
    if (context.cancelled) throw new TransferCancelled();
    throw err;
  }

  fastGet(context, remote, local, onChunk) {
    return new Promise((resolve, reject) => {
      context.sftp.fastGet(remote, local, { step: onChunk }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  fastPut(context, local, remote, onChunk) {
    return new Promise((resolve, reject) => {
      context.sftp.fastPut(local, remote, { step: onChunk }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async download(id, remote, local, onProgress) {
    const context = await this.begin(id);
    const report = throttle(onProgress);

    try {
      const { size } = await this.invoke(context.sftp, 'stat', [remote]);
      await this.fastGet(context, remote, local, (transferred) =>
        report({ transferred, total: size })
      );
      report({ transferred: size, total: size }, true);
      return { path: local, bytes: size };
    } catch (err) {
      await removeQuietly(local);
      SftpClient.rethrow(context, err);
      throw err;
    } finally {
      this.finish(context);
    }
  }

  async upload(id, local, remote, onProgress) {
    const context = await this.begin(id);
    const report = throttle(onProgress);
    const total = fs.statSync(local).size;

    try {
      await this.fastPut(context, local, remote, (transferred) => report({ transferred, total }));
      report({ transferred: total, total }, true);
      return { path: remote, bytes: total };
    } catch (err) {
      SftpClient.rethrow(context, err);
      throw err;
    } finally {
      this.finish(context);
    }
  }

  async downloadDirectory(id, remoteRoot, localRoot, onProgress) {
    const context = await this.begin(id);
    const report = throttle(onProgress);

    try {
      const plan = await this.walk(context, remoteRoot);
      const totalBytes = plan.files.reduce((sum, file) => sum + file.size, 0);
      let doneBytes = 0;

      fs.mkdirSync(localRoot, { recursive: true });
      for (const dir of plan.dirs) {
        fs.mkdirSync(safeJoin(localRoot, dir), { recursive: true });
      }

      for (const [index, file] of plan.files.entries()) {
        if (context.cancelled) throw new TransferCancelled();
        const target = safeJoin(localRoot, file.relative);

        await this.fastGet(context, file.remote, target, (transferred) =>
          report({
            transferred: doneBytes + transferred,
            total: totalBytes,
            file: file.relative,
            filesDone: index,
            filesTotal: plan.files.length,
          })
        );
        doneBytes += file.size;
      }

      report({ transferred: totalBytes, total: totalBytes, filesDone: plan.files.length, filesTotal: plan.files.length }, true);
      return { path: localRoot, files: plan.files.length, bytes: totalBytes, skipped: plan.skipped };
    } catch (err) {
      SftpClient.rethrow(context, err);
      throw err;
    } finally {
      this.finish(context);
    }
  }

  async walk(context, root) {
    const files = [];
    const dirs = [];
    let skipped = 0;

    const visit = async (dir, relative) => {
      if (context.cancelled) throw new TransferCancelled();
      const items = await this.invoke(context.sftp, 'readdir', [dir]);

      for (const item of items) {
        const remote = posix.join(dir, item.filename);
        const rel = relative ? `${relative}/${item.filename}` : item.filename;

        if (item.attrs.isDirectory()) {
          dirs.push(rel);
          await visit(remote, rel);
        } else if (item.attrs.isFile()) {
          files.push({ remote, relative: rel, size: item.attrs.size });
        } else {
          skipped += 1;
        }
      }
    };

    await visit(await this.resolve(root), '');
    return { files, dirs, skipped };
  }

  dispose() {
    for (const context of this.transfers.values()) context.cancel();
    this.transfers.clear();
    try {
      if (this.sftp) this.sftp.end();
    } catch {  }
    this.sftp = null;
  }
}

async function removeQuietly(target) {
  try {
    await fs.promises.rm(target, { force: true });
  } catch {  }
}

module.exports = { SftpClient, TransferCancelled, safeJoin };
