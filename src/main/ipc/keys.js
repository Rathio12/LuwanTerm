'use strict';

const fs = require('fs');
const { BrowserWindow, dialog } = require('electron');
const { handle } = require('./helpers');
const keys = require('../store/keys');
const keygen = require('../ssh/keygen');
const vault = require('../store/vault');

const mainWindow = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

function register(manager) {
  handle('keys:types', () => keygen.KEY_TYPES);
  handle('keys:list', () => keys.list());
  // Explicit, user-initiated scan. Results are shown for picking, not adopted.
  handle('keys:scan', () => keys.candidates());
  handle('keys:create', (input) => keys.create(input));
  handle('keys:rename', (id, name) => keys.rename(id, name));
  handle('keys:remove', (id) => keys.remove(id));
  handle('keys:set-passphrase', (id, passphrase) => keys.setPassphrase(id, passphrase));
  handle('keys:import', (input) => keys.importFile(input));
  handle('keys:link', (input) => keys.linkFile(input));
  handle('keys:deploy', (sessionId, keyId) => manager.deployKey(sessionId, keyId));

  handle('keys:pick-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow(), {
      title: 'Import a private key',
      properties: ['openFile', 'showHiddenFiles'],
      filters: [
        { name: 'Private keys', extensions: ['', 'pem', 'key', 'ppk'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  /**
   * Inspects a candidate key file without importing it, so the renderer knows
   * whether to ask for a passphrase first.
   */
  handle('keys:probe', (filePath, passphrase) => {
    try {
      const details = keygen.inspect(fs.readFileSync(filePath, 'utf8'), passphrase);
      return { usable: true, encrypted: Boolean(passphrase), ...details };
    } catch (err) {
      if (err.needsPassphrase) {
        return { usable: false, needsPassphrase: true, wrongPassphrase: Boolean(err.wrongPassphrase) };
      }
      throw err;
    }
  });
}

module.exports = { register };
