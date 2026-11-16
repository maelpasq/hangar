// Social du compte Hangar (docs/COMPTE.md, phase 7) : amis, présence, activité, messages.
// Tout passe par l'API du compte (`api.social`) ; la connexion temps réel (côté Rust) n'est
// ouverte que si la personne est connectée et a activé les amis. Ce que chacun voit des autres
// est décidé par le serveur, selon les réglages de confidentialité de chacun.

import { api } from '../api';
import type {
  ActivityItem,
  ChatMessage,
  Conversation,
  FriendLists,
  Game,
  Presence,
  SocialEvent,
  SocialGame,
  SocialSettings,
  SocialUser,
  Visibility
} from '../types';
import { portableId, isGhostId, MAX_PROFILE_GAMES } from '../util/sync';
import { cloud } from './cloud.svelte';
import { library } from './library.svelte';
import { runner } from './runner.svelte';
import { ui } from './ui.svelte';

const EMPTY: FriendLists = { friends: [], incoming: [], outgoing: [], blocked: [] };
const message = (e: unknown) => String(e).replace(/^Error:\s*/, '');
/** Vitrine : jeux les plus joués montrés sur le profil. */
const TOP = 6;
/** Collections mises en avant sur le profil. */
export const MAX_FEATURED = 3;
/** Jeux d'une collection montrés sur le profil. */
const COLLECTION_GAMES = 60;
const SHOWCASE_KEY = 'hangar.social.showcase';
const ADDED_KEY = 'hangar.social.added';

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {}
  }
};

/** Libellés des visibilités (Paramètres). */
export const VISIBILITY: { value: Visibility; label: string }[] = [
  { value: 'all', label: 'Tout le monde' },
  { value: 'friends', label: 'Mes amis' },
  { value: 'none', label: 'Personne' }
];

/** Code ami affiché : « K7QM-4XTB ». */
export const prettyCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

/** Statut en clair (« En jeu : Portal 2 »). */
export function presenceLabel(p: Presence): string {
  if (p.state === 'playing' && p.game) return `En jeu : ${p.game.name}`;
  if (p.state === 'online') return 'En ligne';
  if (p.state === 'offline') return 'Hors ligne';
  return 'Statut masqué';
}

class Social {
  settings = $state<SocialSettings | null>(null);
  lists = $state<FriendLists>(EMPTY);
  conversations = $state<Conversation[]>([]);
  activity = $state<ActivityItem[]>([]);
  /** Connexion temps réel ouverte. */
  live = $state(false);
  /** Premier chargement des listes fait (affichage « Chargement »). */
  loaded = $state(false);
  /** Conversation ouverte sur la page Amis (id de l'ami), ou null. */
  chatWith = $state<string | null>(null);
  /** Fils de discussion chargés, par ami. */
  threads = $state<Record<string, { messages: ChatMessage[]; more: boolean }>>({});
  /** Images des profils (avatar, bannière) en `data:`, par `type:id:version` (null : aucune). */
  images = $state<Record<string, string | null>>({});

  private asked = new Set<string>();
  private started = false;
  private presenceSent = '';
  private showcaseTimer: ReturnType<typeof setTimeout> | undefined;

  /** Le compte est joignable et les amis sont activés. */
  enabled = $derived(cloud.status.connected && !cloud.status.offline && !!this.settings?.enabled);
  /** Mon identifiant de compte. */
  me = $derived(cloud.status.user?.id ?? '');
  unread = $derived(this.conversations.reduce((n, c) => n + c.unread, 0));
  /** Pastille de l'entrée Amis : messages non lus et demandes reçues. */
  badge = $derived(this.unread + this.lists.incoming.length);
  /**
   * Mon statut tel que mes amis le voient, suivi en direct : en jeu, en ligne (amis activés et
   * temps réel ouvert), sinon hors ligne (amis désactivés, compte hors ligne).
   */
  myPresence = $derived.by<Presence>(() => {
    if (!this.enabled || !this.live) return { state: 'offline', game: null };
    const id = runner.current;
    const g = id ? library.get(id) : undefined;
    const pid = id ? portableId(library.state, id) : null;
    if (g && pid) return { state: 'playing', game: { id: pid, name: library.name(g), since: runner.running[id!] } };
    return { state: 'online', game: null };
  });
  /** Amis en ligne ou en jeu d'abord, puis par nom. */
  sortedFriends = $derived(
    [...this.lists.friends].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'fr'))
  );
  /** Jeux locaux par identifiant portable (invitations, vitrines des autres). */
  private byPortable = $derived.by(() => {
    const m = new Map<string, Game>();
    for (const g of library.all) {
      const pid = portableId(library.state, g.id);
      if (pid && !m.has(pid)) m.set(pid, g);
    }
    return m;
  });

  /** Jeu de la bibliothèque correspondant à un jeu d'un autre compte. */
  localGame(g: SocialGame | null | undefined): Game | undefined {
    return g ? this.byPortable.get(g.id) : undefined;
  }

  user(id: string | null): SocialUser | undefined {
    if (!id) return undefined;
    const l = this.lists;
    return [...l.friends, ...l.incoming, ...l.outgoing, ...l.blocked].find((u) => u.id === id);
  }

  /** Image d'un profil (chargée une fois par version) : `data:`, ou null tant qu'il n'y en a pas. */
  image(kind: 'avatar' | 'banner', id: string, version: string | null): string | null {
    if (!version) return null;
    if (kind === 'avatar' && id === this.me) return cloud.avatar;
    const key = `${kind}:${id}:${version}`;
    if (!this.asked.has(key)) {
      this.asked.add(key);
      // Hors du rendu : une écriture d'état pendant l'affichage est interdite.
      queueMicrotask(() =>
        api
          .socialImage(kind, id)
          .then((v) => (this.images[key] = v))
          .catch(() => this.asked.delete(key))
      );
    }
    return this.images[key] ?? null;
  }

  // ─── Démarrage ───

  /** Suit l'état du compte : charge les réglages, ouvre ou ferme le temps réel. */
  start(): () => void {
    if (this.started) return () => {};
    this.started = true;
    const offs: Promise<() => void>[] = [api.onSocialEvent((e) => this.onEvent(e)), api.onSocialLive((on) => this.onLive(on))];
    const stop = $effect.root(() => {
      // Connexion au compte : réglages chargés ; déconnexion : tout est oublié.
      $effect(() => {
        const id = cloud.status.connected && !cloud.status.offline ? cloud.status.user?.id : null;
        if (id) void this.loadSettings();
        else if (!cloud.status.connected) this.reset();
      });
      $effect(() => {
        const on = this.enabled;
        api.socialLive(on).catch(() => {});
        if (on) void this.refresh();
        else this.presenceSent = '';
      });
      // Jeu en cours partagé avec les amis (le serveur applique la visibilité choisie).
      $effect(() => {
        const id = runner.current;
        if (!this.enabled) return;
        const pid = id ? portableId(library.state, id) : null;
        const g = id ? library.get(id) : undefined;
        const game = pid && g ? { id: pid, name: library.name(g) } : null;
        const key = JSON.stringify(game);
        if (key === this.presenceSent) return;
        this.presenceSent = key;
        api.social('PUT', '/social/presence', { game }).catch((e) => {
          this.presenceSent = '';
          console.error('social presence', message(e));
        });
      });
      // Vitrine et nouveaux jeux : après chaque synchro (et à l'activation).
      $effect(() => {
        void cloud.lastSync;
        void library.state.prefs.showcase;
        void library.state.prefs.profileGames;
        if (this.enabled && library.ready) this.scheduleShowcase();
      });
    });
    return () => {
      stop();
      clearTimeout(this.showcaseTimer);
      for (const o of offs) void o.then((f) => f());
      api.socialLive(false).catch(() => {});
      this.started = false;
    };
  }

  private reset(): void {
    this.settings = null;
    this.lists = EMPTY;
    this.conversations = [];
    this.activity = [];
    this.threads = {};
    this.chatWith = null;
    this.loaded = false;
    this.presenceSent = '';
  }

  async loadSettings(): Promise<void> {
    try {
      this.settings = await api.social<SocialSettings>('GET', '/social/me');
    } catch (e) {
      console.error('social me', message(e));
    }
  }

  /** Recharge listes, conversations et activité (connexion, reconnexion). */
  async refresh(): Promise<void> {
    await Promise.all([this.refreshLists(), this.refreshConversations(), this.refreshActivity()]);
    this.loaded = true;
  }

  async refreshLists(): Promise<void> {
    try {
      this.lists = await api.social<FriendLists>('GET', '/social/friends');
    } catch (e) {
      console.error('social friends', message(e));
    }
  }

  async refreshConversations(): Promise<void> {
    try {
      this.conversations = (await api.social<{ conversations: Conversation[] }>('GET', '/social/conversations')).conversations;
    } catch (e) {
      console.error('social conversations', message(e));
    }
  }

  async refreshActivity(): Promise<void> {
    try {
      this.activity = (await api.social<{ items: ActivityItem[] }>('GET', '/social/activity')).items;
    } catch (e) {
      console.error('social activity', message(e));
    }
  }

  // ─── Temps réel ───

  private onLive(on: boolean): void {
    const was = this.live;
    this.live = on;
    // Reconnecté : ce qui a pu arriver pendant la coupure.
    if (on && !was && this.loaded) void this.refresh();
  }

  private onEvent(e: SocialEvent): void {
    switch (e.type) {
      case 'presence': {
        const patch = (list: SocialUser[]) => list.map((u) => (u.id === e.id ? { ...u, presence: e.presence } : u));
        this.lists = { ...this.lists, friends: patch(this.lists.friends) };
        break;
      }
      case 'friends':
        void this.refreshLists();
        break;
      case 'request':
        void this.refreshLists();
        this.notify(`${e.from.name} veut devenir ton ami`, 'Demande d\'ami reçue sur Hangar.', () => this.openFriends());
        break;
      case 'accepted':
        void this.refreshLists();
        this.notify(`${e.from.name} a accepté ta demande d'ami`, 'Vous êtes maintenant amis sur Hangar.', () => this.openChat(e.from.id));
        break;
      case 'activity':
        void this.refreshActivity();
        break;
      case 'message':
        this.received(e.message, e.from.name);
        break;
      case 'read':
        if (e.by === this.me) {
          this.conversations = this.conversations.map((c) => (c.with === e.with ? { ...c, unread: 0 } : c));
        } else {
          const t = this.threads[e.by];
          if (t) t.messages = t.messages.map((m) => (m.from === this.me && !m.readAt ? { ...m, readAt: e.at } : m));
        }
        break;
    }
  }

  /** Conversation ouverte et visible : les messages reçus y sont lus aussitôt. */
  private watching(id: string): boolean {
    return ui.screen === 'friends' && this.chatWith === id && ui.windowFocused;
  }

  private received(m: ChatMessage, fromName: string): void {
    const other = m.from === this.me ? m.to : m.from;
    const t = this.threads[other];
    if (t && !t.messages.some((x) => x.id === m.id)) t.messages = [...t.messages, m];
    const mine = m.from === this.me;
    const seen = !mine && this.watching(other);
    const prev = this.conversations.find((c) => c.with === other);
    const unread = mine ? (prev?.unread ?? 0) : seen ? 0 : (prev?.unread ?? 0) + 1;
    this.conversations = [{ with: other, last: m, unread }, ...this.conversations.filter((c) => c.with !== other)];
    if (mine) return;
    if (seen) {
      void this.markRead(other);
      return;
    }
    const text = m.kind === 'invite' ? `T'invite à jouer à ${m.game?.name ?? 'un jeu'}` : m.text;
    this.notify(fromName, text, () => this.openChat(other));
  }

  /** Toast dans l'app, notification du système si Hangar n'est pas au premier plan. */
  private notify(title: string, body: string, open: () => void): void {
    if (!ui.windowFocused) {
      api.socialNotify(title, body).catch(() => {});
      return;
    }
    ui.toast(`${title} : ${body}`.slice(0, 160), { action: { label: 'Voir', run: open } });
  }

  // ─── Navigation ───

  openFriends(): void {
    this.chatWith = null;
    ui.friends();
  }

  openChat(id: string): void {
    this.chatWith = id;
    ui.friends();
    void this.loadThread(id);
  }

  // ─── Réglages ───

  async setSettings(patch: Partial<Omit<SocialSettings, 'privacy' | 'code' | 'banner'>> & { privacy?: Partial<SocialSettings['privacy']>; newCode?: boolean }): Promise<boolean> {
    try {
      this.settings = await api.social<SocialSettings>('PUT', '/social/me', patch);
      return true;
    } catch (e) {
      ui.toast(message(e), { error: true });
      return false;
    }
  }

  async setEnabled(on: boolean): Promise<void> {
    if (await this.setSettings({ enabled: on })) {
      ui.toast(on ? 'Amis activés : tes amis peuvent te trouver et t\'écrire.' : 'Amis désactivés : tu es invisible et hors ligne.');
    }
  }

  async setBanner(bytes: Uint8Array): Promise<boolean> {
    try {
      const banner = await api.socialBanner(bytes);
      if (this.settings) this.settings = { ...this.settings, banner };
      return true;
    } catch (e) {
      ui.toast(message(e), { error: true });
      return false;
    }
  }

  async removeBanner(): Promise<void> {
    try {
      await api.social('DELETE', '/social/banner');
      if (this.settings) this.settings = { ...this.settings, banner: null };
    } catch (e) {
      ui.toast(message(e), { error: true });
    }
  }

  // ─── Amis ───

  async search(q: string): Promise<SocialUser[]> {
    const query = q.replace(/\s+/g, ' ').trim();
    if (query.length < 2) return [];
    return (await api.social<{ users: SocialUser[] }>('GET', `/social/search?q=${encodeURIComponent(query)}`)).users;
  }

  private async act(task: () => Promise<unknown>, done?: string): Promise<boolean> {
    try {
      await task();
      if (done) ui.toast(done);
      await this.refreshLists();
      return true;
    } catch (e) {
      ui.toast(message(e), { error: true });
      return false;
    }
  }

  addFriend(u: { id: string; name: string; relation?: string }): Promise<boolean> {
    const accept = u.relation === 'in';
    return this.act(
      () => api.social('POST', `/social/friends/${u.id}`),
      accept ? `Toi et ${u.name} êtes maintenant amis.` : `Demande d'ami envoyée à ${u.name}.`
    );
  }

  removeFriend(u: { id: string; name: string; relation?: string }): Promise<boolean> {
    const done =
      u.relation === 'in' ? `Demande de ${u.name} refusée.` : u.relation === 'out' ? 'Demande annulée.' : `${u.name} ne fait plus partie de tes amis.`;
    return this.act(() => api.social('DELETE', `/social/friends/${u.id}`), done);
  }

  async block(u: { id: string; name: string }): Promise<boolean> {
    const ok = await this.act(() => api.social('POST', `/social/blocks/${u.id}`), `${u.name} est bloqué.`);
    if (ok && this.chatWith === u.id) this.chatWith = null;
    return ok;
  }

  unblock(u: { id: string; name: string }): Promise<boolean> {
    return this.act(() => api.social('DELETE', `/social/blocks/${u.id}`), `${u.name} est débloqué.`);
  }

  async report(userId: string, reason: string, note: string, messageId?: string): Promise<boolean> {
    try {
      await api.social('POST', '/social/reports', { userId, reason, note: note.trim() || undefined, messageId });
      ui.toast('Signalement envoyé. Merci, il sera examiné.');
      return true;
    } catch (e) {
      ui.toast(message(e), { error: true });
      return false;
    }
  }

  // ─── Messages ───

  async loadThread(id: string, older = false): Promise<void> {
    const t = this.threads[id];
    if (t && !older) {
      void this.markRead(id);
      return;
    }
    const before = older && t?.messages.length ? `?before=${t.messages[0].at}` : '';
    try {
      const page = await api.social<{ messages: ChatMessage[]; more: boolean }>('GET', `/social/messages/${id}${before}`);
      const prev = older ? (this.threads[id]?.messages ?? []) : [];
      this.threads[id] = { messages: [...page.messages, ...prev], more: page.more };
      if (!older) void this.markRead(id);
    } catch (e) {
      ui.toast(message(e), { error: true });
    }
  }

  async markRead(id: string): Promise<void> {
    const c = this.conversations.find((x) => x.with === id);
    if (!c?.unread) return;
    this.conversations = this.conversations.map((x) => (x.with === id ? { ...x, unread: 0 } : x));
    await api.social('POST', `/social/messages/${id}/read`).catch(() => {});
  }

  async send(id: string, body: { text: string } | { game: SocialGame }): Promise<boolean> {
    try {
      const { message: m } = await api.social<{ message: ChatMessage }>('POST', `/social/messages/${id}`, body);
      const t = this.threads[id];
      if (t && !t.messages.some((x) => x.id === m.id)) t.messages = [...t.messages, m];
      if (!this.conversations.some((c) => c.with === id && c.last.id === m.id)) {
        const prev = this.conversations.find((c) => c.with === id);
        this.conversations = [{ with: id, last: m, unread: prev?.unread ?? 0 }, ...this.conversations.filter((c) => c.with !== id)];
      }
      return true;
    } catch (e) {
      ui.toast(message(e), { error: true });
      return false;
    }
  }

  /** Invitation sur un jeu de la bibliothèque. */
  invite(id: string, g: Game): Promise<boolean> {
    const pid = portableId(library.state, g.id);
    if (!pid) {
      ui.toast("Ce jeu ne peut pas être proposé : il n'a pas d'identifiant commun aux autres PC.", { error: true });
      return Promise.resolve(false);
    }
    return this.send(id, { game: { id: pid, name: library.name(g) } });
  }

  // ─── Vitrine et nouveaux jeux ───

  private scheduleShowcase(): void {
    clearTimeout(this.showcaseTimer);
    this.showcaseTimer = setTimeout(() => void this.sendShowcase(), 3000);
  }

  /** Vitrine du profil et bibliothèque installée (jeux en commun) : envoyées seulement quand elles changent. */
  private async sendShowcase(): Promise<void> {
    if (!this.enabled) return;
    const s = library.state;
    const pid = (g: Game) => portableId(s, g.id);
    const top = library.visible
      .map((g) => ({ g, ms: library.totals(g.id).playMs }))
      .filter((x) => x.ms > 0 && pid(x.g))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, TOP)
      .map(({ g, ms }) => ({ id: pid(g)!, name: library.name(g), ms }));
    const collections = (s.prefs.showcase ?? [])
      .map((id) => library.collection(id))
      .filter((c) => !!c)
      .slice(0, MAX_FEATURED)
      .map((c) => ({
        name: c.name.slice(0, 60),
        games: library
          .inCollection(c.id)
          .filter((g) => pid(g))
          .slice(0, COLLECTION_GAMES)
          .map((g) => ({ id: pid(g)!, name: library.name(g) }))
      }));
    const seen = new Set<string>();
    const games: SocialGame[] = [];
    // Jeux en commun : seulement les jeux installés sur ce poste, quel que soit leur store
    // (ni les jeux possédés à installer, ni ceux « Sur un autre PC »).
    for (const g of library.all) {
      const id = pid(g);
      if (!id || g.notInstalled || seen.has(id) || s.hidden.includes(g.id)) continue;
      seen.add(id);
      games.push({ id, name: library.name(g) });
    }
    const favorites = s.prefs.profileGames.slice(0, MAX_PROFILE_GAMES);
    // Version de Hangar de ce poste, montrée sur le profil (renvoyée après chaque mise à jour).
    const version = await api.appVersion().catch(() => undefined);
    const body = { top, favorites, collections, games: games.slice(0, 10_000), version };
    const key = `${this.me}:${JSON.stringify(body)}`;
    if (store.get(SHOWCASE_KEY) !== hash(key)) {
      try {
        await api.social('PUT', '/social/showcase', body);
        store.set(SHOWCASE_KEY, hash(key));
      } catch (e) {
        console.error('social showcase', message(e));
      }
    }
    await this.sendAdded();
  }

  /**
   * Jeux installés apparus depuis la dernière fois (première vue sur ce poste) : une ligne
   * d'activité pour les amis. La toute première fois, rien n'est annoncé (toute la bibliothèque
   * serait « nouvelle »).
   */
  private async sendAdded(): Promise<void> {
    const key = `${ADDED_KEY}:${this.me}`;
    const since = Number(store.get(key) ?? 0);
    const now = Date.now();
    if (!since) return store.set(key, String(now));
    const fresh = library.installed
      .filter((g) => !isGhostId(g.id) && (library.state.firstSeen[g.id] ?? 0) > since)
      .sort((a, b) => (library.state.firstSeen[b.id] ?? 0) - (library.state.firstSeen[a.id] ?? 0))
      .map((g) => ({ id: portableId(library.state, g.id), name: library.name(g) }))
      .filter((g): g is SocialGame => !!g.id);
    if (fresh.length) {
      try {
        await api.social('POST', '/social/activity', { added: fresh.slice(0, 500) });
      } catch (e) {
        console.error('social activity', message(e));
        return;
      }
    }
    store.set(key, String(now));
  }
}

function rank(u: SocialUser): number {
  return u.presence.state === 'playing' ? 0 : u.presence.state === 'online' ? 1 : 2;
}

/** Empreinte courte d'un texte (comparaison de la vitrine déjà envoyée). */
function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 + c, 31) | 0;
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${s.length}`;
}

export const social = new Social();
