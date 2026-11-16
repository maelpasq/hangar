<script lang="ts">
  // Profil d'un compte Hangar dans l'app (le sien ou celui d'un autre) : bannière, avatar,
  // statut, temps de jeu, jeux favoris, jeux les plus joués, collections mises en avant, jeux en commun,
  // activité. Le serveur ne renvoie que ce que la personne partage avec nous.
  import Icon from '../components/Icon.svelte';
  import SocialAvatar from '../components/SocialAvatar.svelte';
  import SocialGameTile from '../components/SocialGameTile.svelte';
  import { api } from '../api';
  import { cloud } from '../stores/cloud.svelte';
  import { presenceLabel, prettyCode, social } from '../stores/social.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { SocialProfile } from '../types';
  import { dateLabel, hoursLabel, plural, timeAgo } from '../util/format';

  let { id }: { id: string } = $props();

  let profile = $state<SocialProfile | null>(null);
  let failed = $state<string | null>(null);

  async function load() {
    try {
      profile = await api.social<SocialProfile>('GET', `/social/users/${id}`);
      failed = null;
    } catch (e) {
      profile = null;
      failed = String(e).replace(/^Error:\s*/, '');
    }
  }

  /** Lien avec ce compte vu dans les listes : le profil est rechargé quand il change. */
  const link = $derived.by(() => {
    const l = social.lists;
    const has = (list: { id: string }[]) => list.some((u) => u.id === id);
    return `${has(l.friends)}${has(l.incoming)}${has(l.outgoing)}${has(l.blocked)}${social.settings?.banner ?? ''}`;
  });

  // Au changement de profil, puis quand le lien change (demande acceptée, ami retiré...).
  $effect(() => {
    void id;
    void link;
    if (cloud.status.connected) void load();
  });

  const self = $derived(profile?.relation === 'self');
  // Mon propre statut suit l'app en direct ; celui des autres, la liste d'amis (temps réel).
  const live = $derived(
    self ? social.myPresence : (social.lists.friends.find((f) => f.id === id)?.presence ?? profile?.presence)
  );
  // Mes jeux favoris : ceux choisis dans les Paramètres, sans attendre l'envoi au serveur.
  const favorites = $derived(self ? library.state.prefs.profileGames : (profile?.favorites ?? []));
  const banner = $derived(profile ? social.image('banner', profile.id, profile.banner) : null);
  const reserved = $derived(
    !!profile && !self && profile.playMs === null && profile.top === null && profile.collections === null && profile.common === null
  );
  const name = $derived(profile?.name ?? '');
  const since = $derived(social.lists.friends.find((f) => f.id === id)?.since);

  function confirm(action: 'remove' | 'block') {
    if (profile) ui.modal = { kind: 'socialConfirm', action, userId: profile.id, name: profile.name };
  }
</script>

<div class="screen scroll page">
  {#if failed}
    <div class="gate">
      <span class="gico"><Icon name="user" size={30} /></span>
      <h1>Profil introuvable</h1>
      <p>{failed}</p>
      <button class="btn" onclick={() => ui.back()}>Retour</button>
    </div>
  {:else if profile}
    <header class="hero" class:img={!!banner}>
      {#if banner}<img class="bimg" src={banner} alt="" />{/if}
      <div class="shade"></div>
    </header>
    <div class="ident">
      <span class="avring"><SocialAvatar id={profile.id} name={profile.name} version={profile.avatar} size={112} presence={live} /></span>
      <div class="itxt">
        <h1 class="ell">{profile.name}</h1>
        <p class="status">
          {#if live && live.state !== 'hidden'}<span class:playing={live.state === 'playing'}>{presenceLabel(live)}</span>{' · '}{/if}Sur
          Hangar depuis {dateLabel(profile.since).replace(/^\d+ /, '')}
        </p>
      </div>
      <div class="actions">
        {#if self}
          <button class="btn" onclick={() => ui.settings('account')}><Icon name="edit" size={15} />Modifier mon profil</button>
        {:else if profile.relation === 'friend'}
          <button class="btn primary" onclick={() => social.openChat(profile!.id)}><Icon name="chat" size={16} />Message</button>
          <button class="btn" onclick={() => (ui.modal = { kind: 'socialInvite', userId: profile!.id, name })}
            ><Icon name="gamepad" size={16} />Inviter</button
          >
          <button class="ibtn" aria-label="Retirer {name} de tes amis" title="Retirer des amis" onclick={() => confirm('remove')}
            ><Icon name="trash" size={16} /></button
          >
        {:else if profile.relation === 'in'}
          <button class="btn primary" onclick={() => social.addFriend(profile!)}><Icon name="check" size={16} />Accepter</button>
          <button class="btn" onclick={() => social.removeFriend(profile!)}>Refuser</button>
        {:else if profile.relation === 'out'}
          <span class="pending">Demande envoyée</span>
          <button class="btn" onclick={() => social.removeFriend(profile!)}>Annuler</button>
        {:else if social.settings?.enabled}
          <button class="btn primary" onclick={() => social.addFriend(profile!)}><Icon name="userPlus" size={16} />Ajouter en ami</button>
        {/if}
        {#if !self}
          <button class="ibtn" aria-label="Bloquer {name}" title="Bloquer" onclick={() => confirm('block')}><Icon name="ban" size={16} /></button>
          <button
            class="ibtn"
            aria-label="Signaler {name}"
            title="Signaler"
            onclick={() => (ui.modal = { kind: 'socialReport', userId: profile!.id, name })}><Icon name="flag" size={16} /></button
          >
        {/if}
      </div>
    </div>

    <div class="stats">
      {#if profile.playMs !== null}
        <div class="stat"><span class="sv num">{hoursLabel(profile.playMs)}</span><span class="sl">de jeu avec Hangar</span></div>
      {/if}
      {#if profile.games !== null}
        <div class="stat"><span class="sv num">{profile.games}</span><span class="sl">{profile.games > 1 ? 'jeux' : 'jeu'} dans la bibliothèque</span></div>
      {/if}
      {#if since}
        <div class="stat"><span class="sv">{dateLabel(since)}</span><span class="sl">début de votre amitié</span></div>
      {/if}
      {#if self && profile.code}
        <div class="stat"><span class="sv mono">{prettyCode(profile.code)}</span><span class="sl">ton code ami</span></div>
      {/if}
    </div>

    {#if reserved}
      <section class="card note">
        <Icon name="eyeOff" size={18} />
        <p>{profile.name} ne montre son temps de jeu et ses jeux qu'à ses amis.</p>
      </section>
    {/if}

    {#if favorites.length}
      <section class="sec" aria-label="Jeux favoris">
        <div class="shead">
          <h2>Jeux favoris</h2>
          {#if self}
            <button class="btn small" onclick={() => (ui.modal = { kind: 'profileGames' })}
              ><Icon name="edit" size={14} />Modifier</button
            >
          {/if}
        </div>
        <div class="tiles">
          {#each favorites as g (g.id)}<SocialGameTile game={g} />{/each}
        </div>
      </section>
    {:else if self}
      <section class="card note">
        <Icon name="star" size={18} />
        <p>Montre jusqu'à 5 jeux favoris en haut de ton profil.</p>
        <button class="btn" onclick={() => (ui.modal = { kind: 'profileGames' })}><Icon name="plus" size={15} />Choisir mes jeux</button>
      </section>
    {/if}

    {#if profile.top?.length}
      <section class="sec" aria-label="Jeux les plus joués">
        <h2>Jeux les plus joués</h2>
        <div class="tiles">
          {#each profile.top as g (g.id)}<SocialGameTile game={g} meta={hoursLabel(g.ms)} />{/each}
        </div>
      </section>
    {/if}

    {#each profile.collections ?? [] as c (c.name)}
      {#if c.games.length}
        <section class="sec" aria-label="Collection {c.name}">
          <h2>{c.name} <span class="count num">{plural(c.games.length, 'jeu', 'jeux')}</span></h2>
          <div class="tiles">
            {#each c.games.slice(0, 12) as g (g.id)}<SocialGameTile game={g} />{/each}
          </div>
        </section>
      {/if}
    {/each}

    {#if profile.common?.length}
      <section class="sec" aria-label="Jeux en commun">
        <h2>Jeux en commun <span class="count num">{profile.common.length}</span></h2>
        <div class="tiles">
          {#each profile.common.slice(0, 18) as g (g.id)}<SocialGameTile game={g} />{/each}
        </div>
      </section>
    {/if}

    {#if profile.activity.length}
      <section class="sec" aria-label="Activité récente">
        <h2>Activité récente</h2>
        <div class="card acts">
          {#each profile.activity as a (a.id)}
            <div class="act">
              <span class="aic"><Icon name={a.kind === 'play' ? 'play' : 'plus'} size={14} /></span>
              <p>
                {#if a.kind === 'play'}A lancé <strong>{a.data.name}</strong>{:else}A ajouté
                  <strong>{a.data.games?.map((g) => g.name).slice(0, 3).join(', ')}</strong>{#if (a.data.count ?? 0) > 3}
                    et {plural((a.data.count ?? 0) - 3, 'autre', 'autres')}{/if}{/if}
              </p>
              <span class="when">{timeAgo(a.at)}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

  {:else}
    <p class="loading">Chargement du profil...</p>
  {/if}
</div>

<style>
  .page {
    flex: 1;
    padding: 8px 28px 48px;
  }

  .gate {
    margin: 80px auto;
    max-width: 440px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    color: var(--muted);
  }

  .gico {
    width: 64px;
    height: 64px;
    border-radius: 20px;
    display: grid;
    place-items: center;
    background: var(--surface-3);
    color: var(--text-3);
  }

  .loading {
    color: var(--muted);
    padding: 40px 0;
  }

  .hero {
    position: relative;
    height: 210px;
    border-radius: var(--r-hero);
    overflow: hidden;
    background:
      radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 55%, transparent), transparent 60%),
      radial-gradient(90% 120% at 100% 100%, color-mix(in srgb, var(--accent) 30%, #0b0d14), transparent 70%),
      var(--surface-2);
    animation: hgFade 0.35s ease both;
  }

  .bimg {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 45%, rgba(0, 0, 0, 0.45));
  }

  .ident {
    display: flex;
    align-items: flex-end;
    gap: 22px;
    padding: 0 22px;
    margin-top: -56px;
    position: relative;
  }

  .avring {
    border-radius: 50%;
    padding: 5px;
    background: var(--bg);
  }

  .itxt {
    flex: 1;
    min-width: 0;
    padding-bottom: 8px;
  }

  h1 {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.9px;
  }

  .status {
    margin-top: 4px;
    color: var(--muted);
    font-size: 14px;
  }

  .note .btn {
    margin-left: auto;
    flex-shrink: 0;
  }

  /* Titre de section avec son bouton (Jeux favoris de mon profil). */
  .shead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .btn.small {
    height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }

  .status .playing {
    color: var(--success-text);
  }

  .ell {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .pending {
    font-size: 13px;
    color: var(--muted);
    padding: 0 6px;
  }

  .ibtn {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    color: var(--muted);
    border: 1px solid var(--border-2);
    transition:
      background 0.18s,
      color 0.18s;
  }

  .ibtn:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .stats {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin: 26px 0 8px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 18px;
    border-radius: 16px;
    background: var(--surface-1);
    border: 1px solid var(--border-1);
    min-width: 150px;
  }

  .sv {
    font-size: 20px;
    font-weight: 750;
    letter-spacing: -0.3px;
  }

  .sv.mono {
    font-family: var(--mono);
    letter-spacing: 1.5px;
    color: var(--accent-text);
  }

  .sl {
    font-size: 12.5px;
    color: var(--muted);
  }

  .sec {
    margin-top: 32px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 21px;
    font-weight: 700;
    letter-spacing: -0.3px;
    margin-bottom: 16px;
  }

  .count {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0;
    padding: 2px 9px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text-3);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
    gap: 20px 16px;
  }

  .card {
    padding: 18px 22px;
    border-radius: var(--r-section);
    background: var(--surface-1);
    border: 1px solid var(--border-1);
  }

  .note {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 26px;
    color: var(--muted);
    font-size: 14px;
  }

  .act {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 0;
    border-top: 1px solid var(--border-1);
    font-size: 14px;
    color: var(--text-3);
  }

  .act:first-child {
    border-top: 0;
  }

  .act p {
    flex: 1;
    min-width: 0;
  }

  .act strong {
    color: var(--text);
    font-weight: 650;
  }

  .aic {
    width: 28px;
    height: 28px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: var(--surface-3);
    color: var(--text-3);
    flex-shrink: 0;
  }

  .when {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .hero {
      animation: none;
    }
  }
</style>
