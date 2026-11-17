<script lang="ts">
  // Recherche de comptes : pseudo, e-mail, code ami ou identifiant. Vide : les plus récents.
  import { untrack } from 'svelte';
  import BadgeIcon from '../../../src/lib/components/BadgeIcon.svelte';
  import Icon from '../../../src/lib/components/Icon.svelte';
  import { api, type UserRow } from '../api';
  import { ago, date } from '../format';
  import { href, replace } from '../router.svelte';

  let { q }: { q: string } = $props();

  // Valeur de départ seulement : ensuite, la saisie mène l'adresse.
  const initial = untrack(() => q);
  let text = $state(initial);
  let rows = $state<UserRow[] | null>(null);
  let failed = $state(false);
  let seq = 0;

  async function load(query: string) {
    const mine = ++seq;
    failed = false;
    try {
      const res = await api.users(query);
      if (mine === seq) rows = res.users;
    } catch {
      if (mine === seq) failed = true;
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      replace(href.comptes(text.trim()));
      load(text.trim());
    }, 250);
  }

  load(initial.trim());
</script>

<header>
  <h1>Comptes</h1>
</header>

<form class="search" role="search" onsubmit={(e) => e.preventDefault()}>
  <label for="q" class="sr-only">Chercher un compte</label>
  <Icon name="search" size={17} />
  <!-- svelte-ignore a11y_autofocus -->
  <input
    id="q"
    type="search"
    placeholder="Pseudo, e-mail, code ami ou identifiant"
    autocomplete="off"
    spellcheck="false"
    autofocus
    bind:value={text}
    oninput={onInput}
  />
</form>

{#if failed}
  <p class="error">Recherche impossible.</p>
{:else if !rows}
  <p class="muted">Chargement…</p>
{:else if !rows.length}
  <p class="empty">Aucun compte trouvé.</p>
{:else}
  <div class="card list">
    <table>
      <thead>
        <tr>
          <th scope="col">Pseudo</th>
          <th scope="col">E-mail</th>
          <th scope="col">Inscrit le</th>
          <th scope="col">Dernière connexion</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as u (u.id)}
          <tr>
            <td>
              <a href={href.compte(u.id)} class="name">
                {u.name}
                {#if u.certified}
                  <span class="seal" title="Compte certifié"><BadgeIcon icon="seal" size={15} /></span>
                  <span class="sr-only">(certifié)</span>
                {/if}
              </a>
            </td>
            <td class="soft">{u.email}</td>
            <td class="soft">{date(u.since)}</td>
            <td class="soft">{ago(u.lastSeen)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if rows.length >= 50}<p class="more muted">50 premiers résultats : précise la recherche.</p>{/if}
  </div>
{/if}

<style>
  header {
    margin-bottom: 18px;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 560px;
    height: 42px;
    padding: 0 14px;
    margin-bottom: 18px;
    border-radius: var(--r-btn);
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--muted);
  }

  .search:focus-within {
    border-color: var(--accent-ring);
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    outline: none;
    color: var(--text);
  }

  .list {
    padding: 6px 8px;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    padding: 10px 12px;
  }

  td {
    padding: 10px 12px;
    border-top: 1px solid var(--border-1);
    white-space: nowrap;
  }

  tbody tr:hover {
    background: var(--surface-1);
  }

  .name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--strong);
    font-weight: 550;
    text-decoration: none;
  }

  .name:hover {
    text-decoration: underline;
  }

  .seal {
    display: inline-flex;
    color: var(--accent);
  }

  .soft {
    color: var(--text-3);
  }

  .more {
    margin: 8px 12px;
    font-size: 12.5px;
  }
</style>
