@echo off
REM ============================================================
REM  ZAI Desktop - Add Desktop Shortcut
REM  Double-click this file to add a "ZAI" icon to your Desktop
REM  that launches the app directly.
REM ============================================================

title ZAI - Add Desktop Shortcut

cd /d "%~dp0"

echo.
echo Creating a ZAI shortcut on your Desktop...

set "SCRIPT_DIR=%~dp0"
set "VBS_FILE=%TEMP%\zai_shortcut.vbs"

REM Batch files can't create .lnk shortcuts directly, so this writes a
REM tiny, temporary VBScript that does it (via Windows' own WScript.Shell),
REM then deletes the script right after - a standard, safe technique.
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

cscript //nologo "%VBS_FILE%"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Could not create the shortcut. You can still launch ZAI
    echo by double-clicking "start ZAI.bat" directly in this folder.
    echo.
    del "%VBS_FILE%" >nul 2>nul
    pause
    exit /b 1
)

del "%VBS_FILE%" >nul 2>nul

echo.
echo Done! Look for a "ZAI" icon on your Desktop.
echo.
pause
