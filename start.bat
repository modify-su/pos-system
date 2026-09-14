@echo off
chcp 65001 > nul
title ระบบ POS & คลังสินค้า
echo ========================================================
echo   ระบบ POS จำหน่ายสินค้าหน้าร้าน และจัดการคลังสินค้า
echo ========================================================

echo.
echo [1/2] กำลังเริ่ม Backend Server (Port 3001)...
start "POS Backend" cmd /k "cd /d %~dp0backend && node src/index.js"

echo [2/2] รอ 2 วินาที และเริ่ม Frontend Server (Port 5173)...
timeout /t 2 /nobreak > nul
start "POS Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================================
echo   ระบบเริ่มทำงานแล้ว!
echo   - Frontend: http://localhost:5173
echo   - Backend:  http://localhost:3001
echo   - ผู้ใช้ทดสอบ:
echo       * admin       / admin1234   (ผู้ดูแลระบบ)
echo       * cashier     / cashier1234 (แคชเชียร์)
echo       * storekeeper / store1234   (พนักงานคลัง)
echo ========================================================
echo.
timeout /t 3 /nobreak > nul
start http://localhost:5173
