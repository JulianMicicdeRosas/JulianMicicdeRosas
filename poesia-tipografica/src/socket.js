// socket.js — Cliente WebSocket con reconexión exponencial hacia server.py.
export class BackendSocket {
  constructor(url, handlers = {}) {
    this.url = url;
    this.handlers = handlers;
    this.ws = null;
    this.backoff = 500;
    this.open = false;
    this.lastMessage = 0;
    this._connect();
    // Watchdog: si el servidor deja de hablar (proceso colgado), forzar reconexión.
    this._watch = setInterval(() => {
      if (this.open && performance.now() - this.lastMessage > 15000) this.send({ type: 'ping', t: Date.now() });
      if (this.open && performance.now() - this.lastMessage > 30000) this.ws?.close();
    }, 5000);
  }

  _connect() {
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      this._schedule();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.open = true;
      this.backoff = 500;
      this.lastMessage = performance.now();
      this.handlers.open?.();
    };
    ws.onmessage = (ev) => {
      this.lastMessage = performance.now();
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const fn = this.handlers[msg.type];
      if (fn) {
        try {
          fn(msg);
        } catch (e) {
          console.error('[ws] handler', msg.type, e);
        }
      }
    };
    ws.onclose = () => {
      const was = this.open;
      this.open = false;
      if (was) this.handlers.close?.();
      this._schedule();
    };
    ws.onerror = () => {};
  }

  _schedule() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this._connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 1.7, 5000);
  }

  send(obj) {
    if (this.open && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }
}
