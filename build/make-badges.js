'use strict';

/**
 * Regenerates the badge row in README.md.
 *
 * The counts are measured here rather than typed by hand, so they cannot drift
 * into being a nice-sounding lie. Run `npm test` first and the test badge
 * reflects that run; otherwise it is left out rather than guessed.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const REPO = 'Rathio12/LuwanTerm';
const STYLE = 'flat-square';
const COUNTED = ['.js', '.html', '.css', '.md', '.json', '.yml', '.ps1'];
const SKIP = new Set(['node_modules', 'dist', '.git', 'out', 'images', 'certs']);

/** Counts lines of everything the project actually consists of. */
function countLines() {
  const totals = { code: 0, docs: 0, files: 0 };

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name) || entry.name.startsWith('.git')) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const ext = path.extname(entry.name);
      if (!COUNTED.includes(ext)) continue;
      if (entry.name === 'package-lock.json' || entry.name === 'fonts.json') continue;

      const lines = fs.readFileSync(full, 'utf8').split('\n').length;
      totals.files += 1;
      if (ext === '.md') totals.docs += lines;
      else totals.code += lines;
    }
  };

  walk(path.join(root, 'src'));
  walk(path.join(root, 'build'));
  walk(path.join(root, 'test'));
  walk(path.join(root, 'docs'));
  for (const name of fs.readdirSync(root)) {
    const full = path.join(root, name);
    if (fs.statSync(full).isFile() && COUNTED.includes(path.extname(name)) && name !== 'package-lock.json') {
      const lines = fs.readFileSync(full, 'utf8').split('\n').length;
      totals.files += 1;
      if (path.extname(name) === '.md') totals.docs += lines;
      else totals.code += lines;
    }
  }
  walk(path.join(root, '.github'));

  return totals;
}

function readTestResults() {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'test', 'results.json'), 'utf8'));
  } catch {
    return null;
  }
}

function electronVersion() {
  const range = (pkg.devDependencies && pkg.devDependencies.electron) || '';
  return range.replace(/^[^0-9]*/, '').split('.')[0] || '';
}

const badge = (label, message, colour, extra = '') => {
  const encode = (text) => encodeURIComponent(String(text).replace(/-/g, '--').replace(/_/g, '__'));
  return `https://img.shields.io/badge/${encode(label)}-${encode(message)}-${colour}?style=${STYLE}${extra}`;
};

const lines = countLines();
const tests = readTestResults();

const deps = pkg.dependencies || {};
const clean = (range) => String(range || '').replace(/^[^0-9]*/, '');

/** Reads LINK_DISCORD out of .env so the badge appears once one is set. */
function discordInvite() {
  try {
    const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
    const match = /^LINK_DISCORD\s*=\s*(.+)$/m.exec(env);
    const url = match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
    return /^https?:\/\//.test(url) ? url : '';
  } catch {
    return '';
  }
}

const badges = [
  `![Electron](${badge('electron', `${electronVersion()}+`, '2B2D31', '&logo=electron&logoColor=white')})`,
  `![Node](${badge('node', '22+', '339933', '&logo=nodedotjs&logoColor=white')})`,
  `![ssh2](${badge('ssh2', `${clean(deps.ssh2)}`, '7c5cff')})`,
  `![Terminal](${badge('terminal', 'xterm.js', '57F287')})`,
  `![PuTTY](${badge('PuTTY .ppk', 'v2 + v3', '5865F2')})`,
  `![Sessions](${badge('sessions', 'unlimited', '2B2D31')})`,
];

const invite = discordInvite();
if (invite) {
  badges.push(
    `[![Discord](${badge('Discord', 'Join server', '5865F2', '&logo=discord&logoColor=white')})](${invite})`
  );
}

if (tests) {
  const colour = tests.failed === 0 ? '22c55e' : 'ef4444';
  const text = tests.failed === 0 ? `${tests.passed} passing` : `${tests.failed} failing`;
  badges.push(`[![Tests](${badge('tests', text, colour)})](https://github.com/${REPO}/tree/main/test)`);
}

badges.push(
  `[![Lines of Code](https://img.shields.io/endpoint?url=${encodeURIComponent(
    `https://ghloc.vercel.app/api/${REPO}/badge`
  )}&style=${STYLE}&color=7c5cff)](https://github.com/${REPO})`,
  `[![Release](https://img.shields.io/github/v/release/${REPO}?style=${STYLE}&label=release&color=3ea8ff)](https://github.com/${REPO}/releases/latest)`,
  `[![Downloads](https://img.shields.io/github/downloads/${REPO}/total?style=${STYLE}&color=f2a33c)](https://github.com/${REPO}/releases)`,
  `[![CI](https://img.shields.io/github/actions/workflow/status/${REPO}/ci.yml?style=${STYLE}&label=CI&branch=main)](https://github.com/${REPO}/actions/workflows/ci.yml)`
);

const block = `<!-- badges -->\n${badges.join('\n')}\n<!-- /badges -->`;

const readmePath = path.join(root, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');

if (/<!-- badges -->[\s\S]*?<!-- \/badges -->/.test(readme)) {
  readme = readme.replace(/<!-- badges -->[\s\S]*?<!-- \/badges -->/, block);
} else {
  readme = readme.replace(/(A clean SSH client[^\n]*\n)/, `$1\n${block}\n`);
}

fs.writeFileSync(readmePath, readme, 'utf8');

console.log('badges regenerated');
console.log(`  lines : ${lines.code} code + ${lines.docs} docs = ${lines.code + lines.docs} across ${lines.files} files (badge is live from ghloc)`);
console.log(`  discord: ${discordInvite() || 'no LINK_DISCORD in .env, badge omitted'}`);
console.log(`  tests : ${tests ? `${tests.passed} passing in ${tests.suites.length} suites` : 'no results.json - run npm test first'}`);
console.log(`  electron: ${electronVersion()}`);
