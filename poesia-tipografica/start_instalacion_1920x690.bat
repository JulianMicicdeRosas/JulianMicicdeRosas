@echo off
REM ─────────────────────────────────────────────────────────────
REM  Show en 1920 x 690 (una sola pantalla o proyector).
REM  Al abrir pregunta: P = pantalla completa (si la pantalla es más alta, el cuadro de
REM  1920 x 690 queda centrado con franjas negras) · V = ventana de 1920 x 690 desde 0,0.
REM ─────────────────────────────────────────────────────────────
set FLAT_FORMATO=1920x690
set FLAT_VENTANA=0,0,1920,690
call "%~dp0start_instalacion.bat"
