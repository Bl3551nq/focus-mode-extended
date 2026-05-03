const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs   = require('fs');

/* ─── Paths ──────────────────────────────────────────── */
const userDataPath    = app.getPath('userData');
const windowStatePath = path.join(userDataPath, 'window-state.json');

/* ─── Window state persistence ───────────────────────── */
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

/* ─── Main window ─────────────────────────────────────── */
let mainWin = null;

function createWindow() {
  const saved  = loadWindowState();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const defaultW = 420;
  const defaultH = 620;

  // Use saved position if it's still on a connected screen, else center
  let winX = Math.round((sw - defaultW) / 2);
  let winY = Math.round((sh - defaultH) / 2);
  let winW = defaultW;
  let winH = defaultH;

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
    width:  winW,
    height: winH,
    x: winX,
    y: winY,
    minWidth:  280,
    minHeight: 380,
    frame:       false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable:   true,
    hasShadow:   false,
    show:        false,          // show after ready-to-show to avoid flash
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration:   false,
      contextIsolation:  true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // Windows-specific: nice rounded corners on Win11
    roundedCorners: true,
  });

  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Show only once fully loaded — no white flash
  mainWin.once('ready-to-show', () => {
    mainWin.show();
    mainWin.focus();
  });

  // Save position on every move/resize
  ['move', 'resize'].forEach(evt =>
    mainWin.on(evt, () => saveWindowState(mainWin))
  );

  mainWin.on('closed', () => { mainWin = null; });
}

/* ─── Auto-launch on Windows startup ─────────────────── */
function setAutoLaunch() {
  app.setLoginItemSettings({
    openAtLogin:  true,
    openAsHidden: false,
    name: 'Focus Mode Extended',
    path: process.execPath,
  });
}

/* ─── App lifecycle ───────────────────────────────────── */
app.whenReady().then(() => {
  createWindow();
  setAutoLaunch();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });
}
