# Mirador - servidor local (lo usan start_windows.bat y start_mac.command).
# Igual que "python -m http.server", pero le dice al navegador que no use copias viejas
# de los archivos: despues de actualizar el repo, Chrome carga siempre el codigo nuevo.
# Uso: python servidor.py [puerto]   (por defecto 8765, solo en 127.0.0.1)
#
# Ademas sirve /flat/acreditaciones/ : la pagina https://www.flatfestival.org/acreditaciones/
# traida en el momento, sin su fondo de particulas y con fondo transparente, para que
# acreditaciones-salida.html la ponga sobre las particulas de la sala. Si no hay internet,
# entrega la ultima copia que haya bajado (.cache-flat/).
import http.server
import os
import re
import sys
import urllib.request

FLAT = "https://www.flatfestival.org/acreditaciones/"
AQUI = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(AQUI, ".cache-flat", "acreditaciones.html")


def pagina_flat():
    """Devuelve (html en bytes, origen) o (None, error)."""
    try:
        req = urllib.request.Request(FLAT, headers={"User-Agent": "Mozilla/5.0 (Mirador)"})
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read().decode("utf-8", "replace")
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        with open(CACHE, "w", encoding="utf-8") as f:
            f.write(html)
        origen = "en vivo"
    except Exception as e:  # sin internet: la ultima copia
        if not os.path.exists(CACHE):
            return None, str(e)
        with open(CACHE, encoding="utf-8") as f:
            html = f.read()
        origen = "copia guardada"
    # sin el fondo de particulas de la web (lo reemplazan las particulas de la sala)
    html = re.sub(r'<script[^>]*src="[^"]*fondo\.js[^"]*"[^>]*>\s*</script>', "", html)
    # el QR se arma con la direccion de la pagina: tiene que apuntar al sitio real, no a 127.0.0.1
    html = html.replace("location.href.split('?')[0]", "'" + FLAT + "'")
    try:
        with open(os.path.join(AQUI, "acred", "pagina.css"), encoding="utf-8") as f:
            css = f.read()
    except OSError:
        css = "html,body{background:transparent!important}#fondo1-holder{display:none!important}"
    # <base>: los estilos, scripts e imagenes relativos se piden al sitio real
    cabeza = '<base href="' + FLAT + '"><style id="mirador-acred">' + css + "</style>"
    html = re.sub(r"<head([^>]*)>", lambda m: "<head" + m.group(1) + ">" + cabeza, html, count=1)
    return html.encode("utf-8"), origen


class SinCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # no-cache: puede guardar el archivo, pero tiene que preguntar si cambio (304 si no cambio)
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass

    def flat(self, cuerpo=True):
        html, origen = pagina_flat()
        if html is None:
            self.send_error(502, "No se pudo traer la pagina de FLAT: " + origen)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.send_header("X-Mirador-Origen", origen.replace(" ", "-"))
        self.end_headers()
        if cuerpo:
            self.wfile.write(html)

    def es_flat(self):
        return self.path.split("?")[0].rstrip("/") == "/flat/acreditaciones"

    def do_GET(self):
        if self.es_flat():
            return self.flat()
        return super().do_GET()

    def do_HEAD(self):
        if self.es_flat():
            return self.flat(cuerpo=False)
        return super().do_HEAD()


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(("127.0.0.1", puerto), SinCache).serve_forever()
