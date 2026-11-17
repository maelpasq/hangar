// Dashboard d'administration : Cloudflare Access le protège avant même le Worker (connexion de
// l'administrateur chez Cloudflare). Le Worker vérifie quand même le jeton qu'Access ajoute à chaque
// requête (`Cf-Access-Jwt-Assertion`, RS256) : signature par les clés publiques de l'équipe,
// audience de l'application, expiration, puis l'adresse, qui doit être celle de `ADMIN_EMAIL`.
import type { Env } from '../env';

export type Keys = (team: string, refresh: boolean) => Promise<JsonWebKey[]>;

type Jwk = JsonWebKey & { kid?: string };

const HOUR = 3_600_000;
let cache: { team: string; keys: Jwk[]; at: number } | undefined;

/** Clés publiques de l'équipe Access, gardées une heure (relues si une clé inconnue arrive). */
export const accessKeys: Keys = async (team, refresh) => {
  const now = Date.now();
  if (!refresh && cache?.team === team && now - cache.at < HOUR) return cache.keys;
  const res = await fetch(`${team}/cdn-cgi/access/certs`, { redirect: 'manual' });
  if (!res.ok) throw new Error(`clés Access : ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  cache = { team, keys: body.keys ?? [], at: now };
  return cache.keys;
};

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const json = (s: string): unknown => JSON.parse(new TextDecoder().decode(fromB64url(s)));
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Adresse de l'équipe Access, sans barre finale, si elle est bien formée. */
export function teamOf(env: Env): string | null {
  const t = env.ACCESS_TEAM?.trim().replace(/\/+$/, '');
  return t && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(t) ? t : null;
}

/**
 * E-mail de l'administrateur si `token` est un jeton Access valide pour ce dashboard et que son
 * adresse est `ADMIN_EMAIL` ; sinon `null`. Sans `ACCESS_TEAM`, `ACCESS_AUD` ou `ADMIN_EMAIL` : personne.
 */
export async function adminFromAccess(token: string | undefined, env: Env, keys: Keys, now = Date.now()): Promise<string | null> {
  const team = teamOf(env);
  const aud = env.ACCESS_AUD?.trim();
  const admin = env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!token || !team || !aud || !admin) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: unknown;
  let claims: unknown;
  try {
    header = json(parts[0]);
    claims = json(parts[1]);
  } catch {
    return null;
  }
  if (!isObject(header) || !isObject(claims) || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  let key = (await keys(team, false)).find((k: Jwk) => k.kid === header.kid);
  if (!key) key = (await keys(team, true)).find((k: Jwk) => k.kid === header.kid);
  if (!key) return null;
  const pub = await crypto.subtle.importKey(
    'jwk',
    { kty: key.kty, n: key.n, e: key.e },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = fromB64url(parts[2]);
  } catch {
    return null;
  }
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pub, signature, signed))) return null;

  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud) || claims.iss !== team) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
  if (typeof claims.nbf === 'number' && claims.nbf * 1000 > now + 60_000) return null;
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  return email && email === admin ? email : null;
}
