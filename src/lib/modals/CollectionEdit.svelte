<script lang="ts">
  // Nouvelle collection, ou ajout de jeux à une collection : nom, recherche et cases à cocher.
  import { onMount } from 'svelte';
  import ConfirmDuplicateCollection from './ConfirmDuplicateCollection.svelte';
  import Cover from '../components/Cover.svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import StoreLogo from '../components/StoreLogo.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import { plural } from '../util/format';
  import { normalize } from '../util/search';

  let { collectionId }: { collectionId?: string } = $props();

  const coll = $derived(library.collection(collectionId));
  let name = $state('');
  let query = $state('');
  // Sélection locale, appliquée au clic sur Créer / Enregistrer (Échap annule).
  // Les jeux masqués déjà dans la collection restent dans la sélection.
  let picked = $state<string[]>([]);
  onMount(() => {
    picked = [...(coll?.games ?? [])];
  });

  const games = $derived(
    [...library.visible].sort((a, b) => library.name(a).localeCompare(library.name(b), 'fr'))
  );
  const shown = $derived.by(() => {
    const q = normalize(query);
    return q ? games.filter((g) => normalize(library.name(g)).includes(q)) : games;
  });
  const count = $derived(games.filter((g) => picked.includes(g.id)).length);
  const canSave = $derived(coll ? true : !!name.trim());

  const close = () => {
    ui.modal = null;
  };

  function toggle(id: string) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
  }

  // Nom déjà pris : demande confirmation avant de créer.
  let confirming = $state(false);

  function save(e?: SubmitEvent) {
    e?.preventDefault();
    if (!canSave) return;
    if (coll) {
      library.setCollectionGames(coll.id, picked);
      close();
      return;
    }
    if (library.hasCollectionNamed(name)) {
      confirming = true;
      return;
    }
    create();
  }

  function create() {
    confirming = false;
    const id = library.createCollection(name);
    if (!id) return;
    library.setCollectionGames(id, picked);
    close();
    ui.collectionView(id);
  }
</script>

<Modal title={coll ? `Ajouter à « ${coll.name} »` : 'Nouvelle collection'} width={520} onclose={close}>
  <form id="coll-edit" class="col" onsubmit={save}>
    {#if !coll}
      <div class="field">
        <label for="coll-edit-name">Nom</label>
        <input id="coll-edit-name" bind:value={name} maxlength="60" placeholder="Avec les potes, À finir..." />
      </div>
    {/if}
    <label class="search">
      <Icon name="search" size={16} stroke={1.9} />
      <span class="sr-only">Rechercher un jeu</span>
      <input type="search" bind:value={query} placeholder="Rechercher un jeu"
        autocomplete="off"
        onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}
      />
    </label>
  </form>

  {#if shown.length}
    <ul aria-label="Jeux">
      {#each shown as g (g.id)}
        <li>
          <label>
            <input type="checkbox" checked={picked.includes(g.id)} onchange={() => toggle(g.id)} />
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
    <span class="sel">{count ? `${plural(count, 'jeu', 'jeux')} ${count > 1 ? 'sélectionnés' : 'sélectionné'}` : ''}</span>
    <span class="grow"></span>
    <button class="btn" type="button" onclick={close}>Annuler</button>
    <button class="btn primary" type="submit" form="coll-edit" disabled={!canSave}>{coll ? 'Enregistrer' : 'Créer'}</button>
  {/snippet}
</Modal>

{#if confirming}
  <ConfirmDuplicateCollection {name} oncancel={() => (confirming = false)} onconfirm={create} />
{/if}

<style>
  .col {
    display: flex;
    flex-direction: column;
    gap: 12px;
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
    height: min(340px, calc(100vh - 360px));
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

  .grow {
    flex: 1;
  }
</style>
