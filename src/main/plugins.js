'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const MAX_FILE_BYTES = 64 * 1024;
const MAX_PLUGINS = 50;
const MAX_NAME = 60;
const MAX_COMMAND = 2000;
const MAX_COLUMNS = 8;
const MAX_SKIP = 20;
const REFRESH_RANGE = [2, 3600];

const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_ROWS = 500;
const MAX_CELL = 300;
const RUN_TIMEOUT_MS = 20000;

const ICONS = new Set([
  'server', 'terminal', 'folder', 'file', 'link', 'code', 'activity', 'cog',
  'search', 'key', 'shield', 'globe', 'chat', 'bug', 'refresh', 'download',
]);

const SPLITS = new Set(['whitespace', 'columns', 'lines']);

const text = (value, limit) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > limit ? '' : trimmed;
};

function validate(raw, id) {
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { problems: ['it is not a JSON object'] };
  }

  const name = text(raw.name, MAX_NAME);
  if (!name) problems.push(`it needs a "name" of up to ${MAX_NAME} characters`);

  const command = text(raw.command, MAX_COMMAND);
  if (!command) problems.push(`it needs a "command" of up to ${MAX_COMMAND} characters`);

  const icon = ICONS.has(raw.icon) ? raw.icon : 'activity';

  let refresh = Number(raw.refreshSeconds === undefined ? raw.every : raw.refreshSeconds);
  if (!Number.isFinite(refresh)) refresh = 0;
  refresh = refresh <= 0 ? 0 : Math.min(REFRESH_RANGE[1], Math.max(REFRESH_RANGE[0], Math.round(refresh)));

  let columns = [];
  if (Array.isArray(raw.columns)) {
    columns = raw.columns
      .slice(0, MAX_COLUMNS)
      .map((column) => text(column, 40))
      .filter(Boolean);
  }

  const split = SPLITS.has(raw.split) ? raw.split : (columns.length ? 'whitespace' : 'lines');

  let skipLines = Number(raw.skipLines);
  if (!Number.isFinite(skipLines) || skipLines <= 0) skipLines = 0;
  skipLines = Math.min(MAX_SKIP, Math.round(skipLines));

  if (problems.length) return { problems };

  return {
    plugin: {
      id,
      name,
      description: text(raw.description, 200),
      icon,
      command,
      refreshSeconds: refresh,
      columns,
      split,
      skipLines,
    },
  };
}

const idFrom = (filename) => filename.replace(/\.json$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 60);

function load() {
  const folder = paths.pluginsDir();
  const found = [];
  const broken = [];

  let names;
  try {
    names = fs.readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.json')).sort();
  } catch {
    return { plugins: [], broken: [], folder };
  }

  for (const name of names.slice(0, MAX_PLUGINS)) {
    const file = path.join(folder, name);
    let raw;

    try {
      if (fs.statSync(file).size > MAX_FILE_BYTES) {
        broken.push({ file: name, id: idFrom(name), problems: [`it is larger than ${MAX_FILE_BYTES / 1024} KB`] });
        continue;
      }
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      broken.push({ file: name, id: idFrom(name), problems: [`it could not be read: ${err.message}`] });
      continue;
    }

    const result = validate(raw, idFrom(name));
    if (result.problems) broken.push({ file: name, id: idFrom(name), problems: result.problems });
    else found.push({ ...result.plugin, file: name });
  }

  return { plugins: found, broken, folder };
}

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(ESC + '\\[[0-9;?]*[ -/]*[@-~]|' + ESC + '[@-_]', 'g');

function printable(value) {
  let out = '';
  for (const character of String(value === null || value === undefined ? '' : value)) {
    const code = character.codePointAt(0);
    if (code === 9) out += ' ';
    else if (code < 32 || code === 127 || (code >= 128 && code <= 159)) continue;
    else out += character;
  }
  return out;
}

function cell(value) {
  const clean = printable(String(value === null || value === undefined ? '' : value).replace(ANSI, '')).trim();
  return clean.length > MAX_CELL ? `${clean.slice(0, MAX_CELL)}...` : clean;
}

const SPLITTERS = {
  whitespace: /\s+/,
  columns: /\s{2,}|\t/,
};

function table(output, plugin = {}) {
  const columns = Array.isArray(plugin.columns) ? plugin.columns.slice(0, MAX_COLUMNS) : [];
  const split = SPLITS.has(plugin.split) ? plugin.split : (columns.length ? 'whitespace' : 'lines');
  const skip = Number.isFinite(plugin.skipLines) ? Math.max(0, Math.min(MAX_SKIP, plugin.skipLines)) : 0;

  const lines = String(output === null || output === undefined ? '' : output)
    .split(/\r?\n/)
    .map((line) => printable(line.replace(ANSI, '')))
    .filter((line) => line.trim())
    .slice(skip);

  const rows = [];
  for (const line of lines.slice(0, MAX_ROWS)) {
    if (split === 'lines') {
      rows.push([cell(line)]);
      continue;
    }

    const fields = line.trim().split(SPLITTERS[split]);
    if (!columns.length) {
      rows.push(fields.slice(0, MAX_COLUMNS).map(cell));
      continue;
    }

    const head = fields.slice(0, columns.length - 1).map(cell);
    const tail = cell(fields.slice(columns.length - 1).join(' '));
    const built = columns.length === 1 ? [cell(line)] : [...head, tail];
    while (built.length < columns.length) built.push('');
    rows.push(built);
  }

  return {
    columns: columns.length ? columns : (split === 'lines' ? ['Output'] : []),
    rows,
    truncated: lines.length > MAX_ROWS,
  };
}

function run(session, plugin, { timeoutMs = RUN_TIMEOUT_MS } = {}) {
  const client = session && session.connection && session.connection.client;
  if (!client) throw new Error('That session is not connected.');

  return new Promise((resolve, reject) => {
    client.exec(plugin.command, { pty: false }, (err, channel) => {
      if (err) {
        reject(new Error(`The command could not be started: ${err.message}`));
        return;
      }

      let stdout = '';
      let stderr = '';
      let truncated = false;
      let settled = false;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          channel.close();
        } catch {

        }
        fn(value);
      };

      const timer = setTimeout(
        () => finish(reject, new Error(`The command did not finish within ${Math.max(1, Math.round(timeoutMs / 1000))} seconds.`)),
        timeoutMs
      );

      channel.on('data', (chunk) => {
        if (truncated) return;
        stdout += chunk.toString('utf8');
        if (stdout.length > MAX_OUTPUT_BYTES) {
          stdout = stdout.slice(0, MAX_OUTPUT_BYTES);
          truncated = true;
        }
      });

      channel.stderr.on('data', (chunk) => {
        if (stderr.length < 4096) stderr += chunk.toString('utf8');
      });

      channel.once('error', (channelErr) => finish(reject, channelErr));

      channel.once('close', (code) => {
        const parsed = table(stdout, plugin);
        finish(resolve, {
          id: plugin.id,
          code: Number.isFinite(code) ? code : null,
          columns: parsed.columns,
          rows: parsed.rows,
          truncated: truncated || parsed.truncated,
          error: parsed.rows.length
            ? ''
            : cell(stderr) || (code ? `The command exited with status ${code}.` : ''),
          at: Date.now(),
        });
      });
    });
  });
}

const fileFor = (id) => {
  const folder = paths.pluginsDir();
  const all = load();
  const entry = [...all.plugins, ...all.broken].find((item) => item.id === id);
  if (!entry) return null;

  const file = path.resolve(folder, entry.file);
  return path.dirname(file) === path.resolve(folder) ? file : null;
};

module.exports = {
  ICONS,
  SPLITS,
  MAX_PLUGINS,
  MAX_ROWS,
  MAX_CELL,
  MAX_OUTPUT_BYTES,
  MAX_FILE_BYTES,
  RUN_TIMEOUT_MS,
  validate,
  load,
  table,
  run,
  folder: () => paths.pluginsDir(),

  enabled(enabledIds) {
    const wanted = new Set(Array.isArray(enabledIds) ? enabledIds : []);
    return load().plugins.filter((plugin) => wanted.has(plugin.id));
  },

  install(filePath) {
    const source = String(filePath || '');
    if (!source) throw new Error('No file was chosen.');

    let stat;
    try {
      stat = fs.statSync(source);
    } catch {
      throw new Error('That file could not be read.');
    }
    if (!stat.isFile()) throw new Error('That is not a file.');
    if (stat.size > MAX_FILE_BYTES) throw new Error(`A plugin must be under ${MAX_FILE_BYTES / 1024} KB.`);

    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(source, 'utf8'));
    } catch (err) {
      throw new Error(`That file is not valid JSON: ${err.message}`);
    }

    const base = idFrom(path.basename(source)) || 'plugin';
    const result = validate(raw, base);
    if (result.problems) throw new Error(`That plugin cannot be used - ${result.problems.join(', and ')}.`);

    const folder = paths.pluginsDir();
    fs.mkdirSync(folder, { recursive: true });

    let name = `${base}.json`;
    for (let suffix = 2; fs.existsSync(path.join(folder, name)) && suffix < 100; suffix += 1) {
      name = `${base}-${suffix}.json`;
    }

    fs.copyFileSync(source, path.join(folder, name));
    return { ...result.plugin, id: idFrom(name), file: name };
  },

  remove(id) {
    const file = fileFor(String(id || ''));
    if (!file) return false;
    fs.rmSync(file, { force: true });
    return true;
  },
};
