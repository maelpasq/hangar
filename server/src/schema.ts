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

// --- Social (docs/COMPTE.md, phase 7) ---

/**
 * Réglages et état social d'un compte. `enabled` : amis activés (sinon invisible et hors ligne).
 * Visibilités : `all`, `friends` ou `none`. `showcase` : vitrine du profil (JSON envoyé par l'app :
 * jeux les plus joués, jeux favoris, collections mises en avant) ; `games` : bibliothèque (identifiants portables
 * et noms), pour les jeux en commun. `online` : un poste a sa connexion temps réel ouverte ;
 * `seen` : dernier signe de vie ; `playing` : jeu en cours (JSON `{ id, name, since }`).
 */
export const social = sqliteTable(
  'social',
  {
    userId: text('user_id').primaryKey(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    code: text('code').notNull().unique(),
    findable: integer('findable', { mode: 'boolean' }).notNull().default(true),
    statusVis: text('status_vis').notNull().default('friends'),
    gameVis: text('game_vis').notNull().default('friends'),
    playVis: text('play_vis').notNull().default('friends'),
    libraryVis: text('library_vis').notNull().default('friends'),
    banner: text('banner'),
    showcase: text('showcase'),
    games: text('games'),
    online: integer('online', { mode: 'boolean' }).notNull().default(false),
    seen: integer('seen').notNull().default(0),
    playing: text('playing'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('social_enabled').on(t.enabled, t.findable)]
);

/**
 * Liens entre deux comptes, vus de `userId` : `friend`, `out` (demande envoyée), `in` (demande
 * reçue), `blocked` (bloqué par `userId`). Une amitié a deux lignes, une demande aussi (out / in).
 */
export const friends = sqliteTable(
  'friends',
  {
    userId: text('user_id').notNull(),
    otherId: text('other_id').notNull(),
    state: text('state').notNull(),
    since: integer('since').notNull()
  },
  (t) => [primaryKey({ columns: [t.userId, t.otherId] }), index('friends_other').on(t.otherId)]
);

/** Activité visible des amis : jeu lancé (`play`), jeux ajoutés (`added`). `data` : JSON. */
export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    data: text('data').notNull(),
    at: integer('at').notNull()
  },
  (t) => [index('activity_user').on(t.userId, t.at)]
);

/**
 * Messages privés, chiffrés au repos (AES-GCM, clé hors de la base). `convo` : les deux comptes,
 * triés, séparés par `:`. `kind` : `text` ou `invite` (invitation sur un jeu).
 */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    convo: text('convo').notNull(),
    fromId: text('from_id').notNull(),
    toId: text('to_id').notNull(),
    kind: text('kind').notNull(),
    body: text('body').notNull(),
    nonce: text('nonce').notNull(),
    at: integer('at').notNull(),
    readAt: integer('read_at')
  },
  (t) => [index('messages_convo').on(t.convo, t.at), index('messages_unread').on(t.toId, t.readAt)]
);

/** Signalements d'un compte ou d'un message, examinés à la main par le développeur. */
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reporterId: text('reporter_id').notNull(),
    targetId: text('target_id').notNull(),
    messageId: text('message_id'),
    /** Texte du message signalé, copié au moment du signalement (pour l'examen). */
    excerpt: text('excerpt'),
    reason: text('reason').notNull(),
    at: integer('at').notNull()
  },
  (t) => [index('reports_target').on(t.targetId)]
);
