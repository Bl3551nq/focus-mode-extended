const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, minimal API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
});
