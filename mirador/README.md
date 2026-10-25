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
│   └── movenet/               Modelo MoveNet (se baja con descargar_modelo.*)
├── canciones/                 Dejá acá los mp3/wav: se listan solos (no van al repositorio)
├── presentacion-scramble.html Diapositivas (logos / artistas / cuenta regresiva) → arranca una performance
├── secuencia.js               La secuencia de las diapositivas (antes presets.js)
├── start_mac.command · start_windows.bat · start_13440.bat   Lanzadores
├── descargar_modelo.sh / .bat Baja el modelo para usar sin internet
├── REVISION.md                Qué podía fallar en el programa anterior y cómo quedó
├── PLANTILLAS.md              Obras de referencia de cada estética, con enlaces
└── legado/                    El HTML original (Cuerpo / Señal, entrega 1), solo de consulta
```

## Puesta en marcha

### Mac (MacBook Air, pruebas)

1. Una vez: `./descargar_modelo.sh` con internet (opcional: si hay internet el modelo se baja solo y queda en caché del navegador).
2. Doble clic en **`start_mac.command`** (la primera vez: clic derecho → Abrir). Abre Chrome en `http://127.0.0.1:8765`.
3. En la puerta: elegí **sesión** (o escribí un nombre nuevo), **formato** (para ensayar la sala: `13440 × 1080`, se ve a escala) y **audio**. **Encender**, o **Probar sin cámara** para ver las estéticas con cuerpos simulados.

Permisos: la primera vez Chrome pide cámara y micrófono. Si la cámara no aparece, revisá Ajustes del Sistema → Privacidad y seguridad → Cámara → Google Chrome.

### Windows (PC de la sala, RTX 3070 Ti)

1. Python 3 (`winget install Python.Python.3.12`) y Chrome o Edge.
2. Una vez con internet: **`descargar_modelo.bat`**.
3. Pruebas: **`start_windows.bat`**. Sala: **`start_13440.bat`** (ver abajo).

Sin internet en la sala el programa arranca igual: las librerías están en `vendor/` y el modelo en `vendor/movenet/`. Si falta el modelo y no hay internet, avisa y arranca en **simulación** para que al menos puedas probar imagen y proyección.

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

## 7 proyectores Full HD (13440 × 1080)

**Lo que la computadora puede y no puede.** Una RTX 3070 Ti tiene 4 salidas (3 DisplayPort + 1 HDMI) y maneja **4 pantallas** simultáneas. Para 7 proyectores hay tres caminos:

1. **Procesador de video wall / splitters** (Datapath Fx4 ×2, Matrox QuadHead2Go ×2, o un procesador que acepte 13440×1080 o 2× 6720×1080): Windows ve una o dos pantallas grandes. Es lo más confiable.
2. **Segunda placa de video** y escritorio extendido con 7 pantallas en fila (Windows lo permite; NVIDIA Surround en GeForce solo une 3).
3. **Dos computadoras** (3 + 4 proyectores) corriendo Mirador cada una con la misma sesión, cámaras propias, y las dos recibiendo la misma música por micrófono. Más simple de lo que suena si la coreografía no cruza el borde entre las dos mitades.

**Cómo abrir la imagen entera.** `start_13440.bat` abre una ventana sin bordes de 13440 × 1080 en la esquina 0,0, que cruza todas las pantallas del escritorio extendido (los proyectores tienen que estar ordenados de izquierda a derecha en Configuración de pantalla de Windows, todos a 1920 × 1080 y **escala 100 %**). Si Windows ve una sola pantalla de 13440 × 1080 (caso 1), cambiá en el .bat a `MIRADOR_KIOSK=1`. Si el primer proyector tiene 40 px extra como en tu montaje anterior, usá `13480x1080`.

**Alineación.** Proyección → *Proyectores = 7* y *patrón de ajuste*: cada franja muestra su número y un círculo para ver deformaciones; *fundido de bordes* suaviza solapes. Las esquinas (tecla C) corrigen un keystone global; para keystone por proyector usá el ajuste del propio proyector o el procesador.

**Cámaras y zonas.** Con una cámara, la zona es toda la pared (la cámara se ve "contenida": a 13440 × 1080 una cámara 16:9 ocupa el centro con bandas a los lados; para cubrir todo el ancho con una sola cámara, en Cámaras → disposición *a mano* podés estirar la zona, o aceptar las bandas y usar módulos que no dependan del video). Cuando sumes cámaras, cada una toma una columna: dos cámaras = dos mitades, tres = tres tercios, o rectángulos a mano. MoveNet pierde cuerpos chicos: conviene **una cámara cada 2–3 proyectores**.

**Luz.** La cámara tiene que ver a los bailarines, no a la proyección. En sala oscura la solución estándar es **luz infrarroja**: focos IR (850 nm) y una cámara sin filtro IR (o una cámara de seguridad USB "IR"); el público no la ve y el proyector no la contamina. La silueta por defecto se arma desde el esqueleto justamente para no depender del brillo de la imagen.

## OBS

- **Capturar**: en OBS, *Captura de ventana* de Chrome con método *Windows 10 (1903 y posterior)*, o *Captura de pantalla* del monitor. Chrome se abre con banderas para que siga pintando aunque esté tapado.
- **Resolución**: NVENC H.264 acepta hasta 4096 px de ancho y HEVC/AV1 hasta 8192: **13440 no se puede codificar por hardware**. Opciones: lienzo de OBS 13440 × 1080 y *resolución de salida* 6720 × 540 (HEVC) o 3840 × 309 (H.264); o dos escenas de 6720 × 1080; o x264 por CPU (pesado). Para documentación de la obra, 3840 de ancho sobra.
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
