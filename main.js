const { app, BrowserWindow, screen, ipcMain, Tray, Menu, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');

const userDataPath    = app.getPath('userData');
const windowStatePath = path.join(userDataPath, 'window-state.json');
const licensePath     = path.join(userDataPath, 'license.json');

function loadWindowState() {
  try { const d = JSON.parse(fs.readFileSync(windowStatePath,'utf8')); return d.version===2?d:null; } catch{return null;}
}
function saveWindowState(data) {
  try { fs.writeFileSync(windowStatePath, JSON.stringify({...data, version:2})); } catch{}
}

let mainWin=null, tray=null;
let isDragging=false, dragOffX=0, dragOffY=0, dragInterval=null;
let currentScale=1, isHidden=false;
let scaleCX=0, scaleCY=0;

const BASE_W=360, BASE_H=580, MAX_S=1.8;
const EXP_W=Math.ceil(BASE_W*MAX_S)+60, EXP_H=Math.ceil(BASE_H*MAX_S)+60;

function wW(s){return Math.round(BASE_W*s);}
function wH(s){return Math.round(BASE_H*s);}

/* ── LICENSE ── */
function validKey(k){
  if(!k||typeof k!=='string')return false;
  const c=k.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(c.length!==16)return false;
  return c.split('').reduce((a,ch)=>a+ch.charCodeAt(0),0)%17===0;
}
ipcMain.handle('validate-license',(e,k)=>{
  if(validKey(k)){try{fs.writeFileSync(licensePath,JSON.stringify({key:k,activated:Date.now()}));}catch{}return{ok:true};}
  return{ok:false};
});
ipcMain.handle('check-license',()=>{
  try{const d=JSON.parse(fs.readFileSync(licensePath,'utf8'));if(validKey(d.key))return{ok:true};}catch{}return{ok:false};
});

/* ── CURSOR HIT-TEST POLLING ── */
// cardBounds in screen coordinates — updated by renderer
let cardBounds={x:0,y:0,w:BASE_W,h:BASE_H};
const PAD=20;
let wasOver=false;

function startHitPoll(){
  setInterval(()=>{
    if(!mainWin||isDragging)return;
    const c=screen.getCursorScreenPoint();
    const b=cardBounds;
    const over=c.x>=b.x-PAD&&c.x<=b.x+b.w+PAD&&c.y>=b.y-PAD&&c.y<=b.y+b.h+PAD;
    if(over!==wasOver){
      wasOver=over;
      mainWin.setIgnoreMouseEvents(!over,{forward:true});
    }
  },16);
}

ipcMain.on('card-bounds',(e,b)=>{
  if(!mainWin)return;
  const[wx,wy]=mainWin.getPosition();
  cardBounds={x:wx+b.x,y:wy+b.y,w:b.w,h:b.h};
});

/* ── WINDOW ── */
function createWindow(){
  const saved=loadWindowState();
  const wa=screen.getPrimaryDisplay().workArea;
  let scale=(saved&&saved.scale)||1;
  currentScale=scale;
  const w=wW(scale),h=wH(scale);
  let x=wa.x+Math.round((wa.width-w)/2);
  let y=wa.y+Math.round((wa.height-h)/2);
  if(saved&&saved.x!=null){
    const fits=screen.getAllDisplays().some(d=>{
      const b=d.workArea;
      return saved.x>=b.x&&saved.y>=b.y&&saved.x+w<=b.x+b.width&&saved.y+h<=b.y+b.height;
    });
    if(fits){x=saved.x;y=saved.y;}
  }

  mainWin=new BrowserWindow({
    width:w,height:h,x,y,
    minWidth:180,minHeight:80,
    frame:false,transparent:true,
    backgroundColor:'#00000000',
    hasShadow:false,resizable:false,
    alwaysOnTop:true,show:false,
    icon:path.join(__dirname,'build','icon.ico'),
    webPreferences:{nodeIntegration:false,contextIsolation:true,preload:path.join(__dirname,'preload.js')},
    roundedCorners:true,
  });

  // Start ignoring mouse events — poll will enable over card
  mainWin.setIgnoreMouseEvents(true,{forward:true});

  mainWin.loadFile(path.join(__dirname,'src','index.html'));
  mainWin.once('ready-to-show',()=>{
    mainWin.show();
    mainWin.focus();
    startHitPoll();
    // Force clear stale renderer localStorage on every launch
    mainWin.webContents.once('did-finish-load', () => {
      mainWin.webContents.executeJavaScript(`
        (function(){
          const ver = localStorage.getItem('fm_state_ver');
          if(ver !== '3'){
            const keys = Object.keys(localStorage).filter(k => k.startsWith('fm_'));
            keys.forEach(k => localStorage.removeItem(k));
            localStorage.setItem('fm_state_ver','3');
            location.reload();
          }
        })();
      `);
    });
  });
  mainWin.on('close',e=>{if(!app.isQuitting){e.preventDefault();mainWin.hide();isHidden=true;}});
  mainWin.on('closed',()=>{mainWin=null;});
  ['move'].forEach(ev=>mainWin.on(ev,()=>{
    // keep cardBounds in sync when window moves
    if(mainWin){const[wx,wy]=mainWin.getPosition();cardBounds.x=wx+(cardBounds.x-wx);cardBounds.y=wy+(cardBounds.y-wy);}
  }));
}

/* ── TRAY ── */
function createTray(){
  tray=new Tray(path.join(__dirname,'build','icon.ico'));
  tray.setToolTip('Focus Mode Extended');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Show / Hide',click:toggleWindow},
    {type:'separator'},
    {label:'Quit',click:()=>{app.isQuitting=true;app.quit();}},
  ]));
  tray.on('click',toggleWindow);
}
function toggleWindow(){
  if(!mainWin)return;
  if(isHidden||!mainWin.isVisible()){mainWin.show();mainWin.focus();isHidden=false;}
  else{mainWin.hide();isHidden=true;}
}

/* ── DRAG ── */
ipcMain.on('drag-start',()=>{
  if(!mainWin)return;
  isDragging=true;
  mainWin.setIgnoreMouseEvents(false);
  const c=screen.getCursorScreenPoint();
  const[wx,wy]=mainWin.getPosition();
  dragOffX=c.x-wx;dragOffY=c.y-wy;
  if(dragInterval)clearInterval(dragInterval);
  dragInterval=setInterval(()=>{
    if(!isDragging||!mainWin)return;
    const p=screen.getCursorScreenPoint();
    const nx=Math.round(p.x-dragOffX),ny=Math.round(p.y-dragOffY);
    mainWin.setPosition(nx,ny);
    // keep cardBounds in sync
    const[wx2,wy2]=mainWin.getPosition();
    cardBounds.x=wx2+(cardBounds.x-nx+(nx-wx2));
    cardBounds.y=wy2+(cardBounds.y-ny+(ny-wy2));
  },8);
});
ipcMain.on('drag-end',()=>{
  isDragging=false;wasOver=false;
  if(dragInterval){clearInterval(dragInterval);dragInterval=null;}
  if(!mainWin)return;
  const[x,y]=mainWin.getPosition();
  saveWindowState({x,y,scale:currentScale});
});

/* ── SCALE: expand on start so content never clips ── */
ipcMain.on('scale-start',()=>{
  if(!mainWin)return;
  const[x,y]=mainWin.getPosition();
  const[w,h]=mainWin.getSize();
  scaleCX=x+w/2;scaleCY=y+h/2;
  mainWin.setBounds({x:Math.round(scaleCX-EXP_W/2),y:Math.round(scaleCY-EXP_H/2),width:EXP_W,height:EXP_H},false);
});
ipcMain.on('scale-end',(e,scale)=>{
  if(!mainWin)return;
  currentScale=scale;
  const nw=wW(scale),nh=wH(scale);
  mainWin.setBounds({x:Math.round(scaleCX-nw/2),y:Math.round(scaleCY-nh/2),width:nw,height:nh},false);
  saveWindowState({x:Math.round(scaleCX-nw/2),y:Math.round(scaleCY-nh/2),scale});
  wasOver=false;
});

/* ── MINIMIZE HEIGHT ── */
ipcMain.on('set-height',(e,h)=>{
  if(!mainWin)return;
  const[x,y]=mainWin.getPosition();
  const[w]=mainWin.getSize();
  mainWin.setBounds({x,y,width:w,height:Math.round(h)},false);
  wasOver=false;
});

/* ── MISC ── */
ipcMain.on('close-window',()=>{if(mainWin){mainWin.hide();isHidden=true;}});
ipcMain.on('install-update',()=>{autoUpdater.quitAndInstall();});

/* ── UPDATER ── */
function setupUpdater(){
  autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=true;
  autoUpdater.on('update-available',info=>{if(mainWin)mainWin.webContents.send('update-available',info.version);});
  autoUpdater.on('update-downloaded',()=>{if(mainWin)mainWin.webContents.send('update-downloaded');});
  autoUpdater.on('error',()=>{});
  setTimeout(()=>autoUpdater.checkForUpdates(),5000);
  setInterval(()=>autoUpdater.checkForUpdates(),2*60*60*1000);
}

function setAutoLaunch(){
  app.setLoginItemSettings({openAtLogin:true,openAsHidden:false,name:'Focus Mode Extended',path:process.execPath});
}

app.whenReady().then(()=>{
  createWindow();createTray();setAutoLaunch();setupUpdater();
  globalShortcut.register('CommandOrControl+Shift+F',toggleWindow);
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on('will-quit',()=>globalShortcut.unregisterAll());
app.on('window-all-closed',()=>{});

const gotLock=app.requestSingleInstanceLock();
if(!gotLock){app.quit();}
else{app.on('second-instance',()=>{if(mainWin){mainWin.show();mainWin.focus();isHidden=false;}});}
