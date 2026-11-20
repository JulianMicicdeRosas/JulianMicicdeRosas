@echo off
REM ---------------------------------------------------------------------------
REM  Ciclo Umbral - OBS + Resolume - 8400 x 690 (oeste 3175 - norte 1775 - este 3450)
REM  Arranca el show (backend + frontend) sin abrir Chrome: OBS lo abre como fuente
REM  de navegador (8400 x 690) y lo manda a Resolume por Spout (emisor FLAT).
REM  Paso a paso: docs\OBS-RESOLUME-CHARLAS.md y docs\TRASPASO-LOCAL.md
REM  La direccion fija el formato, la presentacion UMBRAL y el modo OBS
REM  (pixel a pixel, sin bajar la calidad).
REM ---------------------------------------------------------------------------
set FLAT_FORMATO=8400x690/3175,1775,3450
set "FLAT_OBS_URL=http://127.0.0.1:5173/?formato=8400x690/3175,1775,3450&presentacion=umbral&obs=1"
set FLAT_SIN_NAVEGADOR=1
call "%~dp0start_instalacion.bat"
