const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  dragStart: (mouseX, mouseY) => ipcRenderer.send('drag-start', { mouseX, mouseY }),
  dragMove:  (mouseX, mouseY) => ipcRenderer.send('drag-move',  { mouseX, mouseY }),
  dragEnd:   ()               => ipcRenderer.send('drag-end'),
  closeApp:  ()               => ipcRenderer.send('close-window'),
});
