@echo off
REM Diagnóstico en Windows: prueba OpenAI (transcripción y director), la grilla de texto y el micrófono.
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv (
  py -3 -m venv .venv || python -m venv .venv || goto :error
  .venv\Scripts\python -m pip install -q -r requirements.txt || goto :error
)
.venv\Scripts\python server.py --check
pause
exit /b 0
:error
echo [!] No pude preparar Python. Instala Python 3.10 o superior desde python.org (marcar "Add to PATH").
pause
exit /b 1
