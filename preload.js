const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  platform:        process.platform,
  dragStart:       ()      => ipcRenderer.send('drag-start'),
  dragEnd:         ()      => ipcRenderer.send('drag-end'),
  scaleStart:      ()      => ipcRenderer.send('scale-start'),
  scaleEnd:        (s)     => ipcRenderer.send('scale-end', s),
  setHeight:       (h)     => ipcRenderer.send('set-height', h),
  closeApp:        ()      => ipcRenderer.send('close-window'),
  installUpdate:   ()      => ipcRenderer.send('install-update'),
  validateLicense: (key)   => ipcRenderer.invoke('validate-license', key),
  checkLicense:    ()      => ipcRenderer.invoke('check-license'),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, v) => cb(v)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
});
