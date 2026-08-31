'use strict';

const { ipcMain } = require('electron');

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return { ok: true, data: await fn(...args, event) };
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.error(`[ipc] ${channel}:`, message);
      return { ok: false, error: message };
    }
  });
}

module.exports = { handle };
