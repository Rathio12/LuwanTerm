'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const MAX_FILE_BYTES = 64 * 1024;
const MAX_PLUGINS = 50;
const MAX_NAME = 60;
const MAX_COMMAND = 2000;
const MAX_COLUMNS = 8;
const REFRESH_RANGE = [2, 3600];

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

/**
 * Turns one manifest into a plugin, or explains why it is not one.
 *
 * Manifests are files on disk that somebody else may have written, so this
 * reads like a parser rather than a loader: every field is checked, anything
 * unrecognised is dropped rather than carried along, and a bad manifest is
 * reported instead of throwing. One broken file must not stop the others
 * loading, and must never stop the app starting.
 */
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

  let refresh = Number(raw.refreshSeconds);
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
    },
  };
}

const idFrom = (filename) => filename.replace(/\.json$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 60);

/**
 * Reads the plugins folder.
 *
 * There is deliberately nothing to set up: no folder means no plugins, which is
 * the state every install starts in and most stay in. A plugin that is present
 * but not enabled is listed and does nothing.
 */
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
        broken.push({ file: name, problems: [`it is larger than ${MAX_FILE_BYTES / 1024} KB`] });
        continue;
      }
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      broken.push({ file: name, problems: [`it could not be read: ${err.message}`] });
      continue;
    }

    const result = validate(raw, idFrom(name));
    if (result.problems) broken.push({ file: name, problems: result.problems });
    else found.push({ ...result.plugin, file: name });
  }

  return { plugins: found, broken, folder };
}

module.exports = {
  ICONS,
  SPLITS,
  MAX_PLUGINS,
  validate,
  load,
  folder: () => paths.pluginsDir(),

  /** The ones the user has switched on, in the order they were found. */
  enabled(enabledIds) {
    const wanted = new Set(Array.isArray(enabledIds) ? enabledIds : []);
    return load().plugins.filter((plugin) => wanted.has(plugin.id));
  },
};
