// Temps réel du social (docs/COMPTE.md, phase 7) : un Durable Object par compte garde les
// connexions WebSocket de ses postes (API d'hibernation : rien ne tourne entre deux messages).
// L'API y pousse les évènements (`POST /push`) ; l'ouverture de la première connexion et la
// fermeture de la dernière mettent le compte en ligne ou hors ligne auprès de ses amis.
import { dbOf } from './db';
import type { Env, LiveNamespace } from './env';
import { type Hub, setOnline, touch } from './social';

/** Ce que ce fichier utilise d'un WebSocket et de l'état d'un Durable Object (types du runtime). */
interface Socket {
  readonly readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
}
interface State {
  acceptWebSocket(ws: Socket, tags?: string[]): void;
  getWebSockets(tag?: string): Socket[];
  getTags(ws: Socket): string[];
}
declare const WebSocketPair: { new (): { 0: Socket; 1: Socket } };

const OPEN = 1;
/** Un signe de vie au plus toutes les 3 minutes en base (l'app en envoie toutes les 4). */
const TOUCH_EVERY = 3 * 60_000;

/** Envoi d'évènements aux comptes connectés en temps réel. Sans liaison `LIVE` : rien. */
export function liveHub(ns: LiveNamespace | undefined): Hub {
  if (!ns) return async () => {};
  return async (ids, event) => {
    const body = JSON.stringify(event);
    await Promise.all(
      [...new Set(ids)].map((id) =>
        ns
          .get(ns.idFromName(id))
          .fetch('https://live/push', { method: 'POST', body })
          .catch((e) => console.error('[hangar] temps réel', e))
      )
    );
  };
}

export class Live {
  private lastTouch = 0;

  constructor(
    private state: State,
    private env: Env
  ) {}

  private open(except?: Socket): Socket[] {
    return this.state.getWebSockets().filter((ws) => ws !== except && ws.readyState === OPEN);
  }

  private presence(userId: string, online: boolean): Promise<void> {
    return setOnline(dbOf(this.env), liveHub(this.env.LIVE), userId, online).catch((e) =>
      console.error('[hangar] présence', e)
    );
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/push') {
      const text = await req.text();
      for (const ws of this.open()) {
        try {
          ws.send(text);
        } catch {}
      }
      return new Response('ok');
    }
    if (url.pathname === '/connect') {
      const userId = req.headers.get('x-hangar-user') ?? '';
      if (!userId || req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response(null, { status: 400 });
      const pair = new WebSocketPair();
      const first = this.open().length === 0;
      this.state.acceptWebSocket(pair[1], [userId]);
      if (first) await this.presence(userId, true);
      return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
    }
    return new Response(null, { status: 404 });
  }

  async webSocketMessage(ws: Socket, message: string | ArrayBuffer): Promise<void> {
    if (message !== 'ping') return;
    try {
      ws.send('{"type":"pong"}');
    } catch {}
    const now = Date.now();
    if (now - this.lastTouch < TOUCH_EVERY) return;
    this.lastTouch = now;
    const [userId] = this.state.getTags(ws);
    if (userId) await touch(dbOf(this.env), userId, now).catch(() => {});
  }

  async webSocketClose(ws: Socket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {}
    const [userId] = this.state.getTags(ws);
    if (userId && this.open(ws).length === 0) await this.presence(userId, false);
  }

  async webSocketError(ws: Socket): Promise<void> {
    await this.webSocketClose(ws, 1011, 'erreur');
  }
}
