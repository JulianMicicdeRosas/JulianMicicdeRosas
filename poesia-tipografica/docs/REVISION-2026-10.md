# Revisión del sistema · Ciclo de charlas y talleres FLAT

Octubre de 2026 · rama `charlas-flat` · ~12 000 líneas (server.py 3 050 · typeField.js 2 750 · main.js 950 · configPanel.js 915 · show.js 660).

Esta revisión se hizo leyendo el código completo en cuatro frentes (backend, motor de render, show y panel, lanzadores
y documentación), verificando a mano cada hallazgo grave contra el código, y midiendo el costo de CPU por cuadro del
motor en los dos formatos de salida. Cada hallazgo lleva `archivo:línea` para que se pueda comprobar.

## 1. Veredicto en tres párrafos

**Funciona y es ambicioso.** El sistema hace algo difícil: transcripción en vivo con OpenAI Realtime, dirección de arte
por oración con un LLM, un motor propio de 100 000 letras instanciadas en WebGL con siete animaciones, grabación y
re-proyección sincronizada, dos plataformas, cinco proyectores. Hay decisiones muy buenas: la reconexión con espera
creciente, los watchdogs de micrófono y de OpenAI, la escritura atómica de ajustes, el replay que tolera un WAV con
encabezado corto, el worker que sigue animando con Alt+Tab, el hub WebSocket simple.

**Pero creció a golpes de pedido, sin red de seguridad.** No hay un solo test automatizado en el repositorio; el
arnés de pruebas de punta a punta (OpenAI simulado + Playwright) que se usó estas semanas vive fuera del repo y se
perdería. Las dos piezas centrales son monolitos (una clase de 80 métodos; un archivo Python de 10 clases). El estado
del show se escribe desde cinco lugares. Las migraciones de ajustes se pisan entre sí. El resultado es que cada
pedido nuevo tiene una probabilidad alta de romper algo que ya andaba, y de hecho esta revisión encontró **seis
errores graves** que ninguna prueba había detectado, dos de ellos introducidos en las últimas dos semanas.

**Recomendación:** antes de la próxima función, arreglar los seis errores graves (un día de trabajo, cambios de pocas
líneas) y meter el arnés de pruebas al repositorio. Después, en lugar de seguir agregando animaciones, dedicar dos o
tres semanas a consolidar: partir los dos monolitos, un solo lugar para el estado y los ajustes, lanzadores que no
dependan de internet, y una guía de operador de una carilla. Lo que sigue detalla cada punto.

## 2. Errores graves verificados (arreglar antes de la próxima función)

| # | Qué pasa | Dónde | Efecto en la sala | Arreglo |
|---|---|---|---|---|
| 1 | **Agregar un paso de logos en el panel C borra el loop entero.** `migrate()` toma como «loop viejo» cualquier paso con carpeta `public/loop/sponsors` y reemplaza todo el loop por el de fábrica; el panel pone exactamente esa carpeta por defecto al cambiar un paso a «logos». | `src/main.js:376`, `src/configPanel.js:911` y `:447` | El operador pierde textos, orden y logos subidos, sin aviso. | Sacar esa condición o cambiar el valor por defecto. Chico. |
| 2 | **Los 3 s de gracia de la placa no llegan al backend.** `main.js` pasa `onPrerollReset` al crear `Show`, pero el constructor no lo guarda; `this.onPrerollReset?.()` es `undefined` y el mensaje `preroll_reset` nunca se envía. | `src/show.js:103`, `:558`; `src/main.js:473` | Aplausos y presentación pueden entrar en la transcripción (la gracia en el frontend sí funciona: no dispara por voz). | Una línea en el constructor. Chico. |
| 3 | **Ningún aviso del show se ve.** `notify(text)` muestra `show.label()`, que nunca es vacío, y descarta `text`. | `src/main.js:437-439` | «No hay artista 3», «Ningún artista tiene la tecla 1», «Fin de la re-proyección» no aparecen en ningún lado. | Mostrar `text` y un aviso de 2 s (el CSS `#toast` ya existe y no se usa). Chico. |
| 4 | **Un error al escribir el WAV tumba el servidor.** `recorder_tick()` → `tick()` → `wav.write()` sin try/except; la tarea muere, `asyncio.gather` propaga y el proceso termina. | `server.py:2598-2608`, `:2623` | Disco lleno o OneDrive bloqueando el archivo = pantalla negra, sin operador técnico. | try/except con log; supervisión de tareas que no mate el servidor. Chico. |
| 5 | **Se graba audio desde que arranca el programa**, no sólo mientras se «graba». `recorder.audio()` corre siempre; `recording` sólo gobierna qué va a OpenAI. | `server.py:917` vs `:979` | Pruebas de sonido y charlas de pasillo quedan en `Documentos/Ciclo FLAT/grabaciones/…/audio.wav`, posiblemente sincronizado a OneDrive/iCloud. Es un problema de consentimiento y privacidad. | Grabar sólo con `recording`, o avisarlo en pantalla y en la carpeta. Chico. |
| 6 | **El motor «roba» letras sin avisar a su dueño.** Cuando no hay partícula libre, `_allocParticle` toma cualquier WORD/BGW/FIGURE; las listas que guardan índices no se enteran, y al vencer la palabra vieja se rompe una letra de la nueva. El telón además reescribe glifos sin verificar el estado. | `src/typeField.js:381-386`, `:1409-1419`, `:1514-1521` | Letras que cambian de glifo o desaparecen de palabras vivas; más probable en 13480×1080, donde el telón ocupa la mayor parte del pool. | Número de generación por partícula y una única función `release()`. Medio. |

Otros hallazgos altos, también verificados: las migraciones del loop en `Show` mutan el array compartido pero guardan
las banderas `loop_*_vN` sólo en su copia, así que vuelven a correr en cada guardado y deshacen lo que el operador
cambió (`src/show.js:134-186`); en Windows el arranque abre Chrome a los 4 s sin comprobar que el backend responda
(`start_instalacion.bat:51-53`), y si falla `npm run build` no arranca aunque exista un `dist/` anterior (`:45`); en
Windows no queda ningún log en archivo (`:51`); el WebSocket local no valida `Origin` (`server.py:2619`), así que
cualquier página abierta en el mismo navegador puede cambiar ajustes, inyectar texto o reemplazar la clave.

## 3. Por área

### 3.1 Backend (`server.py`)

Lo bueno: reconexión a OpenAI con espera creciente y vigía de sesión colgada; colas con descarte para no acumular
audio; `SettingsStore` con escritura atómica; el replay usa el tamaño real del WAV y tolera la última línea cortada
del JSONL; la clave nunca viaja al frontend.

Problemas de fondo:

- **I/O sincrónico sobre el event loop.** Enumerar dispositivos de audio y abrir el stream (`:778`, `:2521`, `:2525`)
  puede tardar segundos en Windows (WASAPI/MME) y durante eso se frenan el WebSocket, el envío a OpenAI y la cola de
  audio. `recorder.snapshot` copia la carpeta de logos (hasta cientos de MB) con `copytree` sincrónico (`:2459`), y
  `ensure_flat_logo` intenta una descarga HTTP de hasta 12 s **antes** de levantar el WebSocket (`:2439`): sin internet
  en la sala, el show arranca tarde y Chrome abre con «backend desconectado».
- **Deriva del reloj de la placa** (`:496-506`): cuando la diferencia supera ±0,3 s se insertan o descartan 7 200
  muestras de golpe; con una placa a +100 ppm pasa cada ~50 min y en la re-proyección se oye un salto a mitad de
  palabra. Debería corregirse gradualmente.
- **Cadena de respaldo del director** (`:2344-2370`): openai → ollama → deepseek, 25 s de timeout cada uno. Si OpenAI
  cae a mitad de charla, cada dibujo puede tardar un minuto en llegar a la heurística, y la cola se desfasa del texto.
  Además, si el modelo configurado da 400/404 se reintentan tres modelos **en cada estrofa** sin memorizar cuál anduvo
  (`:2328-2336`).
- **Costos de OpenAI.** Los commits cada 1,8 s no cuestan más (se factura por minuto de audio). Con cadencia «estrofa»
  el director cuesta ~US$0,5–1 por hora. El preset «verso» (`:2130`: mínimo 0 s, 1 palabra) dispara una llamada por
  cada tramo de 1,8 s: ~2 000 por hora, **US$5–10/h**. Conviene limitarlo o sacarlo del panel.
- **Pérdidas chicas:** `partials`/`cleaners` no se limpian al reconectar (`:1285`); `_logo_cache` sin desalojo
  (`:432`); `tempfile.mkdtemp` del replay no se borra (`:2764`); sin handler de SIGTERM, así que `taskkill /F` deja
  el WAV con encabezado hasta 5 s corto.
- **Estructura:** 450 líneas de prompts entre clases; globales mutables; `main` usa privados del director; tres
  clientes LLM que son el mismo POST con variantes; `.env.example` documenta `LLM_PROVIDER` pero el código lo ignora
  si hay clave de OpenAI, y faltan `AUDIO_FILE`, `OPENAI_BASE_URL`, `FLAT_DIR`, `AUDIO_OUTPUT_DEVICE`. `FLAT_DIR` se
  lee al importar, antes de `load_dotenv`, así que en `.env` no funciona.

### 3.2 Motor de render (`src/typeField.js` y dependientes)

Medición propia (CPU de JavaScript por cuadro, navegador sin GPU, así que sólo vale el tiempo de JS):

| Formato | Pool | Partículas activas | `update()` por cuadro |
|---|---|---|---|
| 1822 × 737 (FLAT) | 18 000 | ~1 700–3 200 | 2–5 ms (picos 10–25) |
| 13480 × 1080 @1920 | 78 000 | ~2 500 | 4–10 ms (picos 26–33) |

Con la misma cantidad de letras en pantalla, el formato ancho cuesta el triple: **el costo lo da recorrer el pool
entero, no lo que se ve.** Causas, por orden de peso:

1. **Tres subidas completas de atributos a la GPU por cuadro** (`:1200-1211`): `posRot` y `data` (1,6 MB cada uno) se
   marcan enteros siempre, y `meta` se recopia y sube casi todos los cuadros porque cada gota de lluvia lo ensucia
   (`:349`). ≈ 4,8 MB por cuadro, ≈ 290 MB/s. Hay que subir sólo rangos sucios o compactar las activas al frente.
2. **El telón recorre todas sus celdas 16 veces por segundo** (`:1436-1490`) con objetos JS por celda y 6 arrays
   nuevos por celda cuando hay un hueco (`:1597`). En 13480×1080 son ~70 000 celdas: más de un millón de visitas por
   segundo y basura para el recolector.
3. **Presupuestos de escritura fijos** (`:1409`, `:1435`): ~1 200 celdas por segundo. En la Mac el telón se llena en
   ~8 s; en 13480×1080 tarda **cerca de un minuto**, y la reescritura tras cada verso nunca alcanza. Deben escalar con
   la cantidad de celdas.
4. **Sin lista de libres**: `_allocParticle` escanea hasta 900 posiciones y después todo el pool, por cada letra
   (`:366-389`).
5. `_maskUpdate`, `_releaseAllResting` (por cada verso), `stats()` y el conteo de saturación del muro son O(pool)
   cuando podrían ser O(activas) con listas por estado.

Diseño: la clase mezcla seis subsistemas (física, verso en vivo, caligramas, telón, palabras con seis estrategias,
máscara). La inicialización de una letra está copiada en **nueve** lugares; `if (state[i] !== WORD) continue`
aparece siete veces y es el síntoma del número de generación que falta. Hay dos grillas distintas (muro: 34 filas al
94 %; telón: 40 filas al 90 %) y tres ubicadores aleatorios con la misma lógica de «probar N lugares y romper las
viejas». Números mágicos sin nombre: `1.62` (módulo mono) en cinco lugares, `0.82` (alfa del telón) en cinco.

Corrección visual pendiente: el caligrama (FIGURE) y el nombre (TITLE) no participan de la máscara de palabras, así
que la lluvia cae sobre el nombre y el caligrama se dibuja sobre palabras del muro; `_placeArtistWord` sólo mira la
grilla, no el nombre ni el verso; `resize` rearma el telón pero no el muro, los carriles ni las palabras grandes. En
10:1, las figuras de la tecla 0 y los dibujos ocupan el 10–15 % del ancho: islas en el centro con mucho negro a los
costados.

### 3.3 Show, panel de operación y estado (`show.js`, `main.js`, `configPanel.js`)

- **Estado disperso.** `sparseMode`, `artistWall`, `flowMode`, `backdropOnlyShape`, `wallFx` se escriben en cinco
  métodos de `Show` (en `goArtist` después de `clearScene`, al revés que en los otros); `artistCross`, `sparseKeep`,
  `wordsToBackdrop` sólo en `start()` y quedan colgados al volver al loop; `main.js` escribe otros ocho campos del
  field. No hay una `field.applyScene(preset)`; cada escena nueva es una oportunidad de olvidar una bandera (pasó con
  la partitura congelada al pasar a la 0).
- **Ajustes en cuatro lugares:** defaults en `show.js`, `migrate()` en `main.js`, migraciones del loop en `Show`,
  presets de cadencia en `configPanel.js`, `KEYS` en `server.py`. Cada tecla en un nombre clona todos los ajustes
  (fuentes y logos en `data:` incluidos), los serializa a localStorage y los manda por WebSocket; con más de 5 MB el
  `setItem` falla en silencio y lo local queda viejo. Si el operador toca el panel antes del `hello`, el guardado se
  pierde y la próxima conexión pisa lo nuevo con lo viejo.
- **Grabación demorada no cancelable:** durante los 3 s de gracia, P no detiene (sale temprano por `!recording`) y S
  arranca sin gracia; `recToken` no se inicializa (`++undefined` = NaN).
- **Recarga por pérdida de GPU sin tope** (`main.js:913-922`): una placa que pierde el contexto repetidamente entra
  en bucle; además la escena restaurada no pasa por `logUi`, así que la re-proyección se queda en el loop.
- **`replay_settings` migra lo grabado:** una sesión grabada con ajustes viejos se re-proyecta con los de fábrica.
- **Panel C:** ~40 controles en 12 secciones sin jerarquía: lo de la noche (artistas, micrófono, clave, formato)
  convive con calibración (tratamientos, polaridad, prompts, órbita). `render()` reemplaza el HTML completo en cada
  cambio y el operador pierde el foco mientras escribe.
- **Avisos:** el único canal es una línea gris de 12 px dentro del panel C y el título de la ventana, invisible en
  pantalla completa. Si OpenAI se cae a mitad de charla, nadie se entera con el panel cerrado.
- Código de pruebas en producción (`window.poesia`, el simulador con un intervalo permanente de 16 ms), código muerto
  (`_holdTitle`, CSS `#toast`), `arguments[0]` en un constructor destructurado.

### 3.4 Operación, lanzadores y empaquetado

- **Arranque a ciegas en Windows:** 4 s fijos y abre Chrome; no espera ni 5173 ni 8765. Mac espera 5173 pero no 8765.
- **Build en cada arranque y sin internet no arranca:** `npm install` silencioso (puede quedarse reintentando) +
  `npm run build || goto :error`; Vite vacía `dist/` al empezar, así que un build fallido deja sin nada. Un ZIP recién
  bajado necesita internet y varios minutos (winget + pip + npm + build).
- **`taskkill` por título de ventana** no cierra el Chrome anterior: un segundo arranque abre otra pestaña en el
  Chrome viejo y hay dos clientes contra el backend.
- **Puertos ocupados** (8765 o 5173): el backend muere con traceback en una ventana minimizada; el show sigue con el
  director heurístico y nadie lo ve.
- **Sin salida de emergencia:** no hay forma de reiniciar sólo el backend sin recompilar y cerrar todo, aunque el
  frontend reconecta solo. No hay `cerrar_todo`.
- **Grabaciones:** 173 MB/h de WAV escritos cada 10 ms en Documentos, que suele estar en OneDrive/iCloud; cada sesión
  copia la carpeta de logos entera; nunca se limpian; no hay aviso de disco lleno; sin señal de «está grabando» fuera
  del panel.
- **Dependencias sin fijar:** `requirements.txt` todo `>=` (numpy 1 vs 2), sin `requires-python`; `package.json` con
  `^` (hay lock, pero se usa `npm install` y no `npm ci`). Sin versión, sin tags, sin changelog; `sesion.json` graba
  `version: 1` y no el commit.
- **Documentación:** el README (584 líneas) mezcla manual de operador, instalación, arquitectura y decisiones. Tiene
  contradicciones: «Ollama → DeepSeek → heurística» vs OpenAI primero en el código; `public/loop/sponsors` sigue
  mencionado y es el valor por defecto del panel aunque ya no se usa; «settings.local.json junto a server.py» vs
  `Documentos/Ciclo FLAT/ajustes.json`; cuatro cifras distintas de letras y filas; la rama de clonado es la vieja.
- **Pruebas:** cero tests en el repositorio. El arnés que se usó estas semanas (OpenAI simulado con protocolo GA y
  VAD, servidor con `--audio-archivo`, Playwright con capturas y métricas de superposición) está en una carpeta
  temporal fuera del repo. Es el activo de calidad más valioso del proyecto y hoy no está versionado.

## 4. Propuesta de mejora

### Etapa 0 · Antes de la próxima función (1–2 días)

1. Los seis errores de la tabla del §2 y los tres altos que la siguen (migraciones de `Show`, espera de puertos en el
   `.bat`, `Origin` del WebSocket). Son todos cambios de pocas líneas salvo el número de generación (medio).
2. **Meter el arnés de pruebas al repo** (`tests/e2e/`): `fake_openai.py`, `test.env`, un WAV corto de voz, los
   scripts de Playwright, y un `npm run e2e` que levante todo y corra la noche completa (→, 2, 3, 4, 6, 7, 0, 5, L)
   con capturas y la métrica de superposición. Es lo que convierte cada pedido futuro en algo verificable.
3. Lanzador Windows: esperar 5173 y 8765 en bucle antes de abrir Chrome; arrancar sin `npm install` ni build si
   existe `dist/`; guardar PIDs y cerrar por PID; log a archivo `logs/server-AAAA-MM-DD.log`; `reiniciar_backend.bat`
   y `cerrar_todo.bat`.
4. Grabar sólo con `recording` (o cartel claro) y mover `grabaciones/` a una carpeta fuera de la sincronización.
5. Sacar el preset de cadencia «verso» del panel o limitarlo a un mínimo de 6 s.
6. Un aviso visible fuera del cuadro proyectado: una franja de 20 px en la pantalla del operador (fuera de la
   proyección, o sobre la franja apagada de los primeros 1920 px, que la sala no ve) con estado de micrófono,
   transcripción y grabación.

### Etapa 1 · Consolidación (2–3 semanas)

7. **Un módulo `settings.js`** con defaults, versión numérica (`v: 9`), todas las migraciones (las de `main` y las
   de `Show`), persistencia con diff y debounce, y los `data:` grandes fuera de localStorage. `Show` y el panel sólo
   leen. `server.py` valida contra el mismo esquema (un JSON Schema compartido).
8. **`field.applyScene(preset)`**: una tabla de presets por escena (loop, título, placa, cada animación, 0, 5) con
   todas las banderas; `Show` deja de escribir campos sueltos. Un test de `Show` con un field falso recorre todas las
   transiciones y verifica que no quede ninguna bandera colgada.
9. **Ciclo de vida de partícula** en el motor: `ParticlePool` con `alloc/release/spawnGlyph`, lista de libres, listas
   por estado, generación por índice. Es el prerrequisito de las ganancias de rendimiento y elimina las nueve copias
   de inicialización.
10. **Subida parcial de atributos y telón en arrays planos** con presupuestos proporcionales. Objetivo medible: en
    13480×1080, `update()` por debajo de 3 ms y el telón escrito en menos de 5 s.
11. **Máscara universal**: nombre, caligrama y verso participan; `_placeArtistWord` respeta nombre y verso; `resize`
    rearma todo.
12. Backend: `to_thread` para audio y copias de archivos; WebSocket antes de la descarga del logo; corrección gradual
    de deriva; memorizar el modelo de director que funciona y timeouts de 8–10 s en la cadena de respaldo; limpiar
    `partials` al reconectar; SIGTERM que cierre el WAV.
13. **Tests unitarios** de lo puro, que es mucho: `check_grid`, `_grid_from_shapes`, `clean_letters`,
    `sanitize_direction`, `clean_transcript`, `LinearResampler`, `_parse_time`, `cadence_params` (pytest);
    `parseFormat`, `artistKey`, `resolveAnim`, `migrate`, `sampleText` (vitest). ESLint + Prettier + `// @ts-check`
    con JSDoc en `show.js` y `main.js`. Una acción de CI que corra lint, unit y el e2e.
14. **Documentación en tres piezas**: `GUIA-OPERADOR.md` (una carilla: doble clic en qué, teclas, qué mirar, «si pasa
    X hacé Y», dónde queda la grabación, cómo apagar), `INSTALACION.md` (Windows, Mac, Focusrite, 13480), y
    `docs/arquitectura.md` (diagrama, protocolo, decisiones). `CHANGELOG.md` y un tag por función.
15. **Panel C en dos niveles**: «Esta noche» (artistas y teclas, micrófono, clave, formato, grabar) arriba y
    «Calibración» plegado; render por sección, sin perder el foco.

### Etapa 2 · Reestructuración (1–2 meses, cuando el calendario lo permita)

16. **Partir `server.py` en un paquete** `flat/`: `config`, `settings`, `assets`, `recorder`, `hub` (con un router de
    mensajes en lugar del `if/elif` de 100 líneas), `audio`, `transcriber`, `director/` (prompts, grilla,
    sanitize, un solo cliente OpenAI-compatible + Ollama), `replay`, `check`, `cli`.
17. **Partir `TypeField`** en `ParticlePool`, `Physics`, `LiveLine`, `Calligram`, `Backdrop`, `Words` (con
    estrategias `WallGrid`, `ArtistWall`, `Sediment`, `Score`, `Sparse`, `Free` detrás de `place(word)`) y
    `OcclusionMask`. Hechos los puntos 9–11, es mover código.
18. **Distribución como release**: ZIP por plataforma con `dist/` y Python embebido (o `server.py` sirviendo `dist/`
    y Node fuera de producción), `preparar.bat` (con internet, una vez) separado de `arrancar.bat` (sin internet), y
    `smoke_test.py` corrible desde el diagnóstico: puertos, `hello`, 10 s con `--audio-archivo`, WAV y JSONL
    crecieron, disco libre, replay arranca.
19. **Seguridad mínima**: token en la URL del lanzador validado en `hello`; límite de tamaño a la descarga del logo;
    escapar `mic_device`/`openai_detail`/`figureName` en el panel técnico.

## 5. Arquitectura objetivo (resumen)

```
 micrófono ─► flat/audio ──► flat/transcriber (OpenAI) ──┐
                 │                                         ├─► flat/hub (WS, router, token) ─► frontend
                 └──► flat/recorder (WAV + JSONL)          │                                      │
 flat/director (prompts · grilla · un cliente LLM) ───────┘                              settings.js (v9, migraciones)
                                                                                          show.js  (máquina de estados → field.applyScene)
                                                                                          render/  ParticlePool · Physics · Backdrop · Words · Mask
 tests/unit (pytest, vitest) · tests/e2e (fake OpenAI + Playwright) · CI
```

La regla que ordena todo: **cada dato tiene un dueño**. Las partículas las da y las quita el pool; las banderas de
escena las pone `applyScene`; los ajustes los valida `settings.js`; lo que se dice entra por el hub y queda en el
recorder. Hoy cada una de esas cosas tiene entre tres y nueve dueños, y de ahí salen los errores de esta lista.

## 6. Qué no cambiaría

El protocolo WebSocket plano con JSON; la idea del telón como fondo que se cala; grabar eventos y audio por separado
y sincronizar por tiempo; la re-proyección reusando el mismo frontend; el worker para Alt+Tab; Vite sin framework;
Three.js con instancias propias en lugar de un motor de partículas de terceros. Son las decisiones correctas para este
tamaño de proyecto.
