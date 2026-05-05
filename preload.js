const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform:       process.platform,
  // Mouse hit detection
  mouseEnter:     ()             => ipcRenderer.send('mouse-enter'),
  mouseLeave:     ()             => ipcRenderer.send('mouse-leave'),
  // Drag — sends real screen coordinates directly
  dragStart:      (sx, sy)       => ipcRenderer.send('drag-start', { sx, sy }),
  dragMove:       (sx, sy)       => ipcRenderer.send('drag-move',  { sx, sy }),
  dragEnd:        ()             => ipcRenderer.send('drag-end'),
  // Scale
  scaleStart:     ()             => ipcRenderer.send('scale-start'),
  scaleEnd:       (scale)        => ipcRenderer.send('scale-end', scale),
  // App
  closeApp:       ()             => ipcRenderer.send('close-window'),
  installUpdate:  ()             => ipcRenderer.send('install-update'),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, v) => cb(v)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
});
