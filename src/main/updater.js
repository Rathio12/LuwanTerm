'use strict';

const { app } = require('electron');

/**
 * Update checking against GitHub releases.
 *
 * Deliberately quiet: the automatic check on startup never surfaces an error,
 * because a machine that is offline, behind a proxy, or running a build whose
 * releases are not reachable should not be nagged. A check the user asked for
 * reports whatever happened.
 *
 * Portable builds cannot replace themselves, so they only ever report that a
 * newer version exists.
 */

const FIRST_CHECK_DELAY_MS = 12000;

let updater = null;
let notify = () => {};
let state = { status: 'idle' };
let manual = false;

const isPortable = () => Boolean(process.env.PORTABLE_EXECUTABLE_DIR);

function setState(next) {
  state = next;
  notify(state);
}

/** Loads electron-updater lazily so a dev run never touches it. */
function load() {
  if (updater) return updater;
  try {
    updater = require('electron-updater').autoUpdater;
  } catch {
    return null;
  }

  updater.autoDownload = !isPortable();
  updater.autoInstallOnAppQuit = true;

  updater.on('checking-for-update', () => setState({ status: 'checking' }));

  updater.on('update-available', (info) => {
    setState({
      status: isPortable() ? 'available-portable' : 'downloading',
      version: info.version,
      percent: 0,
    });
  });

  updater.on('update-not-available', () => setState({ status: 'current', version: app.getVersion() }));

  updater.on('download-progress', (progress) => {
    setState({ status: 'downloading', version: state.version, percent: Math.round(progress.percent) });
  });

  updater.on('update-downloaded', (info) => setState({ status: 'ready', version: info.version }));

  updater.on('error', (err) => {

    if (manual) setState({ status: 'error', message: describe(err) });
    else setState({ status: 'idle' });
  });

  return updater;
}

function describe(err) {
  const message = (err && err.message) || String(err);
  if (/404|Not Found/i.test(message)) {
    return 'No releases found. If the repository is private, updates cannot be checked.';
  }
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED/i.test(message)) {
    return 'Could not reach GitHub to check for updates.';
  }
  return message;
}

module.exports = {
  /** @param {(state: object) => void} onState */
  start(onState) {
    notify = typeof onState === 'function' ? onState : () => {};
    if (!app.isPackaged) {
      setState({ status: 'disabled', reason: 'Updates are only checked in a packaged build.' });
      return;
    }

    const timer = setTimeout(() => this.check(false), FIRST_CHECK_DELAY_MS);
    if (timer.unref) timer.unref();
  },

  check(userAsked = true) {
    if (!app.isPackaged) {
      setState({ status: 'disabled', reason: 'Updates are only checked in a packaged build.' });
      return state;
    }

    const instance = load();
    if (!instance) {
      setState({ status: 'error', message: 'The updater component is missing from this build.' });
      return state;
    }

    manual = userAsked;
    instance.checkForUpdates().catch(() => {

    });
    return state;
  },

  /** Restarts into the downloaded version. */
  install() {
    if (state.status !== 'ready') throw new Error('No downloaded update is waiting.');
    setImmediate(() => updater.quitAndInstall());
    return true;
  },

  state() {
    return state;
  },
};
