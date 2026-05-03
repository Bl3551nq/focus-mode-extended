const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform:       process.platform,
  setZoom:        (scale) => ipcRenderer.send('set-zoom',      scale), // size+center on release
  setZoomSize:    (scale) => ipcRenderer.send('set-zoom-size', scale), // size only during drag
  closeApp:       ()      => ipcRenderer.send('close-window'),
  installUpdate:  ()      => ipcRenderer.send('install-update'),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, v) => cb(v)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
});
