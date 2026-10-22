@echo off
REM ─────────────────────────────────────────────────────────────
REM  Ciclo de charlas y talleres FLAT — re-proyección de una sesión grabada (Windows)
REM  Elige la sesión en la ventana «FLAT - re-proyeccion»: el audio
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
taskkill /FI "WINDOWTITLE eq FLAT - re-proyeccion*" /T /F >nul 2>&1
start "poesia-frontend" /min cmd /k "npm run preview"
start "FLAT - re-proyeccion" cmd /k ".venv\Scripts\python server.py --replay elegir"
echo Elige la sesion en la ventana "FLAT - re-proyeccion". Chrome se abre en unos segundos.
timeout /t 6 /nobreak >nul

call "%~dp0abrir_pantalla.bat"
exit /b 0

:error
echo [!] Error durante la preparacion. Revisa los mensajes anteriores.
pause
exit /b 1
