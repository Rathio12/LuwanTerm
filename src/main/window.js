'use strict';

const path = require('path');
const { BrowserWindow, shell } = require('electron');

const DEV = process.argv.includes('--dev');

/**
 * Small frameless window shown while Electron and the renderer start up.
 * It is closed once the renderer reports that it has finished loading.
 */
function createSplash() {
  const splash = new BrowserWindow({
    width: 360,
    height: 210,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0a0b12',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  splash.once('ready-to-show', () => splash.show());
  splash.loadFile(path.join(__dirname, '..', 'renderer', 'splash.html'));
  return splash;
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

  // Shown by main.js once the renderer signals it is ready, not on first paint.
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // The renderer never navigates or spawns windows; links go to the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  if (DEV) {
    // Surfaces renderer errors in the terminal that launched `npm run dev`.
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

module.exports = { createWindow, createSplash };
