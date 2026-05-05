const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform:       process.platform,
  cardBounds:     (b)      => ipcRenderer.send('card-bounds', b),
  dragStart:      (sx, sy) => ipcRenderer.send('drag-start', { sx, sy }),
  dragMove:       (sx, sy) => ipcRenderer.send('drag-move',  { sx, sy }),
  dragEnd:        ()       => ipcRenderer.send('drag-end'),
  scaleEnd:       (scale)  => ipcRenderer.send('scale-end', scale),
  closeApp:       ()       => ipcRenderer.send('close-window'),
  installUpdate:  ()       => ipcRenderer.send('install-update'),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, v) => cb(v)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
});
