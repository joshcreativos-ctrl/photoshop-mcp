@echo off
chcp 65001 >nul
title Free Photoshop MCP
node "%~dp0install.mjs" --uninstall %*
echo.
pause
