'use strict';

const { handle } = require('./helpers');
const policy = require('../policy');
const audit = require('../audit');

function register(manager) {
  const tunnelsOf = (sessionId) => {
    const session = manager.get(sessionId);
    if (!session.tunnels) throw new Error('Tunnels are not available on this session.');
    return session.tunnels;
  };

  handle('tunnels:list', (sessionId) => tunnelsOf(sessionId).list());
  handle('tunnels:open', (sessionId, config) => {
    if (!policy.allows('allowTunnels')) throw new Error('Port forwarding is disabled by policy.');
    const opened = tunnelsOf(sessionId).open(config);
    audit.record('tunnel.open', { sessionId, ...config });
    return opened;
  });
  handle('tunnels:close', (sessionId, tunnelId) => {
    audit.record('tunnel.close', { sessionId, tunnelId });
    return tunnelsOf(sessionId).close(tunnelId);
  });
}

module.exports = { register };
