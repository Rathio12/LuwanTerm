'use strict';

const { BrowserWindow, dialog, shell } = require('electron');
const fs = require('fs');
const { handle } = require('./helpers');
const themes = require('../themes');
const paths = require('../paths');

const mainWindow = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

function register() {
  handle('themes:list', () => themes.list());

  handle('themes:save', (input) => themes.save(input || {}));

  handle('themes:install', async () => {
    const result = await dialog.showOpenDialog(mainWindow(), {
      title: 'Add a theme',
      properties: ['openFile'],
      filters: [{ name: 'Luwan Shell themes', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return themes.install(result.filePaths[0]);
  });

  handle('themes:remove', (id) => themes.remove(id));

  handle('themes:open-folder', async () => {
    const folder = paths.themesDir();
    fs.mkdirSync(folder, { recursive: true });
    await shell.openPath(folder);
    return folder;
  });
}

module.exports = { register };
