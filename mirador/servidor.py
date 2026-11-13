# Mirador - servidor local (lo usan start_windows.bat y start_mac.command).
# Igual que "python -m http.server", pero le dice al navegador que no use copias viejas
# de los archivos: despues de actualizar el repo, Chrome carga siempre el codigo nuevo.
# Uso: python servidor.py [puerto]   (por defecto 8765, solo en 127.0.0.1)
import http.server
import sys


class SinCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # no-cache: puede guardar el archivo, pero tiene que preguntar si cambio (304 si no cambio)
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(("127.0.0.1", puerto), SinCache).serve_forever()
