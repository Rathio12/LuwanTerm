'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SOURCE = ['src', 'build', 'test'];
const READABLE = new Set(['.js', '.css', '.html', '.json', '.md', '.yml', '.txt']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'coverage', '.cache']);

const MIN_WORDS = 7;
const MAX_BYTES = 64 * 1024 * 1024;

const RX_BLOCK = new RegExp('\\/\\*[\\s\\S]*?\\*\\/', 'g');
const RX_LINE = new RegExp('(^|[^:])\\/\\/[^\\n]*', 'gm');
const RX_STRING = new RegExp('([\'"`])(?:\\\\.|(?!\\1)[^\\\\])*\\1', 'g');
const RX_NUMBER = new RegExp('\\b\\d[\\d.a-fx]*\\b', 'gi');
const RX_NAME = new RegExp('[A-Za-z_$][A-Za-z0-9_$]*', 'g');

const normalise = (text) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function markersFrom(text) {
  const found = new Set();

  const add = (raw) => {
    const phrase = normalise(raw);
    const tokens = phrase.split(' ');
    if (tokens.length < MIN_WORDS) return;

    const words = tokens.filter((token) => /^[a-z]{2,}$/.test(token));
    if (words.length < MIN_WORDS || words.length / tokens.length < 0.6) return;

    found.add(phrase);
  };

  for (const match of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
    const body = match[0].replace(/^\s*\*+/gm, ' ').replace(/\/\*+|\*+\//g, ' ');
    for (const sentence of body.split(/(?<=[.!?])\s+|\n\s*\n/)) add(sentence);
  }

  const lines = text.split(/\r?\n/);
  let paragraph = [];
  for (const line of lines) {
    const comment = /^\s*\/\/\s?(.*)$/.exec(line);
    if (comment) {
      paragraph.push(comment[1]);
      continue;
    }
    if (paragraph.length) {
      for (const sentence of paragraph.join(' ').split(/(?<=[.!?])\s+/)) add(sentence);
      paragraph = [];
    }
  }
  if (paragraph.length) add(paragraph.join(' '));

  for (const match of text.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\r\n]){30,400})\1/g)) add(match[2]);

  return found;
}

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'of', 'in',
  'while', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'class', 'extends',
  'async', 'await', 'typeof', 'instanceof', 'delete', 'void', 'null', 'true',
  'false', 'undefined', 'require', 'module', 'exports', 'default', 'import',
  'export', 'from', 'break', 'continue', 'switch', 'case', 'do', 'yield',
]);

const SHAPE_LENGTH = 6;

function shapesFrom(text) {
  const bare = text
    .replace(RX_BLOCK, ' ')
    .replace(RX_LINE, ' ')
    .replace(RX_STRING, ' ')
    .replace(RX_NUMBER, ' ');

  const names = (bare.match(RX_NAME) || []).filter((name) => !KEYWORDS.has(name));

  const shapes = new Set();
  for (let i = 0; i + SHAPE_LENGTH <= names.length; i += 1) {
    shapes.add(names.slice(i, i + SHAPE_LENGTH).join(' ').toLowerCase());
  }
  return shapes;
}

function buildFingerprint() {
  const markers = new Map();

  for (const dir of SOURCE) {
    for (const file of walk(path.join(root, dir))) {
      if (!READABLE.has(path.extname(file))) continue;
      const relative = path.relative(root, file).split(path.sep).join('/');
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const marker of markersFrom(text)) {
        if (!markers.has(marker)) markers.set(marker, relative);
      }
      if (path.extname(file) === '.js') {
        for (const shape of shapesFrom(text)) {
          if (!markers.has(shape)) markers.set(shape, relative);
        }
      }
    }
  }
  return markers;
}

function readSearchable(file) {
  let buffer;
  try {
    const stat = fs.statSync(file);
    if (stat.size > MAX_BYTES) return '';
    buffer = fs.readFileSync(file);
  } catch {
    return '';
  }
  const utf8 = buffer.toString('utf8');
  const utf16 = buffer.includes(0) ? buffer.toString('utf16le') : '';
  return normalise(`${utf8} ${utf16}`);
}

function main() {
  const suspect = process.argv[2];
  if (!suspect) {
    console.error('usage: node build/check-copy.js <folder or file>');
    process.exit(2);
  }
  if (!fs.existsSync(suspect)) {
    console.error(`no such path: ${suspect}`);
    process.exit(2);
  }

  const markers = buildFingerprint();
  console.log(`fingerprint: ${markers.size} markers from this repository`);

  const files = fs.statSync(suspect).isDirectory() ? walk(suspect) : [suspect];
  console.log(`scanning ${files.length} file${files.length === 1 ? '' : 's'} under ${suspect}`);

  const hits = new Map();
  for (const file of files) {
    const haystack = readSearchable(file);
    if (!haystack) continue;
    for (const [marker, origin] of markers) {
      if (hits.has(marker)) continue;
      if (haystack.includes(marker)) hits.set(marker, { origin, found: file });
    }
  }

  const score = markers.size ? (hits.size / markers.size) * 100 : 0;
  console.log('');
  console.log(`matched ${hits.size} of ${markers.size} markers  (${score.toFixed(1)}%)`);
  console.log('');
  console.log('The count is what matters, not the share. Pointing this at one folder');
  console.log('cannot match markers taken from the rest of the project, and unrelated');
  console.log('code of the same kind matches in the single digits.');
  console.log('');

  if (hits.size) {
    console.log('strongest evidence:');

    const quality = (phrase) => phrase.split(' ').filter((token) => /^[a-z]{3,}$/.test(token)).length;
    const shown = [...hits.entries()]
      .sort((a, b) => quality(b[0]) - quality(a[0]))
      .slice(0, 12);
    for (const [marker, where] of shown) {
      const text = marker.length > 96 ? `${marker.slice(0, 93)}...` : marker;
      console.log(`  "${text}"`);
      console.log(`     ours: ${where.origin}`);
      console.log(`     theirs: ${where.found}`);
    }
    console.log('');
  }

  if (hits.size >= 200) console.log('verdict: this is a copy of LuwanTerm.');
  else if (hits.size >= 20) console.log('verdict: parts of LuwanTerm are in here. Read the matches.');
  else if (hits.size) console.log('verdict: a few incidental matches. Probably coincidence - read them.');
  else console.log('verdict: no trace of LuwanTerm.');

  const compressed = files.filter((file) => /\.(exe|7z|zip|nupkg|dmg|appimage)$/i.test(file));
  if (!hits.size && compressed.length) {
    console.log('');
    console.log('note: an installer stores everything compressed, so nothing is readable');
    console.log('      from the outside. Install or unpack it first and scan the app folder,');
    console.log('      or scan resources/app.asar, which is not compressed.');
  }

  process.exit(hits.size >= 20 ? 1 : 0);
}

if (require.main === module) main();

module.exports = { markersFrom, buildFingerprint, normalise };
