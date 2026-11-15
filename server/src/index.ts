// Entrée du Worker Cloudflare : client Turso par HTTP, une app par isolat.
import { createClient } from '@libsql/client/web';
import { drizzle } from 'drizzle-orm/libsql/web';
import { createApp } from './app';
import type { Env } from './env';
import * as schema from './schema';

let app: ReturnType<typeof createApp> | undefined;

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    app ??= createApp(drizzle(createClient({ url: env.TURSO_URL, authToken: env.TURSO_TOKEN }), { schema }), env);
    return app.fetch(request);
  }
};
