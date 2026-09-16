@echo off
chcp 65001 > nul
title Smart POS - Build Windows Installer (.exe)
cd /d %~dp0

echo ========================================================
echo   📦  สร้างไฟล์ตัวติดตั้ง Windows (.exe) - Smart POS
echo ========================================================
echo.

echo [1/3] กำลังอัปเดตและคอมไพล์ Frontend (React)...
cd ..\frontend
call npm run build
if %errorlevel% neq 0 (
    echo ❌ เกิดข้อผิดพลาดในการบิลด์ Frontend
    pause
    exit /b %errorlevel%
)
cd ..\desktop-app

echo.
echo [2/3] กำลังตรวจสอบ Dependencies ของ Electron...
if not exist node_modules (
    call npm install
)

echo.
echo [3/3] กำลังแพ็กเกจไฟล์ตัวติดตั้ง Windows (.exe)...
echo กรุณารอสักครู่ (อาจใช้เวลาประมาณ 1-2 นาที)...
echo.
call npx electron-builder --win

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   ✅ สร้างไฟล์ตัวติดตั้ง .exe สำเร็จเรียบร้อยแล้ว!
    echo   📁 ตำแหน่งไฟล์: desktop-app\release\
    echo ========================================================
    echo.
    explorer release
) else (
    echo.
    echo ❌ เกิดข้อผิดพลาดในการสร้างตัวติดตั้ง
)

pause
