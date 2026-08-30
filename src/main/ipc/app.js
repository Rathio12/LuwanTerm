'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const { handle } = require('./helpers');
const vault = require('../store/vault');
const settings = require('../store/settings');
const snippets = require('../store/snippets');
const knownHosts = require('../store/known-hosts');
const config = require('../config');
const updater = require('../updater');

const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024;

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

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
    links: config.links,
  }));

  handle('app:open-external', async (url) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) links can be opened.');
    await shell.openExternal(url);
    return true;
  });

  handle('clipboard:read', () => clipboard.readText());
  handle('clipboard:write', (text) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });

  handle('app:pick-background', async () => {
    const result = await dialog.showOpenDialog(mainWindow(), {
      title: 'Choose a background image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  /**
   * Reads the chosen background as a data URI. The renderer cannot open
   * arbitrary local files itself, and inlining keeps it within the page's
   * content security policy.
   */
  handle('app:background', () => {
    const current = settings.get();
    if (!current.backgroundImage) return null;

    let stat;
    try {
      stat = fs.statSync(current.backgroundImage);
    } catch {
      return null;
    }
    if (stat.size > MAX_BACKGROUND_BYTES) {
      throw new Error(
        `That image is ${(stat.size / 1048576).toFixed(1)} MB. Pick one under ${MAX_BACKGROUND_BYTES / 1048576} MB.`
      );
    }

    const type = MIME_TYPES[path.extname(current.backgroundImage).toLowerCase()];
    if (!type) throw new Error('That file type is not supported as a background.');

    return {
      dataUri: `data:${type};base64,${fs.readFileSync(current.backgroundImage).toString('base64')}`,
      opacity: current.backgroundOpacity,
      blur: current.backgroundBlur,
    };
  });

  handle('updates:check', () => updater.check(true));
  handle('updates:state', () => updater.state());
  handle('updates:install', () => updater.install());

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
