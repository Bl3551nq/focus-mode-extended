const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform:       process.platform,
  dragStart:      ()      => ipcRenderer.send('drag-start'),
  dragEnd:        ()      => ipcRenderer.send('drag-end'),
  closeApp:       ()      => ipcRenderer.send('close-window'),
  installUpdate:  ()      => ipcRenderer.send('install-update'),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, v) => cb(v)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
});
