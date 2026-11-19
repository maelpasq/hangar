<script lang="ts">
  // Comptes : recherche (pseudo, e-mail, code ami ou identifiant ; vide : les plus récents) et fiche
  // du compte choisi à côté (le premier de la liste tant qu'aucun n'est choisi).
  import { untrack } from 'svelte';
  import Icon from '../../../src/lib/components/Icon.svelte';
  import { api, type UserRow } from '../api';
  import Avatar from '../components/Avatar.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import Pill from '../components/Pill.svelte';
  import { ago, num } from '../format';
  import { href, replace, type Route } from '../router.svelte';
  import { stats } from '../stats.svelte';
  import Fiche from './Fiche.svelte';

  let { route }: { route: Extract<Route, { page: 'comptes' | 'compte' }> } = $props();

  // Valeur de départ seulement : ensuite, la saisie mène l'adresse.
  const initial = untrack(() => route.q);
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

  const selected = $derived(route.page === 'compte' ? route.id : (rows?.[0]?.id ?? null));
  const ONLINE = 10 * 60_000;
  const sub = $derived(
    `${stats.data ? `${num(stats.data.users)} comptes. ` : ''}Recherche par pseudo, e-mail, code ami ou identifiant.`
  );
</script>

<PageHeader title="Comptes" {sub} />

<div class="split">
  <section class="card list scroll" aria-label="Résultats">
    <form class="search" role="search" onsubmit={(e) => e.preventDefault()}>
      <Icon name="search" size={17} />
      <label for="q" class="sr-only">Rechercher un compte</label>
      <input
        id="q"
        type="search"
        placeholder="Pseudo, e-mail, code ami…"
        autocomplete="off"
        spellcheck="false"
        bind:value={text}
        oninput={onInput}
      />
    </form>
    <p class="over">{route.q ? 'Résultats' : 'Récents d’abord'}</p>
    {#if failed}
      <p class="error">Recherche impossible.</p>
    {:else if !rows}
      <p class="empty">Chargement…</p>
    {:else}
      {#each rows as u (u.id)}
        <a
          class="row"
          class:on={u.id === selected}
          href={href.compte(u.id, route.q)}
          aria-current={u.id === selected ? 'true' : undefined}
        >
          <Avatar name={u.name} seed={u.id} size={38} online={u.lastSeen !== null && Date.now() - u.lastSeen < ONLINE} />
          <span class="row-body">
            <span class="name">
              {u.name}
              {#if u.certified}
                <span class="seal" title="Certifié"><Icon name="shieldCheck" size={14} stroke={2} /></span>
                <span class="sr-only">(certifié)</span>
              {/if}
              {#if u.sanction}
                <Pill color="var(--danger)" label={u.sanction === 'total' ? 'Suspendu' : 'Amis coupés'} dot={false} />
              {/if}
            </span>
            <span class="email">{u.email}</span>
          </span>
          <span class="seen">{ago(u.lastSeen)}</span>
        </a>
      {:else}
        <p class="empty">Aucun compte trouvé.</p>
      {/each}
      {#if rows.length >= 50}<p class="empty">50 premiers résultats : précise la recherche.</p>{/if}
    {/if}
  </section>

  <section class="fiche" aria-label="Fiche du compte">
    {#if selected}
      {#key selected}
        <Fiche id={selected} q={route.q} />
      {/key}
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

  .list {
    flex: 1 1 340px;
    max-width: 440px;
    padding: 14px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .search {
    margin: 0 4px 6px;
  }

  .over {
    padding: 0 10px 4px;
  }

  .list .row {
    padding: 10px 12px;
  }

  .name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }

  .seal {
    display: inline-flex;
    color: var(--accent-text);
  }

  .email {
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seen {
    font-size: 12px;
    color: var(--muted-2);
    white-space: nowrap;
  }

  .fiche {
    flex: 1.6 1 520px;
    min-width: 0;
  }

  @media (max-width: 760px) {
    .list {
      max-width: none;
    }
  }
</style>
