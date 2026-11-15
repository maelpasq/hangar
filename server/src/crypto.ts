// Jetons, empreintes et chiffrement (WebCrypto : identique dans le Worker et dans les tests).

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Jeton aléatoire de 32 octets. */
export function randomToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/** Empreinte rangée en base à la place d'un jeton ou d'un code. */
export async function hashToken(token: string): Promise<string> {
  return [...(await sha256(token))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Défi PKCE (S256) d'un vérifieur. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(await sha256(verifier));
}

async function aesKey(secretsKey: string): Promise<CryptoKey> {
  const raw = fromB64(secretsKey);
  if (raw.length !== 32) throw new Error('SECRETS_KEY doit faire 32 octets (base64)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Chiffre `plain` (AES-GCM). `context` lie le résultat à son compte et à son nom. */
export async function seal(secretsKey: string, context: string, plain: string): Promise<{ value: string; nonce: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(context) },
    await aesKey(secretsKey),
    enc.encode(plain)
  );
  return { value: b64url(new Uint8Array(data)), nonce: b64url(iv) };
}

export async function unseal(secretsKey: string, context: string, value: string, nonce: string): Promise<string> {
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(nonce), additionalData: enc.encode(context) },
    await aesKey(secretsKey),
    fromB64(value)
  );
  return new TextDecoder().decode(data);
}
