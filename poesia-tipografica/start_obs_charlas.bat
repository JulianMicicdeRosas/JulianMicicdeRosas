@echo off
REM ─────────────────────────────────────────────────────────────
REM  Charlas y Talleres FLAT · OBS + Resolume · 8400 x 690 (oeste 3175 · norte 1775 · este 3450)
REM  Arranca el show (backend + frontend) sin abrir Chrome: OBS lo abre como fuente de navegador
REM  (8400 x 690, 60 FPS) y lo manda a Resolume por Spout. Paso a paso: docs\OBS-RESOLUME-CHARLAS.md
REM  La direccion fija el formato, la presentacion «Ciclo de charlas y talleres FLAT» y el modo OBS
REM  (pixel a pixel, sin bajar la calidad).
REM ─────────────────────────────────────────────────────────────
set FLAT_FORMATO=8400x690/3175,1775,3450
set "FLAT_OBS_URL=http://127.0.0.1:5173/?formato=8400x690/3175,1775,3450&presentacion=charlas&obs=1"
set FLAT_SIN_NAVEGADOR=1
call "%~dp0start_instalacion.bat"
