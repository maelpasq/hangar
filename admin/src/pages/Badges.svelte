<script lang="ts">
  // Badges : liste (ordre d'affichage dans l'app) et, à côté, le badge choisi : nom, description,
  // emblème, couleur, affichage, ordre, suppression, et le don à plusieurs comptes d'un coup.
  // `nouveau` : création. Écran sans maquette : coquille, en-tête et composants existants
  // (`.row`, `.field`, `.seg`, `.tog`, `.btn`, `.primary`).
  import BadgeIcon from '../../../src/lib/components/BadgeIcon.svelte';
  import Icon from '../../../src/lib/components/Icon.svelte';
  import ArchEmblem from '../../../src/lib/components/ArchEmblem.svelte';
  import { AUTO_BADGES, GIVEN_ICONS } from '../../../src/lib/util/badges';
  import { TIERS, tierAge } from '../../../src/lib/util/seniority';
  import { ApiError, api, type AdminBadge } from '../api';
  import { ICON_LABELS, PALETTE, badgeDefs, colorOf, iconOf, loadBadges } from '../badges.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { num } from '../format';
  import { href } from '../router.svelte';
  import { loadStats } from '../stats.svelte';

  let { id }: { id: string | null } = $props();

  const creating = $derived(id === 'nouveau');
  const current = $derived(creating ? null : (badgeDefs.list.find((b) => b.id === id) ?? badgeDefs.list[0] ?? null));

  // Formulaire : repart des valeurs du badge choisi à chaque changement de badge.
  let name = $state('');
  let description = $state('');
  let icon = $state<string>('star');
  let color = $state('accent');
  let saving = $state(false);
  let error = $state('');
  let saved = $state(false);
  let shown = '';
  $effect(() => {
    const key = creating ? 'nouveau' : (current?.id ?? '');
    if (key === shown) return;
    shown = key;
    name = current?.name ?? '';
    description = current?.description ?? '';
    icon = current?.icon ?? 'star';
    color = current?.color ?? freeColor();
    error = '';
    saved = false;
    bulkText = '';
    bulkResult = '';
  });

  // Une couleur peut servir à plusieurs badges ; un nouveau badge part quand même d'une
  // couleur encore inutilisée (badges calculés par l'app compris), modifiable librement.
  const AUTO_COLORS = AUTO_BADGES.flatMap((a) => a.tiers.map((t) => t.color));
  function freeColor() {
    const used = new Set([...AUTO_COLORS, ...badgeDefs.list.map((b) => b.color)]);
    return PALETTE.find((p) => !used.has(p.color))?.color ?? randomColor(used);
  }
  function randomColor(used: Set<string>) {
    let c = '';
    do c = '#' + Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0');
    while (used.has(c));
    return c;
  }
  const hexOf = (c: string) => (c.startsWith('#') ? c : '#7c5cff');

  const dirty = $derived(
    creating || (!!current && (name.trim() !== current.name || description.trim() !== current.description || icon !== current.icon || color !== current.color))
  );
  const NAME_MAX = 40;
  const DESCRIPTION_MAX = 140;

  const messages: Record<string, string> = {
    requete: 'Vérifie le nom (40 caractères au plus) et la description (140 au plus).',
    origine: 'Les 4 badges d’origine ne se suppriment pas : désactive-les plutôt.',
    utilise: 'Ce badge est encore donné : retire-le d’abord à tous les comptes.',
    couleur: 'Cette couleur est déjà celle d’un autre badge : choisis-en une autre.'
  };
  const fail = (e: unknown) => (error = (e instanceof ApiError && messages[e.code]) || 'Le badge n’a pas été enregistré.');

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (saving || !name.trim()) return;
    saving = true;
    error = '';
    saved = false;
    const fields = { name: name.trim(), description: description.trim(), icon, color };
    try {
      if (creating) {
        const res = await api.createBadge(fields);
        await loadBadges();
        location.hash = href.badges(res.id);
      } else if (current) {
        badgeDefs.list = (await api.updateBadge(current.id, fields)).badges;
        saved = true;
      }
    } catch (err) {
      fail(err);
    } finally {
      saving = false;
    }
  }

  async function setActive(b: AdminBadge) {
    if (saving) return;
    saving = true;
    error = '';
    try {
      badgeDefs.list = (await api.updateBadge(b.id, { active: !b.active })).badges;
      loadStats();
    } catch (err) {
      fail(err);
    } finally {
      saving = false;
    }
  }

  async function move(b: AdminBadge, by: -1 | 1) {
    const ids = badgeDefs.list.map((x) => x.id);
    const i = ids.indexOf(b.id);
    const j = i + by;
    if (saving || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    saving = true;
    error = '';
    try {
      badgeDefs.list = (await api.orderBadges(ids)).badges;
    } catch (err) {
      fail(err);
    } finally {
      saving = false;
    }
  }

  async function remove(b: AdminBadge) {
    if (saving || !confirm(`Supprimer le badge « ${b.name} » ? Il n’est donné à personne.`)) return;
    saving = true;
    error = '';
    try {
      badgeDefs.list = (await api.deleteBadge(b.id)).badges;
      location.hash = href.badges();
    } catch (err) {
      fail(err);
    } finally {
      saving = false;
    }
  }

  // Don groupé : un compte par ligne (ou séparés par des virgules).
  let bulkText = $state('');
  let bulkBusy = $state(false);
  let bulkResult = $state('');
  let bulkFailed = $state(false);
  const refs = $derived(
    bulkText
      .split(/[\n,;]+/)
      .map((r) => r.trim())
      .filter(Boolean)
  );
  const BULK_MAX = 200;

  async function bulk(on: boolean) {
    if (!current || bulkBusy || !refs.length || refs.length > BULK_MAX) return;
    bulkBusy = true;
    bulkFailed = false;
    bulkResult = '';
    try {
      const res = await api.bulkBadge(current.id, refs, on);
      const done = on ? 'donné à' : 'retiré à';
      const parts = [`Badge ${done} ${num(res.changed)} compte${res.changed > 1 ? 's' : ''}`];
      if (res.found > res.changed) parts.push(`${num(res.found - res.changed)} déjà à jour`);
      bulkResult = `${parts.join(', ')}.`;
      if (res.missing.length) {
        bulkFailed = true;
        bulkResult += ` Introuvable${res.missing.length > 1 ? 's' : ''} : ${res.missing.join(', ')}.`;
        bulkText = res.missing.join('\n');
      } else {
        bulkText = '';
      }
      await loadBadges();
      loadStats();
    } catch {
      bulkFailed = true;
      bulkResult = 'Rien n’a été modifié.';
    } finally {
      bulkBusy = false;
    }
  }

  const index = $derived(current ? badgeDefs.list.findIndex((b) => b.id === current.id) : -1);
  const sub = 'Badges donnés à la main, affichés à côté du pseudo dans l’app, dans cet ordre. Chaque changement est noté au journal.';
</script>

<PageHeader title="Badges" {sub}>
  {#snippet actions()}
    <a class="primary" href={href.badges('nouveau')}><Icon name="plus" size={16} />Nouveau badge</a>
  {/snippet}
</PageHeader>

<div class="split">
  <div class="side">
  <section class="card list" aria-label="Badges">
    <p class="over">Ordre d’affichage</p>
    {#each badgeDefs.list as b, i (b.id)}
      <a class="row" class:on={!creating && b.id === current?.id} href={href.badges(b.id)} aria-current={!creating && b.id === current?.id ? 'true' : undefined}>
        <span class="row-num mono">{i + 1}</span>
        <span class="tint emblem" style:--c={colorOf(b)}><BadgeIcon icon={iconOf(b)} size={18} /></span>
        <span class="row-body">
          <span class="row-title">{b.name}</span>
          <span class="row-meta">
            {num(b.held)} compte{b.held > 1 ? 's' : ''}{#if !b.active} · désactivé{/if}
          </span>
        </span>
      </a>
    {:else}
      <p class="empty">Aucun badge.</p>
    {/each}
    {#if creating}
      <div class="row on" aria-current="true">
        <span class="row-num mono">{badgeDefs.list.length + 1}</span>
        <span class="tint emblem" style:--c={colorOf({ color })}><BadgeIcon icon={iconOf({ icon })} size={18} /></span>
        <span class="row-body">
          <span class="row-title">{name.trim() || 'Nouveau badge'}</span>
          <span class="row-meta">En création</span>
        </span>
      </div>
    {/if}
  </section>

  <section class="card list" aria-label="Badges automatiques">
    <p class="over">Automatiques, calculés par l’app</p>
    {#each AUTO_BADGES as a (a.id)}
      <div class="row auto">
        <span class="tint emblem" style:--c={a.tiers.at(-1)?.color}><BadgeIcon icon={a.icon} size={18} /></span>
        <span class="row-body">
          <span class="row-title">{a.name}</span>
          <span class="row-meta">{a.rule}</span>
          {#if a.tiers.length > 1}
            <span class="tiers">
              {#each a.tiers as t (t.label)}<span class="pill" style:--c={t.color}><i></i>{t.label}</span>{/each}
            </span>
          {/if}
        </span>
      </div>
    {/each}
    <div class="row auto">
      <span class="emblem arch"><ArchEmblem tier={TIERS.at(-1)!} size={26} /></span>
      <span class="row-body">
        <span class="row-title">Ancienneté</span>
        <span class="row-meta">Arche selon l’âge du compte, toujours en dernier</span>
        <span class="tiers">
          {#each TIERS as t (t.id)}<span class="pill" style:--c={t.colors[1]} title={tierAge(t)}><i></i>{t.name}</span>{/each}
        </span>
      </span>
    </div>
  </section>
  </div>

  <section class="detail" aria-label={creating ? 'Nouveau badge' : 'Badge choisi'}>
    {#if creating || current}
      <form class="card pad stack" onsubmit={save}>
        <div class="head">
          <span class="tint big" style:--c={colorOf({ color })}><BadgeIcon icon={iconOf({ icon })} size={28} /></span>
          <div class="titles">
            <h2>{name.trim() || 'Nouveau badge'}</h2>
            <p class="card-sub">
              {#if creating}
                Visible dans l’app dès qu’il est donné à un compte.
              {:else if current}
                <span class="mono">{current.id}</span> · {num(current.held)} compte{current.held > 1 ? 's' : ''}
              {/if}
            </p>
          </div>
          {#if current}
            <button
              type="button"
              role="switch"
              class="tog"
              aria-checked={current.active}
              aria-label="Afficher le badge {current.name}"
              title={current.active ? 'Affiché dans l’app' : 'Masqué partout, sans être retiré'}
              disabled={saving}
              onclick={() => current && setActive(current)}
            ></button>
          {/if}
        </div>

        <div class="fields">
          <div>
            <label class="lbl" for="badge-name">Nom</label>
            <input id="badge-name" class="field" maxlength={NAME_MAX} required autocomplete="off" bind:value={name} />
          </div>
          <div>
            <label class="lbl" for="badge-desc">Description <span class="quiet">(dashboard seulement)</span></label>
            <textarea id="badge-desc" class="field" maxlength={DESCRIPTION_MAX} bind:value={description}></textarea>
          </div>
        </div>

        <fieldset>
          <legend class="lbl">Emblème</legend>
          <div class="seg">
            {#each GIVEN_ICONS as ic (ic)}
              <button
                type="button"
                class="ico"
                class:on={icon === ic}
                aria-pressed={icon === ic}
                aria-label={ICON_LABELS[ic]}
                title={ICON_LABELS[ic]}
                style:--c={colorOf({ color })}
                onclick={() => (icon = ic)}
              >
                <BadgeIcon icon={ic} size={18} />
              </button>
            {/each}
          </div>
        </fieldset>

        <fieldset>
          <legend class="lbl">Couleur</legend>
          <div class="seg">
            {#each PALETTE as p (p.color)}
              <button
                type="button"
                class:on={color === p.color}
                aria-pressed={color === p.color}
                onclick={() => (color = p.color)}
              >
                <i style:background={colorOf(p)}></i>{p.label}
              </button>
            {/each}
            <label class="free" class:on={!PALETTE.some((p) => p.color === color)}>
              <input
                type="color"
                value={hexOf(color)}
                oninput={(e) => (color = e.currentTarget.value.toLowerCase())}
                aria-label="Couleur libre"
              />
              Libre{#if !PALETTE.some((p) => p.color === color)}<span class="mono">{color}</span>{/if}
            </label>
          </div>
        </fieldset>

        {#if error}<p class="error" role="alert">{error}</p>{/if}

        <div class="actions">
          <button class="primary" type="submit" disabled={saving || !name.trim() || !dirty}>
            {creating ? 'Créer le badge' : 'Enregistrer'}
          </button>
          {#if saved && !dirty}<span class="ok" role="status">Enregistré.</span>{/if}
          {#if current}
            <span class="spacer"></span>
            <button class="btn" type="button" disabled={saving || index <= 0} onclick={() => current && move(current, -1)}>Monter</button>
            <button class="btn" type="button" disabled={saving || index >= badgeDefs.list.length - 1} onclick={() => current && move(current, 1)}>
              Descendre
            </button>
            <button
              class="btn"
              type="button"
              disabled={saving || current.legacy || current.held > 0}
              title={current.legacy ? messages.origine : current.held > 0 ? messages.utilise : undefined}
              onclick={() => current && remove(current)}
            >
              <Icon name="trash" size={16} />Supprimer
            </button>
          {/if}
        </div>
      </form>

      {#if current}
        <form class="card pad stack" onsubmit={(e) => (e.preventDefault(), bulk(true))}>
          <div class="titles">
            <h3>Donner à plusieurs comptes</h3>
            <p class="card-sub">Identifiant, code ami ou e-mail, un par ligne ({BULK_MAX} au plus). Chaque compte changé est noté au journal.</p>
          </div>
          <div>
            <label class="lbl" for="bulk">Comptes</label>
            <textarea id="bulk" class="field mono" spellcheck="false" placeholder={'ABCD-2345\njoueur@exemple.fr'} bind:value={bulkText}></textarea>
          </div>
          {#if bulkResult}<p class={bulkFailed ? 'error' : 'ok'} role="status">{bulkResult}</p>{/if}
          <div class="actions">
            <button class="primary" type="submit" disabled={bulkBusy || !refs.length || refs.length > BULK_MAX}>
              {refs.length ? `Donner à ${num(refs.length)} compte${refs.length > 1 ? 's' : ''}` : 'Donner'}
            </button>
            <button class="btn" type="button" disabled={bulkBusy || !refs.length || refs.length > BULK_MAX} onclick={() => bulk(false)}>Retirer</button>
          </div>
        </form>
      {/if}
    {:else}
      <div class="card pad"><p class="empty">Aucun badge pour l’instant.</p></div>
    {/if}
  </section>
</div>

<style>
  .split {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
  }

  .side {
    flex: 1 1 340px;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .list {
    padding: 14px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .over {
    padding: 0 10px 4px;
  }

  .list .row {
    padding: 10px 12px;
  }

  .row-num {
    width: 18px;
  }

  .auto {
    align-items: flex-start;
  }

  .auto .row-title {
    white-space: normal;
  }

  .tiers {
    margin-top: 5px;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .arch {
    display: grid;
    place-items: center;
  }

  .emblem {
    width: 36px;
    height: 36px;
    border-radius: 11px;
  }

  .detail {
    flex: 1.6 1 520px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .pad {
    padding: 22px 24px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .big {
    width: 56px;
    height: 56px;
    border-radius: 16px;
  }

  .titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  h2 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.4px;
    color: var(--strong);
    overflow-wrap: anywhere;
  }

  .fields {
    display: grid;
    gap: 16px;
  }

  .fields > div,
  form > div:not(.head):not(.actions):not(.titles):not(.fields) {
    display: flex;
    flex-direction: column;
  }

  .quiet {
    font-weight: 400;
    color: var(--muted);
  }

  .ico {
    width: 40px;
    justify-content: center;
    padding: 0;
  }

  .ico.on {
    color: var(--c);
  }

  .seg button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Couleur libre : même allure qu'un bouton du segment, avec le sélecteur natif en guise de point. */
  .free {
    height: 34px;
    padding: 0 12px 0 8px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border-radius: 10px;
    border: 1px solid var(--border-2);
    font-size: 13px;
    color: var(--text-3);
    cursor: pointer;
    transition: all 0.15s;
  }

  .free:hover {
    background: rgb(var(--ink) / 0.06);
    color: var(--strong);
  }

  .free.on {
    background: rgb(var(--ink) / 0.12);
    border-color: rgb(var(--ink) / 0.2);
    color: var(--strong);
  }

  .free:focus-within {
    outline: 2px solid var(--accent-ring);
    outline-offset: 2px;
  }

  .free input {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    cursor: pointer;
    outline: none;
  }

  .free input::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .free input::-webkit-color-swatch {
    border: 0;
    border-radius: 6px;
  }

  .free .mono {
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .spacer {
    flex: 1;
  }

  .ok {
    font-size: 13px;
    color: var(--success-text);
  }

  @media (max-width: 760px) {
    .side {
      max-width: none;
    }

    .spacer {
      display: none;
    }
  }
</style>
