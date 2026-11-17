// Journal du dashboard d'administration (table `admin_log`).
import type { Db } from '../env';
import { adminLog } from '../schema';

/** Inscrit une action au journal. `targetId` : un compte, ou `bug:<numéro>`. */
export async function logAction(db: Db, actor: string, action: string, targetId: string | null, detail?: unknown) {
  await db.insert(adminLog).values({
    id: crypto.randomUUID(),
    at: Date.now(),
    actor,
    action,
    targetId,
    detail: detail === undefined ? null : JSON.stringify(detail)
  });
}

export function logView(r: typeof adminLog.$inferSelect) {
  let detail: unknown = null;
  try {
    detail = r.detail ? JSON.parse(r.detail) : null;
  } catch {}
  return { id: r.id, at: r.at, actor: r.actor, action: r.action, targetId: r.targetId, detail };
}
