<script lang="ts">
  // Fiche d'un compte : identité, postes, amis, bibliothèque, badges (modifiables), signalements, journal.
  import BadgeIcon from '../../../src/lib/components/BadgeIcon.svelte';
  import Icon from '../../../src/lib/components/Icon.svelte';
  import { givenView } from '../../../src/lib/util/badges';
  import { ApiError, api, type Badge, type UserCard } from '../api';
  import { actionLabel, ago, date, dateTime, hours, num } from '../format';
  import { href } from '../router.svelte';

  let { id, badgeIds }: { id: string; badgeIds: Badge[] } = $props();

  let u = $state<UserCard | null>(null);
  let missing = $state(false);
  let failed = $state(false);
  let busy = $state<Badge | null>(null);
  let badgeError = $state(false);
  let avatarOk = $state(true);
  let copied = $state(false);

  async function load() {
    try {
      u = await api.user(id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) missing = true;
      else failed = true;
    }
  }
  load();

  async function toggle(b: Badge) {
    if (!u || busy) return;
    busy = b;
    badgeError = false;
    try {
      await api.setBadge(u.id, b, !u.badges.includes(b));
      await load();
    } catch {
      badgeError = true;
    } finally {
      busy = null;
    }
  }

  async function copyId() {
    if (!u) return;
    await navigator.clipboard.writeText(u.id).catch(() => {});
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  const avatar = $derived(u?.avatar && avatarOk ? api.avatarUrl(u.id) : null);
</script>

<a class="back" href={href.comptes()}><Icon name="back" size={16} /> Comptes</a>

{#if missing}
  <p class="empty">Ce compte n'existe pas (ou plus).</p>
{:else if failed}
  <p class="error">Impossible de charger la fiche.</p>
{:else if !u}
  <p class="muted">Chargement…</p>
{:else}
  <header class="id">
    <div class="avatar" aria-hidden="true">
      {#if avatar}
        <img src={avatar} alt="" onerror={() => (avatarOk = false)} />
      {:else}
        {u.name.slice(0, 1).toUpperCase()}
      {/if}
    </div>
    <div class="who">
      <h1>
        {u.name}
        {#each u.badges as b (b)}
          {@const v = givenView(b)}
          <span class="emblem" style:color={v.color} title={v.label}><BadgeIcon icon={v.icon} size={20} /></span>
        {/each}
      </h1>
      <p class="soft">
        {u.email}
        {#if !u.emailVerified}<span class="tag warn">non vérifiée</span>{/if}
        · inscrit le {date(u.since)}
      </p>
      <p class="idline">
        <span class="mono">{u.id}</span>
        <button class="copy" type="button" onclick={copyId} aria-label="Copier l'identifiant">
          <Icon name={copied ? 'check' : 'copy'} size={14} />
        </button>
      </p>
    </div>
  </header>

  <div class="grid">
    <section class="card">
      <h2>Badges</h2>
      <p class="hint muted">Donnés à la main, visibles sur le profil dans l'app.</p>
      <div class="badges">
        {#each badgeIds as b (b)}
          {@const v = givenView(b)}
          {@const on = u.badges.includes(b)}
          <button type="button" class="badge" class:on aria-pressed={on} disabled={busy !== null} onclick={() => toggle(b)}>
            <span class="emblem" style:color={on ? v.color : 'var(--muted-2)'}><BadgeIcon icon={v.icon} size={20} /></span>
            {v.label}
            <span class="state">{busy === b ? '…' : on ? 'Retirer' : 'Donner'}</span>
          </button>
        {/each}
      </div>
      {#if badgeError}<p class="error small">Le badge n'a pas été modifié.</p>{/if}
    </section>

    <section class="card">
      <h2>Amis</h2>
      {#if u.social?.enabled}
        <dl>
          <dt>État</dt>
          <dd>
            <span class="dot" class:online={u.social.online}></span>
            {u.social.online ? 'En ligne' : `Vu ${ago(u.social.seen)}`}
          </dd>
          <dt>Code ami</dt>
          <dd class="mono">{u.social.code.slice(0, 4)}-{u.social.code.slice(4)}</dd>
          <dt>Amis</dt>
          <dd>{num(u.social.friends)}</dd>
          <dt>Trouvable par pseudo</dt>
          <dd>{u.social.findable ? 'Oui' : 'Non'}</dd>
        </dl>
      {:else}
        <p class="muted">Amis désactivés.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Bibliothèque synchronisée</h2>
      <dl>
        <dt>Éléments</dt>
        <dd>{num(u.library.entries)}</dd>
        <dt>Sessions de jeu</dt>
        <dd>{num(u.library.sessions)}</dd>
        <dt>Temps de jeu</dt>
        <dd>{hours(u.library.playMs)}</dd>
        <dt>Jaquettes envoyées</dt>
        <dd>{num(u.library.covers)}</dd>
      </dl>
    </section>

    <section class="card">
      <h2>Postes</h2>
      {#if u.devices.length}
        <ul class="plain">
          {#each u.devices as d (d.id)}
            <li>
              <Icon name="monitor" size={16} />
              <span class="grow">{d.name}</span>
              <span class="muted">{ago(d.lastSeen)}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Aucun poste connecté.</p>
      {/if}
    </section>

    <section class="card wide">
      <h2>Signalements reçus <span class="muted">({num(u.reportsReceived.length)})</span></h2>
      {#if u.reportsMade}<p class="hint muted">A lui-même signalé {num(u.reportsMade)} fois.</p>{/if}
      {#if u.reportsReceived.length}
        <ul class="reports">
          {#each u.reportsReceived as r (r.id)}
            <li>
              <div class="line">
                <b>{r.reason}</b>
                <span class="muted">
                  par
                  <a href={href.compte(r.reporterId)}>{r.reporterName ?? 'compte supprimé'}</a>,
                  {dateTime(r.at)}
                </span>
              </div>
              {#if r.excerpt}<blockquote>{r.excerpt}</blockquote>{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Aucun signalement.</p>
      {/if}
    </section>

    <section class="card wide">
      <h2>Journal</h2>
      {#if u.log.length}
        <ul class="plain">
          {#each u.log as l (l.id)}
            <li>
              <span class="grow">{actionLabel(l)}</span>
              <span class="muted">{dateTime(l.at)}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Aucune action sur ce compte.</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 18px;
    color: var(--text-3);
    text-decoration: none;
    font-weight: 500;
  }

  .back:hover {
    color: var(--text);
  }

  .id {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 22px;
  }

  .avatar {
    flex: none;
    width: 68px;
    height: 68px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 26px;
    font-weight: 650;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .who {
    min-width: 0;
  }

  h1 {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .emblem {
    display: inline-flex;
  }

  .soft {
    margin: 4px 0 0;
    color: var(--text-3);
  }

  .idline {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px 0 0;
    color: var(--muted);
  }

  .copy {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .copy:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .tag {
    margin-left: 6px;
    padding: 1px 7px;
    border-radius: 99px;
    font-size: 11.5px;
  }

  .warn {
    background: color-mix(in srgb, var(--star) 18%, transparent);
    color: var(--star);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .wide {
    grid-column: 1 / -1;
  }

  h2 {
    margin-bottom: 12px;
  }

  .hint {
    margin: -6px 0 12px;
    font-size: 12.5px;
  }

  .badges {
    display: grid;
    gap: 6px;
  }

  .badge {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 11px;
    border-radius: var(--r-btn);
    border: 1px solid var(--border-2);
    background: var(--surface-1);
    color: var(--text-3);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s var(--ease), border-color 0.15s var(--ease);
  }

  .badge:hover:not(:disabled) {
    background: var(--surface-3);
  }

  .badge.on {
    border-color: var(--accent-ring);
    background: var(--accent-soft);
    color: var(--strong);
  }

  .badge:disabled {
    cursor: default;
  }

  .state {
    margin-left: auto;
    font-size: 12px;
    color: var(--muted);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 9px 18px;
    margin: 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    color: var(--text-soft);
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted-2);
  }

  .dot.online {
    background: var(--success);
  }

  .plain {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .plain li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-top: 1px solid var(--border-1);
    color: var(--text-soft);
  }

  .plain li:first-child {
    border-top: 0;
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .reports {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .reports li {
    padding: 11px 13px;
    border-radius: var(--r-btn);
    background: var(--surface-1);
    border: 1px solid var(--border-1);
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    align-items: baseline;
  }

  .line b {
    color: var(--text);
    font-weight: 550;
  }

  blockquote {
    margin: 8px 0 0;
    padding-left: 10px;
    border-left: 2px solid var(--border-3);
    color: var(--text-3);
    white-space: pre-wrap;
  }

  .small {
    margin: 10px 0 0;
    font-size: 12.5px;
  }

  @media (max-width: 900px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
