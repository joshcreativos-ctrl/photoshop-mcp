@echo off
chcp 65001 >nul
title Free Photoshop MCP
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas Node.js / You need Node.js: https://nodejs.org
  set /p RESP="Instalarlo con winget ahora? / Install it with winget now? (S/Y/N): "
  if /i "%RESP%"=="S" winget install OpenJS.NodeJS.LTS
  if /i "%RESP%"=="Y" winget install OpenJS.NodeJS.LTS
  echo.
  echo Cierra esta ventana y vuelve a abrir Instalar.cmd. / Close this window and open Instalar.cmd again.
  echo.
  pause
  exit /b 1
)
node "%~dp0install.mjs" %*
echo.
pause
