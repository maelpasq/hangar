<script lang="ts">
  // Renommer un jeu (le nom d'origine reste connu : « Réinitialiser »).
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';

  let { game }: { game: Game } = $props();

  // svelte-ignore state_referenced_locally
  let value = $state(library.name(game));
  const close = () => { ui.modal = null; };

  function save(e: SubmitEvent) {
    e.preventDefault();
    library.rename(game.id, value);
    close();
  }

  function reset() {
    library.rename(game.id, '');
    close();
  }
</script>

<Modal title="Renommer" onclose={close}>
  <form id="rename-form" onsubmit={save}>
    <div class="field">
      <label for="rename-name">Nom affiché</label>
      <input id="rename-name" bind:value onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
    </div>
    {#if library.state.renames[game.id]}
      <p class="orig">Nom d'origine : {game.name}</p>
    {/if}
  </form>
  {#snippet footer()}
    <button class="btn reset" onclick={reset} disabled={!library.state.renames[game.id]}>Réinitialiser</button>
    <span class="grow"></span>
    <button class="btn" onclick={close}>Annuler</button>
    <button class="btn primary" type="submit" form="rename-form" disabled={!value.trim()}>Enregistrer</button>
  {/snippet}
</Modal>

<style>
  .orig {
    margin-top: 10px;
    font-size: 12.5px;
    color: var(--muted);
  }

  .grow {
    flex: 1;
  }
</style>
