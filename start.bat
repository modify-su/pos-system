@echo off
chcp 65001 > nul
title ระบบ POS & คลังสินค้า (Smart POS)
echo ========================================================
echo   ระบบ POS จำหน่ายสินค้าหน้าร้าน และจัดการคลังสินค้า
echo ========================================================
echo.

if not exist "%~dp0frontend\dist\index.html" (
    echo [1/2] กำลังเตรียมไฟล์หน้าเว็บ Frontend (ครั้งแรก)...
    cd /d "%~dp0frontend"
    call npm run build
    cd /d "%~dp0"
)

echo [1/1] กำลังเริ่มเซิร์ฟเวอร์ระบบ POS (Port 3001)...
start "Smart POS Server" cmd /k "cd /d %~dp0backend && node src/index.js"

echo.
echo ========================================================
echo   ✅ ระบบเริ่มทำงานเรียบร้อยแล้ว!
echo   - ใช้งานผ่านเบราว์เซอร์: http://localhost:3001
echo   - ผู้ใช้ทดสอบ:
echo       * admin       / admin1234   (ผู้ดูแลระบบ)
echo       * cashier     / cashier1234 (แคชเชียร์)
echo       * storekeeper / store1234   (พนักงานคลัง)
echo ========================================================
echo.
timeout /t 3 /nobreak > nul
start http://localhost:3001
