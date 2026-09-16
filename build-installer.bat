@echo off
chcp 65001 > nul
title Smart POS - Build Windows Installer (.exe)
cd /d "%~dp0desktop-app"
call build-installer.bat
