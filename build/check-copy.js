'use strict';

/**
 * Tells you whether something is a copy of LuwanTerm.
 *
 *   node build/check-copy.js <folder or file>
 *
 * The markers are derived from this repository every time it runs, so there is
 * no list committed anywhere for somebody to find and strip. What it looks for
 * is the writing rather than the names: comment sentences, error wording and
 * distinctive constants. Renaming the app, reformatting the code, changing the
 * icon and swapping the colours leave all of that intact, because rewriting
 * every comment in a codebase is more work than writing one.
 *
 * It reads binaries too, so a repackaged installer or an unpacked asar can be
 * checked the same way.
 *
 * A high score is evidence, not a verdict. Read the matches before accusing
 * anyone of anything.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SOURCE = ['src', 'build', 'test'];
const READABLE = new Set(['.js', '.css', '.html', '.json', '.md', '.yml', '.txt']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'coverage', '.cache']);

/** Phrases shorter than this match too much prose to mean anything. */
const MIN_WORDS = 7;
const MAX_BYTES = 64 * 1024 * 1024;

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

/**
 * Pulls the sentences worth fingerprinting out of one of our own files: comment
 * prose and string literals long enough to be ours rather than anyone's.
 */
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

/** Every marker this repository can offer, and which file each came from. */
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
    }
  }
  return markers;
}

/**
 * Reads a file as text whatever it is. A packaged app is a binary with our
 * strings sitting inside it, and UTF-16 is how Windows tooling often stores
 * them, so both encodings are searched.
 */
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

  if (score >= 25) console.log('verdict: this is a copy of LuwanTerm.');
  else if (score >= 5) console.log('verdict: parts of LuwanTerm are in here. Read the matches.');
  else if (hits.size) console.log('verdict: a few incidental matches. Probably coincidence - read them.');
  else console.log('verdict: no trace of LuwanTerm.');

  const compressed = files.filter((file) => /\.(exe|7z|zip|nupkg|dmg|appimage)$/i.test(file));
  if (!hits.size && compressed.length) {
    console.log('');
    console.log('note: an installer stores everything compressed, so nothing is readable');
    console.log('      from the outside. Install or unpack it first and scan the app folder,');
    console.log('      or scan resources/app.asar, which is not compressed.');
  }

  process.exit(score >= 5 ? 1 : 0);
}

if (require.main === module) main();

module.exports = { markersFrom, buildFingerprint, normalise };
