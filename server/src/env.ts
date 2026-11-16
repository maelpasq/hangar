import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type * as schema from './schema';

/** Variables et secrets du Worker (voir README.md). Aucun n'est dans le dépôt. */
export interface Env {
  /** Adresse publique de l'API, sans barre finale. */
  BASE_URL: string;
  TURSO_URL: string;
  TURSO_TOKEN?: string;
  /** Secret de Better Auth (signature des cookies). */
  AUTH_SECRET: string;
  /** Clé AES de 32 octets en base64 : chiffre les secrets rangés en base. */
  SECRETS_KEY: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Envoi des codes de connexion par e-mail (Resend). */
  RESEND_API_KEY?: string;
  /** Expéditeur des e-mails, par exemple « Hangar <connexion@exemple.fr> ». */
  MAIL_FROM?: string;
  /** Bucket R2 des avatars (`wrangler.toml`). Absent : pas d'avatar. */
  AVATARS?: AvatarStore;
  /** Durable Objects du temps réel (`wrangler.toml`, classe `Live`). Absent : pas de temps réel. */
  LIVE?: LiveNamespace;
}

/** Ce que l'API utilise d'un espace de Durable Objects. */
export interface LiveNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string | Request, init?: RequestInit): Promise<Response> };
}

/** Ce que l'API utilise d'un bucket R2 (remplacé dans les tests). */
export interface AvatarStore {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  /** Une clé ou plusieurs (1000 au plus par appel, comme R2). */
  delete(key: string | string[]): Promise<void>;
}

export type Db = LibSQLDatabase<typeof schema>;

/** Envoi du code de connexion. Remplacé dans les tests. */
export type Mailer = (to: string, code: string) => Promise<void>;

/** Envoi du rappel avant la suppression d'un compte inactif. Remplacé dans les tests. */
export type Notice = (to: string) => Promise<void>;
