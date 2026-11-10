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

### Supuesto sin confirmar (probable causa del problema actual)

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
