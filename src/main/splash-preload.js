'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splash', {
  onState: (callback) => {
    ipcRenderer.on('splash:state', (_event, state) => callback(state));
  },
});
