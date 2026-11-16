<script lang="ts">
  // Jeux favoris du profil Hangar (5 au plus, à part des favoris de la bibliothèque) :
  // recherche et cases à cocher, comme l'ajout de jeux à une collection.
  import { onMount } from 'svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import StoreLogo from '../components/StoreLogo.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game, SocialGame } from '../types';
  import { normalize } from '../util/search';
  import { MAX_PROFILE_GAMES, portableId } from '../util/sync';

  let query = $state('');
  // Sélection locale (identifiants portables), appliquée au clic sur Enregistrer (Échap annule).
  // Un favori choisi sur un autre PC reste dans la sélection même s'il n'est pas ici.
  let picked = $state<SocialGame[]>([]);
  onMount(() => {
    picked = [...library.state.prefs.profileGames];
  });

  /** Jeux de la bibliothèque, un par identifiant portable. */
  const games = $derived.by(() => {
    const seen = new Set<string>();
    const out: { g: Game; id: string }[] = [];
    for (const g of library.visible) {
      const id = portableId(library.state, g.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ g, id });
    }
    return out.sort((a, b) => library.name(a.g).localeCompare(library.name(b.g), 'fr'));
  });
  const shown = $derived.by(() => {
    const q = normalize(query);
    return q ? games.filter((x) => normalize(library.name(x.g)).includes(q)) : games;
  });
  const full = $derived(picked.length >= MAX_PROFILE_GAMES);
  const isPicked = (id: string) => picked.some((p) => p.id === id);

  const close = () => {
    ui.modal = null;
  };

  function toggle(id: string, g: Game) {
    if (isPicked(id)) picked = picked.filter((p) => p.id !== id);
    else if (!full) picked = [...picked, { id, name: library.name(g) }];
  }

  function save(e?: SubmitEvent) {
    e?.preventDefault();
    library.state.prefs.profileGames = picked.slice(0, MAX_PROFILE_GAMES);
    library.save();
    close();
  }
</script>

<Modal title="Jeux favoris" width={520} onclose={close}>
  <form id="profile-games" class="col" onsubmit={save}>
    <p class="intro">
      Choisis jusqu'à <strong>{MAX_PROFILE_GAMES} jeux</strong> à montrer en haut de ton profil. Ils sont à part des favoris
      de ta bibliothèque.
    </p>
    <label class="search">
      <Icon name="search" size={16} stroke={1.9} />
      <span class="sr-only">Rechercher un jeu</span>
      <input
        type="search"
        bind:value={query}
        placeholder="Rechercher un jeu"
        autocomplete="off"
        onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}
      />
    </label>
  </form>

  {#if shown.length}
    <ul aria-label="Jeux">
      {#each shown as { g, id } (id)}
        {@const on = isPicked(id)}
        <li>
          <label class:off={full && !on}>
            <input type="checkbox" checked={on} disabled={full && !on} onchange={() => toggle(id, g)} />
            <span class="thumb"><Cover game={g} showName={false} fontSize={8} padding={4} /></span>
            <span class="n">{library.name(g)}</span>
            <StoreLogo store={g.store} size={14} />
          </label>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="none">{games.length ? 'Aucun jeu ne correspond à cette recherche.' : 'Aucun jeu dans ta bibliothèque.'}</p>
  {/if}

  {#snippet footer()}
    <span class="sel" class:max={full} aria-live="polite"
      >{picked.length} / {MAX_PROFILE_GAMES}{full ? ' : maximum atteint' : ''}</span
    >
    <span class="grow"></span>
    <button class="btn" type="button" onclick={close}>Annuler</button>
    <button class="btn primary" type="submit" form="profile-games">Enregistrer</button>
  {/snippet}
</Modal>

<style>
  .col {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .intro {
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--muted);
  }

  .intro strong {
    color: var(--strong);
  }

  .search {
    height: 40px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    border-radius: 11px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--muted);
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }

  .search:focus-within {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .search input {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    outline: none;
    color: var(--strong);
    font-size: 14px;
  }

  .search input::placeholder {
    color: var(--muted);
  }

  ul {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    height: min(340px, calc(100vh - 380px));
    overflow: auto;
    margin: 0 -10px;
  }

  li label {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 10px;
    border-radius: 10px;
    cursor: pointer;
  }

  li label:hover {
    background: var(--surface-2);
  }

  /* Maximum atteint : les jeux non choisis sont grisés. */
  li label.off {
    opacity: 0.45;
    cursor: default;
  }

  li label.off:hover {
    background: none;
  }

  input[type='checkbox'] {
    width: 17px;
    height: 17px;
    flex-shrink: 0;
    accent-color: var(--accent);
  }

  .thumb {
    position: relative;
    display: block;
    width: 26px;
    flex-shrink: 0;
    aspect-ratio: 2 / 3;
    border-radius: 5px;
    overflow: hidden;
    background: var(--cover-bg);
  }

  .n {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--strong);
  }

  .none {
    padding: 30px 0;
    text-align: center;
    color: var(--muted);
  }

  .sel {
    align-self: center;
    font-size: 13px;
    color: var(--muted);
  }

  .sel.max {
    color: var(--accent-text);
  }

  .grow {
    flex: 1;
  }
</style>
