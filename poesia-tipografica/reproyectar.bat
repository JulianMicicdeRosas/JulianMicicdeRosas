@echo off
REM ─────────────────────────────────────────────────────────────
REM  Umbral — re-proyección de una sesión grabada (Windows)
REM  Elige la sesión en la ventana «Umbral - re-proyeccion»: el audio
REM  sale por la salida de sonido de Windows y el show se repite igual.
REM ─────────────────────────────────────────────────────────────
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo [!] Primero abre start_instalacion.bat una vez: prepara el programa.
  pause
  exit /b 1
)
call npm run build || goto :error

REM el show y la re-proyección usan los mismos puertos: se cierra lo que haya quedado abierto
taskkill /FI "WINDOWTITLE eq poesia-backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq poesia-frontend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Umbral - re-proyeccion*" /T /F >nul 2>&1
start "poesia-frontend" /min cmd /k "npm run preview"
start "Umbral - re-proyeccion" cmd /k ".venv\Scripts\python server.py --replay elegir"
echo Elige la sesion en la ventana "Umbral - re-proyeccion". Chrome se abre en unos segundos.
timeout /t 6 /nobreak >nul

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe

start "" "%CHROME%" --kiosk --start-fullscreen --no-first-run --disable-infobars ^
  --force_high_performance_gpu --ignore-gpu-blocklist --enable-gpu-rasterization ^
  --disable-session-crashed-bubble --overscroll-history-navigation=0 --disable-pinch ^
  --autoplay-policy=no-user-gesture-required --disable-features=Translate ^
  --user-data-dir="%~dp0.chrome-kiosk" "http://127.0.0.1:5173/"
exit /b 0

:error
echo [!] Error durante la preparacion. Revisa los mensajes anteriores.
pause
exit /b 1
