'use strict';

/**
 * Build-time configuration.
 *
 * The point of these checks is that a release is never shipped unconfigured: an
 * empty Discord id disables Rich Presence outright, and empty links quietly drop
 * the About buttons. .env is not committed, so CI builds rely on the fallback to
 * .env.example - which is exactly what regressed once already.
 *
 * Everything here bakes into a temp directory. The suite must never touch the
 * developer's own .env or the generated config, or an interrupted run leaves
 * their working tree broken.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { suite, check, done } = require('./helpers/harness');

suite('config');

const root = path.join(__dirname, '..');
const bake = path.join(root, 'build', 'bake-config.js');
const example = path.join(root, '.env.example');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luwanterm-config-'));
const out = path.join(dir, 'config.generated.json');
const envFile = path.join(dir, '.env');

/**
 * Bakes with a given environment. `env` values of null are removed, so a test
 * can hide a variable the developer happens to have set.
 */
function run(env = {}, { withEnvFile = false } = {}) {
  const merged = {
    ...process.env,
    LUWAN_CONFIG_OUT: out,
    LUWAN_ENV_FILE: withEnvFile ? envFile : path.join(dir, 'absent'),
    LUWAN_ENV_EXAMPLE: example,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }

  const result = spawnSync(process.execPath, [bake], { cwd: root, encoding: 'utf8', env: merged });
  return {
    output: `${result.stdout}${result.stderr}`,
    config: JSON.parse(fs.readFileSync(out, 'utf8')),
  };
}

const NO_ENV = {
  DISCORD_CLIENT_ID: null,
  DISCORD_LARGE_IMAGE: null,
  LINK_GITHUB: null,
  LINK_ISSUES: null,
  LINK_WEBSITE: null,
  LINK_DISCORD: null,
};

const text = fs.readFileSync(example, 'utf8');
check('.env.example names the Discord application', /^DISCORD_CLIENT_ID=\d{17,20}$/m.test(text));
check('.env.example names the repository', /^LINK_GITHUB=https:\/\/github\.com\/\S+$/m.test(text));
check('.env.example names the website', /^LINK_WEBSITE=https:\/\/\S+$/m.test(text));
check('.env.example names a presence image', /^DISCORD_LARGE_IMAGE=\S+$/m.test(text));

// What CI sees: a checkout with no .env at all.
const ci = run(NO_ENV);
check('a build without .env still gets a Discord id', /^\d{17,20}$/.test(ci.config.discordClientId));
check('a build without .env still gets the repo link', ci.config.github.startsWith('https://github.com/'));
check('a build without .env still gets the website link', ci.config.website.startsWith('https://'));
check('a build without .env still gets a presence image', ci.config.discordLargeImage.startsWith('https://'));
check('it says where the values came from', ci.output.includes('.env.example'));

// A real environment variable is how CI would override one value.
const overridden = run({ ...NO_ENV, LINK_WEBSITE: 'https://example.invalid/site' });
check('an environment variable wins', overridden.config.website === 'https://example.invalid/site');
check('the other values are untouched', overridden.config.github.startsWith('https://github.com/'));

// And a local .env wins over the example.
fs.writeFileSync(envFile, 'LINK_WEBSITE=https://local.invalid/\nLINK_GITHUB=\n');
const local = run(NO_ENV, { withEnvFile: true });
check('.env wins over .env.example', local.config.website === 'https://local.invalid/');
check('an empty value in .env is honoured, not backfilled', local.config.github === '');
check('a key absent from .env falls back', local.config.issues.startsWith('https://github.com/'));

// Values are quoted in some .env files, and comments are common.
fs.writeFileSync(
  envFile,
  'LINK_WEBSITE="https://quoted.invalid/"\n# a comment\nLINK_ISSUES=\'https://single.invalid/\'\n'
);
const quoted = run(NO_ENV, { withEnvFile: true });
check('double quotes are stripped', quoted.config.website === 'https://quoted.invalid/');
check('single quotes are stripped', quoted.config.issues === 'https://single.invalid/');
check('a comment is not read as a key', !('#' in quoted.config));

// The app must read whatever was baked, and pass the links to the renderer.
const config = require(path.join(root, 'src', 'main', 'config'));
check('the app exposes a website link', typeof config.links.website === 'string');
check('the app exposes a github link', typeof config.links.github === 'string');
check('the app exposes a presence image', typeof config.discordLargeImage === 'string');

// The developer's own files were never in play.
check('the real .env was not touched', !fs.existsSync(path.join(dir, 'absent')));
check('the shipped config was not rewritten', fs.existsSync(path.join(root, 'src', 'main', 'config.generated.json')));

fs.rmSync(dir, { recursive: true, force: true });

done();
