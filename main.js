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
function saveWindowState(data) {
  try { fs.writeFileSync(windowStatePath, JSON.stringify(data)); } catch {}
}

let mainWin = null;
const BASE_W = 360, BASE_H = 580;
const MAX_SCALE = 1.8;
// Oversized transparent window used during scale drag so content never crops
const DRAG_W = Math.ceil(BASE_W * MAX_SCALE) + 20;
const DRAG_H = Math.ceil(BASE_H * MAX_SCALE) + 20;

function createWindow() {
  const saved = loadWindowState();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  let winX = Math.round((sw - BASE_W) / 2);
  let winY = Math.round((sh - BASE_H) / 2);
  let winW = BASE_W, winH = BASE_H;

  if (saved && saved.x != null) {
    const displays = screen.getAllDisplays();
    const onScreen = displays.some(d => {
      const b = d.workArea;
      return saved.x >= b.x && saved.y >= b.y &&
             saved.x + (saved.width||BASE_W) <= b.x + b.width &&
             saved.y + (saved.height||BASE_H) <= b.y + b.height;
    });
    if (onScreen) {
      winX = saved.x; winY = saved.y;
      winW = saved.width || BASE_W;
      winH = saved.height || BASE_H;
    }
  }

  mainWin = new BrowserWindow({
    width: winW, height: winH, x: winX, y: winY,
    minWidth: 200, minHeight: 300,
    frame: false, transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
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
  mainWin.on('closed', () => { mainWin = null; });
}

/* ══════════════════════════════════════════════════════
   DRAG — uses getCursorScreenPoint() so it works across
   the entire screen with no DPI/coordinate issues
══════════════════════════════════════════════════════ */
let isDragging = false, dragOffX = 0, dragOffY = 0, dragInterval = null;

ipcMain.on('drag-start', () => {
  if (!mainWin) return;
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = mainWin.getPosition();
  dragOffX = cursor.x - wx;
  dragOffY = cursor.y - wy;
  isDragging = true;

  // Poll cursor position at 60fps instead of relying on renderer events
  const BASE_W_SCALED = Math.round(BASE_W * (global._currentScale || 1));
  const BASE_H_SCALED = Math.round(BASE_H * (global._currentScale || 1));
  dragInterval = setInterval(() => {
    if (!isDragging || !mainWin) return;
    const c = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(c);
    const wa = display.workArea;
    // Use actual content size (not DRAG_W) for bounds — allows reaching all edges
    const [ww, wh] = mainWin.getSize();
    const contentW = global._currentScale ? Math.round(BASE_W * global._currentScale) : ww;
    const contentH = global._currentScale ? Math.round(BASE_H * global._currentScale) : wh;
    const nx = Math.max(wa.x, Math.min(wa.x + wa.width  - contentW, c.x - dragOffX));
    const ny = Math.max(wa.y, Math.min(wa.y + wa.height - contentH, c.y - dragOffY));
    mainWin.setPosition(Math.round(nx), Math.round(ny));
  }, 16); // ~60fps
});

ipcMain.on('drag-end', () => {
  isDragging = false;
  if (dragInterval) { clearInterval(dragInterval); dragInterval = null; }
  if (mainWin) {
    const [x, y] = mainWin.getPosition();
    const [w, h] = mainWin.getSize();
    saveWindowState({ x, y, width: w, height: h });
  }
});

/* ══════════════════════════════════════════════════════
   SCALE — expand window silently on start, shrink on end
   Zero resize calls during drag = zero wobble
══════════════════════════════════════════════════════ */
ipcMain.on('scale-start', () => {
  if (!mainWin) return;
  const [cx, cy] = mainWin.getPosition();
  const [cw, ch] = mainWin.getSize();
  // Expand to max possible size, centered on current window center
  const nx = Math.round(cx + (cw - DRAG_W) / 2);
  const ny = Math.round(cy + (ch - DRAG_H) / 2);
  mainWin.setBounds({ x: nx, y: ny, width: DRAG_W, height: DRAG_H }, false);
});

ipcMain.on('scale-end', (e, scale) => {
  if (!mainWin) return;
  global._currentScale = scale;           // track for drag bounds
  const newW = Math.round(BASE_W * scale);
  const newH = Math.round(BASE_H * scale);
  const [cx, cy] = mainWin.getPosition();
  const [cw, ch] = mainWin.getSize();
  mainWin.setBounds({
    x: Math.round(cx + (cw - newW) / 2),
    y: Math.round(cy + (ch - newH) / 2),
    width: newW, height: newH,
  }, false);
  const [x, y] = mainWin.getPosition();
  saveWindowState({ x, y, width: newW, height: newH });
});

/* ══════════════════════════════════════════════════════
   MISC IPC
══════════════════════════════════════════════════════ */
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
