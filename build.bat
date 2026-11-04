@echo off
cd /d "%~dp0"
where cargo >nul 2>nul || (echo Rust est introuvable. Installe-le depuis https://rustup.rs & pause & exit /b 1)
where npm >nul 2>nul || (echo Node.js est introuvable. Installe-le depuis https://nodejs.org & pause & exit /b 1)
call npm install || (pause & exit /b 1)
call npm run build || (pause & exit /b 1)
call npm run build:setup || (pause & exit /b 1)
echo.
echo Termine !
echo  - Exe portable : src-tauri\target\release\hangar.exe
echo  - Installeur   : installer\target\release\hangar-setup.exe
echo  - NSIS (mises a jour) : src-tauri\target\release\bundle\nsis\
explorer "installer\target\release"
pause
