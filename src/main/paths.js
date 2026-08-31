'use strict';

const path = require('path');
const { app } = require('electron');

const root = () => app.getPath('userData');

module.exports = {
  root,
  hostsFile: () => path.join(root(), 'hosts.json'),
  snippetsFile: () => path.join(root(), 'snippets.json'),
  settingsFile: () => path.join(root(), 'settings.json'),
  knownHostsFile: () => path.join(root(), 'known-hosts.json'),
  vaultFile: () => path.join(root(), 'vault.dat'),
  keysFile: () => path.join(root(), 'keys.json'),
  keysDir: () => path.join(root(), 'keys'),
  logsDir: () => path.join(root(), 'logs'),
};
