'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** The splash window's bridge: it is only ever told what is happening. */
contextBridge.exposeInMainWorld('splash', {
  onState: (callback) => {
    ipcRenderer.on('splash:state', (_event, state) => callback(state));
  },
});
