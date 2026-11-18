# Traspaso a una sesión local · Umbral + OBS + Resolume

18 de noviembre de 2026. Este documento es para abrir una sesión de Claude **en la PC de la sala
(DESKTOP-5P2UPJJ)** y seguir desde ahí. La sesión en la nube que lo escribió no pudo conectarse a esa PC, así que
**nada de lo que sigue sobre la sala está verificado**: todo lo que diga «a comprobar» hay que mirarlo en la máquina.

Cómo usarlo: en esa PC, abrir la app de escritorio de Claude con «Computer use» activado, parado en la carpeta del
programa, y escribir: *«Leé `poesia-tipografica/docs/TRASPASO-LOCAL.md` y seguí desde ahí.»*

## 1. El pedido (textual)

> Necesito que tomes control de la computadora, revises la conexión Umbral / OBS / Resolume.
> Prepares un proyecto del Resolume SOLO para Umbral, donde estén repartidos en todas las pantallas.
> Podés tomar de referencia «Lo que vendrá» en lo que respecta a distribución.
> Tomar control de la cámara para observar respuesta.
>
> Cada tanto se apaga y se enciende. Chequear saturación de splitter, de placa de video, de NDI o de Resolume, pero
> cada vez que se apagan las pantallas el NDI dice offline. Corregir.

Son cuatro trabajos:

1. Revisar la cadena show → OBS → Resolume → pantallas.
2. Encontrar y corregir los cortes (pantallas que se apagan y se encienden; NDI «offline» en cada corte).
3. Armar una composición de Resolume **sólo para Umbral**, repartida en todas las pantallas, con la distribución de
   «Lo que vendrá».
4. Mirar el resultado con la cámara.

**Ojo con la hora:** según el cronograma hay Ciclo Umbral **hoy 18/11 de 18:30 a 20:00** en la Sala inmersiva (y otro
el 29/11, todavía sin publicar). Antes de tocar nada: copia de seguridad de la composición de Resolume, del preset de
Advanced Output y de la colección de escenas y el perfil de OBS. Si falta poco para la función, diagnosticar y anotar
antes que cambiar.

## 2. Qué se sabe de la sala

| Dato | Estado |
|---|---|
| PC: `DESKTOP-5P2UPJJ`, Windows | conocido |
| Carpetas de trabajo en esa PC: «Resolume Arena 6», «Mirador», «Desarrollo - Inmersiva» | conocido (por el nombre; contenido sin ver) |
| Resolume: Arena 6 (por el nombre de la carpeta) | a comprobar la versión exacta |
| OBS → Resolume va por **NDI** | dicho por el usuario |
| Hay un **splitter** entre la placa y las pantallas | dicho por el usuario; modelo y conexión a comprobar |
| Composición de referencia: **«Lo que vendrá»** | está en la PC; no se pudo abrir |
| Placa de video | a comprobar (en octubre se probó con una RTX 3070 Ti; no se sabe si es esta PC) |
| Cantidad, resolución y orden de las pantallas | a comprobar |
| Cámara para observar | a comprobar cuál es y con qué programa se ve |
| Formato del show | 8400 × 690 en tres paredes: oeste 3175 · norte 1775 (frente) · este 3450. **A comprobar que la sala de Umbral use ese mismo reparto**: «todas las pantallas» puede ser otra distribución |

## 3. El programa (Umbral)

- Repositorio: `https://github.com/JulianMicicdeRosas/JulianMicicdeRosas`, rama **`charlas-flat`**, carpeta
  `poesia-tipografica/`. ZIP: `https://github.com/JulianMicicdeRosas/JulianMicicdeRosas/archive/refs/heads/charlas-flat.zip`.
  **A comprobar qué versión hay instalada en la PC** (puede ser anterior): `git log -1` en la carpeta, o la fecha del ZIP.
- Qué es: un servidor en Python (`server.py`: micrófono, transcripción con OpenAI, grabación) y una página (`src/`,
  compilada con Vite) que dibuja el show. Puertos: página en `5173`, servidor en `8765`.
- Arranque en Windows: `start_instalacion_8400.bat` (abre Chrome) o `start_obs_charlas.bat` (no abre Chrome: el show
  lo abre OBS como fuente de navegador). **No hay un lanzador `start_obs_umbral`**: `start_obs_charlas.bat` fija la
  presentación «charlas». Para Umbral, la dirección de la fuente de OBS es:

  ```
  http://127.0.0.1:5173/?formato=8400x690/3175,1775,3450&presentacion=umbral&obs=1
  ```

  - `presentacion=umbral`: título «UMBRAL».
  - `obs=1`: píxel a píxel y sin bajar la calidad (dentro de OBS se detecta solo; se deja explícito).
  - `atlas=2048` al final, si la placa anda justa de memoria.
- Clave de OpenAI: **fuera del repositorio** (en Windows, `%USERPROFILE%\.poesia-tipografica\openai_key`, o se pega
  en el panel C). Nunca escribirla en un archivo del repositorio ni en un commit.
- Datos del usuario: `Documentos\Ciclo FLAT\` (ajustes, logos, grabaciones, copia del cronograma).
- Operar el show dentro de OBS: clic derecho en la fuente → **Interactuar**. No abrir además el show en un Chrome
  aparte: serían dos shows distintos.
- Teclas: `1`…`9` placa del artista con esa tecla (panel C → Artistas) · `0` sólo transcripción · `Z` cierre con el
  logo de FLAT (antes era el `5`) · `S` transcribir / dejar · `P` detener · `T` palabras · `L` loop · `→ ←` loop ·
  `C` panel de operación · `D` panel técnico · `F` pantalla completa.
- Panel C → **Cronograma del día**: propone las placas de Umbral de la fecha (lectores y desmontaje) y las carga con
  un botón.
- Si la placa de video se reinicia, la página del show **se recarga sola** y vuelve a la escena (tope: 3 recargas en
  2 minutos; después avisa en el título de la ventana y hay que recargar a mano).
- El servidor sólo acepta páginas de la misma computadora (`localhost` / `127.0.0.1`). Si el show corre en una PC y
  OBS en otra, hay que poner `WS_ORIGINS=` en `.env` con la dirección de esa página.
- Documentos que conviene leer: `docs/OBS-RESOLUME-CHARLAS.md` (valores exactos de OBS y Resolume para 8400 × 690),
  `docs/REVISION-2026-11.md` (estado del sistema y puntos débiles), `README.md`.
- Pruebas: `npm test` (un segundo) y `npm run e2e` (unos 3 minutos; **usa los puertos del show: no correrla con el
  show andando**).

## 4. Los cortes: cómo diagnosticarlos

Dato clave del usuario: **cada vez que se apagan las pantallas, el NDI pasa a «offline»**. Si las dos cosas pasan en
el mismo instante, la causa está antes del splitter o es común a ambas. Hipótesis, sin haber visto la máquina:

| # | Hipótesis | Qué la confirma | Arreglo |
|---|---|---|---|
| A | **La placa de video reinicia su driver** (saturación, temperatura, memoria de video, driver) | Visor de eventos → Sistema: evento de origen `Display`, id `4101` («nvlddmkm dejó de responder y se recuperó») a la hora del corte; errores de `nvlddmkm` (ids 13, 14, 153) | Bajar la carga (ver §5), driver estable, temperatura, modo de energía «máximo rendimiento» |
| B | **Windows vuelve a detectar las pantallas**: una salida o el splitter pierde la señal un instante y Windows reacomoda todas | No hay 4101, pero las pantallas se reordenan o Resolume pierde el Advanced Output; el corte coincide con mover un cable o con calor en el splitter | Cable y alimentación del splitter, EDID fijo (emulador de EDID o «EDID administrado» de NVIDIA), firmware del splitter |
| C | **OBS se cae o reinicia su salida** | Registro de OBS a la hora del corte (`%APPDATA%\obs-studio\logs`, y `crashes` si hubo) | Según lo que diga el registro |
| D | **NDI saturado**: a 8400 × 690 comprime con el procesador | Uso de CPU alto en OBS; cuadros perdidos en Ver → Estadísticas | Pasar a Spout (§5) |
| E | **Ahorro de energía** (si el corte es periódico) | `powercfg` muestra tiempos de apagado de pantalla o suspensión; suspensión selectiva de USB; placa de red que se duerme | Desactivarlos (abajo) |
| F | **Red**: NDI depende de la red aunque sea en la misma PC | El adaptador de red se reconecta a la hora del corte | Spout; o fijar el adaptador y sacarle el ahorro de energía |

Una hipótesis no excluye a otra: B puede provocar que OBS corte su salida y que el NDI caiga.

### Qué mirar, en orden

1. **Anotar la hora exacta** de dos o tres cortes (con la cámara o mirando).
2. **Eventos de la placa** (PowerShell):

   ```powershell
   Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Display'; Id=4101; StartTime=(Get-Date).AddDays(-7)} |
     Format-Table TimeCreated, Message -Wrap
   Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='nvlddmkm'; StartTime=(Get-Date).AddDays(-7)} |
     Format-Table TimeCreated, Id, Message -Wrap
   ```

   Si no devuelven nada, no hubo reinicio del driver en esos días (apunta a B, C, E o F).
3. **Carga de la placa mientras corre todo** (dejarlo andando y comparar con la hora del corte):

   ```powershell
   nvidia-smi --query-gpu=timestamp,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv -l 2 > "$env:USERPROFILE\Desktop\placa.csv"
   ```

   Memoria de video cerca del total, temperatura alta o uso clavado en 100 % apuntan a A.
4. **Pantallas y splitter**: Configuración → Pantalla (cuántas ve Windows y en qué resolución) y el Panel de control
   de NVIDIA. Ver si el splitter aparece como una sola pantalla ancha o como varias. Tocar cables y fuente del
   splitter para ver si se reproduce el corte.
5. **Energía**:

   ```powershell
   powercfg /getactivescheme
   powercfg /change monitor-timeout-ac 0
   powercfg /change standby-timeout-ac 0
   ```

   Además: Administrador de dispositivos → adaptador de red y concentradores USB → pestaña de energía → destildar
   «permitir que el equipo apague este dispositivo». NVIDIA → Modo de control de energía → «Preferir rendimiento
   máximo» para `obs64.exe` y para Arena.
6. **Registros** de OBS (ruta de arriba) y de Resolume (ubicación a comprobar en esa versión) a la hora del corte.
7. **En el show**: dentro de OBS, Interactuar → tecla `D`: tiene que decir «calidad: alta» y unos 60 cuadros. Si el
   título de la ventana dice «⚠ placa de video: recargar», la placa perdió el dibujo varias veces seguidas (hipótesis A).

## 5. Bajar la carga y sacar el NDI de la cadena

- **Spout en lugar de NDI** cuando OBS y Resolume están en la misma PC: pasa la imagen directo por la placa, sin
  comprimir y sin red. En OBS hace falta el plugin de Spout («Spout2 Plugin for OBS», de Off World Live; **a
  comprobar que sea compatible con la versión de OBS instalada**) y un filtro «Spout Filter» en la escena. En
  Resolume, la fuente aparece en Sources → Spout. Paso a paso en `docs/OBS-RESOLUME-CHARLAS.md`.
- **Si se sigue con NDI**: revisar la versión del plugin de NDI de OBS y de las herramientas de NDI, y que la salida
  de NDI no dependa de un adaptador de red que se duerme.
- **Regla de definición**: el mismo tamaño en todos los eslabones (fuente de navegador, lienzo y salida de OBS,
  composición de Resolume), sin escalar en el medio. Color RGBA en OBS.
- **Si la placa no llega**: `&atlas=2048` en la dirección; fuente de navegador a 30 cuadros (dentro de OBS el show ya
  no baja su resolución por eso); deshabilitar la vista previa de OBS. **No** achicar el lienzo ni la composición.
- Carga medida del programa (en una máquina de prueba, sin placa de video real): en 8400 × 690 el motor cuesta unas
  5 veces más por cuadro que en 1920 × 690. Nunca se midió en la sala con OBS y Resolume a la vez.

## 6. La composición de Resolume para Umbral

1. Abrir **«Lo que vendrá»** y anotar: tamaño de la composición, cuadros por segundo, y en Output → Advanced Output
   los *slices* (recorte de entrada de cada uno y a qué salida va) y las transformaciones de salida. Guardar ese
   preset de Advanced Output con otro nombre: es la «distribución» que se pide reutilizar.
2. **Guardar como** una composición nueva, por ejemplo `UMBRAL`, y vaciarla: una sola capa, un solo clip.
3. Ese clip es la fuente del show: **Spout «FLAT»** (o la fuente NDI de OBS mientras no se cambie). Opacidad 100 %,
   sin efectos, tamaño 1:1.
4. Decidir el tamaño con el usuario si no coincide:
   - Si «Lo que vendrá» usa **8400 × 690** con las tres paredes, la composición de Umbral va igual y los recortes
     son: oeste `0–3175`, norte `3175–4950`, este `4950–8400` (alto 690).
   - Si usa **otro tamaño u otro reparto**, hay dos caminos: (a) cambiar el formato del show para que coincida, con
     la sintaxis `ANCHOxALTO/A,B,C` (anchos de cada pared de izquierda a derecha; la del medio, o la marcada con
     `*`, es la de frente, donde van título, nombres y dibujos); o (b) dejar el show en 8400 × 690 y repartirlo con
     los slices. El (a) da mejor definición porque no escala.
5. Probar con el loop del show (título «UMBRAL» en la pared de frente) y con una placa de artista, mirando con la
   cámara que nada quede cortado en una esquina ni repetido en dos pantallas.

Los archivos de `obs/` (perfil y escena) se escribieron a mano y **nunca se importaron en un OBS real**. Están
pensados para «charlas»: si se importan, cambiar en la fuente `presentacion=charlas` por `presentacion=umbral`. Si la
importación falla, los valores están en `docs/OBS-RESOLUME-CHARLAS.md` para cargarlos a mano.

## 7. Orden de trabajo sugerido

1. Copias de seguridad (Resolume, OBS). Ver qué versión del programa está instalada.
2. Inventario: placa, pantallas que ve Windows, splitter, versiones de OBS, Resolume y NDI, cámara.
3. Reproducir un corte con el registro de la placa andando (§4) y decidir la hipótesis.
4. Corregir lo que corresponda. Cambiar una sola cosa por vez y volver a observar.
5. Armar la composición de Umbral (§6).
6. Prueba larga, de al menos 30 minutos, con el show transcribiendo, mirando con la cámara y con `placa.csv`.
7. Dejar anotado qué se cambió y qué quedó pendiente.

## 8. Reglas de trabajo del usuario

- Responder en español rioplatense.
- Trabajar en la rama `charlas-flat`; sin pull requests salvo que los pida.
- Antes de cada commit: borrar `poesia-tipografica/dist` y comprobar que la clave de OpenAI no esté en ningún archivo.
- En la pared nunca se escribe el estado del show: los avisos van al panel C y al título de la ventana.
- Decir con claridad qué se comprobó y qué no.

## 9. Pendiente sin empezar

Un pedido anterior quedó interrumpido y no se hizo nada: «Sacar nombres de docentes (ejemplo: A CARGO Gabriela "Gab"
Crespín) de las tarjetas». No quedó claro a qué tarjetas se refiere (no parecen ser de este programa): preguntarle
al usuario antes de tocar nada.
