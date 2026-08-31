'use strict';

/**
 * Reads .env and writes src/main/config.generated.json, which the packaged app
 * ships. Real environment variables win over the file, so CI can override a
 * value without editing anything.
 *
 * Keeping this a build step rather than a runtime read means a release cannot be
 * repointed by dropping a .env next to the executable.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = path.join(root, 'src', 'main', 'config.generated.json');

const KEYS = {
  DISCORD_CLIENT_ID: 'discordClientId',
  DISCORD_LARGE_IMAGE: 'discordLargeImage',
  LINK_GITHUB: 'github',
  LINK_ISSUES: 'issues',
  LINK_WEBSITE: 'website',
  LINK_DISCORD: 'discord',
};

/** Minimal .env parser: KEY=value, # comments, optional surrounding quotes. */
function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const index = line.indexOf('=');
    if (index === -1) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const read = (file) => (fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {});

const envFile = path.join(root, '.env');
const fromFile = read(envFile);

// .env is not committed, so a fresh clone - and every CI build - would otherwise
// bake an empty config and ship a release with no Discord id and no links. The
// committed .env.example holds the project's own public values, so it stands in
// as the last resort. Anything private belongs in a real environment variable.
const fromExample = read(path.join(root, '.env.example'));

const config = {};
for (const [envKey, configKey] of Object.entries(KEYS)) {
  const value = process.env[envKey] ?? fromFile[envKey] ?? fromExample[envKey] ?? '';
  config[configKey] = String(value).trim();
}

fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

const source = fs.existsSync(envFile) ? '.env' : '.env.example';
console.log(`config baked from ${source}:`);
for (const [key, value] of Object.entries(config)) {
  console.log(`  ${key}: ${value || '(empty)'}`);
}
