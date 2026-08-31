'use strict';

const { app } = require('electron');

/**
 * Update checking against GitHub releases.
 *
 * Nothing downloads without being asked. The startup check runs inside the
 * loading screen with a short timeout so a slow or unreachable network delays
 * launch by seconds rather than blocking it, and a failure there is silent:
 * being offline is not something to nag about. A check the user asked for in
 * Settings reports whatever happened.
 *
 * Portable builds cannot replace themselves, so they only report that a newer
 * version exists.
 */

const CHECK_TIMEOUT_MS = 7000;
const RECHECK_EVERY_MS = 6 * 60 * 60 * 1000;

let updater = null;
let notify = () => {};
let state = { status: 'idle' };
let manual = false;
let inFlight = null;
let recheckTimer = null;
let offered = null;

const isPortable = () => Boolean(process.env.PORTABLE_EXECUTABLE_DIR);

function setState(next) {
  state = next;
  notify(state);
}

/**
 * Compares dotted versions numerically, so 1.10.0 is correctly newer than 1.9.0
 * where a string comparison would say otherwise.
 */
function isNewer(candidate, current) {
  const parse = (v) => String(v).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left !== right) return left > right;
  }
  return false;
}

function describe(err) {
  const message = (err && err.message) || String(err);
  if (/404|Not Found/i.test(message)) {
    return 'No releases found. If the repository is private, updates cannot be checked.';
  }
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(message)) {
    return 'Could not reach GitHub to check for updates.';
  }
  return message;
}

/** Loads electron-updater lazily so a dev run never touches it. */
function load() {
  if (updater) return updater;
  try {
    updater = require('electron-updater').autoUpdater;
  } catch {
    return null;
  }

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;

  updater.on('checking-for-update', () => setState({ status: 'checking' }));
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

module.exports = {
  isNewer,
  /** @param {(state: object) => void} onState */
  attach(onState) {
    notify = typeof onState === 'function' ? onState : () => {};
  },

  /**
   * Asks GitHub whether there is anything newer.
   *
   * @returns {Promise<{version: string, current: string, canInstall: boolean}|null>}
   *   null when up to date, unreachable, or not applicable to this build
   */
  async check({ userAsked = false, timeout = CHECK_TIMEOUT_MS } = {}) {
    if (!app.isPackaged) {
      setState({ status: 'disabled', reason: 'Updates are only checked in a packaged build.' });
      return null;
    }

    const instance = load();
    if (!instance) {
      setState({ status: 'error', message: 'The updater component is missing from this build.' });
      return null;
    }

    if (inFlight) return inFlight;

    manual = userAsked;
    const current = app.getVersion();

    inFlight = (async () => {
      try {
        const result = await Promise.race([
          instance.checkForUpdates(),
          new Promise((resolve) => setTimeout(() => resolve(null), timeout)),
        ]);

        const version = result && result.updateInfo && result.updateInfo.version;
        if (!version) {
          if (userAsked) setState({ status: 'error', message: 'GitHub did not answer in time.' });
          else setState({ status: 'idle' });
          return null;
        }

        if (!isNewer(version, current)) {
          setState({ status: 'current', version: current });
          return null;
        }

        setState({ status: isPortable() ? 'available-portable' : 'available', version });
        return { version, current, canInstall: !isPortable() };
      } catch (err) {
        if (userAsked) setState({ status: 'error', message: describe(err) });
        else setState({ status: 'idle' });
        return null;
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  },

  /**
   * Re-checks periodically so a long-running window still notices a release.
   * @param {(update: object) => void} onFound called once per new version
   */
  watch(onFound) {
    clearInterval(recheckTimer);
    if (!app.isPackaged) return;

    recheckTimer = setInterval(async () => {
      const update = await this.check({ userAsked: false });

      if (update && update.version !== offered) {
        offered = update.version;
        try {
          onFound(update);
        } catch (err) {
          console.error('[updater] notify failed:', err.message);
        }
      }
    }, RECHECK_EVERY_MS);

    if (recheckTimer.unref) recheckTimer.unref();
  },

  stopWatching() {
    clearInterval(recheckTimer);
    recheckTimer = null;
  },

  /**
   * Downloads the pending update.
   * @param {(percent: number) => void} [onProgress]
   */
  download(onProgress) {
    const instance = load();
    if (!instance) return Promise.reject(new Error('The updater component is missing.'));

    const forward = (progress) => {
      if (typeof onProgress === 'function') onProgress(Math.round(progress.percent));
    };

    instance.on('download-progress', forward);
    return instance
      .downloadUpdate()
      .finally(() => instance.removeListener('download-progress', forward));
  },

  /**
   * Runs the downloaded installer and comes back.
   *
   * There is no separate updater binary: the release's own setup.exe is the
   * updater. It is shown rather than run silently, so the update is visible
   * while it happens, and relaunches on its own afterwards.
   */
  install() {
    if (!updater) throw new Error('Nothing has been downloaded.');
    setImmediate(() => updater.quitAndInstall(false, true));
    return true;
  },

  state() {
    return state;
  },
};
