'use strict';

const { BrowserWindow, dialog, shell } = require('electron');
const fs = require('fs');
const { handle } = require('./helpers');
const plugins = require('../plugins');
const policy = require('../policy');
const settings = require('../store/settings');
const audit = require('../audit');

const mainWindow = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

const allowed = () => policy.allows('allowMonitoring');

function requireAllowed() {
  if (!allowed()) throw new Error('Plugins are disabled by policy.');
}

function register(manager) {
  const recorded = new Set();
  const keyFor = (sessionId, pluginId) => `${sessionId}::${pluginId}`;

  const forget = (sessionId) => {
    for (const key of recorded) {
      if (key.startsWith(keyFor(sessionId, ''))) recorded.delete(key);
    }
  };

  handle('plugins:list', () => {
    const { plugins: found, broken, folder } = plugins.load();
    return {
      plugins: found,
      broken,
      folder,
      enabled: settings.get().enabledPlugins,
      allowed: allowed(),
    };
  });

  handle('plugins:enable', (id, on) => {
    const wanted = String(id || '');
    const current = settings.get().enabledPlugins;
    const next = on ? [...new Set([...current, wanted])] : current.filter((entry) => entry !== wanted);
    return settings.set({ enabledPlugins: next }).enabledPlugins;
  });

  handle('plugins:run', async (sessionId, id) => {
    requireAllowed();

    const plugin = plugins.load().plugins.find((entry) => entry.id === id);
    if (!plugin) throw new Error('That plugin is no longer installed.');
    if (!settings.get().enabledPlugins.includes(plugin.id)) {
      throw new Error('That plugin is switched off.');
    }

    const session = manager.get(sessionId);
    const key = keyFor(sessionId, plugin.id);

    if (!recorded.has(key)) {
      recorded.add(key);
      audit.record('plugin.run', {
        plugin: plugin.id,
        name: plugin.name,
        command: plugin.command,
        everySeconds: plugin.refreshSeconds,
        host: session.profile ? session.profile.host : '',
        sessionId,
      });
    }

    return plugins.run(session, plugin);
  });

  handle('plugins:install', async () => {
    const result = await dialog.showOpenDialog(mainWindow(), {
      title: 'Add a plugin',
      properties: ['openFile'],
      filters: [{ name: 'Plugin manifests', extensions: ['json'] }],
    });
    if (result.canceled) return null;

    const installed = plugins.install(result.filePaths[0]);
    audit.record('plugin.install', {
      plugin: installed.id,
      name: installed.name,
      command: installed.command,
      from: result.filePaths[0],
    });
    return installed;
  });

  handle('plugins:remove', (id) => {
    const wanted = String(id || '');
    const gone = plugins.remove(wanted);
    if (!gone) return false;

    audit.record('plugin.remove', { plugin: wanted });
    const current = settings.get().enabledPlugins;
    if (current.includes(wanted)) {
      settings.set({ enabledPlugins: current.filter((entry) => entry !== wanted) });
    }
    return true;
  });

  handle('plugins:open-folder', async () => {
    const folder = plugins.folder();
    fs.mkdirSync(folder, { recursive: true });
    await shell.openPath(folder);
    return folder;
  });

  return { forget };
}

module.exports = { register };
