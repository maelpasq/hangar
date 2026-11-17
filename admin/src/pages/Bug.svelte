<script lang="ts">
  // Fiche d'un bug : signalement (texte, version, système, capture) et suivi (statut, version de
  // correction, doublon, note interne), avec son historique.
  import Icon from '../../../src/lib/components/Icon.svelte';
  import { ApiError, api, type BugCard, type BugStatus } from '../api';
  import { STATUSES, SYSTEMS, statusOf } from '../bug-status';
  import { actionLabel, dateTime } from '../format';
  import { href } from '../router.svelte';

  let { id }: { id: number } = $props();

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
    duplicateOf = b.duplicateOf ? String(b.duplicateOf) : '';
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

  const changed = $derived(
    !!bug &&
      (status !== bug.status ||
        (status === 'corrige' && fixedIn.trim() !== (bug.fixedIn ?? '')) ||
        (status === 'doublon' && duplicateOf.trim().replace(/^#/, '') !== (bug.duplicateOf ? String(bug.duplicateOf) : '')) ||
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
        duplicateOf: status === 'doublon' ? duplicateOf.trim() || null : null,
        note: note.trim() || null
      });
      fill(await api.bug(bug.id));
      saved = true;
      setTimeout(() => (saved = false), 2000);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      error =
        code === 'version'
          ? 'Version invalide (par exemple 1.2.30).'
          : code === 'doublon'
            ? 'Numéro de bug introuvable (ou celui-ci).'
            : 'Le suivi n\'a pas été enregistré.';
    } finally {
      saving = false;
    }
  }

  const capture = $derived(bug?.capture ? api.captureUrl(bug.id) : null);
</script>

<a class="back" href={href.bugs()}><Icon name="back" size={16} /> Bugs</a>

{#if missing}
  <p class="empty">Ce bug n'existe pas.</p>
{:else if failed}
  <p class="error">Impossible de charger le bug.</p>
{:else if !bug}
  <p class="muted">Chargement…</p>
{:else}
  {@const s = statusOf(bug.status)}
  <header>
    <p class="num">Bug #{bug.id}</p>
    <h1>{bug.title}</h1>
    <p class="meta">
      <span class="pill" style:--c={s.color}>{s.label}</span>
      Hangar {bug.version} · {SYSTEMS[bug.os] ?? bug.os} · signalé le {dateTime(bug.createdAt)}
    </p>
  </header>

  <div class="layout">
    <div class="main">
      <section class="card">
        <h2>Description</h2>
        {#if bug.description}
          <p class="desc">{bug.description}</p>
        {:else}
          <p class="muted">Pas de description.</p>
        {/if}
      </section>

      <section class="card">
        <h2>Capture</h2>
        {#if capture}
          <a class="shot" href={capture} target="_blank" rel="noreferrer">
            <img src={capture} alt={`Capture jointe au bug #${bug.id}`} />
          </a>
        {:else if bug.capture}
          <p class="muted">Capture jointe (non affichée en démo).</p>
        {:else}
          <p class="muted">Aucune capture{bug.closedAt ? ' (effacée 90 jours après la clôture)' : ''}.</p>
        {/if}
      </section>

      <section class="card">
        <h2>Historique</h2>
        {#if bug.log.length}
          <ul class="plain">
            {#each bug.log as l (l.id)}
              <li>
                <span class="grow">{actionLabel(l)}</span>
                <span class="muted">{dateTime(l.at)}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">Pas encore suivi.</p>
        {/if}
      </section>
    </div>

    <form class="card side" onsubmit={save}>
      <h2>Suivi</h2>
      <fieldset>
        <legend class="label">Statut</legend>
        <div class="statuses">
          {#each STATUSES as st (st.id)}
            <label class="status" class:on={status === st.id} style:--c={st.color}>
              <input type="radio" name="status" value={st.id} bind:group={status} />
              <span class="dot"></span>
              {st.label}
            </label>
          {/each}
        </div>
      </fieldset>

      {#if status === 'corrige'}
        <label class="field">
          <span class="label">Corrigé dans la version</span>
          <input type="text" placeholder="1.2.30" bind:value={fixedIn} autocomplete="off" spellcheck="false" />
        </label>
      {:else if status === 'doublon'}
        <label class="field">
          <span class="label">Doublon du bug n°</span>
          <input type="text" inputmode="numeric" placeholder="12" bind:value={duplicateOf} autocomplete="off" />
        </label>
      {/if}

      <label class="field">
        <span class="label">Note interne</span>
        <textarea rows="5" maxlength="2000" placeholder="Pistes, cause, lien vers le commit…" bind:value={note}></textarea>
      </label>

      {#if error}<p class="error small" role="alert">{error}</p>{/if}

      <div class="actions">
        <button class="btn primary" type="submit" disabled={!changed || saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <span class="status-line muted" aria-live="polite">{saved ? 'Enregistré' : ''}</span>
      </div>
      <p class="hint muted">
        {bug.discord
          ? 'Le message Discord du bug suit le statut.'
          : 'Pas de message Discord pour ce bug.'}
      </p>
    </form>
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

  header {
    margin-bottom: 22px;
  }

  .num {
    margin: 0 0 4px;
    color: var(--muted);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin: 10px 0 0;
    color: var(--text-3);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border-radius: 99px;
    font-size: 12px;
    font-weight: 550;
    color: var(--text-soft);
    background: color-mix(in srgb, var(--c) 16%, transparent);
  }

  .pill::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 14px;
    align-items: start;
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  h2 {
    margin-bottom: 12px;
  }

  .desc {
    margin: 0;
    white-space: pre-wrap;
    color: var(--text-soft);
    line-height: 1.55;
    user-select: text;
  }

  .shot {
    display: block;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border-2);
  }

  .shot img {
    display: block;
    width: 100%;
    max-height: 520px;
    object-fit: contain;
    background: var(--bg-deep);
  }

  .plain {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .plain li {
    display: flex;
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
  }

  .side {
    position: sticky;
    top: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .side h2 {
    margin: 0;
  }

  fieldset {
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

  .statuses {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .status {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--border-2);
    background: var(--surface-1);
    color: var(--text-3);
    cursor: pointer;
  }

  .status input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .status:has(input:focus-visible) {
    outline: 2px solid var(--accent-ring);
    outline-offset: 2px;
  }

  .status:hover {
    background: var(--surface-3);
  }

  .status.on {
    border-color: color-mix(in srgb, var(--c) 70%, transparent);
    background: color-mix(in srgb, var(--c) 14%, transparent);
    color: var(--strong);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
  }

  .field input,
  .field textarea {
    width: 100%;
    padding: 9px 11px;
    border-radius: 10px;
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    color: var(--text);
    outline: none;
    resize: vertical;
  }

  .field input:focus,
  .field textarea:focus {
    border-color: var(--accent-ring);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .primary {
    background: var(--accent);
    border-color: transparent;
    color: #fff;
  }

  .primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 85%, #fff);
  }

  .status-line {
    font-size: 12.5px;
  }

  .hint {
    margin: 0;
    font-size: 12px;
  }

  .small {
    margin: 0;
    font-size: 12.5px;
  }

  @media (max-width: 980px) {
    .layout {
      grid-template-columns: 1fr;
    }

    .side {
      position: static;
    }
  }
</style>
