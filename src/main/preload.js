'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Unwraps the { ok, data, error } envelope from ipc/helpers.js so renderer
 * code can use plain try/catch against real Error objects.
 */
async function call(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result || result.ok !== true) {
    throw new Error((result && result.error) || 'The request failed.');
  }
  return result.data;
}

/** Wraps a main -> renderer channel and hands back an unsubscribe function. */
function subscribe(channel, listener) {
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('term', {
  app: {
    info: () => call('app:info'),
    minimize: () => ipcRenderer.send('app:window', 'minimize'),
    maximize: () => ipcRenderer.send('app:window', 'maximize'),
    close: () => ipcRenderer.send('app:window', 'close'),
    openExternal: (url) => call('app:open-external', url),
    onMaximized: (cb) => subscribe('app:maximized', cb),
    ready: () => ipcRenderer.send('app:ready'),
  },

  clipboard: {
    read: () => call('clipboard:read'),
    write: (text) => call('clipboard:write', text),
  },

  settings: {
    get: () => call('settings:get'),
    set: (patch) => call('settings:set', patch),
    reset: () => call('settings:reset'),
  },

  hosts: {
    list: () => call('hosts:list'),
    save: (input) => call('hosts:save', input),
    remove: (id) => call('hosts:remove', id),
    duplicate: (id) => call('hosts:duplicate', id),
    forgetSecret: (id) => call('hosts:forget-secret', id),
    accents: () => call('hosts:accents'),
    pickKey: () => call('dialog:pick-key'),
  },

  knownHosts: {
    list: () => call('known-hosts:list'),
    remove: (host, port) => call('known-hosts:remove', host, port),
  },

  snippets: {
    list: () => call('snippets:list'),
    save: (input) => call('snippets:save', input),
    remove: (id) => call('snippets:remove', id),
  },

  ssh: {
    connect: (hostId, size) => call('ssh:connect', hostId, size),
    disconnect: (sessionId) => call('ssh:disconnect', sessionId),
    write: (sessionId, data) => call('ssh:write', sessionId, data),
    resize: (sessionId, cols, rows) => call('ssh:resize', sessionId, cols, rows),
    list: () => call('ssh:list'),
    respond: (requestId, value) => call('ssh:prompt-response', requestId, value),
    onEvent: (cb) => subscribe('ssh:event', cb),
    onPrompt: (cb) => subscribe('ssh:prompt', cb),
  },

  sftp: {
    home: (sessionId) => call('sftp:home', sessionId),
    list: (sessionId, dir) => call('sftp:list', sessionId, dir),
    mkdir: (sessionId, dir) => call('sftp:mkdir', sessionId, dir),
    rename: (sessionId, from, to) => call('sftp:rename', sessionId, from, to),
    remove: (sessionId, target) => call('sftp:remove', sessionId, target),
    chmod: (sessionId, target, mode) => call('sftp:chmod', sessionId, target, mode),
    download: (sessionId, remotePath, isDirectory) =>
      call('sftp:download', sessionId, remotePath, Boolean(isDirectory)),
    cancel: (sessionId, transferId) => call('sftp:cancel', sessionId, transferId),
    upload: (sessionId, remoteDir) => call('sftp:upload', sessionId, remoteDir),
    reveal: (localPath) => call('sftp:reveal', localPath),
    onProgress: (cb) => subscribe('sftp:progress', cb),
  },

  keys: {
    types: () => call('keys:types'),
    list: () => call('keys:list'),
    scan: () => call('keys:scan'),
    create: (input) => call('keys:create', input),
    import: (input) => call('keys:import', input),
    link: (input) => call('keys:link', input),
    rename: (id, name) => call('keys:rename', id, name),
    remove: (id) => call('keys:remove', id),
    setPassphrase: (id, passphrase) => call('keys:set-passphrase', id, passphrase),
    probe: (filePath, passphrase) => call('keys:probe', filePath, passphrase),
    pickFile: () => call('keys:pick-file'),
    deploy: (sessionId, keyId) => call('keys:deploy', sessionId, keyId),
  },

  tunnels: {
    list: (sessionId) => call('tunnels:list', sessionId),
    open: (sessionId, config) => call('tunnels:open', sessionId, config),
    close: (sessionId, tunnelId) => call('tunnels:close', sessionId, tunnelId),
  },
});
