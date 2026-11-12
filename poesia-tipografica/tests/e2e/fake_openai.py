"""OpenAI simulado para las pruebas: Realtime (transcripción, protocolo GA) por WebSocket en 9970 y
chat/completions (director de arte) por HTTP en 9971. Registra todo lo que recibe para revisar qué manda el programa.

Uso: python fake_openai.py <archivo de registro> <composiciones.json>"""
import asyncio, base64, json, random, sys, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
import numpy as np
import websockets

LOG = open(sys.argv[1], 'a', buffering=1)
COMPS = json.load(open(sys.argv[2]))
N_CHAT = 0
# Imágenes ASCII con tonos, como las que se le piden al modelo con la rampa " .:-=+*#%@"
ASCII = {
    'luna': '''
                   .:-==-:.
                .-+*#%%%%#*+-.
              .=*#%@@@@@@@%#*=.
             -+#%@@@@@@@@@@%#*+-
            :*#%@@@@%%%@@@@%%#*+:
            =#%@@@%*+=+*%@@%%#*+=
            +#%@@@#+-.-+#@@%%#*+=.
            =#%@@@%*+=+*%@%%##*+-
            :*#%@@@@%%%@%%%#**+=.
             -+#%%@@@%%%%##**+=:
              .=*##%%%%##**++-.
                .-=+****++=-:
                   .::--::.
''',
    'casa': '''
                      .=.
                    .=#@#=.
                  .=#@@@@@#=.
                .=#@@@@@@@@@#=.
              .=#@@@@@@@@@@@@@#=.
            .=#%%%%%%%%%%%%%%%%%#=.
              |*************=====|
              |****#####****=====|
              |****#:.:#****==+==|
              |****#:.:#****==+==|
              |****#####****=====|
              |*************=====|
              |****%%%%%****=====|
              |****%@@@%****=====|
              |****%@@@%****=====|
              +------------------+
''',
}
def log(*a): LOG.write(time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a) + '\n')

FRASES = ['la casa respira bajo el agua', 'el silencio sube por la escalera', 'la luna se moja en el patio',
          'nadie nombra la memoria que se deshace', 'un pájaro cruza la mano abierta del viento', 'el árbol guarda la noche en sus raíces']

async def transcribe(ws, item, words):
    if not words: return
    for w in words:
        await ws.send(json.dumps({'type': 'conversation.item.input_audio_transcription.delta', 'item_id': item, 'delta': w + ' '}))
        await asyncio.sleep(0.05)
    await ws.send(json.dumps({'type': 'conversation.item.input_audio_transcription.completed', 'item_id': item, 'transcript': ' '.join(words)}))
    log('transcripto', item, ' '.join(words))

async def realtime(ws):
    auth = ws.request.headers.get('Authorization', '')
    log('WS conectado', ws.request.path, 'auth', auth[:12] + '…', 'beta' if ws.request.headers.get('OpenAI-Beta') else 'ga')
    if not auth.startswith('Bearer sk-'):
        await ws.send(json.dumps({'type': 'error', 'error': {'code': 'invalid_api_key', 'message': 'bad key'}})); return
    await ws.send(json.dumps({'type': 'session.created'}))
    audio_s, speaking, n_item, quiet, seg, item, words = 0.0, 0.0, 0, 0.0, 0.0, '', []
    async for raw in ws:
        ev = json.loads(raw); et = ev.get('type')
        if et == 'session.update':
            sess = ev.get('session', {})
            inp = sess.get('audio', {}).get('input', {})
            log('session.update type=', sess.get('type'), 'formato=', inp.get('format'), 'transcripción=', inp.get('transcription'), 'vad=', (inp.get('turn_detection') or {}).get('type'))
            ok = sess.get('type') == 'transcription' and inp.get('format', {}).get('rate') == 24000
            await ws.send(json.dumps({'type': 'session.updated'} if ok else {'type': 'error', 'error': {'code': 'invalid_value', 'message': 'config'}}))
        elif et == 'input_audio_buffer.append':
            pcm = np.frombuffer(base64.b64decode(ev['audio']), dtype=np.int16)
            dur = len(pcm) / 24000; audio_s += dur
            loud = np.sqrt(np.mean((pcm / 32768.0) ** 2)) > 0.02
            if loud:
                quiet = 0.0
                if not speaking:
                    speaking = 1.0; seg = 0.0; n_item += 1; item = f'item_{n_item}'; words = random.choice(FRASES).split() + random.choice(FRASES).split()
                    await ws.send(json.dumps({'type': 'input_audio_buffer.speech_started', 'item_id': item})); log('speech_started', f'{audio_s:.1f}')
                seg += dur
            elif speaking:
                quiet += dur
                if quiet >= 0.35:  # VAD: fin del habla → transcribe lo que queda del tramo
                    speaking = 0.0
                    await ws.send(json.dumps({'type': 'input_audio_buffer.speech_stopped', 'item_id': item})); log('speech_stopped', f'{audio_s:.1f}')
                    await transcribe(ws, f'{item}_fin', words); words = []
        elif et == 'input_audio_buffer.commit':
            log('commit del cliente (micro-pausa)', f'{audio_s:.1f}')
            n_item += 1
            take = words[:4]; del words[:4]
            await transcribe(ws, f'item_{n_item}_c', take)
        elif et == 'input_audio_buffer.clear':
            log('clear (dejó de grabar)', f'audio recibido {audio_s:.1f} s')
        else:
            log('otro evento', et)

class Chat(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        sysmsg, user = body['messages'][0]['content'], body['messages'][1]['content']
        log('chat', self.path, 'modelo', body.get('model'), 'json', body.get('response_format'), 'max_tokens', body.get('max_tokens'),
            'auth', self.headers.get('Authorization', '')[:12] + '…', '| sistema:', sysmsg[:60].replace('\n', ' '), '| usuario:', user[:80].replace('\n', ' '))
        global N_CHAT
        N_CHAT += 1
        name = random.choice(list(COMPS))
        if '.:-=+*#%@' in sysmsg:
            # imagen ASCII con tonos; una de cada cuatro respuestas viene vacía, para ejercitar el reintento
            fig = random.choice(list(ASCII))
            rows = [] if N_CHAT % 4 == 0 else ASCII[fig].strip('\n').splitlines()
            out = {'figura': fig, 'grilla': rows, 'fisica': {'modo': 'lluvia_text_rain', 'intensidad': 0.4}, 'palabras_clave': ['luna', 'casa'], 'duracion_s': 14}
        elif '"formas"' in sysmsg:
            out = {'figura': name, 'formas': COMPS[name], 'fisica': {'modo': 'lluvia_text_rain', 'intensidad': 0.4}, 'palabras_clave': ['luna', 'casa'], 'duracion_s': 14}
        elif '"emoji"' in sysmsg:
            out = {'figura': 'arbol', 'emoji': '🌳', 'fisica': {'modo': 'lluvia_text_rain'}, 'palabras_clave': [], 'duracion_s': 14}
        else:
            out = {'modo_visual': 'concreto', 'figura': 'luna', 'svg_paths': [], 'fisica': {'modo': 'lluvia_text_rain'}, 'paleta': {}, 'palabras_clave': [], 'duracion_s': 14}
        data = json.dumps({'choices': [{'message': {'content': json.dumps(out, ensure_ascii=False)}}]}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def log_message(self, *a): pass

async def main():
    threading.Thread(target=HTTPServer(('127.0.0.1', 9971), Chat).serve_forever, daemon=True).start()
    async with websockets.serve(realtime, '127.0.0.1', 9970, max_size=None):
        log('OpenAI simulado listo')
        await asyncio.Future()
asyncio.run(main())
