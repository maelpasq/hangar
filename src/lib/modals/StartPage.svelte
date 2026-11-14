<script lang="ts">
  // Montrée une fois à qui avait déjà fait la configuration de départ avant l'arrivée de l'onglet de départ.
  // Fermer sans choisir garde l'Accueil, comme avant.
  import Modal from '../components/Modal.svelte';
  import StartPagePicker from '../components/StartPagePicker.svelte';
  import { openStartPage } from '../start-page';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';

  function done() {
    library.state.prefs.startPage ??= 'home';
    library.save();
    ui.modal = null;
    openStartPage();
  }
</script>

<Modal title="Ton onglet de départ" onclose={done} width={460}>
  <span class="new">Nouveau</span>
  <p class="txt">Hangar peut s'ouvrir directement sur l'onglet de ton choix, par exemple tes favoris.</p>
  <StartPagePicker webGames={library.state.prefs.webGames === true} />
  <p class="hint">Tu pourras le changer dans les Paramètres.</p>
  {#snippet footer()}
    <button class="btn primary autofocus" onclick={done}>Valider</button>
  {/snippet}
</Modal>

<style>
  .new {
    align-self: flex-start;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }

  .txt {
    color: var(--text-3);
    line-height: 1.5;
  }

  .hint {
    font-size: 13px;
    color: var(--muted);
  }
</style>
