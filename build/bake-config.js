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
  LINK_GITHUB: 'github',
  LINK_ISSUES: 'issues',
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

const envFile = path.join(root, '.env');
const fromFile = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};

const config = {};
for (const [envKey, configKey] of Object.entries(KEYS)) {
  const value = process.env[envKey] ?? fromFile[envKey] ?? '';
  config[configKey] = String(value).trim();
}

fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

const source = fs.existsSync(envFile) ? '.env' : 'defaults';
console.log(`config baked from ${source}:`);
for (const [key, value] of Object.entries(config)) {
  console.log(`  ${key}: ${value || '(empty)'}`);
}
