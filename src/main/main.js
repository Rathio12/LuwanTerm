'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');

const { createWindow, createSplash } = require('./window');
const { SessionManager } = require('./ssh/manager');
const { registerAll } = require('./ipc');
const settings = require('./store/settings');
const discord = require('./discord');
const config = require('./config');
const updater = require('./updater');

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

    updater.start((state) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:state', state);
    });

    ipcMain.once('app:ready', reveal);

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
  if (!current.discordEnabled) {
    discord.stop();
    return;
  }
  discord.start({
    largeImage: 'icon',
    largeText: 'LuwanTerm',
    buttons: [
      { label: 'See GitHub', url: config.links.github },
      { label: 'Discord', url: config.links.discord },
    ],
  });
  updatePresence();
}

function updatePresence() {
  const current = settings.get();
  if (!current.discordEnabled) return;

  const sessions = manager.list();
  const count = sessions.length;

  const details = count === 0 ? 'Idle' : count === 1 ? '1 session' : `${count} sessions`;

  let state;
  if (count && current.discordShowHost) {
    const active = sessions[sessions.length - 1];
    state = count > 1 ? `${active.name} and ${count - 1} more` : `On ${active.name}`;
  }

  discord.setPresence({ details, state });
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
