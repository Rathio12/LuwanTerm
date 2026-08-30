'use strict';

/**
 * Pre-flight checks that need no dependencies installed, so CI can run them in
 * seconds. Each one targets a way this project has actually broken before.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let failures = 0;

const fail = (message) => {
  console.error(`  FAIL  ${message}`);
  failures += 1;
};
const pass = (message) => console.log(`  ok    ${message}`);

/** Every .js file must parse. */
function checkSyntax() {
  console.log('syntax');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(path.join(root, 'src'));
  walk(path.join(root, 'build'));

  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (err) {
      fail(`${path.relative(root, file)} does not parse`);
    }
  }
  pass(`${files.length} javascript files parse`);
}

/**
 * Every script and stylesheet the HTML references must exist. Forgetting to add
 * a <script> tag for a new renderer module breaks the app silently.
 */
function checkHtmlReferences() {
  console.log('html references');
  const pages = ['src/renderer/index.html', 'src/renderer/splash.html'];
  let count = 0;

  for (const page of pages) {
    const file = path.join(root, page);
    const html = fs.readFileSync(file, 'utf8');
    const dir = path.dirname(file);

    const refs = [
      ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
      ...html.matchAll(/<link[^>]+href="([^"]+)"/g),
    ].map((m) => m[1]);

    for (const ref of refs) {
      if (/^https?:/.test(ref)) continue;
      count += 1;
      if (!fs.existsSync(path.resolve(dir, ref))) {
        fail(`${page} references missing file: ${ref}`);
      }
    }
  }
  pass(`${count} script and stylesheet references resolve`);
}

/**
 * Anything the packaged app loads from node_modules has to be listed in
 * build.files, or the packaged app starts and immediately fails.
 */
function checkPackagedFiles() {
  console.log('packaging');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const listed = (pkg.build.files || [])
    .filter((entry) => entry.startsWith('node_modules/'))
    .map((entry) => entry.split('/')[1]);

  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const needed = new Set(
    [...html.matchAll(/(?:src|href)="(?:\.\.\/)+node_modules\/([^/"]+)/g)].map((m) => m[1])
  );

  for (const name of needed) {
    if (!listed.includes(name)) {
      fail(`index.html loads node_modules/${name} but build.files does not ship it`);
    }
  }

  for (const name of Object.keys(pkg.dependencies || {})) {
    const scope = name.split('/')[0];
    if (!listed.includes(scope)) {
      fail(`dependency ${name} is not covered by build.files`);
    }
  }
  pass(`build.files covers ${listed.length} module paths`);
}

/** Documentation links must not rot. */
function checkDocLinks() {
  console.log('documentation');
  const files = ['README.md'];
  const docs = path.join(root, 'docs');
  if (fs.existsSync(docs)) {
    for (const name of fs.readdirSync(docs)) {
      if (name.endsWith('.md')) files.push(path.join('docs', name));
    }
  }

  let count = 0;
  for (const rel of files) {
    const file = path.join(root, rel);
    const text = fs.readFileSync(file, 'utf8');
    const dir = path.dirname(file);

    const targets = [
      ...[...text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)].map((m) => m[1]),
      ...[...text.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]),
    ];

    for (const target of targets) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      count += 1;
      if (!fs.existsSync(path.resolve(dir, target))) {
        fail(`${rel} links to missing ${target}`);
      }
    }
  }
  pass(`${count} documentation links resolve`);
}

/** The icon generator must still produce a usable file. */
function checkIcon() {
  console.log('icon');
  try {
    execFileSync(process.execPath, [path.join(root, 'build/make-icon.js')], { stdio: 'pipe' });
    const size = fs.statSync(path.join(root, 'build/icon.ico')).size;
    if (size < 1000) fail(`icon.ico is suspiciously small (${size} bytes)`);
    else pass(`icon.ico regenerated (${size} bytes)`);
  } catch (err) {
    fail(`icon generation failed: ${err.message}`);
  }
}

checkSyntax();
checkHtmlReferences();
checkPackagedFiles();
checkDocLinks();
checkIcon();

console.log('');
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
