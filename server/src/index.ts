// Entrée du Worker Cloudflare : une app par isolat. La tâche planifiée (`wrangler.toml`, une fois
// par jour) fait le ménage : jaquettes plus utilisées, comptes inactifs, vieille activité.
import { createApp } from './app';
import { noticeMailer } from './auth';
import { dbOf } from './db';
import type { Env } from './env';
import { daily } from './lifecycle';
import { liveHub } from './live';

export { Live } from './live';

let app: ReturnType<typeof createApp> | undefined;

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    app ??= createApp(dbOf(env), env, undefined, liveHub(env.LIVE));
    return app.fetch(request);
  },

  scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): void {
    ctx.waitUntil(daily(dbOf(env), env.AVATARS, noticeMailer(env)).catch((e) => console.error('[hangar] ménage', e)));
  }
};
