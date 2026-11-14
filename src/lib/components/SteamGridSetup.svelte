<script lang="ts" module>
  /** Enregistre (ou retire, si vide) la clé SteamGridDB. Le backend l'essaie d'abord sur l'API. */
  export async function setSteamGridKey(k: string): Promise<string | null> {
    try {
      await api.setSteamGridKey(k);
      library.state.prefs.steamGridDb = k !== '';
      library.save();
      art.reset();
      ui.toast(k ? 'Clé SteamGridDB enregistrée, recherche des jaquettes...' : 'Clé SteamGridDB retirée');
      return null;
    } catch (e) {
      return String(e).replace(/^Error:\s*/, '');
    }
  }
</script>

<script lang="ts">
  // Guide de la clé SteamGridDB, en trois étapes : ouvrir la page API, générer la clé, la coller.
  // Utilisé par la configuration de départ et par Paramètres > Jaquettes.
  import { api } from '../api';
  import { art } from '../art.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import Icon from './Icon.svelte';

  let { id = 'sgdb-key', removable = false }: { id?: string; removable?: boolean } = $props();

  let key = $state('');
  let show = $state(false);
  let busy = $state(false);
  let error = $state('');
  /** La page API a été ouverte : l'étape 1 passe en fait. */
  let opened = $state(false);

  const saved = $derived(library.state.prefs.steamGridDb);
  const clean = $derived(key.trim());
  const looksRight = $derived(/^[a-z0-9]{32}$/i.test(clean));

  async function save(k = clean) {
    if (busy || !k) return;
    busy = true;
    error = (await setSteamGridKey(k)) ?? '';
    if (!error) key = '';
    busy = false;
  }

  async function remove() {
    if (busy) return;
    busy = true;
    error = (await setSteamGridKey('')) ?? '';
    busy = false;
  }

  function open() {
    opened = true;
    api.openLink('steamgriddb-api').catch(() => {});
  }

  // Une clé collée complète s'enregistre seule.
  function onpaste(e: ClipboardEvent) {
    const k = e.clipboardData?.getData('text').trim() ?? '';
    if (/^[a-z0-9]{32}$/i.test(k)) {
      e.preventDefault();
      key = k;
      void save(k);
    }
  }

  function submit(e: Event) {
    e.preventDefault();
    void save();
  }
</script>

{#if saved}
  <div class="done" role="status">
    <span class="ok"><Icon name="check" size={16} stroke={2.4} /></span>
    <p>
      <strong>Clé SteamGridDB enregistrée.</strong>
      Hangar y cherche les jaquettes et bannières des jeux absents de Steam.
    </p>
    {#if removable}
      <button type="button" class="btn sm" disabled={busy} onclick={remove}>Retirer</button>
    {/if}
  </div>
{:else}
  <ol class="steps">
    <li class:did={opened}>
      <span class="n" aria-hidden="true">{#if opened}<Icon name="check" size={13} stroke={2.6} />{:else}1{/if}</span>
      <div class="body">
        <strong>Ouvre la page API de SteamGridDB</strong>
        <span class="hint"
          >Elle s'ouvre dans ton navigateur. Connecte-toi avec le bouton « Login » en haut à droite, puis « Sign in
          through Steam » : ton compte Steam suffit, c'est gratuit.</span
        >
        <button type="button" class="btn sm danger go" onclick={open}
          ><Icon name="globe" size={15} />{opened ? 'Rouvrir la page' : 'Ouvrir SteamGridDB'}</button
        >
      </div>
    </li>
    <li>
      <span class="n" aria-hidden="true">2</span>
      <div class="body">
        <strong>Génère ta clé</strong>
        <span class="hint"
          >Sur la page « API » (menu Preferences), clique sur « Generate API Key ». Une suite de 32 lettres et chiffres
          apparaît : sélectionne-la en entier et copie-la (Ctrl+C).</span
        >
      </div>
    </li>
    <li>
      <span class="n" aria-hidden="true">3</span>
      <form class="body" onsubmit={submit}>
        <label for={id}><strong>Colle-la ici</strong></label>
        <span class="hint">Elle s'enregistre toute seule, dans le coffre de ton système (jamais dans un fichier).</span>
        <div class="keyrow">
          <input
            {id}
            type={show ? 'text' : 'password'}
            autocomplete="off"
            spellcheck="false"
            maxlength="128"
            placeholder="Colle ta clé ici"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            bind:value={key}
            oninput={() => (error = '')}
            {onpaste}
          />
          <button type="button" class="btn sm" onclick={() => (show = !show)}>{show ? 'Masquer' : 'Afficher'}</button>
          <button type="submit" class="btn sm" class:danger={looksRight} disabled={!clean || busy}
            >{busy ? 'Vérification...' : 'Enregistrer'}</button
          >
        </div>
        {#if error}
          <span class="err" id="{id}-err" role="alert">{error}</span>
        {:else if clean && !looksRight}
          <span class="warn">Une clé fait 32 caractères, tu en as {clean.length}. Vérifie qu'elle est complète.</span>
        {/if}
      </form>
    </li>
  </ol>
{/if}

<style>
  .steps {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    gap: 12px;
  }

  .n {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    color: var(--danger-text);
    font-size: 12.5px;
    font-weight: 700;
  }

  li.did .n {
    background: var(--success);
    color: #fff;
  }

  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 2px;
  }

  strong {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--strong);
  }

  .hint {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-3);
  }

  .go {
    align-self: flex-start;
    margin-top: 6px;
  }

  .btn.sm {
    height: 34px;
    padding: 0 14px;
    font-size: 13px;
  }

  .keyrow {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 6px;
  }

  .keyrow input {
    flex: 1 1 200px;
    min-width: 0;
    height: 34px;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--strong);
    font-family: var(--mono);
    font-size: 13px;
    outline: none;
  }

  .keyrow input:focus {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .keyrow input[aria-invalid] {
    border-color: var(--danger);
  }

  .err,
  .warn {
    font-size: 12.5px;
    line-height: 1.45;
  }

  .err {
    color: var(--danger-text);
  }

  .warn {
    color: var(--text-3);
  }

  .done {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--success) 10%, transparent);
  }

  .ok {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--success);
    color: #fff;
  }

  .done p {
    flex: 1;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-3);
  }
</style>
