// Tables de la base (Turso / libSQL). Les quatre premières sont celles de Better Auth
// (noms des tables et des champs imposés) ; les autres sont celles du compte Hangar.
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const date = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull()
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: date('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' })
  },
  (t) => [index('session_user').on(t.userId)]
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: date('access_token_expires_at'),
    refreshTokenExpiresAt: date('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull()
  },
  (t) => [index('account_user').on(t.userId)]
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: date('expires_at').notNull(),
    createdAt: date('created_at').notNull(),
    updatedAt: date('updated_at').notNull()
  },
  (t) => [index('verification_identifier').on(t.identifier)]
);

/** Limite de débit de Better Auth (un Worker n'a pas de mémoire entre deux requêtes). */
export const rateLimit = sqliteTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull()
});

/**
 * Un compte Hangar. `cursor` : compteur des changements, il sert de curseur de synchro.
 * `warnedAt` : e-mail de rappel avant la suppression d'un compte inactif (docs/COMPTE.md, section 9).
 */
export const profiles = sqliteTable('profiles', {
  userId: text('user_id').primaryKey(),
  cursor: integer('cursor').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  warnedAt: integer('warned_at')
});

/** Un poste connecté. `tokenHash` vide : poste déconnecté, gardé pour le détail du temps de jeu. */
export const devices = sqliteTable(
  'devices',
  {
    userId: text('user_id').notNull(),
    deviceId: text('device_id').notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').unique(),
    createdAt: integer('created_at').notNull(),
    lastSeen: integer('last_seen').notNull()
  },
  (t) => [primaryKey({ columns: [t.userId, t.deviceId] })]
);

/** Code à usage unique rendu à l'app après la connexion dans le navigateur (PKCE). */
export const loginCodes = sqliteTable('login_codes', {
  codeHash: text('code_hash').primaryKey(),
  userId: text('user_id').notNull(),
  challenge: text('challenge').notNull(),
  expiresAt: integer('expires_at').notNull()
});

/** Un élément synchronisé (clés de `syncEntries`, côté app). Supprimé : `deleted`, sans valeur. */
export const entries = sqliteTable(
  'entries',
  {
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    value: text('value'),
    updatedAt: integer('updated_at').notNull(),
    deviceId: text('device_id').notNull(),
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
    seq: integer('seq').notNull()
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] }), index('entries_seq').on(t.userId, t.seq)]
);

/** Sessions de jeu : ajoutées, jamais modifiées. */
export const gameSessions = sqliteTable(
  'game_sessions',
  {
    userId: text('user_id').notNull(),
    id: text('id').notNull(),
    gameId: text('game_id').notNull(),
    start: integer('start').notNull(),
    end: integer('end').notNull(),
    deviceId: text('device_id').notNull(),
    seq: integer('seq').notNull()
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index('game_sessions_seq').on(t.userId, t.seq)]
);

/** Jaquettes en fichier local envoyées par l'app : l'image est dans R2 (`covers/<compte>/<empreinte>`). */
export const covers = sqliteTable(
  'covers',
  {
    userId: text('user_id').notNull(),
    hash: text('hash').notNull(),
    size: integer('size').notNull(),
    type: text('type').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => [primaryKey({ columns: [t.userId, t.hash] })]
);

/** Secrets chiffrés (clé SteamGridDB) : la clé de chiffrement n'est pas dans la base. */
export const secrets = sqliteTable(
  'secrets',
  {
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    value: text('value').notNull(),
    nonce: text('nonce').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [primaryKey({ columns: [t.userId, t.name] })]
);
