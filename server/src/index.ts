// Entrée du Worker Cloudflare : client Turso par HTTP, une app par isolat. La tâche planifiée
// (`wrangler.toml`, une fois par jour) fait le ménage : jaquettes plus utilisées, comptes inactifs.
import { createClient } from '@libsql/client/web';
import { drizzle } from 'drizzle-orm/libsql/web';
import { createApp } from './app';
import { noticeMailer } from './auth';
import type { Db, Env } from './env';
import { daily } from './lifecycle';
import * as schema from './schema';

let db: Db | undefined;
let app: ReturnType<typeof createApp> | undefined;

const dbOf = (env: Env): Db => (db ??= drizzle(createClient({ url: env.TURSO_URL, authToken: env.TURSO_TOKEN }), { schema }));

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    app ??= createApp(dbOf(env), env);
    return app.fetch(request);
  },

  scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): void {
    ctx.waitUntil(daily(dbOf(env), env.AVATARS, noticeMailer(env)).catch((e) => console.error('[hangar] ménage', e)));
  }
};
