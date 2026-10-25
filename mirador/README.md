# Mirador

Suite de proyección en vivo para cuerpos en movimiento. La cámara sigue hasta seis bailarines por zona (MoveNet en el navegador, sin nube) y la imagen se arma con módulos que se combinan: silueta, enjambre de partículas, garabato, lluvia de letras, pintura, grilla, cortinas, cenizas, niebla, ecos y bloom. Pensado para una **sala inmersiva de 7 proyectores Full HD (13440 × 1080)**, grabación con OBS y **reacción al audio** (micrófono o canción).

Corre en Chrome/Edge sobre WebGL, sin instalar nada más que Python para servir la carpeta. Probado en MacBook Air (Apple Silicon) y pensado para una PC con RTX 3070 Ti.

```
cámara(s) ──► MoveNet (TF.js WebGL) ──► cuerpos (esqueleto 2D por zona)
                                            │
   micrófono / canción ──► análisis ──► AM  │  módulos 2D (canvas) + módulos GL (puntos, silueta)
                                            ▼
                      escena ──► ecos ──► bloom ──► composición ──► homografía ──► salida 13440×1080
```

## Carpeta

```
mirador/
├── index.html                 Programa (puerta de entrada + panel + salida)
├── css/mirador.css
├── js/
│   ├── core.js                Parámetros (P), WebGL, shaders, formato de salida, resize
│   ├── tracking.js            Zonas de cámara, MoveNet por cámara, cuerpos, simulador sin cámara
│   ├── modules.js             Módulos visuales y productores (máscara GPU / CPU)
│   ├── render.js              Capa 2D → GL → ecos → bloom → salida · escalador · perfiles · grabación
│   ├── audio.js               Micrófono / canción, bandas, golpe, multiplicadores AM · playlist
│   ├── plantillas.js          Estéticas (ver PLANTILLAS.md)
│   ├── sessions.js            Sesiones con nombre (parámetros + canciones + cámaras + formato)
│   ├── screens.js             Opción B: una ventana por pantalla (Window Management API)
│   ├── ui.js                  Panel lateral con pestañas
│   └── main.js                Arranque, bucle, teclado, integración con las diapositivas
├── vendor/                    TF.js + pose-detection copiados (funciona sin CDN)
│   └── movenet/               Modelo MoveNet incluido (multipose + singlepose), ~14 MB
├── canciones/                 Dejá acá los mp3/wav: se listan solos (no van al repositorio)
├── presentacion-scramble.html Diapositivas (logos / artistas / cuenta regresiva) → arranca una performance
├── secuencia.js               La secuencia de las diapositivas (antes presets.js)
├── start_mac.command · start_windows.bat · start_8k.bat · start_13440.bat   Lanzadores
├── descargar_modelo.sh / .bat Reemplaza el modelo por la copia oficial de tfhub (opcional)
├── REVISION.md                Qué podía fallar en el programa anterior y cómo quedó
├── PLANTILLAS.md              Obras de referencia de cada estética, con enlaces
└── legado/                    El HTML original (Cuerpo / Señal, entrega 1), solo de consulta
```

## Puesta en marcha

### Mac (MacBook Air, pruebas)

1. Doble clic en **`start_mac.command`** (la primera vez: clic derecho → Abrir). Abre Chrome en `http://127.0.0.1:8765`.
2. En la puerta: elegí **sesión** (o escribí un nombre nuevo), **formato** (para ensayar la sala: `13440 × 1080`, se ve a escala) y **audio**. **Encender**, o **Probar sin cámara** para ver las estéticas con cuerpos simulados.

Permisos: la primera vez Chrome pide cámara y micrófono. Si la cámara no aparece, revisá Ajustes del Sistema → Privacidad y seguridad → Cámara → Google Chrome.

### Windows (PC de la sala, RTX 3070 Ti)

1. Python 3 (`winget install Python.Python.3.12`) y Chrome o Edge.
2. Pruebas: **`start_windows.bat`**. Sala con salida 8K y splitter: **`start_8k.bat`** (ver abajo).

Sin internet en la sala el programa arranca igual: las librerías **y el modelo MoveNet** vienen en `vendor/` (ver `vendor/movenet/LEEME.md`; `descargar_modelo.*` lo reemplaza por la copia oficial de tfhub si querés). Si algo falla con TensorFlow, avisa y arranca en **simulación** para que al menos puedas probar imagen y proyección.

## El panel (tecla H)

| Pestaña | Qué tiene |
|---|---|
| **Sesión** | Nombre, guardar/duplicar/exportar/importar, notas; lista de sesiones; **canciones de la sesión** (agregar archivos, carpeta `canciones/`, orden, reproducir). |
| **Plantillas** | 12 estéticas con tecla rápida (1‑9, 0). Se aplican encima y después se ajustan. |
| **Módulos** | Cada módulo con su interruptor, descripción y controles; esqueleto y enlaces; **fuente de la silueta** (esqueleto / brillo / fondo); ecos; posproceso. |
| **Cámaras** | Zonas (hasta 4 cámaras), disposición (columnas / filas / a mano), espejo por zona, video en la imagen, detección (confianza, suavizado, cuerpos máx.). |
| **Audio** | Fuente (apagado / micrófono / canción), micrófono, ganancia, suavizado, medidores en vivo, tempo estimado, y **qué mueve la música** (tamaño ← graves, bloom y destello ← golpe, color ← agudos, ecos ← nivel…). |
| **Proyección** | Formato de salida, cantidad de proyectores y fundido de bordes, patrón de ajuste con franjas numeradas, negro, esquinas (keystone), pantalla completa, opción B por ventanas, **grabación**. |
| **Sistema** | Perfil de rendimiento, fps mínimo, adaptación automática, resolución interna y de la capa 2D, densidad de puntos, inferencia, diagnóstico y teclas. |

Todo lo que tocás se autoguarda en la sesión actual. **Exportá la sesión** (.json) para llevarla de la Mac a la PC; las canciones no viajan dentro del .json: copiá los archivos a `canciones/` en la otra máquina y se vuelven a enlazar por nombre.

### Teclas

`H` panel · `F` pantalla completa · `C` mover esquinas · `B` negro · `Shift+B` aprender fondo · `X` limpiar ecos · `V` rotar cámaras · `R` grabar/parar · `M` micrófono sí/no · `Espacio` canción play/pausa · `↑/↓` canción anterior/siguiente · `1‑9, 0` plantillas · `G/L` exportar/importar sesión · `Esc`/`⌫` diapositivas.

## Las dos versiones de audio

Es el mismo programa con la fuente de audio elegida en la puerta (o `?audio=mic` / `?audio=cancion` en la URL; `start_13440.bat` arranca con micrófono):

- **Micrófono**: reacciona a la música de la sala. El programa **no** reproduce ese audio (para no acoplar). Para que tome bien la música, usá una entrada de línea desde la consola o un micrófono cerca del parlante; en la pestaña Audio podés elegir el dispositivo y la ganancia.
- **Canción**: reproduce las canciones de la sesión y reacciona a eso. Los medidores de la pestaña Audio muestran lo que "escucha".

Con la tecla `M` alternás el micrófono en cualquier momento. Si una plantilla queda demasiado nerviosa, bajá "Qué mueve la música" o usá el botón *Reacción suave*.

## 7 proyectores Full HD con una salida 8K y un splitter

El montaje previsto: **una sola salida de video 8K (7680 × 4320) de la RTX 3070 Ti a un splitter** que recorta 7 ventanas Full HD, una por proyector. Para eso Mirador tiene el modo **mosaico** (Proyección → *Salida 8K a splitter*, o `start_8k.bat`):

1. El programa compone el panorama de la sala, **13440 × 1080** (7 franjas de 1920 × 1080).
2. En la salida, cada franja se coloca en una **baldosa** del cuadro 8K. Por defecto: franjas 1‑4 en la fila de arriba (y = 0) y 5‑7 en la segunda (y = 1080), de izquierda a derecha. El resto del cuadro queda negro.
3. El splitter recorta sus 7 salidas exactamente en esas coordenadas. Si tu splitter usa otra disposición (otro orden, otra fila, centrado), se escribe en *mapa a mano* (una línea `x,y` por franja) y queda guardada en la sesión. Con el **patrón de ajuste** cada baldosa muestra su número y un círculo para comprobar que llega al proyector correcto y sin deformación.

Windows: la pantalla 8K a **7680 × 4320, escala 100 %**, 60 Hz con DSC (HDMI 2.1 o DisplayPort 1.4a de la 3070 Ti) o 30 Hz si el splitter no acepta DSC. Chrome se abre en kiosk sobre esa pantalla y el canvas del programa es exactamente 7680 × 4320. Alternativas que también resuelve el mismo modo: cuadro 7680 × 2160 (si el splitter trabaja en "8K ancho"), o 3840 × 2160 con 2×2 baldosas para un splitter 4K → 4 Full HD.

A tener en cuenta con el splitter:

- Verificá si acepta 8K a 60 Hz o solo a 30 Hz, y si fuerza submuestreo de color 4:2:0 (los bordes de las letras y las líneas finas se ven más blandos; en ese caso subí *grosor* en los módulos de línea).
- Los splitters agregan latencia (1 cuadro o más); con la música por micrófono no se nota, con la cámara sí un poco. No afecta al programa.
- Para ver qué llega, *ver panorama* en el mismo grupo muestra la imagen seguida (lo que ve el público) en lugar del mosaico (lo que recibe el splitter).

Si en algún momento no hay splitter: `start_13440.bat` abre una ventana de 13440 × 1080 que cruza un escritorio extendido (recordá que la 3070 Ti sola saca 4 pantallas), y la opción B de Proyección reparte por ventanas.

**Alineación.** Las esquinas (tecla C) corrigen un keystone global del panorama antes de cortarlo; para keystone por proyector usá el ajuste del propio proyector o del splitter. *Fundido de bordes* suaviza solapes entre franjas.

**Cámaras y zonas.** Con una cámara, la zona es toda la pared (la cámara se ve "contenida": a 13440 × 1080 una cámara 16:9 ocupa el centro con bandas a los lados; para cubrir todo el ancho con una sola cámara, en Cámaras → disposición *a mano* podés estirar la zona, o aceptar las bandas y usar módulos que no dependan del video). Cuando sumes cámaras, cada una toma una columna: dos cámaras = dos mitades, tres = tres tercios, o rectángulos a mano. MoveNet pierde cuerpos chicos: conviene **una cámara cada 2–3 proyectores**.

**Luz.** La cámara tiene que ver a los bailarines, no a la proyección. En sala oscura la solución estándar es **luz infrarroja**: focos IR (850 nm) y una cámara sin filtro IR (o una cámara de seguridad USB "IR"); el público no la ve y el proyector no la contamina. La silueta por defecto se arma desde el esqueleto justamente para no depender del brillo de la imagen.

## OBS

- **Capturar**: en OBS, *Captura de ventana* de Chrome con método *Windows 10 (1903 y posterior)*, o *Captura de pantalla* del monitor. Chrome se abre con banderas para que siga pintando aunque esté tapado.
- **Resolución**: con el modo mosaico la pantalla es 7680 × 4320, que NVENC HEVC/AV1 sí codifica (8192 máx.; H.264 solo hasta 4096). Grabar el mosaico tal cual documenta lo que recibe el splitter, no lo que ve el público. Para una grabación "de público" conviene la grabación interna (tecla R) con *ver panorama* activado, o capturar en OBS una segunda instancia/ventana con el panorama. 13440 px de ancho no se codifican por hardware en ningún caso.
- **Alternativa sin OBS**: tecla `R` graba desde el navegador a `.webm` (VP9) con el audio activo, reescalado a 1920 o 3840 de ancho (Proyección → Grabación). Es liviano y no pierde cuadros por foco de ventana.
- **Volver a proyectar**: lo más fiel no es el video sino la **sesión**: guardá la sesión y la canción y volvé a correr el programa.

## Liviano, en la Mac y en la PC

- El perfil se mide al arrancar (4 s) y se adapta solo: si los fps bajan del mínimo, primero baja la **capa 2D**, después la resolución interna, los puntos, el bloom… y los recupera cuando sobra margen. Todo se ve y se cambia en Sistema.
- Lo más pesado en 13440 px es la capa 2D (enjambre, garabato, lluvia, pintura, grilla, cortinas) porque se sube a la GPU cada cuadro; la silueta, los puntos, los ecos y el bloom son GL puro. Para la 3070 Ti, perfil *Completo* con capa 2D en 0.8 anda a 60 fps con 2–3 módulos; para la Mac, *Equilibrado* y formato 1920 × 1080 para ensayar.
- Inferencia: MultiPose Lightning ~12–20 ms por cámara en la 3070 Ti, ~25–40 ms en la Mac. Con 3 cámaras bajá *inferencia* a 20 Hz y *cuerpos máx.* a 3.

## Diapositivas (presentación)

`presentacion-scramble.html` sigue siendo la pantalla entre performances (logos, artistas, cuenta regresiva). Al llegar a un paso `performance`, manda a Mirador `start-performance` con `audio`, `escena` (acepta los nombres viejos: `enjambre`, `niebla`, `lineas`, `garabato`, `empuje`) y opcionalmente `sesion` (nombre de una sesión guardada). `Esc`/`⌫` vuelve a las diapositivas. La secuencia se edita en `secuencia.js`.

## Créditos

Motor y módulos originales: *Cuerpo / Señal* (entrega 1). Enjambre basado en *particle-swarm-pose*. Referencias de cada estética en `PLANTILLAS.md`. TensorFlow.js y MoveNet: Apache 2.0 (ver `vendor/LICENSE-*`).
