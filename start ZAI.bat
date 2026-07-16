@echo off
REM ============================================================
REM  ZAI Desktop - Start
REM  Double-click this file any time to launch ZAI.
REM ============================================================

title ZAI

cd /d "%~dp0"

if not exist "node_modules" (
    echo.
    echo It looks like ZAI hasn't been set up on this PC yet.
    echo.
    echo Please double-click "setup.bat" first ^(just once^),
    echo then come back and use this file from then on.
    echo.
    pause
    exit /b 1
)

echo.
echo Starting ZAI...
echo ^(A window will open shortly. The first launch after any
echo restart of your PC may take a little longer.^)
echo.

call npm run dev

REM If ZAI closes or crashes, keep this window open so you can
REM read any error message instead of it vanishing instantly.
echo.
echo ZAI has closed.
pause
