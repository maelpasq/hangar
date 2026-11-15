<script lang="ts">
  // Fenêtre fermée avec le réglage « Demander » : garder Hangar en arrière-plan ou le quitter.
  // « Ne plus afficher » retient le choix (modifiable dans Paramètres > Bureau).
  import Modal from '../components/Modal.svelte';
  import { api } from '../api';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import { isMac } from '../util/platform';

  const tray = isMac ? 'la barre des menus' : 'la zone de notification';
  let remember = $state(false);

  const close = () => {
    ui.modal = null;
  };

  function choose(action: 'tray' | 'quit') {
    if (remember) {
      library.state.prefs.closeAction = action;
      library.save();
    }
    close();
    api.closeMain(action === 'quit').catch(() => {});
  }
</script>

<Modal title="Garder Hangar en arrière-plan ?" onclose={close} width={540}>
  <p class="txt">Hangar reste dans {tray} avec tes jeux récents, prêt à les relancer.</p>
  {#snippet footer()}
    <button class="btn" onclick={() => choose('quit')}>Quitter Hangar</button>
    <button class="btn primary autofocus" onclick={() => choose('tray')}>Garder en arrière-plan</button>
    <label class="remember">
      <input type="checkbox" bind:checked={remember} />
      Ne plus afficher
    </label>
  {/snippet}
</Modal>

<style>
  .txt {
    color: var(--text-3);
    line-height: 1.5;
  }

  :global(.foot) .btn {
    white-space: nowrap;
  }

  .remember {
    order: -1;
    white-space: nowrap;
    margin-right: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-2);
    font-size: 13px;
    cursor: pointer;
  }

  .remember input {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
    margin: 0;
  }
</style>
