<script lang="ts">
  // Première synchro d'un poste dont la bibliothèque et le compte ont tous deux des données :
  // fusionner (par défaut, rien n'est perdu) ou prendre celles du compte.
  import { onDestroy } from 'svelte';
  import Modal from '../components/Modal.svelte';
  import type { FirstChoice } from '../stores/cloud.svelte';
  import { ui } from '../stores/ui.svelte';

  let { resolve }: { resolve: (choice: FirstChoice) => void } = $props();

  let done = false;
  function choose(choice: FirstChoice) {
    if (done) return;
    done = true;
    resolve(choice);
    if (ui.modal?.kind === 'cloudMerge') ui.modal = null;
  }
  // Fermée autrement (Échap, autre fenêtre) : fusion, le choix qui ne perd rien.
  onDestroy(() => choose('merge'));
</script>

<Modal title="Synchroniser ce PC avec ton compte" onclose={() => choose('merge')} width={560}>
  <p class="txt">
    Ce PC et ton compte Hangar ont chacun leurs favoris, collections ou renommages. Tu peux les réunir, ou
    remplacer ceux de ce PC par ceux du compte.
  </p>
  <p class="txt small">Tes jeux installés, leurs fichiers et ton temps de jeu ne sont jamais touchés.</p>
  {#snippet footer()}
    <button class="btn" onclick={() => choose('account')}>Utiliser le compte</button>
    <button class="btn primary autofocus" onclick={() => choose('merge')}>Fusionner</button>
  {/snippet}
</Modal>

<style>
  .txt {
    color: var(--text-3);
    line-height: 1.5;
  }

  .txt.small {
    margin-top: 10px;
    font-size: 13px;
  }

  :global(.foot) .btn {
    white-space: nowrap;
  }
</style>
