'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** Bridge for the update prompt window: receive the offer, send back a choice. */
contextBridge.exposeInMainWorld('updatePrompt', {
  onOffer: (callback) => {
    ipcRenderer.on('update:offer', (_event, offer) => callback(offer));
  },

  respond: (accepted) => ipcRenderer.send('update:answer', Boolean(accepted)),
});
