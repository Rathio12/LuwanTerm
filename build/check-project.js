'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let failures = 0;

const fail = (message) => {
  console.log(`  FAIL  ${message}`);
  failures += 1;
};
const pass = (message) => console.log(`  ok    ${message}`);

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

function checkHtmlReferences() {
  console.log('html references');
  const hasModules = fs.existsSync(path.join(root, 'node_modules'));
  const pages = ['src/renderer/index.html', 'src/renderer/splash.html'];
  let count = 0;
  let skipped = 0;

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
      if (ref.includes('node_modules/') && !hasModules) {
        skipped += 1;
        continue;
      }
      count += 1;
      if (!fs.existsSync(path.resolve(dir, ref))) {
        fail(`${page} references missing file: ${ref}`);
      }
    }
  }

  pass(
    `${count} script and stylesheet references resolve` +
      (skipped ? ` (${skipped} into node_modules skipped, not installed)` : '')
  );
}

function checkPackagedFiles() {
  console.log('packaging');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const declared = Object.keys(pkg.dependencies || {});

  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const loaded = new Set(
    [...html.matchAll(/(?:src|href)="(?:\.\.\/)+node_modules\/((?:@[^/"]+\/)?[^/"]+)/g)].map(
      (m) => m[1]
    )
  );

  for (const name of loaded) {
    if (!declared.includes(name)) {
      fail(`index.html loads node_modules/${name} but it is not a dependency`);
    }
  }

  if ((pkg.build.files || []).some((entry) => entry.startsWith('node_modules/'))) {
    fail('build.files pins node_modules paths by hand; electron-builder ships production deps itself');
  }

  pass(`${declared.length} dependencies declared, ${loaded.size} loaded by the renderer`);
}

function checkDocLinks() {
  console.log('documentation');
  const files = ['README.md'];
  const docs = path.join(root, 'guides');
  if (fs.existsSync(docs)) {
    for (const name of fs.readdirSync(docs)) {
      if (name.endsWith('.md')) files.push(path.join('guides', name));
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

/**
 * Nothing that looks like a credential may reach a published file.
 *
 * .env holds real tokens and is git-ignored, but nothing enforced that they
 * could not reach the build: bake-config.js copies named keys into
 * config.generated.json, which ships inside the asar, and .env.example is
 * committed. Both are one careless line away from publishing a secret.
 */
function checkSecrets() {
  console.log('secrets');

  const SECRETISH = /(token|secret|password|passwd|api[_-]?key|private[_-]?key|credential)/i;
  // Token-shaped rather than merely long: a Discord application id is twenty
  // digits and entirely public, so length alone would flag the wrong things.
  // A real token mixes letters and digits and is not a URL.
  const opaque = (value) =>
    typeof value === 'string' &&
    value.length >= 20 &&
    !/^https?:/i.test(value) &&
    /[A-Za-z]/.test(value) &&
    /[0-9]/.test(value);

  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '.env'], { cwd: root, stdio: 'pipe' });
    fail('.env is tracked by git - it holds real credentials and must not be');
  } catch {
    pass('.env is not tracked');
  }

  const example = path.join(root, '.env.example');
  if (fs.existsSync(example)) {
    const offenders = fs
      .readFileSync(example, 'utf8')
      .split(new RegExp('\\r?\\n'))
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
      .filter(([key, value]) => SECRETISH.test(key) || opaque(value));

    if (offenders.length) fail(`.env.example carries something credential-shaped: ${offenders.map(([k]) => k).join(', ')}`);
    else pass('.env.example holds only public values');
  }

  const keys = (fs.readFileSync(path.join(root, 'build/bake-config.js'), 'utf8').match(new RegExp('^\\s+([A-Z_]+):', 'gm')) || [])
    .map((line) => line.trim().replace(':', ''));
  const bakeable = keys.filter((key) => SECRETISH.test(key));
  if (bakeable.length) fail(`build/bake-config.js would bake a credential into the app: ${bakeable.join(', ')}`);
  else pass(`${keys.length} baked keys, none credential-shaped`);

  const generated = path.join(root, 'src/main/config.generated.json');
  if (fs.existsSync(generated)) {
    const config = JSON.parse(fs.readFileSync(generated, 'utf8'));
    const leaked = Object.entries(config).filter(([key, value]) => SECRETISH.test(key) || opaque(value));
    if (leaked.length) fail(`the shipped config contains ${leaked.map(([k]) => k).join(', ')}`);
    else pass('the shipped config carries nothing secret');
  }
}

checkSyntax();
checkHtmlReferences();
checkPackagedFiles();
checkDocLinks();
checkIcon();
checkSecrets();

console.log('');
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
