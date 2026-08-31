'use strict';

const { ipcMain } = require('electron');

/**
 * Wraps a handler so the renderer always receives a predictable envelope
 * instead of Electron's "Error invoking remote method ..." wrapper text.
 */
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
