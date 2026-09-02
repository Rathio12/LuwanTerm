'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const target = process.env.LUWAN_CONFIG_OUT || path.join(root, 'src', 'main', 'config.generated.json');
const envFile = process.env.LUWAN_ENV_FILE || path.join(root, '.env');
const exampleFile = process.env.LUWAN_ENV_EXAMPLE || path.join(root, '.env.example');

const KEYS = {
  DISCORD_CLIENT_ID: 'discordClientId',
  DISCORD_LARGE_IMAGE: 'discordLargeImage',
  LINK_GITHUB: 'github',
  LINK_ISSUES: 'issues',
  LINK_WEBSITE: 'website',
  LINK_DONATE: 'donate',
  LINK_DISCORD: 'discord',
};

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

const fromFile = read(envFile);

const fromExample = read(exampleFile);

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
