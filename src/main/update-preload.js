'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updatePrompt', {
  onOffer: (callback) => {
    ipcRenderer.on('update:offer', (_event, offer) => callback(offer));
  },

  respond: (accepted) => ipcRenderer.send('update:answer', Boolean(accepted)),
});
