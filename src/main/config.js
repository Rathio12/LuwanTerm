'use strict';

/**
 * Build-time configuration.
 *
 * Values come from `.env` at the project root, baked into the build by
 * build/bake-config.js. They are deliberately *not* user settings: a release
 * must not be reconfigurable by whoever runs it, or it could be made to
 * masquerade as a different Discord application.
 *
 * To change them for your own build, edit `.env` and rebuild. See .env.example.
 */

const DEFAULTS = {
  discordClientId: '',
  github: '',
  issues: '',
  discord: '',
};

let baked = {};
try {

  baked = require('./config.generated.json');
} catch {
  baked = {};
}

const config = { ...DEFAULTS, ...baked };

module.exports = {
  ...config,
  links: {
    github: config.github,
    issues: config.issues,
    discord: config.discord,
  },
};
