'use strict';

const appIpc = require('./app');
const hostsIpc = require('./hosts');
const sshIpc = require('./ssh');
const sftpIpc = require('./sftp');
const tunnelsIpc = require('./tunnels');
const keysIpc = require('./keys');

function registerAll(manager, hooks = {}) {
  appIpc.register(hooks);
  hostsIpc.register();
  sshIpc.register(manager);
  sftpIpc.register(manager);
  tunnelsIpc.register(manager);
  keysIpc.register(manager);
}

module.exports = { registerAll };
