'use strict';

const { handle } = require('./helpers');
const policy = require('../policy');
const stats = require('../ssh/stats');

function register(manager) {
  handle('ssh:connect', (hostId, size) => manager.create({ hostId, size }));
  handle('ssh:list', () => manager.list());
  handle('ssh:disconnect', (sessionId) => manager.close(sessionId));
  handle('ssh:resize', (sessionId, cols, rows) => manager.get(sessionId).resize(cols, rows));

  handle('ssh:write', (sessionId, data) => {
    const session = manager.sessions.get(sessionId);

    return session ? session.write(data) : false;
  });

  handle('ssh:prompt-response', (requestId, value) => manager.answerPrompt(requestId, value));

  handle('stats:read', async (sessionId) => {
    if (!policy.allows('allowMonitoring')) throw new Error('Server monitoring is disabled by policy.');
    return stats.read(manager.get(sessionId));
  });
}

module.exports = { register };
