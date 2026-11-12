"""Pruebas de las partes puras del backend (sin micrófono, sin red). Corren en un segundo:

    python tests/test_server.py        (o:  pytest tests/)
"""
import datetime as dt
import os
import sys
import tempfile

os.environ.setdefault("FLAT_DIR", tempfile.mkdtemp(prefix="flat-test-"))  # no tocar Documentos/Ciclo FLAT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server as S  # noqa: E402

LUNA = """
                   .:-==-:.
                .-+*#%%%%#*+-.
              .=*#%@@@@@@@%#*=.
             -+#%@@@@@@@@@@%#*+-
            :*#%@@@@%%%@@@@%%#*+:
            =#%@@@%*+=+*%@@%%#*+=
            :*#%@@@@%%%@%%%#**+=.
              .=*##%%%%##**++-.
                   .::--::.
"""


def test_ascii_conserva_los_tonos():
    rows, why = S.ascii_tones(LUNA)
    assert rows and not why
    assert len(rows) == S.GRID_H and all(len(r) == S.GRID_W for r in rows)
    assert len(set("".join(rows))) >= 8, "se perdieron los tonos intermedios"
    assert rows[0].strip("0") == "" and rows[-1].strip("0") == "", "la figura no quedó centrada con margen"


def test_ascii_acepta_lista_y_fondo_de_puntos():
    rows, why = S.ascii_tones(["." * 20, "....########........", "...##########.......", "....########........", "." * 20])
    assert rows, why
    assert "".join(rows).count("0") > 0.4 * S.GRID_W * S.GRID_H, "los puntos del fondo se tomaron como figura"


def test_ascii_rechaza_lo_que_no_sirve():
    assert S.ascii_tones([])[0] is None
    assert S.ascii_tones(["   ", "   "])[0] is None
    assert S.ascii_tones("@" * 48 + ("\n" + "@" * 48) * 25)[0] is None  # todo lleno: sin figura
    assert S.ascii_tones(None)[1]


def test_ascii_signos_fuera_de_la_rampa():
    rows, _ = S.ascii_tones(["  /\\  ", " /MM\\ ", "/MMMM\\", "|MMMM|", "+----+"] * 2)
    assert rows and "8" in "".join(rows)


def test_origen_del_websocket():
    ok = S.FrontendHub.origin_allowed
    assert ok(None) and ok("http://127.0.0.1:5173") and ok("http://localhost:5173") and ok("http://[::1]:5173")
    assert not ok("https://ejemplo.com") and not ok("http://127.0.0.1.ejemplo.com") and not ok("null") and not ok("file://")
    os.environ["WS_ORIGINS"] = "http://192.168.1.20:5173"
    try:
        assert ok("http://192.168.1.20:5173")
    finally:
        del os.environ["WS_ORIGINS"]


CRONO = """Título,,,,,,,,,,,,,
ID,Fecha,Inicio,Fin,Tipo,Actividad,Descripción (web),Artistas / participantes,Sede / sala,Estado (Agenda),Ciclo (web),Recorrido,Inscripción,Publicar en la web
EV-1,11/11/2026,18:30,20:00,Lectura,Ciclo Umbral,,"Ana Suárez, Leandro Recabarren · desmontaje: Lia Vinci",MMAMM - Sala inmersiva,,Ciclo Umbral,,,Sí
EV-2,11/11/2026,15:00,18:00,Capacitación,Taller de negociación,,Guillermo Núñez (Xowen Studio),MMAMM - Espacio de taller,,Talleres y Charlas,,,Sí
EV-3,22/10/2026,18:00,18:20,Charla,Charla: Plataformas,,"Gabriela Bazán, Iván Vidal",MMAMM - Sala inmersiva,,Talleres y Charlas,,,Sí
EV-4,22/10/2026,20:00,20:30,Charla,Charla: Oculta,,Ezequiel Gatto,MMAMM - Sala inmersiva,,Talleres y Charlas,,,No
"""


def test_cronograma_umbral():
    ev = S.parse_cronograma(CRONO)
    assert len(ev) == 3, "lo no publicado no se lee"
    p = S.propose_placas(ev, dt.date(2026, 11, 11))
    assert [x["nombre"] for x in p["umbral"]] == ["Ana Suárez", "Leandro Recabarren", "Lia Vinci"]
    assert p["umbral"][-1]["detalle"].endswith("desmontaje")
    assert p["charlas"][0]["nombre"] == "Guillermo Núñez" and p["charlas"][0]["usar"] is False  # otra sala, sin paréntesis
    assert p["sugerida"] == "umbral"


def test_cronograma_charlas():
    p = S.propose_placas(S.parse_cronograma(CRONO), dt.date(2026, 10, 22))
    assert [x["nombre"] for x in p["charlas"]] == ["Gabriela Bazán y Iván Vidal"]
    assert p["sugerida"] == "charlas" and not p["umbral"]


def test_cronograma_dia_sin_actividades():
    p = S.propose_placas(S.parse_cronograma(CRONO), dt.date(2026, 12, 25))
    assert not p["umbral"] and not p["charlas"] and p["sugerida"] == ""


def test_ajustes_guardan_lo_nuevo():
    store = S.SettingsStore(os.path.join(tempfile.mkdtemp(), "ajustes.json"))
    nuevos = {"dibujo_letras": "rampa", "ascii_v13": True, "loop_viejo_v13": True, "cero": {"palabras": 20}, "brillo": {"fondo": 0.5},
              "grabar": False, "carpeta_grabaciones": "x", "presentacion": "charlas", "titulo_solido_v12": True}
    store.update({**nuevos, "no_existe": 1})
    assert all(store.data.get(k) == v for k, v in nuevos.items()), "un ajuste nuevo no está en SettingsStore.KEYS"
    assert "no_existe" not in store.data


def test_carpeta_de_grabaciones():
    d = tempfile.mkdtemp()
    assert S.resolve_recordings_dir(d) == os.path.realpath(d)
    assert S.check_writable(d) is None
    assert S.check_writable(os.path.join(os.sep, "proc", "no_se_puede")) is not None or os.name == "nt"


if __name__ == "__main__":
    fallas = 0
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ✓ {nombre}")
            except Exception as exc:  # noqa: BLE001
                fallas += 1
                print(f"  ✗ {nombre}: {exc!r}")
    print("Todo bien." if not fallas else f"{fallas} prueba(s) fallaron.")
    sys.exit(1 if fallas else 0)
