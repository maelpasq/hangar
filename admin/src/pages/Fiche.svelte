<script lang="ts">
  // Fiche d'un compte (à droite de la liste) : identité, chiffres, badges (modifiables), amis et
  // postes, signalements reçus, sanctions, journal.
  import Icon, { type IconName } from '../../../src/lib/components/Icon.svelte';
  import { ApiError, api, type Badge, type SanctionKind, type UserCard } from '../api';
  import { BADGES } from '../badges';
  import Avatar, { avatarColor } from '../components/Avatar.svelte';
  import Pill from '../components/Pill.svelte';
  import ReportBox from '../components/ReportBox.svelte';
  import { actionLabel, ago, date, hours, num } from '../format';
  import { DURATIONS, KINDS, kindLabel, reportStatusOf, untilLabel } from '../moderation';
  import { href } from '../router.svelte';

  let { id, badgeIds, q = '' }: { id: string; badgeIds: Badge[]; q?: string } = $props();

  let u = $state<UserCard | null>(null);
  let missing = $state(false);
  let failed = $state(false);
  let busy = $state<Badge | null>(null);
  let badgeError = $state(false);
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
      punishError = 'La sanction n’a pas été appliquée.';
    } finally {
      punishing = false;
    }
  }

  async function liftOne(sid: string) {
    punishing = true;
    punishError = '';
    try {
      await api.lift(sid);
      await load();
    } catch {
      punishError = 'La sanction n’a pas été levée.';
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

  const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const givable = $derived(BADGES.filter((b) => badgeIds.includes(b.id)));
  const figures = $derived<{ label: string; icon: IconName; value: string }[]>(
    u
      ? [
          { label: 'Jeux synchronisés', icon: 'image', value: num(u.library.entries) },
          { label: 'Sessions', icon: 'clock', value: num(u.library.sessions) },
          { label: 'Temps de jeu', icon: 'clock', value: hours(u.library.playMs) },
          { label: 'Amis', icon: 'heart', value: num(u.social?.enabled ? u.social.friends : 0) }
        ]
      : []
  );
</script>

{#if missing}
  <div class="card pad"><p class="empty">Ce compte n’existe pas (ou plus).</p></div>
{:else if failed}
  <p class="error">Impossible de charger la fiche.</p>
{:else if !u}
  <div class="card pad"><p class="empty">Chargement…</p></div>
{:else}
  <div class="stack">
    <div class="card hero">
      <div class="banner" style:--av={avatarColor(u.id)} aria-hidden="true"></div>
      <div class="ident">
        <Avatar name={u.name} seed={u.id} size={72} src={u.avatar ? api.avatarUrl(u.id) : null} />
        <div class="who">
          <div class="name-line">
            <h2 class="name">{u.name}</h2>
            {#each BADGES.filter((b) => u?.badges.includes(b.id)) as b (b.id)}
              <span class="pill" style:--c={b.color}><Icon name="shieldCheck" size={12} stroke={2} />{b.label}</span>
            {/each}
            {#each activeSanctions as s (s.id)}
              <Pill color="var(--danger)" label={kindLabel(s.kind)} />
            {/each}
          </div>
          <span class="mail">
            {u.email}
            {#if u.emailVerified}
              <span class="verified"><Icon name="shieldCheck" size={13} stroke={2} />vérifié</span>
            {:else}
              <span class="unverified">non vérifiée</span>
            {/if}
          </span>
          <span class="since">
            Inscrit le {longDate.format(u.since)} ·
            <span class="mono">{u.id}</span>
            <button class="copy" type="button" onclick={copyId} aria-label="Copier l’identifiant">
              <Icon name={copied ? 'check' : 'copy'} size={13} />
            </button>
          </span>
        </div>
      </div>
      <div class="figures">
        {#each figures as f (f.label)}
          <div class="figure">
            <span class="f-label"><Icon name={f.icon} size={14} />{f.label}</span>
            <span class="f-value">{f.value}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="duo">
      <div class="card block">
        <div class="titles">
          <h3>Badges</h3>
          <p class="card-sub small">Chaque changement est noté au journal.</p>
        </div>
        {#each givable as b (b.id)}
          {@const on = u.badges.includes(b.id)}
          <div class="line">
            <span class="tint icon" style:--c={b.color}><Icon name="shieldCheck" size={15} /></span>
            <span class="text">
              <span class="t">{b.label}</span>
              <span class="h">{b.hint}</span>
            </span>
            <button
              type="button"
              role="switch"
              class="tog"
              aria-checked={on}
              aria-label="{on ? 'Retirer' : 'Donner'} le badge {b.label}"
              disabled={busy !== null}
              onclick={() => toggle(b.id)}
            ></button>
          </div>
        {/each}
        {#if badgeError}<p class="error">Le badge n’a pas été modifié.</p>{/if}
      </div>

      <div class="card block">
        <h3>Amis et présence</h3>
        {#if u.social?.enabled}
          <dl>
            <div><dt>Code ami</dt><dd class="mono code">{u.social.code}</dd></div>
            <div><dt>Trouvable par pseudo</dt><dd>{u.social.findable ? 'Oui' : 'Non'}</dd></div>
            <div>
              <dt>Présence</dt>
              <dd class="presence" class:online={u.social.online}>
                <i></i>{u.social.online ? 'En ligne' : `Vu ${ago(u.social.seen)}`}
              </dd>
            </div>
          </dl>
        {:else}
          <p class="quiet">Amis désactivés sur ce compte.</p>
        {/if}
        <h3 class="devices-title">Postes</h3>
        {#each u.devices as d (d.id)}
          <div class="line">
            <span class="icon neutral"><Icon name="monitor" size={15} /></span>
            <span class="t grow">{d.name}</span>
            <span class="h">{ago(d.lastSeen)}</span>
          </div>
        {:else}
          <p class="quiet">Aucun poste connecté.</p>
        {/each}
      </div>
    </div>

    <div class="card block">
      <div class="head">
        <h3>Signalements reçus</h3>
        <Pill color={u.reportsReceived.length ? 'var(--danger)' : 'var(--muted-2)'} label={num(u.reportsReceived.length)} dot={false} />
      </div>
      {#each u.reportsReceived as r (r.id)}
        {@const st = reportStatusOf(r.status)}
        <ReportBox reason={r.reason} excerpt={r.excerpt}>
          {#snippet meta()}
            par <a href={href.compte(r.reporterId, q)}>{r.reporterName ?? 'compte supprimé'}</a> · {ago(r.at)}
          {/snippet}
          <Pill color={st.color} label={st.label} />
        </ReportBox>
      {:else}
        <p class="quiet">
          Aucun signalement. Les messages privés restent chiffrés : seule la copie gardée au moment d’un signalement
          est visible.
        </p>
      {/each}
      {#if u.reportsMade}<p class="card-sub small">A lui-même signalé {num(u.reportsMade)} fois.</p>{/if}
    </div>

    <div class="card block">
      <h3>Sanctions</h3>
      {#each activeSanctions as s (s.id)}
        <div class="line sanction">
          <span class="text">
            <span class="t">{kindLabel(s.kind)}, {untilLabel(s.until)}</span>
            <span class="h">Motif : {s.reason} · depuis le {date(s.at)}</span>
          </span>
          <button class="btn" type="button" disabled={punishing} onclick={() => liftOne(s.id)}>Lever</button>
        </div>
      {:else}
        <p class="quiet">Aucune sanction en cours.</p>
      {/each}

      <form class="punish" onsubmit={punish}>
        <fieldset>
          <legend class="lbl">Nouvelle sanction</legend>
          <div class="seg">
            {#each KINDS as k (k.id)}
              <button type="button" class:on={kind === k.id} aria-pressed={kind === k.id} onclick={() => (kind = k.id)}>
                <i style:background={k.id === 'total' ? 'var(--danger)' : 'var(--star)'}></i>{k.label}
              </button>
            {/each}
          </div>
          <p class="card-sub small help">{KINDS.find((k) => k.id === kind)?.help}</p>
        </fieldset>
        <div class="pair">
          <div class="dur">
            <label class="lbl" for="days">Durée</label>
            <select id="days" class="field" bind:value={days}>
              {#each DURATIONS as d (d.label)}
                <option value={d.days === null ? 'def' : String(d.days)}>{d.label}</option>
              {/each}
            </select>
          </div>
          <div class="why">
            <label class="lbl" for="reason">Motif (montré à la personne dans Hangar)</label>
            <input id="reason" class="field" maxlength="500" placeholder="Par exemple : messages insultants" bind:value={reason} />
          </div>
        </div>
        {#if punishError}<p class="error" role="alert">{punishError}</p>{/if}
        <div>
          <button class="btn" type="submit" disabled={punishing || !reason.trim()}>
            <Icon name="ban" size={16} />{punishing ? 'Application…' : 'Appliquer la sanction'}
          </button>
        </div>
      </form>

      {#if pastSanctions.length}
        <details>
          <summary>Anciennes sanctions ({pastSanctions.length})</summary>
          <ol class="hist">
            {#each pastSanctions as s (s.id)}
              <li>
                <span class="dot"></span>
                <span class="text">
                  <span class="t small">{kindLabel(s.kind)} : {s.reason}</span>
                  <span class="h">{date(s.at)}{s.liftedAt ? `, levée le ${date(s.liftedAt)}` : ', terminée'}</span>
                </span>
              </li>
            {/each}
          </ol>
        </details>
      {/if}
    </div>

    <div class="card block">
      <h3>Journal</h3>
      {#if u.log.length}
        <ol class="hist">
          {#each u.log as l (l.id)}
            <li>
              <span
                class="dot"
                style:background={l.action === 'badge.donner' ? 'var(--success)' : l.action === 'badge.retirer' || l.action.startsWith('sanction') ? 'var(--danger)' : 'var(--accent)'}
              ></span>
              <span class="text">
                <span class="t small">{actionLabel(l)}</span>
                <span class="h">{l.actor} · {ago(l.at)}</span>
              </span>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="quiet">Aucune action sur ce compte.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .pad {
    padding: 24px;
  }

  .hero {
    position: relative;
    overflow: hidden;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .banner {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 110px;
    background: linear-gradient(120deg, var(--av), transparent 70%);
    opacity: 0.35;
  }

  .ident {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px;
  }

  .who {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .name-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .name {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.4px;
  }

  .mail {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-3);
  }

  .verified {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--success-text);
  }

  .unverified {
    color: var(--star);
  }

  .since {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--muted);
  }

  .since .mono {
    font-size: 12px;
  }

  .copy {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    color: var(--muted);
    transition:
      background 0.15s,
      color 0.15s;
  }

  .copy:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .figures {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .figure {
    flex: 1 1 130px;
    min-width: 0;
    padding: 14px 16px;
    border-radius: 14px;
    background: rgb(var(--glass) / 0.26);
    border: 1px solid var(--border-1);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .f-label {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--muted);
  }

  .f-value {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.4px;
    color: var(--strong);
    font-variant-numeric: tabular-nums;
  }

  .duo {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: 16px;
  }

  .block {
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .titles {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .small {
    font-size: 12.5px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .icon {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .neutral {
    background: rgb(var(--ink) / 0.06);
    color: var(--text-2);
  }

  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .t {
    font-size: 14px;
    color: var(--text);
  }

  .t.small {
    font-size: 13.5px;
    color: var(--text-soft);
  }

  .grow {
    flex: 1;
  }

  .h {
    font-size: 12px;
    color: var(--muted);
  }

  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  dl div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 13.5px;
  }

  dt {
    color: var(--text-3);
  }

  dd {
    margin: 0;
    color: var(--strong);
  }

  .code {
    letter-spacing: 1px;
  }

  .presence {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--text-3);
  }

  .presence i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }

  .presence.online {
    color: var(--success-text);
  }

  .devices-title {
    margin-top: 6px;
  }

  .quiet {
    font-size: 13.5px;
    color: var(--muted);
  }

  .sanction {
    padding: 12px 14px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger) 22%, transparent);
  }

  .punish {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 16px;
    border-top: 1px solid rgb(var(--ink) / 0.06);
  }

  .help {
    margin-top: 8px;
  }

  .pair {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }

  .dur {
    flex: 0 1 160px;
  }

  .why {
    flex: 1 1 240px;
    min-width: 0;
  }

  select.field {
    appearance: auto;
  }

  summary {
    cursor: pointer;
    font-size: 13px;
    color: var(--muted);
  }

  .hist {
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .block > .hist {
    margin: 0;
  }

  .hist li {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .dot {
    width: 9px;
    height: 9px;
    margin-top: 5px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--muted-2);
    box-shadow: 0 0 0 4px rgb(var(--ink) / 0.04);
  }
</style>
