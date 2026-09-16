@echo off
chcp 65001 > nul
title Smart POS - Desktop App Launcher
cd /d %~dp0

echo ========================================================
echo   🖥️  Smart POS - Desktop Application (Electron)
echo ========================================================
echo.

if not exist node_modules (
    echo [1/3] กำลังติดตั้ง Electron Dependencies (ครั้งแรกเท่านั้น)...
    call npm install
)

if not exist ..\frontend\dist (
    echo [2/3] กำลังเตรียมไฟล์ Frontend...
    cd ..\frontend
    call npm run build
    cd ..\desktop-app
)

echo [3/3] กำลังเปิดหน้าต่างโปรแกรม Desktop...
echo.
call npx electron .
