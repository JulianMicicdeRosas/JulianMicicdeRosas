// secuencia.js — secuencia de la presentación (antes presets.js)

// ---------- SECUENCIA DE LA PRESENTACIÓN ----------
// La presentación es una lista de PASOS. Se avanza de un paso al siguiente con Enter / Espacio / →
// (← vuelve al paso anterior). Hay dos tipos de paso:
//
// 1) LOOP: { slides: [...], dwell: ms }
//    Las diapositivas rotan solas en bucle cada "dwell" milisegundos (por defecto 6000)
//    hasta que se aprieta Enter / →, que pasa al paso siguiente.
//    Campos de cada diapositiva:
//      "logo":   URL de un logo grande.
//      "logos":  array de URLs para mostrar una fila de logos (sponsors).
//      "title":  título (con efecto scramble).
//      "body":   texto en un párrafo.   "align": "left" para alinearlo a la izquierda.
//      "lines":  array de strings apilados (ej: nombres de artistas).
//
// 2) PERFORMANCE: { performance: { ... } }
//    Automática, sin trigger: muestra "performer" + "work" durante "infoSeconds" (5 por defecto),
//    hace la cuenta regresiva de "countdown" segundos (5,4,3,2,1) y entra a Cuerpo / Señal.
//    Al salir de la performance (Backspace/Escape) vuelve a las diapositivas y pasa al paso siguiente.
//      "performer": nombre y apellido, o un array de nombres si bailan varios: ["Ana Pérez", "Luis Gómez"].
//      "work":      nombre de la obra.
//      "preset":    ligero | equilibrado | completo.
//      "escena":    escena con la que arranca el visual.
//      "audio":     canción a reproducir.
//      "link":      (solo si esta página corre suelta, sin Cuerpo / Señal como padre) HTML al que saltar.

const LOGO_FLAT = "https://centroeesonoros.org/wp-content/uploads/2026/08/FLAT-Logo-Blanco-Bajada.png";

const SEQUENCE = [

  // Paso 1 — loop: logo principal ⇄ sponsors
  {
    dwell: 6000,
    slides: [
      { logo: LOGO_FLAT },
      // Reemplazá estas URLs por los logos reales de los sponsors
      { title: "Sponsors", logos: [LOGO_FLAT, LOGO_FLAT, LOGO_FLAT] }
    ]
  },

  // Paso 2 — loop: artistas ⇄ obras
  {
    dwell: 6000,
    slides: [
      { title: "Artistas", lines: ["Apellido y Nombre", "Apellido y Nombre", "Apellido y Nombre"] },
      { title: "Obras",    lines: ["Nombre de la obra", "Nombre de la obra", "Nombre de la obra"] }
    ]
  },

  // Paso 3 — performance (intro 5 s → cuenta regresiva 5..1 → Cuerpo / Señal)
  {
    performance: {
      performer: ["Apellido y Nombre", "Apellido y Nombre", "Apellido y Nombre", "Apellido y Nombre", "Apellido y Nombre"],   // un string si es solista, un array si son varios
      work: "Nombre de la obra",
      infoSeconds: 5,
      countdown: 5,
      link: "index.html",
      /*preset: "completo",
      escena: "enjambre",*/
      audio: "canciones/Alma Corazón y Vida (Vals Peruano).mp3"
    }
  },

  // Paso 4 — loop: logo principal ⇄ sponsors
  {
    dwell: 6000,
    slides: [
      { logo: LOGO_FLAT },
      // Reemplazá estas URLs por los logos reales de los sponsors
      { title: "Sponsors", logos: [LOGO_FLAT, LOGO_FLAT, LOGO_FLAT] }
    ]
  },
  {
    performance: {
      performer: ["Apellido y Nombre", "Apellido y Nombre", "Apellido y Nombre", "Apellido y Nombre", "Apellido y Nombre"],   // un string si es solista, un array si son varios
      work: "Nombre de la obra",
      infoSeconds: 5,
      countdown: 5,
      link: "index.html",
      /*preset: "completo",
      escena: "enjambre",*/
      audio: "Remembranza.mp3"
    }
  },
  {
    dwell: 6000,
    slides: [
      { logo: LOGO_FLAT },
      // Reemplazá estas URLs por los logos reales de los sponsors
      { title: "Sponsors", logos: [LOGO_FLAT, LOGO_FLAT, LOGO_FLAT] }
    ]
  },
];
