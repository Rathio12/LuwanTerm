'use strict';

const DEFAULTS = {
  discordClientId: '',
  discordLargeImage: '',
  github: '',
  issues: '',
  website: '',
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
    website: config.website,
    discord: config.discord,
  },
};
