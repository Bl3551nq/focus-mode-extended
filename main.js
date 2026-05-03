const { app, BrowserWindow, screen, ipcMain } = require('electron');
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
  const defaultW = 420, defaultH = 620;
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
    minWidth: 280, minHeight: 380,
    frame: false, transparent: true,
    backgroundColor: '#00000000',
    resizable: true, hasShadow: false,
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

/* ── IPC: drag the window itself ── */
let dragOffsetX = 0, dragOffsetY = 0;

ipcMain.on('drag-start', (e, { mouseX, mouseY }) => {
  if (!mainWin) return;
  const [wx, wy] = mainWin.getPosition();
  dragOffsetX = mouseX - wx;
  dragOffsetY = mouseY - wy;
});

ipcMain.on('drag-move', (e, { mouseX, mouseY }) => {
  if (!mainWin) return;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const [ww, wh] = mainWin.getSize();
  const newX = Math.max(0, Math.min(sw - ww, mouseX - dragOffsetX));
  const newY = Math.max(0, Math.min(sh - wh, mouseY - dragOffsetY));
  mainWin.setPosition(Math.round(newX), Math.round(newY));
});

ipcMain.on('drag-end', () => { if (mainWin) saveWindowState(mainWin); });
ipcMain.on('close-window', () => { if (mainWin) mainWin.close(); });

function setAutoLaunch() {
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false, name: 'Focus Mode Extended', path: process.execPath });
}

app.whenReady().then(() => {
  createWindow(); setAutoLaunch();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else { app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } }); }
