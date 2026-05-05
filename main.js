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
// Window stays at this size always — transparent overflow passes clicks through
const WIN_W = Math.ceil(BASE_W * MAX_SCALE) + 60;
const WIN_H = Math.ceil(BASE_H * MAX_SCALE) + 60;

let currentScale = 1;
let isDragging   = false;
let dragOffX = 0, dragOffY = 0;

function createWindow() {
  const saved = loadWindowState();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  // Window is always WIN_W x WIN_H — position tracks the card center
  let centerX = sw / 2;
  let centerY = sh / 2;

  if (saved && saved.cx != null) {
    centerX = saved.cx;
    centerY = saved.cy;
    currentScale = saved.scale || 1;
  }

  const winX = Math.round(centerX - WIN_W / 2);
  const winY = Math.round(centerY - WIN_H / 2);

  mainWin = new BrowserWindow({
    width:  WIN_W,
    height: WIN_H,
    x: winX, y: winY,
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

  // Transparent areas pass mouse events through to apps beneath
  mainWin.setIgnoreMouseEvents(true, { forward: true });

  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWin.once('ready-to-show', () => { mainWin.show(); mainWin.focus(); });
  mainWin.on('closed', () => { mainWin = null; });
}

/* ══════════════════════════════════════════════════
   MOUSE HIT DETECTION
   Renderer tells us when cursor enters/leaves card
   so we toggle mouse capture on/off instantly
══════════════════════════════════════════════════ */
ipcMain.on('mouse-enter', () => {
  if (mainWin) mainWin.setIgnoreMouseEvents(false);
});
ipcMain.on('mouse-leave', () => {
  if (!isDragging && mainWin)
    mainWin.setIgnoreMouseEvents(true, { forward: true });
});

/* ══════════════════════════════════════════════════
   DRAG — renderer sends screenX/Y directly on mousemove
   No polling, no jitter, no wobble
══════════════════════════════════════════════════ */
ipcMain.on('drag-start', (e, { sx, sy }) => {
  if (!mainWin) return;
  isDragging = true;
  const [wx, wy] = mainWin.getPosition();
  dragOffX = sx - wx;
  dragOffY = sy - wy;
});

ipcMain.on('drag-move', (e, { sx, sy }) => {
  if (!isDragging || !mainWin) return;
  mainWin.setPosition(
    Math.round(sx - dragOffX),
    Math.round(sy - dragOffY)
  );
});

ipcMain.on('drag-end', () => {
  isDragging = false;
  if (!mainWin) return;
  mainWin.setIgnoreMouseEvents(true, { forward: true });
  const [x, y] = mainWin.getPosition();
  const cx = x + WIN_W / 2;
  const cy = y + WIN_H / 2;
  saveWindowState({ cx, cy, scale: currentScale });
});

/* ══════════════════════════════════════════════════
   SCALE — window never changes size (always WIN_W x WIN_H)
   so content is never clipped. Just save new scale.
══════════════════════════════════════════════════ */
ipcMain.on('scale-end', (e, scale) => {
  currentScale = scale;
  if (!mainWin) return;
  const [x, y] = mainWin.getPosition();
  saveWindowState({ cx: x + WIN_W / 2, cy: y + WIN_H / 2, scale });
});

/* ══════════════════════════════════════════════════
   MISC
══════════════════════════════════════════════════ */
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
