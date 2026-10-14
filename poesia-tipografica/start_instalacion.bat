@echo off
REM ─────────────────────────────────────────────────────────────
REM  Poesía Tipográfica — arranque de la instalación en Windows
REM  1) backend Python  2) frontend compilado  3) Chrome en kiosk
REM ─────────────────────────────────────────────────────────────
chcp 65001 >nul
cd /d "%~dp0"

if not exist .env copy .env.example .env >nul
REM La clave de OpenAI se pega en el panel C del show (tecla C).
if not exist .venv (
  py -3 -m venv .venv || python -m venv .venv || goto :error
  .venv\Scripts\python -m pip install --upgrade pip
)
REM cada arranque: dependencias al día y frontend recompilado (tras actualizar el programa, nada queda viejo)
.venv\Scripts\pip install -q -r requirements.txt || goto :error
if not exist node_modules (
  call npm install || goto :error
)
call npm install --no-audit --no-fund >nul 2>&1
call npm run build || goto :error

start "poesia-backend" /min cmd /k ".venv\Scripts\python server.py"
start "poesia-frontend" /min cmd /k "npm run preview"
timeout /t 4 /nobreak >nul

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe

start "" "%CHROME%" --kiosk --start-fullscreen --no-first-run --disable-infobars ^
  --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch ^
  --autoplay-policy=no-user-gesture-required --disable-features=Translate ^
  --user-data-dir="%~dp0.chrome-kiosk" "http://127.0.0.1:5173/"
exit /b 0

:error
echo [!] Error durante la preparacion. Revisa los mensajes anteriores.
pause
exit /b 1
