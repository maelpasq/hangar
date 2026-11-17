<script lang="ts">
  // Fiche d'un compte : identité, postes, amis, bibliothèque, badges (modifiables), signalements, journal.
  import BadgeIcon from '../../../src/lib/components/BadgeIcon.svelte';
  import Icon from '../../../src/lib/components/Icon.svelte';
  import { givenView } from '../../../src/lib/util/badges';
  import { ApiError, api, type Badge, type UserCard } from '../api';
  import { actionLabel, ago, date, dateTime, hours, num } from '../format';
  import { DURATIONS, KINDS, kindLabel, reportStatusOf, untilLabel } from '../moderation';
  import type { SanctionKind } from '../api';
  import { href } from '../router.svelte';

  let { id, badgeIds }: { id: string; badgeIds: Badge[] } = $props();

  let u = $state<UserCard | null>(null);
  let missing = $state(false);
  let failed = $state(false);
  let busy = $state<Badge | null>(null);
  let badgeError = $state(false);
  let avatarOk = $state(true);
  let copied = $state(false);

  // Nouvelle sanction.
  let kind = $state<SanctionKind>('social');
  let days = $state<string>('7');
  let reason = $state('');
  let punishing = $state(false);
  let punishError = $state('');

  async function punish(e: SubmitEvent) {
    e.preventDefault();
    if (!u || punishing || !reason.trim()) return;
    punishing = true;
    punishError = '';
    try {
      await api.sanction(u.id, kind, reason.trim(), days === 'def' ? null : Number(days));
      reason = '';
      await load();
    } catch {
      punishError = "La sanction n'a pas été appliquée.";
    } finally {
      punishing = false;
    }
  }

  async function liftOne(id: string) {
    punishing = true;
    punishError = '';
    try {
      await api.lift(id);
      await load();
    } catch {
      punishError = "La sanction n'a pas été levée.";
    } finally {
      punishing = false;
    }
  }

  const activeSanctions = $derived(u?.sanctions.filter((s) => s.active) ?? []);
  const pastSanctions = $derived(u?.sanctions.filter((s) => !s.active) ?? []);

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

    <section class="card wide" aria-labelledby="mod-title">
      <h2 id="mod-title">Sanctions</h2>
      {#if activeSanctions.length}
        <ul class="sanctions">
          {#each activeSanctions as s (s.id)}
            <li class="on">
              <span class="grow">
                <b>{kindLabel(s.kind)}</b>, {untilLabel(s.until)}
                <span class="muted">· depuis le {date(s.at)}</span><br />
                <span class="soft">Motif : {s.reason}</span>
              </span>
              <button class="btn" type="button" disabled={punishing} onclick={() => liftOne(s.id)}>Lever</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Aucune sanction en cours.</p>
      {/if}

      <form class="punish" onsubmit={punish}>
        <fieldset>
          <legend class="label">Nouvelle sanction</legend>
          <div class="kinds">
            {#each KINDS as k (k.id)}
              <label class="kind" class:sel={kind === k.id}>
                <input type="radio" name="kind" value={k.id} bind:group={kind} />
                <span><b>{k.label}</b><br /><span class="muted">{k.help}</span></span>
              </label>
            {/each}
          </div>
        </fieldset>
        <div class="row2">
          <label class="field">
            <span class="label">Durée</span>
            <select bind:value={days}>
              {#each DURATIONS as d (d.label)}
                <option value={d.days === null ? 'def' : String(d.days)}>{d.label}</option>
              {/each}
            </select>
          </label>
          <label class="field grow">
            <span class="label">Motif (montré à la personne dans Hangar)</span>
            <input type="text" maxlength="500" placeholder="Par exemple : messages insultants" bind:value={reason} />
          </label>
        </div>
        {#if punishError}<p class="error small" role="alert">{punishError}</p>{/if}
        <button class="btn danger" type="submit" disabled={punishing || !reason.trim()}>
          {punishing ? 'Application…' : 'Appliquer la sanction'}
        </button>
      </form>

      {#if pastSanctions.length}
        <details class="past">
          <summary>Anciennes sanctions ({pastSanctions.length})</summary>
          <ul class="plain">
            {#each pastSanctions as s (s.id)}
              <li>
                <span class="grow">{kindLabel(s.kind)} : {s.reason}</span>
                <span class="muted">{date(s.at)}{s.liftedAt ? `, levée le ${date(s.liftedAt)}` : ', terminée'}</span>
              </li>
            {/each}
          </ul>
        </details>
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
                <span class="pill" style:--c={reportStatusOf(r.status).color}>{reportStatusOf(r.status).label}</span>
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

  .sanctions {
    list-style: none;
    margin: 0 0 16px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sanctions li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 13px;
    border-radius: var(--r-btn);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
    color: var(--text-soft);
  }

  .punish {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid var(--border-1);
  }

  .punish fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .label {
    display: block;
    margin-bottom: 8px;
    padding: 0;
    font-size: 12.5px;
    color: var(--muted);
  }

  .kinds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .kind {
    position: relative;
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--r-btn);
    border: 1px solid var(--border-2);
    background: var(--surface-1);
    color: var(--text-soft);
    cursor: pointer;
    font-size: 13px;
  }

  .kind input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .kind:has(input:focus-visible) {
    outline: 2px solid var(--accent-ring);
    outline-offset: 2px;
  }

  .kind.sel {
    border-color: color-mix(in srgb, var(--danger) 60%, transparent);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }

  .row2 {
    display: flex;
    gap: 10px;
  }

  .field select,
  .field input {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border-radius: 10px;
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    color: var(--text);
    outline: none;
  }

  .field select:focus,
  .field input:focus {
    border-color: var(--accent-ring);
  }

  .danger {
    align-self: flex-start;
    background: color-mix(in srgb, var(--danger) 22%, transparent);
    border-color: color-mix(in srgb, var(--danger) 50%, transparent);
    color: var(--danger-text);
  }

  .danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger) 32%, transparent);
  }

  .past {
    margin-top: 14px;
    color: var(--text-3);
  }

  .past summary {
    cursor: pointer;
    margin-bottom: 6px;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 1px 8px;
    border-radius: 99px;
    font-size: 11.5px;
    color: var(--text-soft);
    background: color-mix(in srgb, var(--c) 16%, transparent);
  }

  .small {
    margin: 10px 0 0;
    font-size: 12.5px;
  }

  @media (max-width: 900px) {
    .grid,
    .kinds {
      grid-template-columns: 1fr;
    }
  }
</style>
