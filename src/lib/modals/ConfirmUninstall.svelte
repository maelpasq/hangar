<script lang="ts">
  // Confirmation avant de désinstaller un jeu.
  import { confirmUninstall } from '../actions';
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';

  let { game }: { game: Game } = $props();

  const close = () => { ui.modal = null; };
</script>

<Modal title="Désinstaller {library.name(game)} ?" onclose={close} width={420}>
  <p class="txt">Les fichiers du jeu seront supprimés de l'ordinateur. Tes sauvegardes dans le cloud et ton achat sont conservés.</p>
  {#snippet footer()}
    <button class="btn autofocus" onclick={close}>Annuler</button>
    <button
      class="btn danger"
      onclick={() => {
        const id = game.id;
        close();
        confirmUninstall(id);
      }}>Désinstaller</button
    >
  {/snippet}
</Modal>

<style>
  .txt {
    color: var(--text-3);
    line-height: 1.5;
  }
</style>
