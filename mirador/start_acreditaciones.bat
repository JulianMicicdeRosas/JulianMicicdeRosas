@echo off
REM -------------------------------------------------------------
REM  Mirador - Acreditaciones FLAT (en la sala, con OBS + Resolume)
REM
REM  Igual que start_sala.bat (misma camara, misma calibracion, misma sesion,
REM  misma cadena hasta los proyectores), pero la ventana de SALIDA muestra:
REM    - en la pared del medio (Norte), la pagina
REM      https://www.flatfestival.org/acreditaciones/  (QR y actividades del dia)
REM    - en las tres paredes, particulas que reaccionan a la gente: segun el
REM      lugar de la sala donde esta cada persona se modifica la parte de cada
REM      pared que tiene al lado.
REM
REM  La ventana de SALIDA se llama igual que la de Mirador ("Mirador - SALIDA"):
REM  OBS la captura con la fuente 'Mirador SALIDA' sin cambiar nada.
REM  En la ventana de CONTROL: H abre el panel, pestana Acreditaciones.
REM  Necesita internet (la pagina y sus datos se traen de flatfestival.org).
REM -------------------------------------------------------------
set MIRADOR_PORT=8766
set MIRADOR_SALIDA=8400x690
set MIRADOR_MOSAICO=
set MIRADOR_AJUSTE=estirar
set MIRADOR_KIOSK=
set MIRADOR_VENTANAS=2
set MIRADOR_AUDIO=off
set MIRADOR_APP=acreditaciones
call "%~dp0start_windows.bat"
