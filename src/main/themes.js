'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const settings = require('./store/settings');

const MAX_FILE_BYTES = 32 * 1024;
const MAX_THEMES = 60;
const MAX_NAME = 40;
const MAX_DESCRIPTION = 140;
const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

const RESET = [
  'terminalTheme', 'fontWeight', 'lineHeight', 'letterSpacing', 'terminalPadding',
  'cursorStyle', 'cursorBlink', 'accentColor', 'terminalOpacity', 'uiCorners',
  'backgroundOpacity', 'backgroundBlur', 'backgroundEffect',
  'effectDensity', 'effectSpeed', 'effectLinks', 'effectGrid', 'effectGlow', 'effectAccent',
  'effectMouse', 'effectMouseForce', 'effectNodeGlow', 'effectPulse', 'effectNodeSize',
  'effectLineWidth', 'effectLineOpacity', 'effectGridSize', 'effectColor', 'effectOpacity',
];

const ALLOWED = new Set([...RESET, 'fontFamily', 'fontSize', 'uiFontFamily', 'backgroundImage']);

const text = (value, limit) => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, limit);

const idFrom = (filename) => filename.replace(/\.json$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 60);

function resolveImage(value, folder, problems) {
  const name = String(value || '').trim();
  if (!name) return '';
  if (path.isAbsolute(name) || name.includes('/') || name.includes('\\') || name.startsWith('.')) {
    problems.push('backgroundImage must be a file name in the themes folder, like "night.jpg"');
    return null;
  }
  if (!IMAGE_TYPES.has(path.extname(name).toLowerCase())) {
    problems.push(`backgroundImage must be one of ${[...IMAGE_TYPES].join(', ')}`);
    return null;
  }
  const file = path.join(folder, name);
  if (!fs.existsSync(file)) {
    problems.push(`backgroundImage "${name}" is not in the themes folder`);
    return null;
  }
  return file;
}

function validate(raw, id, folder) {
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { problems: ['it is not a JSON object'] };

  const name = text(raw.name, MAX_NAME);
  if (!name) problems.push('it has no "name"');

  const wanted = raw.settings;
  if (!wanted || typeof wanted !== 'object' || Array.isArray(wanted)) {
    problems.push('it has no "settings" object');
    return { problems };
  }

  const given = {};
  for (const [key, value] of Object.entries(wanted)) {
    if (!ALLOWED.has(key)) {
      problems.push(`"${key}" is not a setting a theme can change`);
      continue;
    }
    if (key === 'backgroundImage') continue;
    given[key] = value;
  }

  const cleaned = settings.clean(given);
  for (const key of Object.keys(given)) {
    if (!(key in cleaned)) problems.push(`"${key}" has a value it cannot take: ${JSON.stringify(given[key])}`);
  }

  let image;
  if (Object.prototype.hasOwnProperty.call(wanted, 'backgroundImage')) {
    image = resolveImage(wanted.backgroundImage, folder, problems);
  }

  if (problems.length) return { problems };

  const look = {};
  for (const key of RESET) look[key] = settings.DEFAULTS[key];
  Object.assign(look, cleaned);
  if (image !== undefined) look.backgroundImage = image;

  return {
    theme: {
      id,
      name,
      description: text(raw.description, MAX_DESCRIPTION),
      author: text(raw.author, MAX_NAME),
      settings: look,
    },
  };
}

function readFolder(folder, source) {
  const found = [];
  const broken = [];
  let names;
  try {
    names = fs.readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.json')).sort();
  } catch {
    return { found, broken };
  }

  for (const name of names.slice(0, MAX_THEMES)) {
    const file = path.join(folder, name);
    const id = `${source}:${idFrom(name)}`;
    let raw;
    try {
      if (fs.statSync(file).size > MAX_FILE_BYTES) {
        broken.push({ id, file: name, source, problems: [`it is larger than ${MAX_FILE_BYTES / 1024} KB`] });
        continue;
      }
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      broken.push({ id, file: name, source, problems: [`it could not be read: ${err.message}`] });
      continue;
    }
    const result = validate(raw, id, folder);
    if (result.problems) broken.push({ id, file: name, source, problems: result.problems });
    else found.push({ ...result.theme, file: name, source });
  }
  return { found, broken };
}

function list() {
  const builtIn = readFolder(paths.builtInThemesDir(), 'built-in');
  const yours = readFolder(paths.themesDir(), 'yours');
  return {
    themes: [...builtIn.found, ...yours.found],
    broken: [...builtIn.broken, ...yours.broken],
    folder: paths.themesDir(),
  };
}

function slug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-theme';
}

function freeName(folder, base, ext) {
  let name = `${base}${ext}`;
  for (let suffix = 2; fs.existsSync(path.join(folder, name)) && suffix < 100; suffix += 1) {
    name = `${base}-${suffix}${ext}`;
  }
  return name;
}

function save({ name, description, look }) {
  const title = text(name, MAX_NAME);
  if (!title) throw new Error('Give the theme a name.');
  const folder = paths.themesDir();
  fs.mkdirSync(folder, { recursive: true });

  const chosen = settings.clean(Object.fromEntries(
    Object.entries(look || {}).filter(([key]) => ALLOWED.has(key) && key !== 'backgroundImage' && key !== 'fontSize')
  ));

  const base = slug(title);
  const out = { name: title, description: text(description, MAX_DESCRIPTION), settings: chosen };

  const image = String((look && look.backgroundImage) || '');
  if (image && fs.existsSync(image) && IMAGE_TYPES.has(path.extname(image).toLowerCase())) {
    const copy = freeName(folder, `${base}-background`, path.extname(image).toLowerCase());
    fs.copyFileSync(image, path.join(folder, copy));
    out.settings.backgroundImage = copy;
  }

  const file = freeName(folder, base, '.json');
  fs.writeFileSync(path.join(folder, file), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  return { file, id: `yours:${idFrom(file)}` };
}

function install(source) {
  const from = String(source || '');
  let stat;
  try {
    stat = fs.statSync(from);
  } catch {
    throw new Error('That file could not be read.');
  }
  if (!stat.isFile()) throw new Error('That is not a file.');
  if (stat.size > MAX_FILE_BYTES) throw new Error(`A theme must be under ${MAX_FILE_BYTES / 1024} KB.`);

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(from, 'utf8'));
  } catch (err) {
    throw new Error(`That file is not valid JSON: ${err.message}`);
  }

  const folder = paths.themesDir();
  fs.mkdirSync(folder, { recursive: true });

  const wanted = raw && raw.settings && raw.settings.backgroundImage;
  const besideIt = wanted ? path.join(path.dirname(from), String(wanted)) : '';
  if (wanted && !String(wanted).includes('/') && !String(wanted).includes('\\') && fs.existsSync(besideIt)
    && !fs.existsSync(path.join(folder, String(wanted)))) {
    fs.copyFileSync(besideIt, path.join(folder, String(wanted)));
  }

  const result = validate(raw, 'check', folder);
  if (result.problems) throw new Error(`That theme cannot be used - ${result.problems.join(', and ')}.`);

  const file = freeName(folder, idFrom(path.basename(from)) || 'theme', '.json');
  fs.copyFileSync(from, path.join(folder, file));
  return { ...result.theme, id: `yours:${idFrom(file)}`, file };
}

function remove(id) {
  const value = String(id || '');
  if (!value.startsWith('yours:')) throw new Error('Only your own themes can be deleted.');
  const entry = [...list().themes, ...list().broken].find((theme) => theme.id === value);
  if (!entry) return false;
  const folder = path.resolve(paths.themesDir());
  const file = path.resolve(folder, entry.file);
  if (path.dirname(file) !== folder) return false;
  fs.rmSync(file, { force: true });
  return true;
}

module.exports = { list, save, install, remove, validate, RESET, ALLOWED, MAX_FILE_BYTES };
