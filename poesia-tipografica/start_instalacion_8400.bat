@echo off
REM ─────────────────────────────────────────────────────────────
REM  Encuentro con Martel - Futuridades — tres paredes, 8400 x 690
REM  Oeste 3175 (izquierda) · norte 1775 (frente) · este 3450 (derecha).
REM  Al abrir pregunta: P = pantalla completa (Windows tiene que ver una pantalla de
REM  8400 x 690) · V = ventana de 8400 x 690 desde la esquina 0,0.
REM ─────────────────────────────────────────────────────────────
set FLAT_FORMATO=8400x690/3175,1775,3450
set FLAT_VENTANA=0,0,8400,690
call "%~dp0start_instalacion.bat"
