@echo off
title Focus Mode Extended — Builder
color 0D
echo.
echo  ================================================
echo   Focus Mode Extended — Windows Installer Builder
echo  ================================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo  Download it free from: https://nodejs.org
    echo  Install the LTS version, then run this script again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js found: %NODE_VER%
echo.

:: Install dependencies
echo  [1/3] Installing dependencies (first time may take 2-3 minutes)...
echo.
call npm install --legacy-peer-deps
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo  [2/3] Building Windows installer...
echo.
call npx electron-builder --win nsis --x64
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Build failed. See output above.
    pause
    exit /b 1
)

echo.
echo  ================================================
echo   BUILD COMPLETE!
echo  ================================================
echo.
echo  Your installer is in the  dist\  folder:
echo.
dir /b dist\*.exe 2>nul
echo.
echo  Upload this .exe file to Gumroad and you're live.
echo.
pause
