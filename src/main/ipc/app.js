'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const { handle } = require('./helpers');
const vault = require('../store/vault');
const settings = require('../store/settings');
const snippets = require('../store/snippets');
const knownHosts = require('../store/known-hosts');

/** Single-window app, so the active window is unambiguous. */
const mainWindow = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

function register(hooks = {}) {
  ipcMain.on('app:window', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
    else if (action === 'close') win.close();
  });

  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    secretsAvailable: vault.available(),
  }));

  handle('app:open-external', async (url) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) links can be opened.');
    await shell.openExternal(url);
    return true;
  });

  // Sandboxed preloads cannot reach the clipboard module directly.
  handle('clipboard:read', () => clipboard.readText());
  handle('clipboard:write', (text) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });

  handle('settings:get', () => settings.get());
  handle('settings:set', (patch) => {
    const next = settings.set(patch);
    if (hooks.onSettingsChanged) hooks.onSettingsChanged(next);
    return next;
  });
  handle('settings:reset', () => {
    const next = settings.reset();
    if (hooks.onSettingsChanged) hooks.onSettingsChanged(next);
    return next;
  });

  handle('snippets:list', () => snippets.list());
  handle('snippets:save', (input) => snippets.save(input));
  handle('snippets:remove', (id) => snippets.remove(id));

  handle('known-hosts:list', () => knownHosts.list());
  handle('known-hosts:remove', (host, port) => knownHosts.remove(host, port));

  handle('dialog:pick-key', async () => {
    const result = await dialog.showOpenDialog(mainWindow(), {
      title: 'Select a private key',
      properties: ['openFile', 'showHiddenFiles'],
      filters: [
        { name: 'Private keys', extensions: ['pem', 'key', 'ppk', ''] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });
}

module.exports = { register };
