'use strict';

/**
 * Build-time configuration.
 *
 * The point of these checks is that a release is never shipped unconfigured: an
 * empty Discord id disables Rich Presence outright, and empty links quietly drop
 * the About buttons. .env is not committed, so CI builds rely on the fallback to
 * .env.example - which is exactly what regressed once already.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { suite, check, done } = require('./helpers/harness');

suite('config');

const root = path.join(__dirname, '..');
const bake = path.join(root, 'build', 'bake-config.js');
const generated = path.join(root, 'src', 'main', 'config.generated.json');

const run = (env) => {
  const result = spawnSync(process.execPath, [bake], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { output: `${result.stdout}${result.stderr}`, config: JSON.parse(fs.readFileSync(generated, 'utf8')) };
};

// Keep whatever the developer has, and put it back at the end.
const envFile = path.join(root, '.env');
const saved = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : null;
const savedConfig = fs.existsSync(generated) ? fs.readFileSync(generated, 'utf8') : null;

const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
check('.env.example names the Discord application', /^DISCORD_CLIENT_ID=\d{17,20}$/m.test(example));
check('.env.example names the repository', /^LINK_GITHUB=https:\/\/github\.com\/\S+$/m.test(example));
check('.env.example names the website', /^LINK_WEBSITE=https:\/\/\S+$/m.test(example));
check('.env.example names a presence image', /^DISCORD_LARGE_IMAGE=\S+$/m.test(example));

try {
  // What CI sees: a checkout with no .env at all.
  if (saved !== null) fs.rmSync(envFile);

  const ci = run({
    DISCORD_CLIENT_ID: undefined,
    DISCORD_LARGE_IMAGE: undefined,
    LINK_GITHUB: undefined,
    LINK_ISSUES: undefined,
    LINK_WEBSITE: undefined,
    LINK_DISCORD: undefined,
  });
  check('a build without .env still gets a Discord id', /^\d{17,20}$/.test(ci.config.discordClientId));
  check('a build without .env still gets the repo link', ci.config.github.startsWith('https://github.com/'));
  check('a build without .env still gets the website link', ci.config.website.startsWith('https://'));
  check('a build without .env still gets a presence image', ci.config.discordLargeImage.startsWith('https://'));
  check('it says where the values came from', ci.output.includes('.env.example'));

  // A real environment variable is how CI would override one value.
  const overridden = run({ LINK_WEBSITE: 'https://example.invalid/site' });
  check('an environment variable wins', overridden.config.website === 'https://example.invalid/site');
  check('the other values are untouched', overridden.config.github.startsWith('https://github.com/'));

  // And a local .env wins over the example.
  fs.writeFileSync(envFile, 'LINK_WEBSITE=https://local.invalid/\nLINK_GITHUB=\n');
  const local = run({ LINK_WEBSITE: undefined, LINK_GITHUB: undefined });
  check('.env wins over .env.example', local.config.website === 'https://local.invalid/');
  check('an empty value in .env is honoured, not backfilled', local.config.github === '');
  check('a key absent from .env falls back', local.config.issues.startsWith('https://github.com/'));

  // Values are quoted in some .env files; the parser must cope.
  fs.writeFileSync(envFile, 'LINK_WEBSITE="https://quoted.invalid/"\n# a comment\nLINK_ISSUES=\'https://single.invalid/\'\n');
  const quoted = run({ LINK_WEBSITE: undefined, LINK_ISSUES: undefined });
  check('double quotes are stripped', quoted.config.website === 'https://quoted.invalid/');
  check('single quotes are stripped', quoted.config.issues === 'https://single.invalid/');
} finally {
  if (saved === null) fs.rmSync(envFile, { force: true });
  else fs.writeFileSync(envFile, saved);
  if (savedConfig !== null) fs.writeFileSync(generated, savedConfig);
}

// The app must read whatever was baked, and expose the links to the renderer.
const config = require(path.join(root, 'src', 'main', 'config'));
check('the app exposes a website link', typeof config.links.website === 'string');
check('the app exposes a github link', typeof config.links.github === 'string');
check('the app exposes a presence image', typeof config.discordLargeImage === 'string');

check('the suite left no stray env file', fs.existsSync(envFile) === (saved !== null));

done();
