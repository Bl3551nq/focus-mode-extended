const { app, BrowserWindow, screen, ipcMain, Tray, Menu, globalShortcut, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');

const userDataPath    = app.getPath('userData');
const windowStatePath = path.join(userDataPath, 'window-state.json');
const licensePath     = path.join(userDataPath, 'license.json');

function loadWindowState() {
  try {
    const d = JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
    if (!d || d.version !== 2) return null;
    return d;
  } catch { return null; }
}
function saveWindowState(data) {
  try { fs.writeFileSync(windowStatePath, JSON.stringify({ ...data, version: 2 })); } catch {}
}

let mainWin = null;
let tray    = null;
let isDragging   = false;
let dragOffX     = 0, dragOffY = 0;
let dragInterval = null;
let currentScale = 1;
let isHidden     = false;

const BASE_W = 360, BASE_H = 580;
function winW(s) { return Math.round(BASE_W * s); }
function winH(s) { return Math.round(BASE_H * s); }

/* ══ LICENSE ══════════════════════════════════════════ */
function validateKey(key) {
  if (!key || typeof key !== 'string') return false;
  const clean = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 16) return false;
  // Simple checksum: sum of char codes mod 17 must equal 0
  const sum = clean.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return sum % 17 === 0;
}
function loadLicense() {
  try { return JSON.parse(fs.readFileSync(licensePath, 'utf8')); } catch { return null; }
}
function saveLicense(key) {
  try { fs.writeFileSync(licensePath, JSON.stringify({ key, activated: Date.now() })); } catch {}
}

ipcMain.handle('validate-license', (e, key) => {
  if (validateKey(key)) { saveLicense(key); return { ok: true }; }
  return { ok: false };
});
ipcMain.handle('check-license', () => {
  const lic = loadLicense();
  if (lic && validateKey(lic.key)) return { ok: true, key: lic.key };
  return { ok: false };
});

/* ══ TRAY ════════════════════════════════════════════ */
function createTray() {
  const iconPath = path.join(__dirname, 'build', 'icon.ico');
  tray = new Tray(iconPath);
  tray.setToolTip('Focus Mode Extended');

  const menu = Menu.buildFromTemplate([
    { label: 'Show / Hide', click: toggleWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
}

function toggleWindow() {
  if (!mainWin) return;
  if (isHidden || !mainWin.isVisible()) {
    mainWin.show(); mainWin.focus(); isHidden = false;
  } else {
    mainWin.hide(); isHidden = true;
  }
}

/* ══ WINDOW ══════════════════════════════════════════ */
function createWindow() {
  const saved = loadWindowState();
  const wa    = screen.getPrimaryDisplay().workArea;

  let scale = (saved && saved.scale) ? saved.scale : 1;
  currentScale = scale;
  const w = winW(scale), h = winH(scale);

  let x = wa.x + Math.round((wa.width  - w) / 2);
  let y = wa.y + Math.round((wa.height - h) / 2);

  if (saved && saved.x != null) {
    const fits = screen.getAllDisplays().some(d => {
      const b = d.workArea;
      return saved.x >= b.x && saved.y >= b.y &&
             saved.x + w <= b.x + b.width &&
             saved.y + h <= b.y + b.height;
    });
    if (fits) { x = saved.x; y = saved.y; }
  }

  mainWin = new BrowserWindow({
    width: w, height: h, x, y,
    minWidth: 180, minHeight: 80,
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

  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWin.once('ready-to-show', () => { mainWin.show(); mainWin.focus(); });

  // Hide to tray instead of quitting
  mainWin.on('close', e => {
    if (!app.isQuitting) { e.preventDefault(); mainWin.hide(); isHidden = true; }
  });
  mainWin.on('closed', () => { mainWin = null; });
}

/* ══ DRAG ════════════════════════════════════════════ */
ipcMain.on('drag-start', () => {
  if (!mainWin) return;
  isDragging = true;
  const c = screen.getCursorScreenPoint();
  const [wx, wy] = mainWin.getPosition();
  dragOffX = c.x - wx; dragOffY = c.y - wy;
  if (dragInterval) clearInterval(dragInterval);
  dragInterval = setInterval(() => {
    if (!isDragging || !mainWin) return;
    const p = screen.getCursorScreenPoint();
    mainWin.setPosition(Math.round(p.x - dragOffX), Math.round(p.y - dragOffY));
  }, 8);
});
ipcMain.on('drag-end', () => {
  isDragging = false;
  if (dragInterval) { clearInterval(dragInterval); dragInterval = null; }
  if (!mainWin) return;
  const [x, y] = mainWin.getPosition();
  saveWindowState({ x, y, scale: currentScale });
});

/* ══ SCALE ═══════════════════════════════════════════ */
ipcMain.on('scale-end', (e, scale) => {
  if (!mainWin) return;
  currentScale = scale;
  const [x, y] = mainWin.getPosition();
  const [w, h] = mainWin.getSize();
  const cx = x + w / 2, cy = y + h / 2;
  const nw = winW(scale), nh = winH(scale);
  mainWin.setBounds({ x: Math.round(cx - nw/2), y: Math.round(cy - nh/2), width: nw, height: nh }, false);
  saveWindowState({ x: Math.round(cx - nw/2), y: Math.round(cy - nh/2), scale });
});

/* ══ RESIZE FOR MINIMIZED STATE ══════════════════════ */
ipcMain.on('set-height', (e, h) => {
  if (!mainWin) return;
  const [x, y] = mainWin.getPosition();
  const [w]    = mainWin.getSize();
  mainWin.setBounds({ x, y, width: w, height: Math.round(h) }, false);
});

/* ══ MISC IPC ════════════════════════════════════════ */
ipcMain.on('close-window',   () => { if (mainWin) { mainWin.hide(); isHidden = true; } });
ipcMain.on('install-update', () => { autoUpdater.quitAndInstall(); });

/* ══ AUTO-UPDATER ════════════════════════════════════ */
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
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false, name: 'Focus Mode Extended', path: process.execPath });
}

/* ══ APP LIFECYCLE ═══════════════════════════════════ */
app.whenReady().then(() => {
  createWindow();
  createTray();
  setAutoLaunch();
  setupUpdater();

  // Global hotkey: Ctrl+Shift+F toggles show/hide
  globalShortcut.register('CommandOrControl+Shift+F', toggleWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { /* keep running in tray */ });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => {
    if (mainWin) { mainWin.show(); mainWin.focus(); isHidden = false; }
  });
}
