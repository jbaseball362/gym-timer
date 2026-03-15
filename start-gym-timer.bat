@echo off
REM Gym Timer — Windows launch script
REM Starts the Node.js server and opens the display in a browser

cd /d "%~dp0"

set PORT=3000
if defined PORT set PORT=%PORT%
set URL=http://localhost:%PORT%

REM Check for Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed.
    echo Download it at https://nodejs.org/
    pause
    exit /b 1
)

REM Check for node_modules
if not exist "node_modules" (
    echo Error: Dependencies not installed. Run 'npm install' first.
    pause
    exit /b 1
)

REM Check if port is already in use
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo Error: Port %PORT% is already in use.
    echo Either stop the other process or set a different PORT variable.
    pause
    exit /b 1
)

REM Start the server in a new window
echo Starting Gym Timer server...
start "Gym Timer Server" /min cmd /c "npm start"

REM Wait for the server to be ready
:wait_loop
timeout /t 1 /nobreak >nul
curl -s %URL% >nul 2>&1
if %errorlevel% neq 0 goto wait_loop

REM Find and launch a browser
set BROWSER=

REM Check Chrome
where chrome >nul 2>&1
if %errorlevel% equ 0 (
    set BROWSER=chrome
    set BROWSER_TYPE=chrome
    goto found
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    set BROWSER_TYPE=chrome
    goto found
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    set BROWSER_TYPE=chrome
    goto found
)

REM Check Edge
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    set BROWSER_TYPE=chrome
    goto found
)

REM Check Firefox
where firefox >nul 2>&1
if %errorlevel% equ 0 (
    set BROWSER=firefox
    set BROWSER_TYPE=firefox
    goto found
)
if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" (
    set "BROWSER=%ProgramFiles%\Mozilla Firefox\firefox.exe"
    set BROWSER_TYPE=firefox
    goto found
)

REM No browser found, open with default
echo No specific browser found. Opening with default browser...
start %URL%
goto done

:found
echo Opening display in %BROWSER%...
if "%BROWSER_TYPE%"=="chrome" (
    start "" "%BROWSER%" --app=%URL% --start-maximized --autoplay-policy=no-user-gesture-required
) else (
    start "" "%BROWSER%" -new-window %URL%
)

:done
echo.
echo Gym Timer is running! Close this window to stop the server.
echo Display: %URL%
echo Controller: %URL%/control
pause
