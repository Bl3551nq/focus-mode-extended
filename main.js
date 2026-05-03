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

function createWindow() {
  const saved  = loadWindowState();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const defaultW = 360, defaultH = 560;
  let winX = Math.round((sw - defaultW) / 2);
  let winY = Math.round((sh - defaultH) / 2);
  let winW = defaultW, winH = defaultH;

  if (saved) {
    const displays = screen.getAllDisplays();
    const onScreen = displays.some(d => {
      const b = d.workArea;
      return saved.x >= b.x && saved.y >= b.y &&
             saved.x + saved.width <= b.x + b.width &&
             saved.y + saved.height <= b.y + b.height;
    });
    if (onScreen) { winX = saved.x; winY = saved.y; winW = saved.width; winH = saved.height; }
  }

  mainWin = new BrowserWindow({
    width: winW, height: winH, x: winX, y: winY,
    minWidth: 200, minHeight: 300,
    frame: false, transparent: true,
    backgroundColor: '#00000000',
    resizable: false,           // we handle resize ourselves via zoom+IPC
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    roundedCorners: true,
  });

  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWin.once('ready-to-show', () => { mainWin.show(); mainWin.focus(); });
  ['move', 'resize'].forEach(evt => mainWin.on(evt, () => saveWindowState(mainWin)));
  mainWin.on('closed', () => { mainWin = null; });
}

/* ── IPC: drag using real OS cursor position ── */
let dragOffsetX = 0, dragOffsetY = 0;

ipcMain.on('drag-start', () => {
  if (!mainWin) return;
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = mainWin.getPosition();
  dragOffsetX = cursor.x - wx;
  dragOffsetY = cursor.y - wy;
});

ipcMain.on('drag-move', () => {
  if (!mainWin) return;
  const cursor  = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const bounds  = display.workArea;
  const [ww, wh] = mainWin.getSize();
  // allow full movement across entire screen including edges
  const newX = Math.max(bounds.x - ww + 40, Math.min(bounds.x + bounds.width - 40, cursor.x - dragOffsetX));
  const newY = Math.max(bounds.y, Math.min(bounds.y + bounds.height - 40, cursor.y - dragOffsetY));
  mainWin.setPosition(Math.round(newX), Math.round(newY));
});

ipcMain.on('drag-end', () => { if (mainWin) saveWindowState(mainWin); });
ipcMain.on('close-window', () => { if (mainWin) mainWin.close(); });
ipcMain.on('install-update', () => { autoUpdater.quitAndInstall(); });

/* ── IPC: resize window when zoom scale changes ── */
const BASE_W = 360, BASE_H = 560;
ipcMain.on('set-zoom', (e, scale) => {
  if (!mainWin) return;
  const newW = Math.round(BASE_W * scale);
  const newH = Math.round(BASE_H * scale);
  const [cx, cy] = mainWin.getPosition();
  const [ow, oh] = mainWin.getSize();
  // keep window centered on its current position
  const nx = Math.round(cx + (ow - newW) / 2);
  const ny = Math.round(cy + (oh - newH) / 2);
  mainWin.setSize(newW, newH);
  mainWin.setPosition(nx, ny);
  saveWindowState(mainWin);
});

/* ── Auto-updater ── */
function setupUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
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
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false, name: 'Focus Mode Extended', path: process.execPath });
}

app.whenReady().then(() => {
  createWindow(); setAutoLaunch(); setupUpdater();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else { app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } }); }
