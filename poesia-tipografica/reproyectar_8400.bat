@echo off
REM ─────────────────────────────────────────────────────────────
REM  UMBRAL — re-proyección en tres paredes (8400 x 690)
REM ─────────────────────────────────────────────────────────────
set FLAT_FORMATO=8400x690/3175,1775,3450
set FLAT_VENTANA=0,0,8400,690
call "%~dp0reproyectar.bat"
