'use strict';

const path = require('path');
const { BrowserWindow, shell } = require('electron');

const DEV = process.argv.includes('--dev');

function createSplash() {
  const splash = new BrowserWindow({
    width: 380,
    height: 260,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0a0b12',
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  splash.once('ready-to-show', () => splash.show());
  splash.loadFile(path.join(__dirname, '..', 'renderer', 'splash.html'));
  return splash;
}

function createUpdatePrompt(parent) {
  const prompt = new BrowserWindow({
    width: 440,
    height: 290,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f111a',
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, 'update-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const reveal = () => {
    if (prompt.isDestroyed() || prompt.isVisible()) return;
    prompt.show();
    prompt.setAlwaysOnTop(true, 'screen-saver');
    prompt.moveTop();
    prompt.focus();
  };

  prompt.once('ready-to-show', reveal);
  setTimeout(reveal, 3000);

  prompt.loadFile(path.join(__dirname, '..', 'renderer', 'update.html'));
  return prompt;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 940,
    minHeight: 580,
    frame: false,
    show: false,
    backgroundColor: '#0a0b12',
    title: 'LuwanTerm',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  if (DEV) {

    win.webContents.on('console-message', (...args) => {
      const detail =
        args[0] && typeof args[0] === 'object' && 'message' in args[0]
          ? args[0]
          : { level: args[1], message: args[2], lineNumber: args[3], sourceId: args[4] };
      console.log(`[renderer:${detail.level}] ${detail.message} (${detail.sourceId}:${detail.lineNumber})`);
    });
    win.webContents.openDevTools({ mode: 'detach' });
  }

  const notifyMaximize = () => win.webContents.send('app:maximized', win.isMaximized());
  win.on('maximize', notifyMaximize);
  win.on('unmaximize', notifyMaximize);

  return win;
}

module.exports = { createWindow, createSplash, createUpdatePrompt };
