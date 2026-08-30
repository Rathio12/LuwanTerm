'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');

const { createWindow, createSplash } = require('./window');
const { SessionManager } = require('./ssh/manager');
const { registerAll } = require('./ipc');
const settings = require('./store/settings');
const discord = require('./discord');

// Keep the splash up long enough to read, but never long enough to annoy.
const SPLASH_MIN_MS = 700;
const SPLASH_TIMEOUT_MS = 8000;

const manager = new SessionManager();
let mainWindow = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    registerAll(manager, { onSettingsChanged: applyDiscord });
    manager.onChange = updatePresence;
    applyDiscord();

    const splash = createSplash();
    const splashShownAt = Date.now();

    mainWindow = createWindow();
    manager.attach(mainWindow.webContents);

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;

      const remaining = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt));
      setTimeout(() => {
        if (!splash.isDestroyed()) splash.close();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      }, remaining);
    };

    ipcMain.once('app:ready', reveal);
    // Never strand the user on the splash if the renderer cannot report in.
    mainWindow.webContents.once('did-fail-load', reveal);
    setTimeout(reveal, SPLASH_TIMEOUT_MS);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length !== 0) return;
      mainWindow = createWindow();
      mainWindow.once('ready-to-show', () => mainWindow.show());
      manager.attach(mainWindow.webContents);
    });
  });
}

/**
 * Discord Rich Presence. Off unless the user turns it on and supplies their own
 * application id, and it never names a host unless they ask for that too - an
 * SSH client should not broadcast which machines you are logged into.
 */
function applyDiscord(current = settings.get()) {
  if (!current.discordEnabled || !current.discordClientId) {
    discord.stop();
    return;
  }
  discord.start({
    clientId: current.discordClientId,
    largeImage: 'icon',
    largeText: 'LuwanTerm',
  });
  updatePresence();
}

function updatePresence() {
  const current = settings.get();
  if (!current.discordEnabled) return;

  const sessions = manager.list();
  const count = sessions.length;
  let state;

  if (!count) {
    state = 'Idle';
  } else if (current.discordShowHost) {
    const active = sessions[sessions.length - 1];
    state = count > 1 ? `${active.name} and ${count - 1} more` : `On ${active.name}`;
  } else {
    state = count === 1 ? '1 session' : `${count} sessions`;
  }

  discord.setPresence({ details: 'LuwanTerm', state });
}

app.on('before-quit', () => {
  discord.stop();
  manager.closeAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  console.error('[main] uncaught exception:', err);
});
