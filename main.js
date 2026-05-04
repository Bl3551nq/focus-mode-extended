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
const DRAG_W = Math.ceil(BASE_W * MAX_SCALE) + 40;
const DRAG_H = Math.ceil(BASE_H * MAX_SCALE) + 40;

// Center point anchored before scale expansion — ensures no drift on shrink
let scaleCenterX = 0, scaleCenterY = 0;
let currentScale = 1;

// Drag state
let isDragging = false;
let dragOffX = 0, dragOffY = 0;
let dragInterval = null;

function createWindow() {
  const saved = loadWindowState();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  let winX = Math.round((sw - BASE_W) / 2);
  let winY = Math.round((sh - BASE_H) / 2);
  let winW = BASE_W, winH = BASE_H;

  if (saved && saved.x != null) {
    const onScreen = screen.getAllDisplays().some(d => {
      const b = d.workArea;
      return saved.x >= b.x - 50 && saved.y >= b.y - 50 &&
             saved.x < b.x + b.width && saved.y < b.y + b.height;
    });
    if (onScreen) {
      winX = saved.x; winY = saved.y;
      winW = saved.width  || BASE_W;
      winH = saved.height || BASE_H;
      currentScale = saved.scale || 1;
    }
  }

  mainWin = new BrowserWindow({
    width: winW, height: winH, x: winX, y: winY,
    minWidth: 100, minHeight: 100,
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

/* ═══════════════════════════════════════════════════
   DRAG — 60fps polling from OS cursor, no bounds clamp
   so window moves freely to every screen corner
═══════════════════════════════════════════════════ */
ipcMain.on('drag-start', () => {
  if (!mainWin) return;
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = mainWin.getPosition();
  dragOffX = cursor.x - wx;
  dragOffY = cursor.y - wy;
  isDragging = true;

  if (dragInterval) clearInterval(dragInterval);
  dragInterval = setInterval(() => {
    if (!isDragging || !mainWin) return;
    const c = screen.getCursorScreenPoint();
    // No clamping — let window move anywhere on screen
    mainWin.setPosition(
      Math.round(c.x - dragOffX),
      Math.round(c.y - dragOffY)
    );
  }, 16);
});

ipcMain.on('drag-end', () => {
  isDragging = false;
  if (dragInterval) { clearInterval(dragInterval); dragInterval = null; }
  if (!mainWin) return;
  const [x, y] = mainWin.getPosition();
  const [w, h] = mainWin.getSize();
  saveWindowState({ x, y, width: w, height: h, scale: currentScale });
});

/* ═══════════════════════════════════════════════════
   SCALE — anchor to center point so shrink lands
   exactly where expand started — zero twitch
═══════════════════════════════════════════════════ */
ipcMain.on('scale-start', () => {
  if (!mainWin) return;
  const [wx, wy] = mainWin.getPosition();
  const [ww, wh] = mainWin.getSize();
  // Record the center of the CURRENT window (before expansion)
  scaleCenterX = wx + ww / 2;
  scaleCenterY = wy + wh / 2;
  // Expand symmetrically around that center
  mainWin.setBounds({
    x: Math.round(scaleCenterX - DRAG_W / 2),
    y: Math.round(scaleCenterY - DRAG_H / 2),
    width: DRAG_W,
    height: DRAG_H,
  }, false);
});

ipcMain.on('scale-end', (e, scale) => {
  if (!mainWin) return;
  currentScale = scale;
  const newW = Math.round(BASE_W * scale);
  const newH = Math.round(BASE_H * scale);
  // Shrink back anchored to the SAME center point — no drift, no twitch
  mainWin.setBounds({
    x: Math.round(scaleCenterX - newW / 2),
    y: Math.round(scaleCenterY - newH / 2),
    width: newW,
    height: newH,
  }, false);
  saveWindowState({
    x: Math.round(scaleCenterX - newW / 2),
    y: Math.round(scaleCenterY - newH / 2),
    width: newW, height: newH, scale,
  });
});

/* ═══════════════════════════════════════════════════
   MISC
═══════════════════════════════════════════════════ */
ipcMain.on('close-window',   () => { if (mainWin) mainWin.close(); });
ipcMain.on('install-update', () => { autoUpdater.quitAndInstall(); });

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
