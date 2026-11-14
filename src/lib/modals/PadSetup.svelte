<script lang="ts">
  // Mode manette activé : ce qu'il faut désactiver pour que le bouton central de la manette
  // n'ouvre que Hangar (Game Bar, Steam, Launchpad...), selon le système.
  import Modal from '../components/Modal.svelte';
  import PadTips from '../components/PadTips.svelte';
  import { padFromAnywhere } from '../pad-tips';
  import { ui } from '../stores/ui.svelte';

  const close = () => (ui.modal = null);
</script>

<Modal title="Mode manette activé" onclose={close} width={520}>
  <p class="txt">
    {padFromAnywhere
      ? 'Start et le bouton central de ta manette ouvrent maintenant Hangar en plein écran, même depuis un jeu. Rappuie pour revenir où tu étais.'
      : 'Start et le bouton central de ta manette ouvrent maintenant Hangar en plein écran.'}
  </p>
  <p class="txt strong">Pour qu'il n'ouvre que Hangar, désactive ce qui utilise déjà ce bouton :</p>
  <PadTips compact />
  {#snippet footer()}
    <button class="btn primary autofocus" onclick={close}>J'ai compris</button>
  {/snippet}
</Modal>

<style>
  .txt {
    color: var(--text-3);
    line-height: 1.5;
  }

  .strong {
    font-weight: 600;
    color: var(--text);
  }
</style>
