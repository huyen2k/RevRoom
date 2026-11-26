@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Cai Node.js LTS tu nodejs.org roi mo lai. & pause & exit /b 1)
node xem-web.cjs
pause
