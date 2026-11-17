// Social de démo (hors Tauri, `npm run dev:web`) : quelques amis, demandes, messages et activité,
// servis comme le ferait l'API `/social/*`. Rien ne sort du navigateur.

import type {
  ActivityItem,
  Badge,
  ChatMessage,
  Presence,
  Relation,
  SocialEvent,
  SocialGame,
  SocialProfile,
  SocialSettings,
  SocialUser
} from './types';
import { RELEASES } from './util/release-notes';

const ME = 'demo-compte-0001';
/** Version de Hangar de la démo (la plus récente des notes de version). */
const DEMO_VERSION = RELEASES[0]?.version ?? '1.0.0';
const H = 3_600_000;
const MIN = 60_000;
const g = (id: string, name: string): SocialGame => ({ id, name });
const GAMES = {
  satisfactory: g('steam:satisfactory', 'Satisfactory'),
  cs2: g('steam:cs2', 'Counter-Strike 2'),
  valorant: g('riot:valorant', 'VALORANT'),
  bg3: g('steam:bg3', "Baldur's Gate 3"),
  rocket: g('epic:rocketleague', 'Rocket League'),
  elden: g('steam:eldenring', 'ELDEN RING'),
  fortnite: g('epic:fortnite', 'Fortnite'),
  hades: g('steam:1145350', 'Hades II')
};

interface Person {
  id: string;
  name: string;
  rel: Relation;
  presence: Presence;
  since: number;
  playMs: number;
  games: SocialGame[];
  top: (SocialGame & { ms: number })[];
  favorites?: SocialGame[];
  collections: { name: string; games: SocialGame[] }[];
  version?: string;
}

export function mockSocial(emit: (e: SocialEvent) => void) {
  const now = Date.now();
  const settings: SocialSettings = {
    enabled: false,
    code: 'K7QM4XTB',
    findable: true,
    privacy: { status: 'friends', game: 'friends', play: 'friends', library: 'friends' },
    banner: null
  };
  const on = (game?: SocialGame): Presence =>
    game ? { state: 'playing', game: { ...game, since: now - 47 * MIN } } : { state: 'online', game: null };
  const off: Presence = { state: 'offline', game: null };
  const people: Person[] = [
    {
      id: 'demo-ami-0001',
      name: 'Lina',
      rel: 'friend',
      version: DEMO_VERSION,
      presence: on(GAMES.satisfactory),
      since: now - 400 * 24 * H,
      playMs: 612 * H,
      games: [GAMES.satisfactory, GAMES.bg3, GAMES.elden, GAMES.hades],
      top: [
        { ...GAMES.satisfactory, ms: 214 * H },
        { ...GAMES.bg3, ms: 160 * H },
        { ...GAMES.elden, ms: 98 * H },
        { ...GAMES.hades, ms: 41 * H }
      ],
      favorites: [GAMES.hades, GAMES.elden, GAMES.bg3],
      collections: [{ name: 'Coop du dimanche', games: [GAMES.satisfactory, GAMES.bg3] }]
    },
    {
      id: 'demo-ami-0002',
      name: 'Sam',
      rel: 'friend',
      version: '1.2.20',
      presence: on(),
      since: now - 200 * 24 * H,
      playMs: 298 * H,
      games: [GAMES.cs2, GAMES.valorant, GAMES.rocket],
      top: [
        { ...GAMES.cs2, ms: 180 * H },
        { ...GAMES.valorant, ms: 90 * H }
      ],
      collections: []
    },
    { id: 'demo-ami-0003', name: 'Noé', rel: 'friend', presence: off, since: now - 90 * 24 * H, playMs: 75 * H, games: [GAMES.fortnite, GAMES.rocket], top: [{ ...GAMES.fortnite, ms: 60 * H }], collections: [] },
    { id: 'demo-ami-0004', name: 'Maëlys', rel: 'friend', presence: { state: 'hidden', game: null }, since: now - 30 * 24 * H, playMs: 0, games: [], top: [], collections: [] },
    { id: 'demo-ami-0005', name: 'Hugo', rel: 'in', presence: { state: 'hidden', game: null }, since: now - 2 * H, playMs: 0, games: [], top: [], collections: [] },
    { id: 'demo-ami-0006', name: 'Jade', rel: 'out', presence: { state: 'hidden', game: null }, since: now - 26 * H, playMs: 0, games: [], top: [], collections: [] },
    { id: 'demo-ami-0007', name: 'Théo', rel: 'none', presence: { state: 'hidden', game: null }, since: now - 10 * 24 * H, playMs: 0, games: [], top: [], collections: [] }
  ];
  const myGames = new Set<string>(['steam:satisfactory', 'steam:bg3', 'steam:cs2', 'riot:valorant', 'epic:fortnite', 'epic:rocketleague', 'steam:eldenring']);
  let seq = 0;
  const msg = (from: string, to: string, text: string, ago: number, game: SocialGame | null = null): ChatMessage => ({
    id: `m${++seq}`,
    from,
    to,
    kind: game ? 'invite' : 'text',
    text: game ? '' : text,
    game,
    at: now - ago,
    readAt: from === ME ? now - ago + MIN : null
  });
  const threads = new Map<string, ChatMessage[]>([
    [
      'demo-ami-0001',
      [
        msg('demo-ami-0001', ME, 'Tu as vu la mise à jour de Satisfactory ?', 3 * H),
        msg(ME, 'demo-ami-0001', 'Oui ! Les nouveaux convoyeurs changent tout.', 3 * H - 4 * MIN),
        msg('demo-ami-0001', ME, 'On reprend notre usine ce soir ?', 50 * MIN),
        msg('demo-ami-0001', ME, '', 48 * MIN, GAMES.satisfactory)
      ]
    ],
    ['demo-ami-0002', [msg(ME, 'demo-ami-0002', 'GG pour hier soir', 26 * H), msg('demo-ami-0002', ME, 'Merci, revanche quand tu veux', 25 * H)]]
  ]);
  // Lus sauf les deux derniers de Lina.
  for (const m of threads.get('demo-ami-0002')!) m.readAt ??= now;
  threads.get('demo-ami-0001')!.slice(0, 2).forEach((m) => (m.readAt ??= now));
  const activity: ActivityItem[] = [
    { id: 'a1', kind: 'play', at: now - 47 * MIN, data: GAMES.satisfactory, userId: 'demo-ami-0001', userName: 'Lina' },
    { id: 'a2', kind: 'added', at: now - 5 * H, data: { games: [GAMES.hades], count: 1 }, userId: 'demo-ami-0001', userName: 'Lina' },
    { id: 'a3', kind: 'play', at: now - 26 * H, data: GAMES.cs2, userId: 'demo-ami-0002', userName: 'Sam' },
    { id: 'a4', kind: 'play', at: now - 3 * 24 * H, data: GAMES.fortnite, userId: 'demo-ami-0003', userName: 'Noé' },
    { id: 'a5', kind: 'added', at: now - 4 * 24 * H, data: { games: [GAMES.rocket, GAMES.cs2, GAMES.valorant], count: 3 }, userId: 'demo-ami-0002', userName: 'Sam' }
  ];

  const card = (p: Person): SocialUser => ({ id: p.id, name: p.name, avatar: null, relation: p.rel, presence: p.rel === 'friend' ? p.presence : { state: 'hidden', game: null }, since: p.since });
  const find = (id: string) => people.find((p) => p.id === id);
  const fail = (m: string) => Promise.reject(m);
  /** Comptes certifiés (démo : je suis l'administrateur, je peux certifier tout le monde). */
  const certified = new Set<string>([ME, 'demo-ami-0001']);
  const badgesOf = (id: string): Badge[] => (certified.has(id) ? ['certifie'] : []);
  /** Mes jeux favoris, tels qu'envoyés par la dernière vitrine. */
  let myFavorites: SocialGame[] = [];

  async function handle(method: string, path: string, body: any): Promise<unknown> {
    await new Promise((r) => setTimeout(r, 120));
    const [route, query = ''] = path.split('?');
    const parts = route.split('/').filter(Boolean).slice(1);
    const [head, id, tail] = parts;
    if (head === 'me') {
      if (method === 'PUT') {
        if (typeof body.enabled === 'boolean') settings.enabled = body.enabled;
        if (typeof body.findable === 'boolean') settings.findable = body.findable;
        if (body.privacy) Object.assign(settings.privacy, body.privacy);
        if (body.newCode) settings.code = 'R3WN8CHP';
      }
      return structuredClone(settings);
    }
    if (head === 'showcase' && Array.isArray(body?.favorites)) myFavorites = body.favorites;
    if (head === 'showcase' || head === 'presence' || head === 'activity' && method === 'POST' || head === 'reports') return { ok: true };
    if (head === 'banner') return (settings.banner = null), { ok: true };
    if (head === 'activity') return { items: activity };
    if (head === 'friends' && !id) {
      const pick = (r: Relation) => people.filter((p) => p.rel === r).map(card);
      return { friends: pick('friend'), incoming: pick('in'), outgoing: pick('out'), blocked: pick('blocked') };
    }
    if (head === 'friends' || head === 'blocks') {
      const p = find(id);
      if (!p) return fail('Ce joueur est introuvable.');
      if (head === 'blocks') p.rel = method === 'POST' ? 'blocked' : 'none';
      else if (method === 'DELETE') p.rel = 'none';
      else p.rel = p.rel === 'in' ? 'friend' : p.rel === 'friend' ? 'friend' : 'out';
      if (p.rel === 'friend') p.presence = on();
      setTimeout(() => emit({ type: 'friends' }), 50);
      return { ok: true, relation: p.rel };
    }
    if (head === 'search') {
      const q = decodeURIComponent(new URLSearchParams(query).get('q') ?? '').toLowerCase().replace(/[\s-]/g, '');
      return { users: people.filter((p) => p.rel !== 'blocked' && (p.name.toLowerCase().includes(q) || q === 'abcd2345')).map(card) };
    }
    if (head === 'users' && tail === 'badges') {
      if (body?.on) certified.add(id);
      else certified.delete(id);
      return { badges: badgesOf(id) };
    }
    if (head === 'users') {
      if (id === ME) {
        const self: SocialProfile = {
          id: ME,
          name: 'Alex',
          badges: badgesOf(ME),
          canBadge: true,
          avatar: null,
          banner: settings.banner,
          since: now - 500 * 24 * H,
          relation: 'self',
          code: settings.code,
          presence: { state: 'online', game: null },
          playMs: 842 * H,
          games: myGames.size,
          version: DEMO_VERSION,
          top: [
            { ...GAMES.satisfactory, ms: 230 * H },
            { ...GAMES.cs2, ms: 190 * H },
            { ...GAMES.bg3, ms: 120 * H }
          ],
          favorites: myFavorites,
          collections: [{ name: 'Avec les potes', games: [GAMES.satisfactory, GAMES.cs2, GAMES.valorant, GAMES.rocket] }],
          common: null,
          activity: [{ id: 's1', kind: 'play', at: now - 2 * H, data: GAMES.cs2 }]
        };
        return self;
      }
      const p = find(id);
      if (!p || p.rel === 'blocked') return fail('Ce joueur est introuvable.');
      const friend = p.rel === 'friend';
      const prof: SocialProfile = {
        id: p.id,
        name: p.name,
        badges: badgesOf(p.id),
        canBadge: true,
        avatar: null,
        banner: null,
        since: p.since,
        relation: p.rel,
        code: null,
        presence: card(p).presence,
        playMs: friend ? p.playMs : null,
        games: friend ? p.games.length : null,
        version: p.version ?? null,
        top: friend ? p.top : null,
        favorites: friend ? (p.favorites ?? []) : null,
        collections: friend ? p.collections : null,
        common: friend ? p.games.filter((x) => myGames.has(x.id)) : null,
        activity: friend ? activity.filter((a) => a.userId === p.id) : []
      };
      return prof;
    }
    if (head === 'conversations') {
      return {
        conversations: [...threads.entries()]
          .map(([w, list]) => ({ with: w, last: list[list.length - 1], unread: list.filter((m) => m.to === ME && !m.readAt).length }))
          .sort((a, b) => b.last.at - a.last.at)
      };
    }
    if (head === 'messages') {
      const list = threads.get(id) ?? [];
      if (tail === 'read') {
        list.forEach((m) => m.to === ME && (m.readAt ??= Date.now()));
        return { ok: true };
      }
      if (method === 'GET') return { messages: list, more: false };
      if (find(id)?.rel !== 'friend') return fail("Impossible : vous n'êtes pas amis, ou les amis sont désactivés.");
      const m: ChatMessage = { id: `m${++seq}`, from: ME, to: id, kind: body.game ? 'invite' : 'text', text: body.text ?? '', game: body.game ?? null, at: Date.now(), readAt: null };
      threads.set(id, [...list, m]);
      setTimeout(() => emit({ type: 'message', message: m, from: { id: ME, name: 'Alex' } }), 30);
      // Réponse de démo.
      const p = find(id)!;
      setTimeout(() => {
        const r: ChatMessage = { id: `m${++seq}`, from: id, to: ME, kind: 'text', text: body.game ? 'Je lance, j\'arrive !' : 'Ça marche !', game: null, at: Date.now(), readAt: null };
        threads.set(id, [...(threads.get(id) ?? []), r]);
        emit({ type: 'message', message: r, from: { id, name: p.name } });
      }, 2500);
      return { message: m };
    }
    return fail('Requête invalide.');
  }

  return { handle, settings };
}
