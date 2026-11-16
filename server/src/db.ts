// Client Turso par HTTP, un par isolat (partagé par le Worker et ses Durable Objects).
import { createClient } from '@libsql/client/web';
import { drizzle } from 'drizzle-orm/libsql/web';
import type { Db, Env } from './env';
import * as schema from './schema';

let db: Db | undefined;

export const dbOf = (env: Env): Db => (db ??= drizzle(createClient({ url: env.TURSO_URL, authToken: env.TURSO_TOKEN }), { schema }));
