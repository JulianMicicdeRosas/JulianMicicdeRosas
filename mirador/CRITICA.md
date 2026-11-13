# Mirador — crítica y propuestas de mejora

Revisión hecha el 12/11/2026 sobre el código de `main` y lo que se vio en las pruebas de la sala. Va de lo más grave a lo menos. Cada punto tiene una propuesta concreta.

## 1. Lo más importante

### 1.1 El panel de control se proyecta — **resuelto el 13/11: dos ventanas, control y salida (tecla O)**
El panel, los avisos y las vistas K y S viven en la misma ventana que la imagen. Todo lo que el operador abre lo ve el público. Ya hubo que esconder a mano el aviso de canción y la ayuda de teclas.

**Propuesta:** separar control y salida en dos ventanas. La salida queda limpia y va a OBS; el control se abre en el monitor del operador y le manda los cambios a la salida (`BroadcastChannel`, mismo origen). Es el cambio que más mejora el uso en función.

### 1.2 No hay "modo función"
Durante una función cualquier tecla hace algo: un número cambia la plantilla, X borra los ecos, B pone negro, Z resetea el zoom. No hay bloqueo ni confirmación. Los cambios de plantilla son cortes secos.

**Propuestas:**
- **Bloqueo de función:** una tecla que deja activas solo las teclas de show (siguiente escena, negro, pánico).
- **Lista de escenas por sesión:** plantilla + ajustes + canción, en orden, con "siguiente" y "anterior". Hoy la sesión guarda un solo estado.
- **Fundido entre plantillas** (1–3 s a negro o cruzado) en lugar del corte.

### 1.3 La detección depende de la CPU y en la sala está al límite
En la prueba del 11/11, con Resolume y NDI corriendo, la CPU llegó al 97 % y cada detección tardó 1–2 s (contra ~48 ms con la sala libre). Con eso las figuras llegan tarde, por más que el dibujo vaya a 60 fps.

**Propuestas:**
- Mostrar siempre en pantalla del operador el tiempo de detección, con alarma si pasa de 100 ms.
- Bajar solo la exigencia cuando se atrasa: de 3 partes a 2, de 384 a 320.
- Mover la detección a un *worker* con su propio contexto de GPU, para que no compita con el dibujo.
- Evaluar otra PC para Resolume/NDI, o una CPU con más núcleos: el cuello no es la 3070 Ti.

### 1.4 Demasiadas capas de geometría superpuestas
Hoy conviven: esquinas generales (C), zoom, esquinas por proyector, mosaico 8K con mapa a mano, líneas de calibración (K), sincronización automática y su ajuste fino. En la sala real, el mapeo a proyectores lo hace Resolume, así que la mitad no se usa y confunde.

**Propuesta:** un selector de "modo de salida" al arrancar: **Resolume/OBS** (lienzo limpio, sin mosaico ni esquinas), **splitter directo** (mosaico + esquinas por proyector) o **un proyector**. Cada modo muestra solo sus controles.

## 2. Interfaz

- **Ocho pestañas y mucho scroll.** Cámaras tiene seis grupos; Módulos, 19 efectos con unos diez controles cada uno. **Propuesta:** en Módulos mostrar solo los efectos encendidos y un botón "agregar efecto"; un buscador de controles.
- **31 plantillas, 10 teclas.** No se pueden ordenar ni marcar favoritas. **Propuesta:** favoritas arrastrables; las teclas 1–0 siguen ese orden; filtro por tipo (partículas, fluido, líneas, figura).
- **Sin deshacer.** Un control movido por error no vuelve. **Propuesta:** doble clic en un control lo devuelve al valor de la plantilla; Ctrl+Z para el último cambio.
- **Etiquetas cortadas** ("ver la cámara sobr…", "puntos a lo ancho (…"). **Propuesta:** etiquetas en dos líneas o más cortas.
- **Tres nombres para lo mismo:** "Sincronizar", "Calibrar cámara a las paredes (K)" y "Esquinas (C)" suenan parecido y hacen cosas distintas. **Propuesta:** "Cámara → paredes" (sincronizar y líneas) y "Salida → proyectores" (esquinas, mosaico).
- **Sin estado a la vista.** Para saber si está todo bien hay que entrar a tres pestañas. **Propuesta:** una barra fija con cuatro luces: cámara, detección (ms), sincronización (fecha, o "vencida") y audio.
- **Los avisos se proyectan.** Pasan por la misma ventana. Se resuelve con 1.1.
- **El arranque pregunta poco.** La puerta pide sesión, formato y audio, pero no dice si la cámara anda ni qué sesión corresponde a la sala. **Propuesta:** botón "Sala" que cargue `sesiones/Sala.json`, y una prueba de cámara antes de encender.

## 3. Orden del proyecto

- **Código muy denso.** Hay líneas de 400 caracteres con varias sentencias, y todo son variables globales que dependen del orden de carga. Es rápido de escribir y difícil de mantener. **Propuesta:** pasar a módulos ES, una sentencia por línea con un formateador, y separar `ui.js` (hoy más de 450 líneas) por pestaña.
- **Sin pruebas automáticas.** Cada cambio se verificó a mano con Playwright y scripts sueltos. **Propuesta:** guardar esos scripts en `pruebas/` (arranque, todas las plantillas sin error de GPU, sincronización simulada, recuperación) y correrlos antes de cada subida.
- **Dos generaciones de efectos.** Los clásicos dibujan en CPU sobre un lienzo 2D de 8192 px; los nuevos van en GPU. Los clásicos son los que más cargan la CPU, que es justo el recurso escaso en la sala. **Propuesta:** portar a GPU los que se usen (silueta ya lo está; garabato, grilla y lluvia son candidatos) y retirar los que no.
- **Sesiones atadas al puerto.** Viven en el `localStorage` del origen: 8765 y 8766 son mundos distintos, y ya causó confusión. **Propuesta:** guardar y leer sesiones como archivos en `sesiones/` con un servidor local mínimo que acepte escritura; un solo puerto.
- **Cinco lanzadores.** `start_windows`, `start_8k`, `start_13440`, `start_sala`, `start_mac`. **Propuesta:** uno por sistema, y que el modo se elija en la puerta.
- **Cinco documentos que se pisan.** README, LEEME-PC, TRASPASO, REVISION y PLANTILLAS repiten cosas y partes quedaron viejas (TRASPASO §6.1 todavía habla del mosaico). **Propuesta:** README para usar, TRASPASO solo para el estado actual, y borrar REVISION.
- **Restos.** `legado/`, `secuencia.js` y la presentación embebida no son parte del programa. **Propuesta:** moverlos a una carpeta `extras/` o sacarlos.

## 4. Imagen

- **Corte seco entre plantillas** (ver 1.2).
- **El audio mueve poco.** Tamaño, brillo y tono reaccionan, pero ningún efecto nuevo tiene una respuesta propia al golpe. **Propuesta:** un pulso por efecto: las partículas saltan, la membrana tiembla, el fluido suelta una bocanada.
- **Las paredes no se distinguen.** El lienzo es uno solo; no hay forma de poner otra plantilla o color por pared. **Propuesta:** plantilla o paleta por pared.
- **Ajustado sin la sala.** Brillos y densidades se calibraron con cuerpos simulados y sin placa de video. Hay que repasarlos una vez en la sala y guardar esos valores como los de fábrica.

## 5. Orden sugerido

1. Ventana de control separada (1.1).
2. Modo función: bloqueo, lista de escenas y fundido (1.2).
3. Luces de estado y alarma de detección (1.3, §2).
4. Modo de salida al arrancar y limpieza de controles (1.4).
5. Favoritas y filtro de plantillas; deshacer (§2).
6. Pruebas automáticas y un solo lanzador (§3).
7. Portar o retirar los efectos clásicos (§3).
