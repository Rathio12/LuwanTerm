'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');

const { createWindow, createSplash, createUpdatePrompt } = require('./window');
const { SessionManager } = require('./ssh/manager');
const { registerAll } = require('./ipc');
const settings = require('./store/settings');
const hosts = require('./store/hosts');
const keys = require('./store/keys');
const discord = require('./discord');
const config = require('./config');
const updater = require('./updater');

/**
 * `LuwanTerm.exe --provenance` prints which build this is and whether its
 * record still checks out, then exits without opening a window. Redirect it to
 * a file if you are on Windows, where a GUI process has no console of its own:
 *
 *   LuwanTerm.exe --provenance > build.txt
 */
if (process.argv.includes('--provenance')) {
  const provenance = require('./provenance');
  const signature = provenance.verify();
  const tree = provenance.checkTree();

  process.stdout.write(`${String(provenance)}
`);
  process.stdout.write(`  signature: ${signature.state} - ${signature.detail}
`);
  process.stdout.write(`  files:     ${tree.ok ? 'intact' : 'CHANGED'} - ${tree.detail}
`);
  if (provenance.record) process.stdout.write(`${JSON.stringify(provenance.record, null, 2)}
`);

  app.exit(signature.state === 'verified' && tree.ok ? 0 : 1);
}

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

  app.whenReady().then(async () => {
    registerAll(manager, { onSettingsChanged: applyDiscord });
    manager.onChange = updatePresence;

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

    updater.attach((state) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:state', state);
    });

    const rendererReady = new Promise((resolve) => {
      ipcMain.once('app:ready', resolve);
      mainWindow.webContents.once('did-fail-load', resolve);
      setTimeout(resolve, SPLASH_TIMEOUT_MS);
    });

    const updating = await runBootSequence(splash, rendererReady);
    if (updating) return;

    reveal();
    watchForUpdates();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length !== 0) return;
      mainWindow = createWindow();
      mainWindow.once('ready-to-show', () => mainWindow.show());
      manager.attach(mainWindow.webContents);
    });
  });
}

/**
 * Keeps checking while the app is open, so a window left running for days still
 * finds out about a release. Each version is only ever offered once.
 */
function watchForUpdates() {
  updater.watch(async (update) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!(await askToUpdate(mainWindow, update))) return;

    try {
      await updater.download();
      updater.install();
    } catch (err) {
      mainWindow.webContents.send('update:state', { status: 'error', message: err.message });
    }
  });
}

/** Tells the splash window what is happening. */
function splashState(splash, state) {
  if (splash && !splash.isDestroyed()) splash.webContents.send('splash:state', state);
}

/**
 * Asks, on the splash, whether to install a waiting update. Defaults to "not
 * now" if nobody answers, so an unattended machine still finishes booting.
 */
function askToUpdate(splash, update) {
  return new Promise((resolve) => {
    const prompt = createUpdatePrompt(splash);
    let done = false;

    const settle = (accepted) => {
      if (done) return;
      done = true;
      ipcMain.removeListener('update:answer', onAnswer);
      if (!prompt.isDestroyed()) prompt.destroy();
      resolve(accepted);
    };

    const onAnswer = (_event, accepted) => settle(accepted);
    ipcMain.on('update:answer', onAnswer);

    prompt.on('closed', () => settle(false));

    prompt.webContents.once('did-finish-load', () => {
      prompt.webContents.send('update:offer', { version: update.version, current: update.current });
    });
  });
}

/**
 * The work that actually happens behind the loading screen: settings migration,
 * stored data, Discord, and the update check.
 *
 * @returns {Promise<boolean>} true when an update is being installed, in which
 *   case the main window is never shown
 */
async function runBootSequence(splash, rendererReady) {
  const step = (percent, status, detail) => splashState(splash, { percent, status, detail });

  step(12, 'Loading configuration');
  const current = settings.get();

  step(28, 'Restoring your hosts and keys');
  try {
    hosts.list();
    keys.list();
  } catch (err) {
    console.error('[boot] stored data could not be read:', err.message);
  }

  step(44, 'Connecting to Discord');
  applyDiscord(current);

  step(60, 'Checking for updates');
  const update = await updater.check({ userAsked: false });

  if (update && update.canInstall) {
    step(70, `Version ${update.version} is available`, 'Waiting for your answer');
    if (await askToUpdate(splash, update)) {
      step(0, `Downloading ${update.version}`, 'This can take a moment');
      try {
        await updater.download((percent) => step(percent, `Downloading ${update.version}`, `${percent}%`));
        step(100, 'Restarting to finish the update');
        updater.install();
        return true;
      } catch (err) {
        step(70, 'Update failed, carrying on', err.message.slice(0, 60));
      }
    }
  } else if (update) {
    step(70, `Version ${update.version} is available`, 'Portable builds cannot self-update');
  }

  step(82, 'Starting the interface');
  await rendererReady;

  step(100, 'Ready');
  return false;
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
    largeImage: config.discordLargeImage,
    largeText: 'LuwanTerm',

    buttons: [
      { label: 'See GitHub', url: config.links.github },
      { label: 'View page', url: config.links.website },
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
  updater.stopWatching();
  discord.stop();
  manager.closeAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  console.error('[main] uncaught exception:', err);
});
