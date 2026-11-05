<script lang="ts">
  // Collections d'un jeu : cases à cocher, et création d'une nouvelle collection.
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';

  let { game }: { game: Game } = $props();

  let name = $state('');
  const close = () => {
    ui.modal = null;
  };

  function create(e: SubmitEvent) {
    e.preventDefault();
    if (library.createCollection(name, game.id)) name = '';
  }
</script>

<Modal title="Collections" onclose={close}>
  <p class="lead">Range {library.name(game)} dans tes propres listes.</p>
  {#if library.state.collections.length}
    <ul>
      {#each library.state.collections as c (c.id)}
        <li>
          <label>
            <input
              type="checkbox"
              checked={c.games.includes(game.id)}
              onchange={() => library.toggleInCollection(c.id, game.id)}
            />
            <span class="n">{c.name}</span>
            <span class="count num">{c.games.length}</span>
          </label>
        </li>
      {/each}
    </ul>
  {/if}
  <form id="coll-form" class="new" onsubmit={create}>
    <div class="field">
      <label for="coll-new">Nouvelle collection</label>
      <input id="coll-new" bind:value={name} maxlength="60" placeholder="Avec les potes, À finir..." />
    </div>
    <button class="btn" type="submit" disabled={!name.trim()}>Créer</button>
  </form>
  {#snippet footer()}
    <span class="grow"></span>
    <button class="btn primary" onclick={close}>Terminé</button>
  {/snippet}
</Modal>

<style>
  .lead {
    margin-bottom: 14px;
    color: var(--muted);
    font-size: 13.5px;
  }

  ul {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 260px;
    overflow: auto;
    margin-bottom: 16px;
  }

  li label {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 40px;
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
    accent-color: var(--accent);
  }

  .n {
    flex: 1;
    color: var(--strong);
  }

  .count {
    font-size: 12px;
    color: var(--muted-2);
  }

  .new {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }

  .new .field {
    flex: 1;
  }

  .grow {
    flex: 1;
  }
</style>
