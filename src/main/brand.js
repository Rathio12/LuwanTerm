'use strict';

const pkg = require('../../package.json');
const build = pkg.build || {};
const publish = (build.publish || [])[0] || {};

module.exports = {
  productName: build.productName || pkg.name,
  version: pkg.version,
  appId: build.appId || '',
  userDataFolder: 'luwan-term',
  owner: publish.owner || '',
  repo: publish.repo || '',
};
