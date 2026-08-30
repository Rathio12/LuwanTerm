'use strict';

const { handle } = require('./helpers');

function register(manager) {
  handle('ssh:connect', (hostId, size) => manager.create({ hostId, size }));
  handle('ssh:list', () => manager.list());
  handle('ssh:disconnect', (sessionId) => manager.close(sessionId));
  handle('ssh:resize', (sessionId, cols, rows) => manager.get(sessionId).resize(cols, rows));

  handle('ssh:write', (sessionId, data) => {
    const session = manager.sessions.get(sessionId);
    // Keystrokes racing a disconnect are normal; drop them instead of erroring.
    return session ? session.write(data) : false;
  });

  handle('ssh:prompt-response', (requestId, value) => manager.answerPrompt(requestId, value));
}

module.exports = { register };
