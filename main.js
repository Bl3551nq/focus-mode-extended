const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');

const userDataPath    = app.getPath('userData');
const windowStatePath = path.join(userDataPath, 'window-state.json');

function loadWindowState() {
  try {
    const data = JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
    // Reset if state is from old builds that had wrong position logic
    if (!data || data.version !== 2) return null;
    return data;
  }
  catch { return null; }
}
function saveWindowState(data) {
  try { fs.writeFileSync(windowStatePath, JSON.stringify({ ...data, version: 2 })); } catch {}
}

let mainWin      = null;
let isDragging   = false;
let dragOffX     = 0, dragOffY = 0;
let dragInterval = null;
let currentScale = 1;

const BASE_W   = 360;
const BASE_H   = 580;
const MAX_SCALE = 1.8;
const EXPAND_W = Math.ceil(BASE_W * MAX_SCALE) + 40;
const EXPAND_H = Math.ceil(BASE_H * MAX_SCALE) + 40;

// Center point saved before expand so shrink lands exactly
let scaleCX = 0, scaleCY = 0;

function winW(scale) { return Math.round(BASE_W * scale); }
function winH(scale) { return Math.round(BASE_H * scale); }

function createWindow() {
  const saved = loadWindowState();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = primaryDisplay.workAreaSize;
  const wa = primaryDisplay.workArea;

  let scale = 1;
  if (saved && saved.scale) scale = saved.scale;

  let w = winW(scale);
  let h = winH(scale);

  // Always default to center
  let x = wa.x + Math.round((sw - w) / 2);
  let y = wa.y + Math.round((sh - h) / 2);

  // Only restore saved position if it's fully visible on a connected screen
  if (saved && saved.x != null && saved.y != null) {
    const allDisplays = screen.getAllDisplays();
    const fullyVisible = allDisplays.some(d => {
      const b = d.workArea;
      return saved.x >= b.x &&
             saved.y >= b.y &&
             saved.x + w <= b.x + b.width &&
             saved.y + h <= b.y + b.height;
    });
    if (fullyVisible) {
      x = saved.x;
      y = saved.y;
    }
    // else: use centered defaults above
  }

  currentScale = scale;

  mainWin = new BrowserWindow({
    width: w, height: h, x, y,
    minWidth: 180, minHeight: 260,
    frame: false, transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false, resizable: false,
    alwaysOnTop: true, show: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    roundedCorners: true,
  });

  // Window always exactly matches content — no transparent gaps, no click-through needed
  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWin.once('ready-to-show', () => { mainWin.show(); mainWin.focus(); });
  mainWin.on('closed', () => { mainWin = null; });
}

/* ── DRAG: 60fps polling, unclamped so it reaches every corner ── */
ipcMain.on('drag-start', () => {
  if (!mainWin) return;
  isDragging = true;
  const c = screen.getCursorScreenPoint();
  const [wx, wy] = mainWin.getPosition();
  dragOffX = c.x - wx;
  dragOffY = c.y - wy;
  if (dragInterval) clearInterval(dragInterval);
  dragInterval = setInterval(() => {
    if (!isDragging || !mainWin) return;
    const p = screen.getCursorScreenPoint();
    mainWin.setPosition(Math.round(p.x - dragOffX), Math.round(p.y - dragOffY));
  }, 8); // 120fps polling for smooth drag
});

ipcMain.on('drag-end', () => {
  isDragging = false;
  if (dragInterval) { clearInterval(dragInterval); dragInterval = null; }
  if (!mainWin) return;
  const [x, y] = mainWin.getPosition();
  const [w, h] = mainWin.getSize();
  saveWindowState({ x, y, w, h, scale: currentScale });
});

/* ── SCALE: expand before drag, shrink after — anchored to center ── */
ipcMain.on('scale-start', () => {
  if (!mainWin) return;
  const [x, y] = mainWin.getPosition();
  const [w, h] = mainWin.getSize();
  scaleCX = x + w / 2;
  scaleCY = y + h / 2;
  mainWin.setBounds({
    x: Math.round(scaleCX - EXPAND_W / 2),
    y: Math.round(scaleCY - EXPAND_H / 2),
    width: EXPAND_W, height: EXPAND_H,
  }, false);
});

ipcMain.on('scale-end', (e, scale) => {
  if (!mainWin) return;
  currentScale = scale;
  const nw = winW(scale), nh = winH(scale);
  mainWin.setBounds({
    x: Math.round(scaleCX - nw / 2),
    y: Math.round(scaleCY - nh / 2),
    width: nw, height: nh,
  }, false);
  saveWindowState({
    x: Math.round(scaleCX - nw / 2),
    y: Math.round(scaleCY - nh / 2),
    w: nw, h: nh, scale,
  });
});

/* ── MISC ── */
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
