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

let mainWin      = null;
let isDragging   = false;
let dragOffX     = 0, dragOffY = 0;
let currentScale = 1;

const BASE_W = 360, BASE_H = 580;
const MAX_SCALE = 1.8;
const WIN_W  = Math.ceil(BASE_W * MAX_SCALE) + 80;
const WIN_H  = Math.ceil(BASE_H * MAX_SCALE) + 80;

// Card bounds in SCREEN coordinates — updated by renderer whenever card moves/resizes
let cardBounds = { x: 0, y: 0, w: BASE_W, h: BASE_H };
const PAD = 24; // generous hit padding so minimized pill is always catchable

/* ══════════════════════════════════════════════════
   CURSOR POLLING — runs in main, no renderer events needed
   Polls getCursorScreenPoint() every 16ms and compares
   to card screen bounds — reliable on Windows
══════════════════════════════════════════════════ */
let wasOver = false;

function startHitPoll() {
  setInterval(() => {
    if (!mainWin || isDragging) return;
    const c = screen.getCursorScreenPoint();
    const b = cardBounds;
    const over =
      c.x >= b.x - PAD && c.x <= b.x + b.w + PAD &&
      c.y >= b.y - PAD && c.y <= b.y + b.h + PAD;

    if (over !== wasOver) {
      wasOver = over;
      mainWin.setIgnoreMouseEvents(!over, { forward: true });
    }
  }, 16);
}

/* ══════════════════════════════════════════════════
   CARD BOUNDS — renderer sends these whenever the
   card layout changes (load, minimize, scale)
══════════════════════════════════════════════════ */
ipcMain.on('card-bounds', (e, bounds) => {
  // bounds is in client (window-relative) coords — convert to screen
  if (!mainWin) return;
  const [wx, wy] = mainWin.getPosition();
  cardBounds = {
    x: wx + bounds.x,
    y: wy + bounds.y,
    w: bounds.w,
    h: bounds.h,
  };
});

/* ══════════════════════════════════════════════════
   DRAG — direct screenX/Y, no polling needed
══════════════════════════════════════════════════ */
ipcMain.on('drag-start', (e, { sx, sy }) => {
  if (!mainWin) return;
  isDragging = true;
  mainWin.setIgnoreMouseEvents(false); // lock on during drag
  const [wx, wy] = mainWin.getPosition();
  dragOffX = sx - wx;
  dragOffY = sy - wy;
});

ipcMain.on('drag-move', (e, { sx, sy }) => {
  if (!isDragging || !mainWin) return;
  const nx = Math.round(sx - dragOffX);
  const ny = Math.round(sy - dragOffY);
  mainWin.setPosition(nx, ny);
  // Update cardBounds x/y so hit-poll stays in sync during move
  const [wx, wy] = mainWin.getPosition();
  cardBounds.x = wx + (cardBounds.x - (nx - (nx - wx)));
  cardBounds.y = wy + (cardBounds.y - (ny - (ny - wy)));
});

ipcMain.on('drag-end', () => {
  isDragging = false;
  wasOver    = false; // force re-evaluate on next poll
  if (!mainWin) return;
  const [x, y] = mainWin.getPosition();
  saveWindowState({ cx: x + WIN_W / 2, cy: y + WIN_H / 2, scale: currentScale });
});

/* ══════════════════════════════════════════════════
   SCALE
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

/* ══════════════════════════════════════════════════
   WINDOW
══════════════════════════════════════════════════ */
function createWindow() {
  const saved = loadWindowState();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  let centerX = sw / 2, centerY = sh / 2;
  if (saved && saved.cx != null) {
    centerX = saved.cx; centerY = saved.cy;
    currentScale = saved.scale || 1;
  }

  const winX = Math.round(centerX - WIN_W / 2);
  const winY = Math.round(centerY - WIN_H / 2);

  mainWin = new BrowserWindow({
    width: WIN_W, height: WIN_H, x: winX, y: winY,
    minWidth: 100, minHeight: 100,
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

  // Start with pass-through — poll will enable when cursor hits card
  mainWin.setIgnoreMouseEvents(true, { forward: true });
  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWin.once('ready-to-show', () => {
    mainWin.show();
    mainWin.focus();
    startHitPoll();
  });
  mainWin.on('closed', () => { mainWin = null; });
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
