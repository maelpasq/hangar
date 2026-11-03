<script lang="ts">
  // Confirmation avant d'arrêter un jeu en cours.
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';

  let { game }: { game: Game } = $props();

  const close = () => { ui.modal = null; };
</script>

<Modal title="Arrêter {library.name(game)} ?" onclose={close} width={420}>
  <p class="txt">Le jeu va être fermé. Pense à sauvegarder ta partie avant, toute progression non enregistrée sera perdue.</p>
  {#snippet footer()}
    <button class="btn autofocus" onclick={close}>Annuler</button>
    <button
      class="btn danger"
      onclick={() => {
        const id = game.id;
        close();
        runner.stop(id);
      }}>Arrêter</button
    >
  {/snippet}
</Modal>

<style>
  .txt {
    color: var(--text-3);
    line-height: 1.5;
  }
</style>
