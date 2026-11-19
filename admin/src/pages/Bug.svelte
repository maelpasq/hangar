<script lang="ts">
  // Fiche d'un bug (à droite de la liste) : signalement (texte, version, système, capture) et suivi
  // (statut, version de correction, doublon, note interne), avec son historique.
  import Icon from '../../../src/lib/components/Icon.svelte';
  import { ApiError, api, type BugCard, type BugStatus, type LogRow } from '../api';
  import { TINTS } from '../badges.svelte';
  import { STATUSES, SYSTEMS, statusOf } from '../bug-status';
  import Pill from '../components/Pill.svelte';
  import { actionLabel, ago } from '../format';

  let { id, onSaved }: { id: number; onSaved?: () => void } = $props();

  let bug = $state<BugCard | null>(null);
  let missing = $state(false);
  let failed = $state(false);

  // Formulaire du suivi.
  let status = $state<BugStatus>('nouveau');
  let fixedIn = $state('');
  let duplicateOf = $state('');
  let note = $state('');
  let saving = $state(false);
  let error = $state('');
  let saved = $state(false);

  function fill(b: BugCard) {
    bug = b;
    status = b.status;
    fixedIn = b.fixedIn ?? '';
    duplicateOf = b.duplicateOf ? `#${b.duplicateOf}` : '';
    note = b.note ?? '';
  }

  async function load() {
    try {
      fill(await api.bug(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) missing = true;
      else failed = true;
    }
  }
  load();

  const dupId = (v: string) => v.trim().replace(/^#/, '');

  const changed = $derived(
    !!bug &&
      (status !== bug.status ||
        (status === 'corrige' && fixedIn.trim() !== (bug.fixedIn ?? '')) ||
        (status === 'doublon' && dupId(duplicateOf) !== (bug.duplicateOf ? String(bug.duplicateOf) : '')) ||
        note.trim() !== (bug.note ?? ''))
  );

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!bug || !changed || saving) return;
    saving = true;
    error = '';
    saved = false;
    try {
      await api.updateBug(bug.id, {
        status,
        fixedIn: status === 'corrige' ? fixedIn.trim() || null : null,
        duplicateOf: status === 'doublon' ? dupId(duplicateOf) || null : null,
        note: note.trim() || null
      });
      fill(await api.bug(bug.id));
      saved = true;
      onSaved?.();
      setTimeout(() => (saved = false), 2000);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      error =
        code === 'version'
          ? 'Version invalide (par exemple 1.2.30).'
          : code === 'doublon'
            ? 'Numéro de bug introuvable (ou celui-ci).'
            : 'Le suivi n’a pas été enregistré.';
    } finally {
      saving = false;
    }
  }

  const capture = $derived(bug?.capture ? api.captureUrl(bug.id) : null);
  const dotOf = (l: LogRow) =>
    l.action === 'bug.statut' ? statusOf(String(l.detail?.vers)).color : l.action === 'bug.note' ? TINTS.info : 'var(--accent)';
</script>

{#if missing}
  <p class="empty">Ce bug n’existe pas.</p>
{:else if failed}
  <p class="error">Impossible de charger le bug.</p>
{:else if !bug}
  <p class="empty">Chargement…</p>
{:else}
  {@const s = statusOf(bug.status)}
  <div class="fiche">
    <div class="head">
      <div class="tags">
        <span class="mono num">#{bug.id}</span>
        <Pill color={s.color} label={s.label} />
        <span class="pill neutral"><Icon name="monitor" size={13} />{SYSTEMS[bug.os] ?? bug.os}</span>
        <span class="pill neutral">Hangar {bug.version}</span>
        {#if bug.discord}
          <span class="pill discord" style:--c={TINTS.discord}><Icon name="discord" size={13} />Sur Discord</span>
        {/if}
      </div>
      <h2 class="title">{bug.title}</h2>
      <p class="sub">Reçu {ago(bug.createdAt)}{bug.fixedIn ? ` · corrigé dans ${bug.fixedIn}` : ''}</p>
    </div>

    <div class="report">
      <div class="desc-col">
        <span class="lbl">Description</span>
        <p class="desc">{bug.description || 'Pas de description.'}</p>
      </div>
      <div class="shot-col">
        <span class="lbl">Capture</span>
        {#if capture}
          <a class="shot" href={capture} target="_blank" rel="noreferrer" aria-label="Ouvrir la capture">
            <img src={capture} alt={`Capture jointe au bug #${bug.id}`} />
            <span class="grow"><Icon name="external" size={13} />Agrandir</span>
          </a>
        {:else if bug.capture}
          <!-- Démo : pas de vraie image, un aperçu figuré. -->
          <div class="shot fake" role="img" aria-label="Capture jointe (non affichée en démo)">
            <span class="bar"></span>
            <span class="tile a"></span>
            <span class="tile b"></span>
            <span class="tile c"></span>
            <span class="grow"><Icon name="external" size={13} />Agrandir</span>
          </div>
        {:else}
          <div class="noshot">{bug.closedAt ? 'Capture effacée' : 'Pas de capture'}</div>
        {/if}
      </div>
    </div>

    <form class="block" onsubmit={save}>
      <h3>Suivi</h3>
      <fieldset>
        <legend class="lbl">Statut</legend>
        <div class="seg">
          {#each STATUSES as st (st.id)}
            <button type="button" class:on={status === st.id} aria-pressed={status === st.id} onclick={() => (status = st.id)}>
              <i style:background={st.color}></i>{st.label}
            </button>
          {/each}
        </div>
      </fieldset>
      <div class="pair">
        <div>
          <label class="lbl" for="fixed">Corrigé dans la version</label>
          <input
            id="fixed"
            class="field mono"
            placeholder="1.2.30"
            autocomplete="off"
            spellcheck="false"
            bind:value={fixedIn}
            disabled={status !== 'corrige'}
          />
        </div>
        <div>
          <label class="lbl" for="dup">Doublon de</label>
          <input
            id="dup"
            class="field mono"
            placeholder="#41"
            autocomplete="off"
            bind:value={duplicateOf}
            disabled={status !== 'doublon'}
          />
        </div>
      </div>
      <div>
        <label class="lbl" for="note">Note interne</label>
        <textarea
          id="note"
          class="field"
          maxlength="2000"
          placeholder="Visible seulement ici, jamais par l’utilisateur."
          bind:value={note}
        ></textarea>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button type="submit" class="primary" disabled={!changed || saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        <span class="hint">{bug.discord ? 'Le message Discord sera mis à jour.' : 'Pas de message Discord pour ce bug.'}</span>
        <span class="ok" aria-live="polite">{saved ? 'Enregistré' : ''}</span>
      </div>
    </form>

    <div class="block hist">
      <h3>Historique</h3>
      <ol>
        {#each bug.log as l (l.id)}
          <li>
            <span class="dot" style:background={dotOf(l)}></span>
            <span class="what">
              <span class="text">{actionLabel(l)}</span>
              <span class="when">{l.actor} · {ago(l.at)}</span>
            </span>
          </li>
        {/each}
        <li>
          <span class="dot" style:background="var(--accent)"></span>
          <span class="what">
            <span class="text">Signalement reçu{bug.discord ? ', message posté sur Discord' : ''}</span>
            <span class="when">{ago(bug.createdAt)}</span>
          </span>
        </li>
      </ol>
    </div>
  </div>
{/if}

<style>
  .fiche {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .head {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .num {
    color: var(--muted-2);
  }

  .neutral {
    background: rgb(var(--ink) / 0.06);
    color: var(--text-2);
  }

  .discord {
    margin-left: auto;
  }

  .title {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.3px;
  }

  .sub {
    font-size: 12.5px;
    color: var(--muted);
  }

  .report {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .desc-col,
  .shot-col {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .desc-col {
    flex: 1 1 240px;
  }

  .shot-col {
    flex: 0 1 200px;
  }

  .desc-col .lbl,
  .shot-col .lbl {
    margin: 0;
  }

  .desc {
    padding: 14px 16px;
    border-radius: 14px;
    background: rgb(var(--glass) / 0.3);
    border: 1px solid var(--border-1);
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-soft);
    white-space: pre-line;
    min-height: 96px;
  }

  .shot {
    position: relative;
    display: block;
    height: 124px;
    border-radius: 14px;
    overflow: hidden;
    background: linear-gradient(135deg, var(--cover-bg), var(--panel));
    border: 1px solid var(--border-2);
    text-decoration: none;
  }

  .shot img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .fake span:not(.grow) {
    position: absolute;
    border-radius: 6px;
    background: rgb(var(--ink) / 0.08);
  }

  .fake .bar {
    left: 12px;
    top: 12px;
    right: 40px;
    height: 10px;
    border-radius: 4px;
  }

  .fake .tile {
    top: 32px;
    width: 46px;
    height: 64px;
  }

  .fake .a {
    left: 12px;
    background: color-mix(in srgb, var(--accent) 28%, transparent) !important;
  }

  .fake .b {
    left: 66px;
  }

  .fake .c {
    left: 120px;
  }

  .grow {
    position: absolute;
    right: 8px;
    bottom: 8px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.6);
    color: white;
    font-size: 12px;
  }

  .noshot {
    height: 124px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    border: 1px dashed rgb(var(--ink) / 0.12);
    color: var(--muted-2);
    font-size: 13px;
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding-top: 20px;
    border-top: 1px solid rgb(var(--ink) / 0.06);
  }

  .pair {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }

  .pair > div {
    flex: 1 1 180px;
    min-width: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .hint {
    font-size: 12.5px;
    color: var(--muted);
  }

  .ok {
    margin-left: auto;
    font-size: 13px;
    color: var(--success-text);
  }

  .hist {
    gap: 12px;
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  li {
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
    box-shadow: 0 0 0 4px rgb(var(--ink) / 0.04);
  }

  .what {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .text {
    font-size: 13.5px;
    color: var(--text-soft);
  }

  .when {
    font-size: 12px;
    color: var(--muted);
  }
</style>
