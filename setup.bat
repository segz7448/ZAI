@echo off
REM ============================================================
REM  ZAI Desktop - First-Time Setup
REM  Double-click this file once, the first time you set up ZAI
REM  on this PC. It installs everything the app needs.
REM ============================================================

title ZAI - First-Time Setup

echo.
echo ===============================================
echo   ZAI Desktop - First-Time Setup
echo ===============================================
echo.

REM Move to the folder this script lives in, no matter where it's double-clicked from
cd /d "%~dp0"

echo Checking for Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js is not installed, or not on your PATH.
    echo.
    echo ZAI needs Node.js to run. Download and install it from:
    echo     https://nodejs.org
    echo.
    echo Choose the "LTS" version. After installing, close this
    echo window and double-click setup.bat again.
    echo.
    pause
    exit /b 1
)

echo Node.js found - good.
echo.
echo Installing ZAI's dependencies now. This can take a few
echo minutes the first time (it's downloading everything ZAI
echo needs, including the local AI engine and a real browser).
echo Please don't close this window.
echo.

call npm install

if %errorlevel% neq 0 (
    echo.
    echo ===============================================
    echo   Something went wrong during setup.
    echo ===============================================
    echo.
    echo Common fixes:
    echo   - Check your internet connection and try again
    echo   - Make sure no antivirus is blocking npm
    echo   - Try running this file as Administrator
    echo.
    pause
    exit /b 1
)

echo.
echo ===============================================
echo   Setup complete!
echo ===============================================
echo.
echo Creating a ZAI shortcut on your Desktop...

set "SCRIPT_DIR=%~dp0"
set "VBS_FILE=%TEMP%\zai_shortcut.vbs"

(
    echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
    echo strDesktop = oWS.SpecialFolders^("Desktop"^)
    echo Set oLink = oWS.CreateShortcut^(strDesktop ^& "\ZAI.lnk"^)
    echo oLink.TargetPath = "%SCRIPT_DIR%start ZAI.bat"
    echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
    echo oLink.WindowStyle = 1
    echo oLink.Description = "Launch ZAI"
    if exist "%SCRIPT_DIR%assets\icon.ico" (
        echo oLink.IconLocation = "%SCRIPT_DIR%assets\icon.ico"
    )
    echo oLink.Save
) > "%VBS_FILE%"

cscript //nologo "%VBS_FILE%" >nul 2>nul
del "%VBS_FILE%" >nul 2>nul

if exist "%USERPROFILE%\Desktop\ZAI.lnk" (
    echo Done - look for a "ZAI" icon on your Desktop.
) else (
    echo Could not add the Desktop icon automatically - you can still
    echo double-click "start ZAI.bat" in this folder, or run
    echo "Add Desktop Shortcut.bat" separately to try again.
)

echo.
echo From now on, just double-click the ZAI icon on your Desktop
echo to launch the app.
echo.
pause
