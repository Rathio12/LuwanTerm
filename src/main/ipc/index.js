'use strict';

const appIpc = require('./app');
const hostsIpc = require('./hosts');
const sshIpc = require('./ssh');
const sftpIpc = require('./sftp');
const tunnelsIpc = require('./tunnels');
const keysIpc = require('./keys');
const pluginsIpc = require('./plugins');

/**
 * Wires every channel to the running session manager.
 *
 * Two modules want to hear that a session is gone and the manager offers one
 * hook, so they are chained here rather than one of them quietly winning.
 */
function registerAll(manager, hooks = {}) {
  appIpc.register(hooks);
  hostsIpc.register();
  sshIpc.register(manager);
  sftpIpc.register(manager);
  tunnelsIpc.register(manager);
  keysIpc.register(manager);

  const plugins = pluginsIpc.register(manager);
  const earlier = manager.onSessionGone;
  manager.onSessionGone = (sessionId) => {
    if (earlier) earlier(sessionId);
    plugins.forget(sessionId);
  };
}

module.exports = { registerAll };
