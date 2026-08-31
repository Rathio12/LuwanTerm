'use strict';

const { handle } = require('./helpers');

function register(manager) {
  const tunnelsOf = (sessionId) => {
    const session = manager.get(sessionId);
    if (!session.tunnels) throw new Error('Tunnels are not available on this session.');
    return session.tunnels;
  };

  handle('tunnels:list', (sessionId) => tunnelsOf(sessionId).list());
  handle('tunnels:open', (sessionId, config) => tunnelsOf(sessionId).open(config));
  handle('tunnels:close', (sessionId, tunnelId) => tunnelsOf(sessionId).close(tunnelId));
}

module.exports = { register };
