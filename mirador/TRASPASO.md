# Mirador — traspaso a una sesión local de Claude

Este archivo sirve para seguir en una sesión de Claude **en la computadora de la sala**, donde Claude sí puede ver y manejar la PC, la cámara y Chrome. Antes de esto, el trabajo se hizo en una sesión en la nube, que no tenía acceso a la PC.

---

## 0. Para Julián: cómo mudarse (una sola vez)

En la **PC de la sala** (Windows, RTX 3070 Ti), que es la que tiene la cámara, los proyectores y el splitter:

1. **Instalá la app de escritorio de Claude** (claude.ai/download) e iniciá sesión con tu cuenta.
2. **Activá el uso de la computadora:** *Settings → This computer → Computer use → activado*. Viene apagado.
3. **Instalá la extensión "Claude in Chrome"** en Chrome. Hace falta porque el uso de la computadora solo puede *mirar* los navegadores, no hacer clic en ellos; para manejar la pestaña de Mirador (botones, pestaña Sincronizar) Claude usa esa extensión.
4. **Bajá la última versión de Mirador**, con una de estas dos opciones:
   - Con git, en PowerShell:
     ```
     git clone https://github.com/JulianMicicdeRosas/Mirador.git C:\Mirador
     ```
     Si la carpeta ya existe: `git -C C:\Mirador pull`.
   - O descomprimí el último `Mirador-PC.zip` en `C:\Mirador`. No uses "Archivos de programa" ni OneDrive.
5. En la app de Claude, abrí **Claude Code** con la carpeta `C:\Mirador`. Es una sesión local, no en la nube.
6. Escribí este primer mensaje:
   > Leé `TRASPASO.md` entero y seguí desde la sección 6 ("Qué falta"). Tomá control de la PC: abrí Mirador con `start_8k.bat`, corré la sincronización y configurala para que los esqueletos caigan sobre los cuerpos.
7. Cuando Claude pida permiso para usar Chrome, PowerShell o la cámara, aprobalo.

Si vas a usar la MacBook en vez de la PC, los pasos son los mismos, con la carpeta `~/Mirador` y `start_mac.command`.

---

## 1. Qué es Mirador

Programa web local (HTML + JS, sin servidor propio; lo sirve `python -m http.server` en `127.0.0.1:8765`) para una **sala inmersiva con proyección sobre cuerpos en movimiento**.

```
cámara ─► MoveNet MultiPose (TF.js 4.22, WebGL) ─► cuerpos (esqueleto 2D)
       ─► calibración cámara→paredes (calib.js, sync.js) ─► módulos visuales
       ─► eco / bloom / composición + zoom + colorimetría (FS_COMP) ─► keystone ─► mosaico 8K ─► splitter ─► 7 proyectores
```

- **Repo:** `JulianMicicdeRosas/Mirador`, rama `main`. Es privado. Último commit antes de este traspaso: `49f7e3f`.
- **Hay una copia** en `JulianMicicdeRosas/JulianMicicdeRosas`, rama `claude/amazing-cray-3dwqpm`, carpeta `mirador/`. Hay que mantener las dos iguales.
- **Lanzadores:**
  - `start_windows.bat`: busca Chrome o Edge y sirve la página.
  - `start_8k.bat`: salida `8400x690`, mosaico `7680x4320`, kiosk y micrófono.
  - `start_13440.bat`, `start_mac.command`.
  - Los `.bat` tienen que quedar en **ASCII puro con CRLF**: cmd.exe no lee UTF-8.
- **Parámetros de la dirección:** `?mosaico=7680x4320`, `?perfil=ligero|equilibrado|completo`, `?panel=1`, `?escena=…`, `?audio=…`.
- **Modelo:** viene incluido en `vendor/movenet/`. Es una copia de `@vladmandic/human-models` con la firma de entrada parcheada a dinámica. Funciona sin internet.

### Archivos

| Archivo | Qué hace |
|---|---|
| `js/core.js` | Parámetros `P_DEFAULT`, paredes (`wallRanges`), mosaico (`mosaicTiles`), shaders (`FS_COMP` con zoom, colorimetría, puntos de sincronización; `FS_CAMWARP`), homografía de esquinas. |
| `js/tracking.js` | Cámaras y zonas. Detector compartido (`DET`) con la imagen en partes (`detTiles`) y niveles en GPU (`detProcess`). Exposición dinámica (`meterExposure`), ids propias (`trackPoses`), tope de cuerpos (`selectBodies`), ajustes de la cámara física (`CAM_HW`, `setCamHW`), simulador. |
| `js/calib.js` | Calibración por tramos: líneas `top`/`bottom` en fracción de la imagen de la cámara, una homografía por tramo. Modo **piso** (`calMapPose`: recta desde el punto de la cámara en el piso, pasando por los pies, hasta la base) y modo **vista** (`calMap`). Tamaño `real` / `camara` / `fija`, `horizonFit`, `verticalVP`, `calU` (correr y separación). Vista K (`Calib`). |
| `js/sync.js` | Sincronización automática con la cámara: proyecta puntos, los busca por diferencia contra negro, ajusta la homografía por mínimos cuadrados por pared y rehace `cal.top`/`cal.bottom`. |
| `js/render.js` | Tubería GL. `setColorUniforms` (zoom, colorimetría, sincronización), `drawCamOverlay` (cámara sobre la proyección, tecla S), mosaico, escalador, grabación. |
| `js/efectos.js` | Efectos de GPU. Productores `motion` (velocidad del esqueleto en una textura) y `maskblur` (silueta difuminada en dos escalas). Módulos `particulas`, `fluido`, `membrana`, `ondas`, `liquida`. Paletas (`PALETAS`), `fxAvailable`, `clearFX`. Necesitan texturas float (y lectura en el vertex shader para partículas y membrana). |
| `js/modules.js` | Módulos visuales y esqueletos (`drawSkeletons`; `verEsqueletos` con la tecla E). |
| `js/ui.js` | Panel. Pestañas: Sesión, Plantillas, Módulos, **Sincronizar** (naranja), Cámaras, Audio, Proyección, Sistema. |
| `js/sessions.js` | Sesiones en localStorage, versión 3. Guarda `P`, zonas con `cal` y `hw`, canciones. Exportan e importan en JSON. |
| `README.md`, `LEEME-PC.txt`, `REVISION.md`, `PLANTILLAS.md` | Documentación para Julián. |

### Teclas

- **H** panel · **F** pantalla completa · **C** esquinas · **K** calibración cámara→paredes
- **S** cámara sobre la proyección · **E** esqueletos encima de todo
- **+ / −** zoom · **Z** zoom 1×
- **B** negro · **X** limpiar ecos · **R** grabar · **M** micrófono
- **Espacio** canción · **1-9** plantillas

---

## 2. La sala

- **Tres paredes**, de izquierda a derecha vistas desde la cámara. Lienzo **8400 × 690**:

  | Pared | Lado | Tamaño | Lugar en el lienzo |
  |---|---|---|---|
  | Oeste | izquierda | 3175 × 690 | 0–3175 |
  | Norte | fondo | 1775 × 690 | 3175–4950 |
  | Este | derecha | 3450 × 690 | 4950–8400 |

- **Cámara fija**, alta, en el lado sur, mirando al norte. La foto de referencia es `referencia/camara-sala.jpg`; las líneas celestes las dibujó Julián a mano y son aproximadas. Abajo a la izquierda de esa foto está el **operador** sentado, que cae en la zona ignorada.
- **7 proyectores Full HD**, alimentados por **una salida 8K (7680 × 4320) que reparte un splitter**. Una RTX 3070 Ti maneja solo 4 pantallas, por eso el splitter.
- **OBS** para grabar.

### Supuesto que resultó falso (ver la sección 5 bis: la sala usa OBS + Resolume, no mosaico 8K)

En modo mosaico (`P.map.mosMode='paredes'`), las paredes van como baldosas dentro del cuadro 8K:

| Pared | Posición en el cuadro | Tamaño |
|---|---|---|
| Oeste | (0, 0) | 3175 × 690 |
| Norte | (3175, 0) | 1775 × 690 |
| Este | (0, 690) | 3450 × 690 |

**Nunca se confirmó cómo corta el splitter el cuadro ni qué proyector apunta a qué parte de qué pared.**

Si el splitter corta una grilla fija de 4 × 4 celdas de 1920 × 1080:
- Cada proyector mostraría pedazos de dos paredes. Por ejemplo, la celda (0,0) tendría Oeste 0–1920 arriba y Este 0–1920 abajo.
- Este cruzaría el límite entre filas en y=1080.

Eso no puede verse bien en la sala. **Hay que preguntarle a Julián, o verlo en la sala:**
- el modelo del splitter o procesador;
- si corta en grilla fija o con ventanas a medida;
- qué salida va a qué proyector;
- qué parte de qué pared cubre cada proyector.

Con eso se arma el mapa a mano en *Proyección → Salida 8K a splitter → mapa a mano*. Formato, una baldosa por línea: `sx,sy,sw,sh > x,y[,w,h]`, en px del lienzo y del cuadro.

---

## 3. Lo que se hizo (por commit)

| Commit | Cambio |
|---|---|
| `1d3f88f` `d24fa68` | Reestructura modular. Plantillas y sesiones con canciones. Audio por micrófono o canción. Modelo incluido. Mosaico 8K. |
| `5edc1ba` `5116ffe` `270c130` | Lanzadores para Windows (ASCII y CRLF) y `LEEME-PC.txt`. |
| `30af98a` `46bd7fb` | Sala de tres paredes. Calibración por tramos con homografías. Modo piso (ray-casting por los pies). Zona ignorada. Tecla K. |
| `d8b8b7b` | Detección permisiva: imagen en 2–3 partes con solapamiento, resolución 384, umbrales más bajos, vista previa con colores (verde en uso, rojo ignorado, gris descartado, amarillo fuera del máximo), tecla E. |
| `81066bd` | Exposición dinámica, blancos y negros de la imagen que analiza el modelo (en GPU). Ajustes de la cámara física. |
| `9a4f27c` | 1 cuerpo por cámara (de fábrica; se queda con el que viene siguiendo). Zoom de salida. Colorimetría de todo lo proyectado (libre / absoluto / gradiente) y por pared, con patrón de color. |
| `49f7e3f` | **Pestaña naranja Sincronizar**: sincronización automática con puntos, verificación con S, tamaño "altura real", ajuste fino (tamaño, altura, correr, separación), punto de la cámara en el piso automático. El aviso de canción y la ayuda de teclas ya no se proyectan. |
| (este) | **Efectos de GPU** (`js/efectos.js`): partículas, fluido Navier-Stokes, membrana, ondas, silueta líquida, con paletas y 12 plantillas nuevas con miniatura (`referencia/plantillas/`). **Estabilidad:** guardián que se recarga solo si se pierde el contexto WebGL o el detector, tiempo acotado en shaders, eco sin fantasmas, capa 2D solo si se usa, mapas por id podados, medición que espera a la GPU. **Corner pin** por baldosa del mosaico. |

---

## 4. El problema que motivó la sincronización

En la sala, los esqueletos salían **amontonados en una zona de la pared norte y todos grandes**, mientras las personas reales estaban repartidas por todo el ancho. Hay foto: cinco personas en fila frente a la pared norte y los esqueletos agrupados a la izquierda del centro.

Causas probables:
- La calibración venía de la foto con líneas dibujadas a mano.
- El lienzo de tres paredes estaba en una sola proyección.
- La altura de la figura era fija (82 %).

---

## 5. Estado actual: primera sincronización real

Julián corrió la sincronización en la sala (en modo mosaico 8K):

```
Sincronizado: 2 de 3 paredes · 9/18 puntos · error 1.1 px
Oeste: 0/6  sin datos (quedó la calibración anterior)
Norte: 4/6  ✓ error 1.1 px
Este:  5/6  ✓ error 0.6 px
cuerpo 529: Oeste · posición 0 % del ancho · alto 1434 % de la pared · como la cámara
```

En la ventana, con S, se veía:
- la baldosa de Norte arriba a la derecha de la de Oeste;
- la de Este debajo, con un trapecio muy deformado;
- Oeste en negro.

Lectura:

1. **La cámara no vio ningún punto de Oeste.** Puede ser que esa parte del cuadro 8K no llegue a un proyector, que ese proyector apunte fuera de la vista de la cámara, que esté apagado o que el splitter corte distinto (ver la sección 2). Hay que mirar la sala con la sincronización corriendo.
2. **Con 4 o 5 puntos de una grilla de 3 × 2, la homografía de Norte y Este extrapola mal.** Está "exacta" sobre esos puntos y deformada en el resto. El error bajo no prueba nada.
3. **Calibración mezclada.** Oeste conserva las líneas viejas de la foto, pero su vértice compartido con Norte se movió. El tramo Oeste queda deformado y el modo "real" no puede ajustar el horizonte, así que cae a "cámara". Con eso salen tamaños absurdos (1434 %).

---

## 5 bis. Resuelto en la PC de la sala (10/11/2026): cómo está armada de verdad

**El supuesto del mosaico 8K era falso.** No hay salida 8K ni hace falta mosaico. La cadena real es:

```
Mirador (Chrome kiosk, pantalla principal 1920×1080)
  → OBS (captura de ventana, NDI "OBS PGM" / "OBS Preview" con DistroAV)
  → Resolume Arena 6 (clip NDI en una composición de 8400 × 690)
  → Advanced Output "Screen 9": 9 slices con warp → salida 4096 × 2160 (DISPLAY4)
  → splitter en grilla 3 × 3 (celdas de ~1365 × 720) → 7 proyectores
```

- El mapeo de la sala **ya está hecho en Resolume** (`Documents\Resolume Arena 6\Preferences\AdvancedOutput.xml`). Las esquinas caen en x≈3172 y x≈4945 del lienzo, igual que en Mirador (3175 y 4950). **No tocar ese Advanced Output:** lo usan otras obras.
- **Causa del amontonamiento en Norte:** OBS mandaba 1280×720 y el clip NDI entraba a Resolume **sin estirar**, centrado en la composición: ocupaba solo x≈3560–4840, o sea la pared Norte. Además Mirador dibujaba un mosaico 8K dentro de esa ventana.

Lo que quedó configurado:

| Dónde | Qué |
|---|---|
| Mirador | `start_sala.bat`: `salida=8400x690`, **sin mosaico**, `ajuste=estirar` (el lienzo llena toda la ventana 1920×1080). |
| OBS | Perfil **Mirador** (1920×1080, 30 fps) y colección de escenas **Mirador** (una captura de la ventana de Chrome, a pantalla completa). El perfil y la colección anteriores ("Sin Título") quedaron intactos; respaldo en `%APPDATA%\obs-studio\respaldo-antes-de-mirador`. |
| Resolume | Composición **Mirador sala** (copia de "sala nueva 2 dia de bolivia"). El clip NDI de OBS tiene **Scale W 437,5 % y Scale H 63,89 %** (1920×1080 → 8400×690). |
| Sesión | **Sala** (en el perfil de Chrome de `C:\Mirador` y exportada en `sesiones/Sala.json`). Trae la sincronización y las zonas ignoradas. |

Resultado de la sincronización por toda la cadena (grilla 5 × 3 por pared, espera 900 ms por la demora de OBS → NDI → Resolume):

```
Oeste: 9/15 ✓   Norte: 15/15 ✓   Este: 9/15 ✓   error ~2 px de cámara
escala: k = 0,96 · horizonte y = 46 px · cámara en el piso (0,54 ; 4,1), automática
```

- Los puntos que faltan son los del **primer 40 % de Oeste** (lienzo 0–1270, slice 1 de Resolume: en la cámara esa parte de la pared se ve sin luz; revisar ese proyector) y el **último 40 % de Este** (queda fuera del cuadro de la cámara).
- Con poses de prueba, cada lugar del piso cae en su pared y la figura mide ~65 % del alto de la pared. **Falta verificar con una persona real** (tecla E) y tocar *separación*, *altura* y *tamaño* si hace falta.
- Con la sala vacía la detección engancha sillas y objetos. Zonas ignoradas: sillas de abajo a la izquierda y franja sobre las paredes. Las sillas de la derecha no se ignoran (ahí puede haber gente).

- **Placa de video:** Chrome arrancaba con la Intel UHD 630 (la pantalla principal cuelga de la integrada). Los lanzadores ahora llevan `--force_high_performance_gpu`: con la RTX 3070 Ti pasa de perfil Ligero a 36 fps a perfil Completo, render 8400×690, ~55 fps. Se comprueba en la consola con `gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)`.
- **Hasta 10 cuerpos:** MoveNet MultiPose da como mucho 6 por pasada. Con *cuerpos máx.* mayor que 6 la imagen se corta sola en 3 partes (`detTileN`): ~48 ms por detección. La sesión Sala quedó en 10. Sin probar con 10 personas reales.
- **Color sólido:** *Proyección → Colorimetría → absoluto: un solo color* (`P.color.mode='absoluto'`, `P.color.c1`). Probado con azul.
- El servidor local se cerró una vez solo; si Chrome muestra un error de conexión, volver a abrir `start_sala.bat`.

Cosas a saber para operar:

- Mirador en kiosk tapa a Resolume y OBS (hay un solo monitor de operación). Para verlos, minimizar Chrome; **mientras está minimizado OBS no captura**.
- El clip de Resolume usa la fuente NDI **OBS Preview**; OBS está en Modo Estudio con una sola escena, así que vista previa y programa son lo mismo.
- Manejo desde afuera: lanzar con `MIRADOR_CDP=9222` y hablarle a Chrome por el puerto de depuración local (`http://127.0.0.1:9222/json`, `Runtime.evaluate`). Así se corrió `Sync.run(sources[0])` sin tocar la ventana.
- Resolución: el lienzo viaja a 1920 px de ancho para 8400 (4,4×). Alcanza para esqueletos; para más detalle habría que pasar a una fuente de 8400×690 real (fuente de navegador de OBS con cámara, o Spout).
- El servidor de la copia vieja (`Downloads\Mirador-PC`, puerto 8765, consola de administrador) no se pudo cerrar sin permisos; el nuevo corre en 8766. Cerrando esas dos consolas, `start_sala.bat` vuelve a usar 8765.

---
### Prueba del 11/11/2026 (después de los efectos de GPU y las plantillas nuevas)

- Las 24 plantillas corren sin errores (41–49 fps con la cámara detectando, 60 fps con 10 cuerpos simulados). El color sólido (*absoluto*) se aplica también a los efectos de GPU.
- **Puerto:** `start_sala.bat` usa el **8766**. La sesión Sala vive en ese origen, y la copia vieja (`Downloads\Mirador-PC`) vuelve a arrancar como administrador en el 8765, con un Chrome en mosaico 8K. Si está abierta, cerrarla: tapa a Mirador y OBS puede capturar la ventana equivocada (las dos tienen el mismo título).
- **OBS:** la captura de Mirador apareció corrida y al 72 %. Tiene que ocupar todo el lienzo: seleccionarla y apretar Ctrl+S (estirar a la pantalla). En Modo Estudio, después apretar *Transición*.
- **CPU al límite:** con Resolume mostrando otra presentación por NDI (1,5 núcleos), la CPU (i5-8500, 6 núcleos) llegó al 97 % y cada detección tardó 1–2 s, cuando con la sala libre tardaba ~48 ms. El cuello es el proceso de GPU de Chrome, que queda atado a un núcleo. Volver a medir con la sala libre (`sources[0]._diag.ms`). Si sigue lento, bajar a 6 cuerpos (una sola parte) o sacar la fuente NDI que no se use en Resolume.

### Vínculo con OBS y Resolume (13/11/2026, noche)

- **Fuente propia en OBS:** la escena **Mirador** tiene ahora su fuente **Mirador SALIDA** (`[chrome.exe]: Mirador · SALIDA`, Windows 10, estirada a 8400 × 690, 31 px de recorte arriba, bloqueada). La fuente vieja **Captura de ventana 2** quedó oculta en esa escena y sin tocar, porque la comparte la escena **umbral** (4 copias) y alguien la apunta a otras ventanas (hoy: `Proyección — MODO NO SUPERVISADO`). Respaldo de la escena anterior: `%APPDATA%\obs-studio\respaldo-antes-de-mirador`.
- **Si OBS muestra negro con la fuente visible:** seleccionarla, desbloquearla (candado), Ctrl+S (estirar a la pantalla), bloquearla de nuevo y, en Modo Estudio, *Transición*. Los límites cargados editando el .json no siempre los toma.
- **Resolume:** `Mirador sala`, clip NDI **OBS PGM** de la columna 2 activo (8400 × 690, sin escala). Ya estaba así.
- **Verificado con la cámara:** durante un concierto, la figura de la chelista cayó en la pared Norte justo detrás de ella (pie en x = 0,35 de la cámara → Norte, 39 % del lienzo). Detección 68 ms, 39 fps con toda la cadena andando. La sincronización no se repitió: es la del 13/11 a la tarde.
- **Lanzar Mirador desde una terminal de Claude:** si el lanzador queda como hijo de esa terminal, al reiniciarse la terminal se cierran también Chrome y el servidor. Lanzarlo independiente (`Invoke-CimMethod Win32_Process Create`) o con doble clic en `start_sala.bat`.

## 6. Qué falta (próximo paso, en este orden)

### 6.1 En la sala, con la PC

1. Abrir Mirador con `start_8k.bat` y apretar H.
2. Proyectar el **patrón de ajuste** (*Proyección → patrón de ajuste*). Mirar en la sala y con la cámara qué parte del lienzo muestra cada proyector:
   - ¿Se ven Oeste, Norte y Este cada una en su pared, enteras y continuas?
   - Si no, corregir el mosaico con el mapa a mano, o los cables y las ventanas del splitter.
   - **Esto va primero:** si la proyección no muestra el lienzo de forma coherente, ninguna sincronización lo arregla.
3. Con la proyección coherente: sala oscura, nadie delante de las paredes, pestaña **Sincronizar → Sincronizar ahora**. Se puede correr desde la consola de Chrome (`Sync.run(sources[0])`) y leer `Sync.last`.
4. Verificar con S y luego con personas y la tecla E. Ajustar *separación*, *altura* y *tamaño* en el ajuste fino.

### 6.2 Mejoras de código ya diseñadas (pendientes)

- **Grilla densa:** sincronizar con columnas cada ~600 px de lienzo dentro de cada pared y 2–3 filas, en vez de 3 × 2 por pared. Así cada tramo es chico y cae dentro de un proyector.
  - Un tramo por par de columnas, con extrapolación al borde de la pared en el primero y el último.
  - Guardar `cal.names[]` (pared de cada tramo), `cal.valid[]` y `cal.shares` (ancho de columna).
  - `calPrepare` tiene que usar `names` y `valid`.
  - `calRayHit` tiene que saltear los tramos inválidos.
  - `horizonFit` y `verticalVP` tienen que usar solo vértices válidos.
- **No mezclar calibraciones:** si una pared no se ve, marcarla inválida. No dejar las líneas de la foto con un vértice nuevo.
- **Validar cada ajuste:** al menos 4 puntos que cubran las dos columnas y las dos filas, y un cuadrilátero convexo de área razonable. Si no, el tramo es inválido.
- **Toma en blanco:** proyectar todo blanco una vez (`uSyncMode=3` en `FS_COMP`) y capturar la huella blanco−negro. Sirve para:
  - aceptar solo los puntos dentro de la huella;
  - mostrarla en el panel ("esto es lo que la cámara ve proyectado").
- **Limitar el tamaño** de la figura en `calMapPose` a entre 0,12 y 1,1 del alto de la pared, antes del multiplicador *tamaño*.
- **Diagnóstico en el panel:**
  - foto de la cámara con los puntos encontrados y las líneas resultantes;
  - tira del lienzo con cada punto en verde (visto) o rojo (no visto);
  - en modo mosaico, las celdas de 1920 × 1080 del splitter marcadas sobre la tira (P1…P16), para ver qué proyector debería mostrar cada parte.
- **"Exportar diagnóstico"** (JSON con `cal`, `Sync.last` con todos los puntos, formato, mosaico, baldosas, zoom, esquinas, resolución de la cámara y fotos en JPEG chicas). Así se puede revisar sin estar en la sala.
- **Vista K con muchos tramos:** etiquetar solo una vez por pared. En Cámaras, esconder los controles de peso por tramo cuando la calibración viene de la grilla.

### 6.3 Cómo probar sin la sala

- `python -m http.server 8799` en la carpeta y Playwright con Chromium.
- Cámara falsa: `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=archivo.y4m`. Se hace con `ffmpeg -loop 1 -i foto.png -t 2 -r 15 -pix_fmt yuv420p archivo.y4m`.
- Para probar la sincronización, reemplazar `sources[0].video` por un canvas con `videoWidth`, `videoHeight` y `readyState` definidos. Dibujar la foto de la sala y, cuando existe `Sync.mark`, un círculo blanco donde lo vería la cámara según homografías "verdaderas" conocidas. Comparar después `cal.top`/`cal.bottom` contra esa verdad. Con 18/18 puntos dio un error de 0,0005.
- **Ojo:** sin GPU (SwiftShader), leer un cuadro de la cámara tarda segundos. En una PC real son milisegundos y la sincronización de 18 puntos ronda los 10 s.

---

## 7. Detalles técnicos que conviene saber

- **Coordenadas:**
  - `cal.top`/`cal.bottom`/`cal.center` están en fracción de la imagen **cruda** de la cámara, sin espejo. Las zonas calibradas usan `mirror=false`.
  - La detección usa `flipHorizontal:false`.
  - En GL, la `v` del lienzo es `1 - v_uv.y`.
  - Las texturas de video se suben con `UNPACK_FLIP_Y`.
- **`tf-core.min.js` no trae operaciones encadenadas:** usar `tf.slice(t,…)`, `tf.div(…)`, no `t.slice()`.
- **El detector es uno solo, compartido y sin tracker interno.** Las ids estables las pone `trackPoses`. Se rehace si cambia `P.det.res`.
- **Mientras sincroniza:**
  - `Sync.running` pausa la detección;
  - `body.syncing` oculta el panel, los avisos y las capas, porque todo lo de la ventana se proyecta;
  - la cámara pasa a exposición y balance manuales si `getCapabilities` lo permite.
- **El modo "real" de tamaño** usa `horizonFit`: alto de la pared en la imagen ≈ k·(y_base − y_h). Necesita paredes a distintas profundidades. Si toda la proyección queda sobre una sola pared, no ajusta y cae a "cámara".
- **El punto de la cámara en el piso** (`_calC`) sale, en este orden, de:
  1. las verticales medidas al sincronizar (`verticalVP`);
  2. el horizonte con un ángulo de webcam de ~75°;
  3. el punto manual de la vista K.

  Con un punto equivocado, los cuerpos se corren a los costados.
- **Sesiones:**
  - `version:3`;
  - las sesiones viejas abren con `maxPoses=1`;
  - las que no traen `view`/`color` vuelven a valores neutros;
  - `cal` se guarda por zona, con `synced`, `size`, `scale`, `dx`, `spread`, `centerAuto`.
- **Commits:** sin identificadores de modelo en los mensajes. Hacer commit y push a `main` de Mirador y copiar a la otra rama, con `git archive HEAD | tar -x -C …/mirador`.

---

## 8. Preguntas abiertas para Julián

1. ¿Qué splitter o procesador es? ¿Corta en grilla fija (4 × 4 de 1920 × 1080) o con ventanas a medida?
2. ¿Qué salida del splitter va a cada proyector, y qué cubre cada uno: qué pared y qué parte?
3. ¿Los 7 proyectores ya están todos colgados y apuntados, o por ahora hay solo algunos? En la foto se veía uno sobre la pared norte.
4. ¿La cámara ve las tres paredes completas desde su lugar definitivo?

## Dos ventanas (13/11/2026)

- `js/salida.js`: la ventana de control corre todo y la de **SALIDA** (título "Mirador · SALIDA") muestra solo la imagen. La imagen pasa por `glCanvas.captureStream(60)`; si no hay, se copia cuadro a cuadro. Las teclas de la salida se reenvían al control.
- `?ventanas=2` la abre al encender, dentro del clic en *Encender*. `start_sala.bat` ya no usa kiosk: pone `MIRADOR_VENTANAS=2`, que suma `--disable-popup-blocking --start-maximized`.
- **En OBS hay que cambiar la fuente** a la ventana "Mirador · SALIDA". Antes capturaba la única ventana, con el panel incluido.

### Prueba en la sala del 13/11/2026 (dos ventanas por toda la cadena)

- **Ojo con las copias:** el repo es `C:\Mirador`. Había otra copia corriendo desde `Downloads\Mirador final\Mirador` (como administrador, mismo puerto 8766, otro perfil de Chrome sin la sesión Sala). Hay que abrir siempre `C:\Mirador\start_sala.bat`.
- **La SALIDA quedaba en negro:** con el lienzo de 8400 px, el video de `captureStream` trae cuadros pero la ventana no los muestra. `js/salida.js` ahora copia cuadro a cuadro cuando el lienzo pasa de 4096 px (`Salida.STREAM_MAX`); el límite exacto no se midió.
- **OBS** (perfil y escena **Mirador**; el lienzo del perfil está en **8400 × 690**, no 1920 × 1080): la captura apunta a `[chrome.exe]: Mirador · SALIDA`, método **Windows 10**, sin cursor, estirada con Ctrl+S y con **31 px de recorte arriba** (la ventana emergente de Chrome dibuja su barra de título dentro del área capturada). Si cambia el alto de esa barra, hay que retocar el recorte. La escena "umbral" no se tocó.
- **Resolume:** estaba abierta una composición vacía de 1920 × 1080. Hay que abrir **Mirador sala** y disparar el clip NDI de la **columna 2** de la capa 2 (**OBS PGM**, 8400 × 690, sin escala). El de la columna 1 (OBS Preview, Scale 156,72 % / W 437,5 % / H 63,89 %) quedó de cuando OBS mandaba 1920 × 1080 y ahora muestra solo la pared Norte ampliada.
- **Pantallas hoy:** operación 1366 × 768 y salida al splitter 2048 × 1080 (antes figuraban 1920 × 1080 y 4096 × 2160). La ventana de SALIDA mide 1584 × 861: el lienzo viaja con ~1584 px de ancho hasta OBS.
- **Patrón de ajuste visto con la cámara:** OESTE, NORTE y ESTE caen cada una en su pared.
- **Sincronización** (grilla 5 × 3): con 900 ms → Oeste 9/15, Norte 13/15, Este 8/15; con 1400 ms → Oeste 11/15, Norte 11/15, Este 8/15, error ≤ 3,3 px de cámara. Subir la espera no cambia el resultado: los puntos que faltan son la primera columna de Oeste y las dos últimas de Este (fuera de cuadro o sin luz, como el 10/11) y puntos de la fila de abajo tapados por las sillas y el pedestal. Había sillas en la sala y entraba luz por la ventana de arriba a la derecha. Las líneas nuevas coinciden con las del 10/11 y con los bordes reales de las paredes; con S la cámara superpuesta coincide.
- **Detección:** `sources[0]._diag.ms` = 26–50 ms (mediana 37) con 2 partes y la sala vacía. No hizo falta bajar la exigencia. Falta medir con bailarines.
- **Con personas (tecla E), 2 y después 3 frente a la pared Norte:** cada figura cae en la pared detrás de su cuerpo. Medido con la cámara (proyección menos negro): corrimiento horizontal de −33 a +16 px de cámara, sin signo fijo (se movían y la cadena demora ~1 s); los pies apoyan en la base de la pared y la figura mide 48–62 % del alto de la pared (tamaño "altura real"). **El ajuste fino quedó en neutro** (tamaño 1, correr 0, separación 1, altura 0,97): no hizo falta tocarlo. `_diag.ms` = 24–32 ms con 3 cuerpos.
- **Esqueleto opcional en todas las plantillas:** `P.track.skelMode` = `plantilla` (lo que diga la plantilla) | `si` | `no`. Se elige arriba en la pestaña **Plantillas** y en **Módulos → esqueleto**; no cambia al elegir otra plantilla y se guarda en la sesión. La tecla E lo sigue mostrando encima de todo. Probado en un Chrome aparte (lógica, panel y sesiones); el Mirador de la sala lo toma recién al recargar.
- **Si se apaga el splitter:** Resolume pierde la ventana "Display". Al volver, *Output → Advanced…* (Screen 9 tiene que decir DISPLAY1 4096×2160) y cerrar sin tocar nada la vuelve a crear.
- **Pendiente:** probar con gente frente a Oeste y Este (todos estuvieron en Norte) y con 10 personas. Las sillas de la derecha a veces se detectan como cuerpo en la pared Este.

