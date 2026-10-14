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
├── start_instalacion.bat Arranque completo en Windows (backend + frontend + Chrome kiosk)
├── public/loop/          Imágenes del loop (flat.png, sponsors.png…)
└── src/
    ├── main.js           Escena, cámara orbital, bucle, conexión al backend, simulador, teclado
    ├── show.js           Estados de la noche: loop → artista → poema / palabras
    ├── configPanel.js    Panel C: atajos, micrófono + vúmetro, artistas, loop, prompt, estética
    ├── pointCloud.js     Nube de puntos estilo TouchDesigner (morph en GPU)
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

## Puesta en marcha (Windows 10/11)

Requisitos: Python 3.10+, Node.js 18+, Google Chrome, y opcionalmente [Ollama](https://ollama.com).

```bat
copy .env.example .env          :: completar OPENAI_API_KEY
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

## Operación de la noche

```
 LOOP (FLAT · sponsors · UMBRAL) ──1…9──► NOMBRE DEL ARTISTA ──S──► POEMA (graba)
   ▲                                  ▲ número: reinicia el nombre      │ T ⇄
   └───────────────L──────────────────┴─────────────────────────── PALABRAS (graba)
```

| Tecla | Acción |
| --- | --- |
| `C` | panel de operación (y recordatorio de atajos) |
| `1`…`9`, `0` | ir al nombre del artista N (0 = 10). Otra vez un número: reinicia a ese nombre y deja de grabar |
| `S` | comenzar a grabar: el poema dibuja con sus letras |
| `T` | modo palabras: todo lo dicho, disperso por la pared con tamaños sutilmente distintos (otra vez `T`: vuelve a poema) |
| `L` | volver al loop (deja de grabar) |
| `F` | pantalla completa · `D` panel técnico / simulación · `Esc` cierra paneles |

Sólo se envía audio a OpenAI mientras se graba (`S` o `T`): el loop y los nombres no consumen la API.

### Panel C

- **Micrófono**: lista los dispositivos de entrada que ve `server.py` y cambia en caliente. El vúmetro muestra nivel,
  pico, dBFS y avisa «sin señal», «saturando» o «backend desconectado».
- **Artistas**: nombres en orden; la posición es la tecla. Se reordenan con ↑ ↓.
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
