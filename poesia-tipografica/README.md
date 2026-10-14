# Poesía Tipográfica

Instalación interactiva para proyección mural. Una persona lee poemas frente a un micrófono; cada letra pronunciada
nace en la pared en el instante en que se dice y, verso a verso, las mismas letras se reorganizan en **caligramas
vivos** (una luna, un ojo, un árbol dibujados con el verso recorriendo su contorno y un *halftone* tipográfico en su
volumen) o en **composiciones simbólicas** herederas de Camille Utterback (*Text Rain*), Rafael Lozano-Hemmer
(*Subtitled Public*), Charles Sandison y Jeffrey Shaw.

```
 micrófono ─► server.py ──────────── ws://localhost:8765 ─────────────► Three.js (kiosk)
               │ AudioEngine   RMS + FFT cada 10 ms ─────── audio_reactive ─► temblor / eje Z / escala (shader)
               │ Realtime      OpenAI (sólo transcripción) ─ word_delta ─────► letras nacen en el subtítulo
               │                                            verse_completed ─► el verso se libera al campo
               └ ArtDirector   Ollama → DeepSeek → heurística art_direction ─► caligrama / física / paleta
```

## Estructura

```
poesia-tipografica/
├── server.py             Backend: audio, OpenAI Realtime, director de arte (LLM), WebSocket local
├── requirements.txt
├── .env.example          Toda la configuración del backend
├── package.json          Vite + Three.js + fuentes empaquetadas (funciona sin internet)
├── vite.config.js
├── index.html
├── start_mac.command     Arranque completo en macOS (doble clic)
├── start_instalacion.bat Arranque completo en Windows (backend + frontend + Chrome kiosk)
├── reproyectar.bat      Re-proyección de una sesión grabada (también reproyectar_mac.command)
├── public/loop/          Imágenes del loop (flat.png) y public/loop/sponsors/ (todos los logos)
└── src/
    ├── main.js           Escena, cámara orbital, bucle, conexión al backend, simulador, teclado
    ├── show.js           Estados de la noche: loop → artista → poema / palabras
    ├── configPanel.js    Panel C: atajos, micrófono + vúmetro, artistas, loop, prompt, estética
    ├── pointCloud.js     Nube de puntos estilo TouchDesigner (morph en GPU)
    ├── logos.js          Grilla de logos adaptativa (limpieza de fondo, monocromo, paginación)
    ├── shaders.js        GLSL de glifos instanciados (reactividad acústica) + pase de grano/aberración
    ├── glyphAtlas.js     Atlas tipográfico dinámico en Canvas 2D (Cormorant Garamond + IBM Plex Mono)
    ├── typeField.js      Motor de partículas: 12 000 letras, 1 draw call, 4 físicas, caligramas, subtítulo vivo
    ├── svgSampler.js     SVG path → máscara 512² → luz volumétrica → puntos de contorno (con tangente) e interior
    ├── shapeLibrary.js   20 figuras de respaldo (luna, ojo, pájaro, árbol, mano…)
    ├── localDirector.js  Director heurístico en el navegador + normalización del contrato art_direction
    ├── debugPanel.js     Panel de calibración (tecla D)
    ├── postfx.js         UnrealBloom contenido + grano + aberración cromática
    ├── socket.js         WebSocket con reconexión
    └── style.css
```

## Puesta en marcha en Mac (MacBook Air, Apple Silicon)

Una sola vez, en Terminal:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"   # si no tienes Homebrew
brew install python@3.12 node
brew install ollama            # opcional: director de arte local (Metal, muy rápido en chips M)
brew install --cask google-chrome   # si no tienes Chrome
git clone -b claude/lucid-goldberg-asyjj8 https://github.com/JulianMicicdeRosas/JulianMicicdeRosas.git ~/umbral   # fuera del Escritorio/iCloud
```

Después, cada noche: **doble clic en `poesia-tipografica/start_mac.command`** (la primera vez: clic derecho →
Abrir, porque macOS bloquea scripts descargados). El script:

1. crea `.venv`, instala dependencias y compila el frontend si hace falta;
2. la primera vez **pide la clave de OpenAI** (sin mostrarla) y la guarda en el **Llavero de macOS**, fuera de la
   carpeta: actualizar o volver a descargar el proyecto no la borra. También se puede pegar o cambiar en el
   **panel C → Clave de OpenAI** (si falta, el panel se abre solo);
3. arranca Ollama y descarga el modelo si falta (`OLLAMA_MODEL`, por defecto `qwen2.5:7b`; con 8 GB de RAM
   usar `qwen2.5:3b`);
4. arranca backend y frontend, **impide que la Mac se duerma** (`caffeinate`) y abre Chrome en kiosk;
5. al cerrar la ventana de Terminal se apaga todo. Logs en `logs/`.

Notas de macOS:

- **Permiso de micrófono**: la primera vez macOS pregunta si Terminal puede usar el micrófono → Permitir. Si se
  negó, macOS no da error: entrega silencio. El panel C lo detecta («silencio absoluto») y dice dónde activarlo:
  Ajustes del Sistema → Privacidad y seguridad → Micrófono → Terminal.
- **Proyector**: Chrome kiosk se abre en la pantalla principal. En Ajustes del Sistema → Pantallas, marca el
  proyector como pantalla principal (o usa duplicar). Conviene cerrar la tapa sólo con cargador conectado.
- **Rendimiento**: la MacBook Air no tiene ventilador; tras horas de show baja la frecuencia por temperatura. La
  app tiene **calidad adaptativa**: si los FPS bajan de 48 reduce resolución interna y cantidad de puntos, y los
  recupera cuando sobra margen (se ve en el panel D, «calidad»). En Mac la resolución interna se limita a 1.25×
  (Retina) para no calentar de más. Recomendado: enchufada, modo de bajo consumo apagado.
- Micrófonos USB o interfaces de audio aparecen en el panel C (host «Core Audio»). Si el dispositivo no acepta
  24 kHz, el backend lo abre a 48 kHz y remuestrea solo.

### Si no transcribe (problemas frecuentes)

Doble clic en **`diagnostico_mac.command`** (en Windows: `.venv\Scripts\python server.py --check`). Prueba la
clave contra OpenAI, graba 2 s del micrófono y dice qué falla. En los paneles D y C también se ve el motivo.

| Síntoma | Causa | Solución |
| --- | --- | --- |
| micrófono: `silencio` | macOS no dio permiso a Terminal (entrega ceros, no error) | Ajustes del Sistema → Privacidad y seguridad → Micrófono → activar Terminal; cerrar Terminal con Cmd+Q y reabrir. Si no aparece: `tccutil reset Microphone com.apple.Terminal` |
| openai: `error — clave rechazada (401)` | clave inválida o revocada | crear otra en platform.openai.com/api-keys y reemplazarla en `.env` |
| openai: `error — … (429)` / `insufficient_quota` | sin saldo | cargar crédito en Billing |
| openai: `error — unknown_parameter …` | variante de API no aceptada | automático: el backend prueba la otra (`OPENAI_REALTIME_API=auto`) |
| openai: `error — model_not_found` | modelo no habilitado en la cuenta | `TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe` en `.env` |

## Puesta en marcha (Windows 10/11)

Lo más simple: descomprimir el ZIP y hacer doble clic en **`start_instalacion.bat`**. Si faltan Python o Node.js
los instala con winget (luego pide cerrar y volver a abrirlo); después prepara todo, compila y abre Chrome en kiosk.
La clave de OpenAI se pega en el panel C (tecla C) y queda fuera del programa. El logo de FLAT se copia solo desde
Descargas (`FLAT-Logo*.png`). Si algo falla: **`diagnostico_windows.bat`**.

Requisitos (manual): Python 3.10+, Node.js 18+, Google Chrome, y opcionalmente [Ollama](https://ollama.com).

```bat
copy .env.example .env          :: opcional: el arranque lo crea solo. La clave se pega en el panel C
py -3 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python server.py --list-devices   :: elegir el micrófono → AUDIO_DEVICE en .env

ollama pull qwen2.5:7b          :: o llama3.1:8b (OLLAMA_MODEL en .env)

npm install
npm run dev                     :: desarrollo: http://127.0.0.1:5173
```

Producción: `start_instalacion.bat` compila el frontend, abre el backend minimizado y lanza Chrome en
`--kiosk` contra `http://127.0.0.1:5173/`. Para la sala:

- Windows: desactivar suspensión de pantalla, notificaciones y "mejoras de audio" del micrófono (Configuración →
  Sonido → Propiedades del dispositivo). El supresor de ruido de Windows recorta las colas de los versos.
- Proyector: modo de imagen sin "realce dinámico de negros". El fondo es `#000000` y el grano/aberración están
  anclados a la luz: un píxel negro sale exactamente negro, el rectángulo del proyector desaparece.
- GPU: con una gráfica dedicada se sostienen 60 FPS con 12 000–15 000 glifos. En integradas, `?pool=8000&dpr=1`.

### Equipo de prueba: RTX 3070 Ti + Focusrite Scarlett 18i20 (2.ª gen.)

**Placa de video.** El lanzador abre Chrome forzando la GPU de alto rendimiento. Si el equipo también tiene video
integrado, conviene fijarlo a mano: Configuración de Windows → Sistema → Pantalla → Gráficos → Chrome → «Alto
rendimiento» (o Panel de control de NVIDIA → Programas → Chrome → «Procesador NVIDIA de alto rendimiento»). Con una
3070 Ti la calidad adaptativa queda siempre en «alta»; si se quiere más densidad: `http://127.0.0.1:5173/?pool=16000`.
En el Panel de NVIDIA, «Sincronización vertical: activada» para Chrome evita cortes en el proyector.

**Placa de audio.** Instalar el driver de Focusrite (Focusrite Control) y fijar la frecuencia en **48 kHz** (el
programa remuestrea a 24 kHz). En Windows la placa aparece varias veces (MME, DirectSound, WASAPI, WDM-KS) y, según
el driver, como pares de entradas («Analogue 1 + 2», «Analogue 3 + 4»…) o como un único dispositivo de 18 entradas.
En el panel C → Micrófono:

1. Elegir el dispositivo Focusrite del tipo **MME** o **Windows WASAPI** (WDM-KS suele fallar).
2. En **«Entrada de la placa»** elegir dónde está el micrófono: en «Analogue 3 + 4» la entrada 1 es la 3 de la placa
   y la 2 es la 4; en el dispositivo de 18 entradas es el número directo.
3. Hablar y mirar el vúmetro. `diagnostico_windows.bat` graba todas las entradas a la vez y muestra el nivel de cada una
   (con una flecha en la elegida): sirve para encontrar en qué entrada está la voz.

Micrófono de condensador: activar **48V** en la placa. Ganancia: que la voz normal pique entre −18 y −10 dBFS; sin
«Air» ni «Inst». Desactivar en Windows las «mejoras de audio» de la Focusrite. También se puede fijar en `.env`:
`AUDIO_DEVICE=Focusrite` y `AUDIO_CHANNEL=1`.

## Formato de salida

Panel C → **Formato de salida**: 1822 × 737 (por defecto, la pantalla del FLAT), 1920 × 1080, pantalla completa u
otro («ancho x alto»). Con formato fijo todo se compone para esa proporción y se centra en la ventana; lo que sobra
queda negro. El muro de palabras, el título, los nombres y la transcripción quedan centrados en el cuadro.

## Forma de las ilustraciones

Panel C → Grilla de texto. La imagen se arma en tres pasos: **fuente → tonos → tratamiento**, y se compone con las
letras del muro: cada letra se enciende según el tono de la imagen en su lugar (no sólo prendida / apagada).

**Forma (fuente)** — «Ver el prompt exacto que se envía» muestra el pedido completo al LLM:

| Forma | Qué pide al LLM | Cómo se ve |
| --- | --- | --- |
| **Dibujada por el LLM** (por defecto, formato «Composición») | una composición levemente abstracta de 12–40 elementos con tono: manchas, anillos, arcos, trazos, polígonos y vacíos | el programa la dibuja en grises y le aplica el tratamiento |
| **Silueta de emoji** | el concepto y un emoji | se calca la silueta del emoji y pasa por el tratamiento (más literal) |
| **Letras transcriptas** | arte ASCII de 30 × 64 sólo con las letras de lo dicho | se muestra tal cual, letra por letra (sin tratamiento) |

**Tratamiento** (cómo se dibuja con las letras): *Variado* (cambia en cada imagen) o fijo, o que lo elija el LLM:

- **Topografía**: curvas de nivel de la forma — el borde en el rosa de la marca, anillos interiores que siguen las
  capas y dos o tres ondas hacia afuera. La figura emerge de líneas concéntricas.
- **Luz y grano**: todas las letras de la forma, con brillo según la profundidad (núcleo pleno, borde que se apaga),
  grano y un halo tenue.
- **Erosión**: la forma se deshace por el borde, se agrieta y suelta restos hacia un lado (como ceniza al viento).
- **Eco**: la forma repetida en ecos que se desvanecen, con bandas desplazadas (tiempo, movimiento).
- **Silueta**: la forma plena con sus grises y el borde de las masas en acento.

Todo es determinista: la misma estrofa produce la misma imagen (la re-proyección es idéntica). El muro tiene 40 filas
(resolución de la imagen) y el programa usa 18 000 letras (`?pool=` para cambiarlo).

**Formatos de dibujo** (Forma = «Dibujada por el LLM»), para comparar con «Probar»:

1. **Composición abstracta en capas** (recomendado): 12–40 elementos con tono (elipses, anillos, arcos, trazos,
   polígonos, vacíos) en un lienzo 100 × 100; levemente abstracta, con referencias de dibujo (Klee, Gego, Mira
   Schendel, León Ferrari). El programa la dibuja en grises.
   **Figuras geométricas (silueta)**: lo mismo pero sólo para una silueta plena.
2. **Coordenadas por fila (tramos)**: `[fila, desde, hasta]` por cada tramo de figura.
3. **Filas de # y .** (clásico): la grilla escrita tal cual.
4. **Filas numeradas con regla**: cada fila con su número y una regla de columnas para no perder la cuenta.
5. **Plan y después dibujo**: primero describe partes, proporciones y posición; después dibuja siguiendo el plan.
6. **Arte ASCII con rampa de densidad** `" .:-=+*#%@"`: los tonos densos se toman como figura.

Por qué estos formatos: los modelos de lenguaje pierden la posición en 2D cuando escriben carácter por carácter;
pedir coordenadas o figuras geométricas y que el programa dibuje es lo que mejor resultado da según lo publicado
(ASCIIEval, ICLR 2026; SVE-ASCII, arXiv 2603.14505; notas sobre «code canvas» y coordenadas en lugar de dibujo).
Los formatos 3–6 son las variantes de prompt directo más usadas, para comparar.

El prompt de la grilla es corto y limpio: sólo pide lo que el programa usa (figura, la forma, física, palabras clave
y duración). El texto de «Cómo elegir la imagen» es el editable del panel; la curaduría se agrega si existe.
El muro tiene 34 filas, el borde de la forma va en el acento de la marca (#ff9898) y mientras hay una ilustración
casi no caen letras sueltas.

## Si la grilla de texto falla

«Probar» (panel C → Grilla de texto) muestra por qué no sirvió la grilla del modelo (vacía, casi llena, formato raro…).
El servidor la limpia (acepta otros caracteres, la recentra y la escala) y, si igual falla, hace un segundo pedido
corto sólo de la grilla. Si eso también falla, se usa la silueta SVG que el modelo manda de respaldo, y si no hay,
la figura de la biblioteca. En modo palabras (T) las ilustraciones también se calan en el muro.

## Placa del artista · tamaños en grilla · tecla 0

**Placa del artista (1–4, 6–9)**: primero se ve el nombre sobre el muro. Cuando la persona **empieza a hablar**
(la voz supera el umbral ~0,35 s), el nombre se borra letra por letra con glitch y arranca la animación (lo mismo
que apretar S): transcripción, muro e ilustraciones. Se ajusta en panel C → Micrófono («Placa del artista…» y
«Umbral de voz»); el comienzo de lo dicho no se pierde (el backend guarda el último segundo y medio de audio).

**Tamaños**: el tamaño de las letras del muro es el mínimo; algunas palabras dichas aparecen **2, 3 o 4 veces más
grandes**, ocupando exactamente k × k celdas por letra (todo en grilla); las palabras clave, en el rosa de la marca.

**Tecla 0 — sólo transcripción**: se apaga todo en su lugar (sin polvo que cae) y graba. Cada palabra dicha aparece
alineada a la grilla, en tamaño mínimo o 2× / 3×, sobre el trazado de una figura (círculo, espiral, diagonal, onda,
columna o constelación) que se renueva cada 7–10 palabras; líneas finas las unen. Quedan a lo sumo 9 palabras: cada
una vive 7–12 s y se rompe con glitch. S detiene / retoma; L vuelve al loop.

## Grabación de la sesión y re-proyección

**Todo se graba desde que arranca el programa** (no hace falta apretar nada), en
`Documentos/Umbral/grabaciones/AAAA-MM-DD_HH-MM-SS/`:

| Archivo | Qué es |
| --- | --- |
| `audio.wav` | el micrófono, continuo, 24 kHz mono (≈ 170 MB por hora). Si el micrófono se corta, se rellena con silencio: el audio nunca se corre respecto de los eventos |
| `eventos.jsonl` | todo lo que pasa, con su segundo exacto en el audio: teclas y botones del show, palabras transcriptas, versos, imágenes del director de arte (grillas incluidas), ajustes cambiados en el panel, estado de micrófono/OpenAI |
| `ajustes.json`, `logos/` | copia de los ajustes y los logos del arranque (la re-proyección no depende de lo que se cambie después) |
| `sesion.json` | fecha y hora de inicio |

Se escribe a disco en el momento: un corte de luz no pierde la sesión. El panel C (sección Micrófono) muestra la
carpeta, los minutos grabados y la cantidad de eventos; el diagnóstico verifica que se pueda escribir y el espacio libre.

**Re-proyectar otro día:** doble clic en **`reproyectar.bat`** (Windows) o **`reproyectar_mac.command`** (Mac).
Muestra la lista de sesiones, se elige una y el show se repite solo: el audio sale por la salida de sonido
(`AUDIO_OUTPUT_DEVICE` en `.env` para elegir otra) y su posición es el reloj, así que cada palabra, imagen y tecla
cae sincronizada con la voz. La reactividad al sonido se recalcula desde el audio grabado. Durante la re-proyección
las teclas del show no hacen nada (sólo C, D, F) y nada se graba ni se envía a OpenAI. Para empezar en otro punto:
`python server.py --replay ultima --desde 12:30`.

Lo que se repite es la secuencia completa (qué palabra, qué imagen, qué estado, en qué segundo); el movimiento fino de
cada letra tiene azar propio en cada función, así que no es un video cuadro por cuadro sino la misma obra otra vez.
Para un video fijo, grabar la pantalla durante la re-proyección (OBS).

## Operación de la noche

```
 LOOP (FLAT · logos · UMBRAL, se repite)  ──→──→ (desde el último paso)
   │  → / ← avanza / retrocede                         ▼
   │                                          TÍTULO UMBRAL (fijo)
   │                                                   │ T
   │                                                   ▼
   │                                      PALABRAS (graba sola)
   │                                                   │ 1…9, 0
   │                                                   ▼
   │                                    NOMBRE DEL ARTISTA (no graba)
   │                                                   │ S ⇄ S
   └──────────────── L ──────────────────  POEMA (graba / detenido)
```

| Tecla | Acción |
| --- | --- |
| `→` / `←` | loop: paso siguiente / anterior. Desde el último paso, `→` fija el título UMBRAL |
| `T` | empieza a grabar en modo palabras (desde el título o cuando sea), hasta que se elige un artista |
| `1`…`9`, `0` | nombre del artista N (0 = 10): deja de grabar; no empieza hasta apretar `S` |
| `S` | grabar / dejar de grabar (el poema dibuja; lo dibujado queda en pantalla) |
| `P` | detener la grabación (igual que `S` cuando graba) |
| `L` | volver al loop (deja de grabar) |
| `C` | panel de operación (y recordatorio de atajos) |
| `F` | pantalla completa · `D` panel técnico / simulación · `Esc` cierra paneles |

Toda letra que cambia de lugar lo hace con **glitch** (salta en escalones con cortes horizontales y parpadeo; cada
transición dispara además una ráfaga de glitch de pantalla). El fondo es un **telón de texto**: un bloque
monoespaciado con las últimas palabras dichas repetidas, del que se desprenden letras que caen y se apilan; el
título, el nombre y las figuras lo calan (quedan como huecos negros).

Sólo se envía audio a OpenAI mientras se graba (`S` o `T`): el loop y los nombres no consumen la API.

### Ilustraciones en grilla de texto

La imagen está hecha de texto. Con cada estrofa el director (OpenAI, o Ollama sin internet) elige un concepto
dibujable y devuelve, además de la física, una **grilla de 48 × 26** caracteres (`#` figura, `.` fondo). El
programa la compone con el **muro de palabras** (las últimas palabras dichas, repetidas en ciclo hasta llenar todas
las celdas: cuantas menos palabras, más veces se repite cada una):

- **Positivo**: sólo quedan las palabras dentro de la figura (la figura hecha de palabras sobre negro).
- **Negativo**: la figura es un hueco negro calado en el muro.
- Polaridad en el panel C: alternar, siempre positivo, siempre negativo, o que la elija el LLM.
- Al terminar la imagen, el muro se reescribe de a poco hasta la próxima (en el tiempo de la cadencia).
- Si el modelo no responde o la grilla no es válida, la figura de la biblioteca se convierte a grilla.

En el panel C, sección **Grilla de texto**, se edita la **parte estética** del pedido (qué dibujar, cuán sintético,
cuánto ocupa…); el formato técnico se agrega solo. El botón **Probar** pide una grilla con un texto de ejemplo, la
muestra como texto en el panel y la aplica en la pared.

### Windows

`start_instalacion.bat`: en cada arranque instala/actualiza dependencias, recompila el frontend, abre el backend y
Chrome en modo kiosco. La clave de OpenAI se pega en el panel C (queda guardada fuera del programa).
`diagnostico_windows.bat`: prueba la clave, el director (muestra la grilla que devuelve) y el micrófono.
Requisitos: Python 3.10+ (python.org, marcar «Add to PATH»), Node.js LTS y Google Chrome.

### Manual de marca FLAT (integrado)

Tipografías **Geist Mono** (títulos, nombres, muro, figuras) y **Roboto** (texto), empaquetadas en el programa
(sin internet). Acento por defecto: **rosa «Ciclo Umbral» `#ff9898`**; el panel C tiene la paleta completa del
manual (Ciclo Refracción `#9999ff`, Cinema Liminal `#3333cb`, Talleres `#cccccc`, Espacio Inmersivo `#9900cc`,
Blockchain `#30d618`, Hackatón `#0074ff`, Conexión Sonora `#ccff00`, Exposición `#e6005c`, Órbita `#8ecddd`).
El glitch de los logos separa el color en rosa Umbral y lila Refracción.

### Transcripción limpia

Se eliminan anotaciones (`[música]`, `(risas)`, `♪`) y las frases que los modelos inventan en silencio
(«Subtítulos realizados por la comunidad de Amara.org», «Gracias por ver»…). Un segmento que sólo era eso se
descarta y se desvanece. Cada estrofa produce una imagen (nunca queda sólo en física).

### Loop de logos (hasta que empieza la noche)

Los 39 logos de FLAT 2026 vienen **integrados en el programa** en `poesia-tipografica/logos/` (orden de la «Pirámide de logos»,
ver `logos/LEEME.txt`). Para cambiar uno sin esperar una versión nueva, ponerlo en **Documentos/Umbral/logos/** (fuera del programa: actualizar o volver a descargar no los borra; los
ajustes del panel C también viven ahí, en `Documentos/Umbral/ajustes.json`). El programa crea las carpetas solo.

**Atajo:** doble clic en `importar_logos.command` — busca la carpeta «FLAT 2026 - Logos…» en Descargas (o la que
arrastres), reconoce las subcarpetas organizadores / socio cultural / patrocinadores, convierte PDF a PNG y copia
todo a `Documentos/Umbral/logos/`:

| Carpeta | Orden | Tiempo por página (por defecto) |
| --- | --- | --- |
| `flat` | abre el loop: logo al centro, rodeado por el muro de palabras | 10 s · al arrancar, si está vacía, se copia `FLAT-Logo*.png` de Descargas (o se baja de la web) |
| `organizadores` | 1º | 8 s |
| `socio-cultural` (también vale «socio cultural») | 2º | 16 s |
| `patrocinadores` | 3º | 8 s |
| `acompanan` | 4º | 8 s |
| `embajadas` | 5º | 8 s |
| `media-partner` | 6º | 6 s (vacía = se salta) |

Luego UMBRAL en letras, y vuelve a empezar hasta que se aprieta un número de artista. Cada carpeta se muestra en grilla
adaptativa (o «de a uno»); entre logo y logo hay una transición de **glitch** (cortes, separación rojo/cian, bloques).
Se muestran en orden alfabético: para forzar un orden, numerar los archivos (`01-flat.png`, `02-…`).

### Estilos de imagen y muro de palabras

Las figuras oscilan entre los estilos activos (panel C → Estilos de imagen; elige el LLM según la estrofa, o azar,
o secuencia): **caligrama + nube de puntos**, **ASCII de densidad** (grilla mono, el glifo según la luz), **glitch
azaroso** (ráfagas: bandas desplazadas, letras sustituidas, separación de color) y **marca FLAT**. Con «Aplicar la
marca a todo», subtítulos, nombres, muro, figuras y colores usan la tipografía, paleta y mayúsculas de la marca
(provisorio hasta tener el manual). El modo `T` es un **muro en grilla monoespaciada**: palabras de 1, 2 o 3 módulos
de alto (las clave y las dichas con más voz, más grandes), alineadas, que llenan la pared en orden de lectura.

### Curaduría, imágenes en vivo y cadencia

- **Curaduría** (panel C): texto libre, en tus palabras, sobre la muestra. El director de arte lo recibe antes de
  cada estrofa como guía principal.
- **Imágenes en vivo**: el LLM dibuja cada figura (SVG) a partir de la estrofa y la curaduría. Si el dibujo no sirve
  (vacío, ilegible), se usa la biblioteca. Modo **Curadas**: elige entre 20 figuras (más rápido). El panel muestra la
  latencia y el origen de la última imagen.
- **Director de arte**: OpenAI (por defecto, misma clave, modelo `OPENAI_DIRECTOR_MODEL`, por defecto `gpt-4.1-mini`
  con respaldo `gpt-4o-mini`), Ollama local o DeepSeek; si falla, el siguiente disponible y al final la heurística.
- **Cadencia** (cada cuánto una imagen): por estrofa. Se acumulan versos hasta reunir N palabras y una pausa de cierre;
  nunca antes del mínimo entre imágenes; un tope fuerza la imagen si se lee de corrido.

| Preset | mínimo entre imágenes | palabras | pausa de cierre | tope |
| --- | --- | --- | --- | --- |
| Cada verso | 0 s | 1 | 0 s | — |
| **Por estrofa** (por defecto) | 14 s | 10 | 1,8 s | 45 s |
| Contemplativa | 25 s | 20 | 2,5 s | 70 s |

- **Grabar / detener**: `S` graba (o reanuda), `P` detiene; también hay botones en el panel C. El estado del show no se
  muestra nunca en la pared.

### Panel C

- **Micrófono**: lista los dispositivos de entrada que ve `server.py` y cambia en caliente. El vúmetro muestra nivel,
  pico, dBFS y avisa «sin señal», «saturando» o «backend desconectado».
- **Artistas**: nombres en orden; la posición es la tecla. Se reordenan con ↑ ↓.
- **Loop · logos**: el paso «logos» muestra **todos** los archivos de una carpeta (por defecto
  `public/loop/sponsors/`) más los que subas desde el panel. La grilla se adapta sola a la cantidad (1 logo grande,
  2 lado a lado, 3 en dos filas centradas, …): se prueban todas las combinaciones filas × columnas y cada logo se
  dimensiona por área visual para que uno apaisado y uno cuadrado pesen parecido. Más de «por pág.» logos se
  reparten en páginas equilibradas (10 con máx. 8 → 5 + 5), cada una «s/pág» segundos. Fondos opacos se vuelven
  transparentes y «monocromo» los pasa a silueta hueso. Agregar o quitar logos = copiar o borrar archivos en la
  carpeta (no hace falta recompilar ni reiniciar).
- **Loop**: pasos de texto o imagen. Las imágenes van en `public/loop/` (ej. `loop/flat.png`) o se suben con «Subir…».
  Render «letras» = la figura se forma con letras y nube de puntos; «imagen» = el logo tal cual (para sponsors
  legibles); «título» = texto compuesto en tipografía.
- **Prompt estético**: cómo interpreta el LLM los versos. La parte técnica (el JSON) se agrega sola.
- **Estética**: nube de puntos estilo *pointcloud* de TouchDesigner (on/off), profundidad, intensidad y órbita de cámara.

Todo se guarda solo en `settings.local.json` junto a `server.py` (y en el navegador como respaldo).

### Estética nube de puntos

Cada figura (caligrama, UMBRAL, logos) se acompaña de ~80 000 puntos (`?points=`) muestreados de su máscara y
extruidos en Z por una luz rasante: un relieve que la cámara orbita lentamente. Los puntos viajan entre figuras
por curvas en GPU, se deshacen en polvo cuando la figura se suelta y la voz los empuja en profundidad. El brillo se
normaliza por densidad para que el fondo siga siendo negro absoluto.

### Sin micrófono / sin clave (calibración)

```bat
.venv\Scripts\python server.py --no-audio --no-openai
```

`D` abre el panel técnico: inyecta versos de prueba (respeta el modo poema/palabras), fuerza figuras y físicas.
Si el backend no está corriendo, el navegador usa su propio director heurístico.

Parámetros de URL: `?pool=12000 &points=80000 &ws=ws://localhost:8765 &bloom=0.55 &grain=0.055 &dpr=1.5 &debug`.

## Protocolo WebSocket (`ws://localhost:8765`)

Servidor → frontend (JSON, campo `type`):

| type | carga útil |
| --- | --- |
| `audio_reactive` | `rms` (0..1, envolvente), `level`, `db`, `freq` (Hz dominante de la voz), `centroid`, `bands[8]`, `t` |
| `speech` | `state`: `started` \| `stopped` (VAD de OpenAI) |
| `word_delta` | `item_id`, `delta` |
| `verse_completed` | `item_id`, `text` |
| `art_direction` | `data`: contrato abajo + `verso`, `provider`, `latencia_ms` |
| `status` / `hello` | `status`: `{mic, openai, llm}` |

Frontend → servidor: `session` (`recording`, `mode`), `list_devices` / `set_device`, `save_settings` / `get_settings`,
`inject_verse` (modo debug) y `ping`.

Contrato `art_direction.data` (saneado en `server.py` y otra vez en `localDirector.js`):

```json
{
  "modo_visual": "concreto | simbolico | hibrido",
  "figura": "luna",
  "svg_paths": ["M 256 40 C … Z"],
  "relleno": "contorno | volumen | ambos",
  "fisica": { "modo": "lluvia_text_rain | enjambre_lozano | vortice_sandison | dispersion_ceniza",
              "intensidad": 0.6, "velocidad": 0.45, "turbulencia": 0.4, "densidad": 0.6 },
  "paleta": { "base": "#F4F1EA", "secundario": "#8C8984", "acento": "#E3A14B", "uso_acento": 0.1 },
  "tipografia": "serif | mono | mixta",
  "palabras_clave": ["luna", "agua"],
  "emocion": "melancolia",
  "duracion_s": 14
}
```

Si el LLM devuelve `svg_paths` inválidos o inutilizables (cobertura < 1 % o > 88 % del lienzo), se usa la figura
de la biblioteca indicada en `figura`. Si el LLM no responde, `server.py` usa un director heurístico léxico.

## Decisiones técnicas

- **Latencia de la reactividad**: bloques de 10 ms a 24 kHz; RMS y FFT (ventana Hann de 2048 con interpolación
  parabólica del pico) se emiten en cuanto llega cada bloque. En el navegador el valor va directo a un uniform;
  ningún cálculo por partícula en CPU depende del audio.
- **Deltas de transcripción**: llegan en cuanto el modelo los produce (con `gpt-4o-transcribe`, tras cada segmento
  que el VAD de servidor confirma; `silence_duration_ms: 350` mantiene los segmentos cortos). Mientras tanto, el
  cursor del subtítulo respira con la voz para que la pared nunca quede muda. `whisper-1` sólo emite `completed`:
  el verso aparece entero con un barrido rápido.
- **Sesión Realtime**: `modalities: ["text"]`, `create_response: false` y cancelación defensiva de cualquier
  `response.created`: el modelo nunca contesta, sólo transcribe. Reconexión con *backoff* exponencial con *jitter*;
  el audio acumulado durante un corte se descarta salvo los últimos 500 ms.
- **Tipografía**: un atlas Canvas 2D de 2048² (256 celdas de 128 px) con mipmaps; el juego latino-español completo
  se pre-rasteriza en serif y mono, y cualquier carácter nuevo se dibuja al vuelo. Un único `InstancedBufferGeometry`
  con tres atributos `vec4` por instancia: un draw call para todo el poema.
- **Caligramas**: el contorno se recorre con `getPointAtLength`; cada letra se coloca según su avance real y se rota
  con la tangente, así el verso *se lee* siguiendo el trazo. El interior usa una retícula hexagonal cuya escala,
  brillo y gris dependen de una luz rasante calculada sobre la máscara desenfocada (*halftone* volumétrico). El
  contorno se dibuja en el orden del trazo; el volumen florece desde el centro.
- **Físicas**: lluvia con pilas por columna sobre el suelo, la silueta de la figura y la repisa invisible del verso
  anterior; enjambre con un campo de densidad/velocidad interpolado bilinealmente (sin vecinos O(n²)); vórtice en
  espiral logarítmica ascendente con profundidad; ceniza con ruido curl de alta frecuencia, deriva lateral y vida
  limitada. Las físicas se funden por pesos, y una turbulencia curl transitoria acompaña cada cambio de figura.
- **Reciclaje**: las letras dormidas no cuestan nada (fuera del clip en el shader, sin física). La densidad visible
  crece con el poema; al reaparecer, cada letra toma su glifo del texto recién leído.
