const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');

const userDataPath    = app.getPath('userData');
const windowStatePath = path.join(userDataPath, 'window-state.json');

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(windowStatePath, 'utf8')); }
  catch { return null; }
}
function saveWindowState(win) {
  try {
    if (win.isMinimized() || win.isMaximized()) return;
    fs.writeFileSync(windowStatePath, JSON.stringify(win.getBounds()));
  } catch {}
}

let mainWin = null;
const BASE_W = 360, BASE_H = 580;

function createWindow() {
  const saved = loadWindowState();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  let winX = Math.round((sw - BASE_W) / 2);
  let winY = Math.round((sh - BASE_H) / 2);
  let winW = BASE_W, winH = BASE_H;

  if (saved) {
    const displays = screen.getAllDisplays();
    const onScreen = displays.some(d => {
      const b = d.workArea;
      return saved.x >= b.x && saved.y >= b.y &&
             saved.x + saved.width  <= b.x + b.width &&
             saved.y + saved.height <= b.y + b.height;
    });
    if (onScreen) {
      winX = saved.x; winY = saved.y;
      winW = saved.width; winH = saved.height;
    }
  }

  mainWin = new BrowserWindow({
    width: winW, height: winH, x: winX, y: winY,
    minWidth: 200, minHeight: 300,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    roundedCorners: true,
  });

  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWin.once('ready-to-show', () => { mainWin.show(); mainWin.focus(); });
  ['move', 'resize'].forEach(e => mainWin.on(e, () => saveWindowState(mainWin)));
  mainWin.on('closed', () => { mainWin = null; });
}

/* ── IPC: resize window atomically when zoom changes ── */
ipcMain.on('set-zoom', (e, scale) => {
  if (!mainWin) return;
  const newW = Math.round(BASE_W * scale);
  const newH = Math.round(BASE_H * scale);
  const [cx, cy] = mainWin.getPosition();
  const [ow, oh] = mainWin.getSize();
  // atomic setBounds — no visual jump between position & size changes
  mainWin.setBounds({
    x: Math.round(cx + (ow - newW) / 2),
    y: Math.round(cy + (oh - newH) / 2),
    width:  newW,
    height: newH,
  }, false); // false = no animation
  saveWindowState(mainWin);
});

/* ── IPC: close & update ── */
ipcMain.on('close-window',   () => { if (mainWin) mainWin.close(); });
ipcMain.on('install-update', () => { autoUpdater.quitAndInstall(); });

/* ── Auto-updater ── */
function setupUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', info => {
    if (mainWin) mainWin.webContents.send('update-available', info.version);
  });
  autoUpdater.on('update-downloaded', () => {
    if (mainWin) mainWin.webContents.send('update-downloaded');
  });
  autoUpdater.on('error', () => {});
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  setInterval(() => autoUpdater.checkForUpdates(), 2 * 60 * 60 * 1000);
}

function setAutoLaunch() {
  app.setLoginItemSettings({
    openAtLogin: true, openAsHidden: false,
    name: 'Focus Mode Extended', path: process.execPath,
  });
}

app.whenReady().then(() => {
  createWindow(); setAutoLaunch(); setupUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
  });
}
