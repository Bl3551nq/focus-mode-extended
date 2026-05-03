# Focus Mode Extended — Build Guide

## What you need (one-time setup)
- A Windows 10 or 11 PC
- Node.js LTS → https://nodejs.org (free, takes 2 minutes)

## How to build the installer

1. Extract this folder anywhere on your Windows PC
2. Double-click **BUILD.bat**
3. Wait 2–3 minutes the first time (downloads Electron)
4. Find your installer in the `dist\` folder:
   `FocusMode-Extended-Setup-1.0.0.exe`
5. Upload that `.exe` to Gumroad ✓

---

## What the installer does for buyers

When a buyer runs `FocusMode-Extended-Setup-1.0.0.exe`:

✅ Standard install wizard (Next → Choose folder → Install → Finish)
✅ Installs to `C:\Program Files\Focus Mode Extended\`
✅ Creates **Desktop shortcut**
✅ Creates **Start Menu** entry under "Focus Mode"
✅ Adds to **Windows Startup** — auto-launches on every boot
✅ Appears in **Add/Remove Programs** for clean uninstall

## What buyers' data is saved

All user data saves automatically to:
`C:\Users\[name]\AppData\Roaming\focus-mode-extended\`

This includes:
- Checklist edits (all 5 modes)
- Icon assignments
- Theme (dark/light)
- Window position and size
- Scale level

Data survives restarts, Windows updates, and even app updates.

---

## Updating the app (future versions)

1. Edit `src/index.html` with your changes
2. Bump version in `package.json` → `"version": "1.0.1"`
3. Run `BUILD.bat` again
4. Upload the new `.exe` to Gumroad → replace the file

---

## Suggested Gumroad listing copy

**Title:** Focus Mode Extended — Trading Checklist Widget for Windows

**Price:** $9–$15

**Description:**
> A distraction-free trading checklist widget that lives on your desktop.
> Built for traders who need structure without the noise.
>
> **Features**
> — 5 customizable modes (each with its own checklist)
> — Editable checklist items per mode
> — 25-icon glossary — change any icon to match your workflow
> — Dark/light theme
> — Scales to any size from the left handle
> — Drag to anywhere on your screen
> — Remembers everything between sessions
> — Auto-launches with Windows
>
> **Install is simple:** Run the .exe, follow two clicks, done.
> No subscription. One purchase, lifetime access.
