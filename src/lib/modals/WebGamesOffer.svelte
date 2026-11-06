<script lang="ts">
  // Proposition des jeux web, une fois, à qui avait Hangar avant leur arrivée (l'installation neuve passe par Onboarding).
  // Fermer sans répondre (Échap, clic à côté) reporte la question au prochain lancement.
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import { plural } from '../util/format';
  import games from '../web-games.json';

  const PREVIEW = ['openfront', 'krunker', 'slither', 'skribbl'];
  const covers = import.meta.glob<string>('../../assets/web-games/*.webp', { eager: true, import: 'default' });
  const preview = PREVIEW.map((id) => covers[`../../assets/web-games/${id}.webp`]).filter(Boolean);

  function answer(on: boolean) {
    library.state.prefs.webGames = on;
    library.save();
    ui.modal = null;
    if (on) {
      ui.webGames();
      ui.toast('Jeux web activés');
    }
  }
</script>

<Modal
  title="Les jeux web arrivent dans Hangar"
  onclose={() => (ui.modal = null)}
  width={480}
>
  <span class="new">Nouveau</span>
  <div class="strip" aria-hidden="true">
    {#each preview as src (src)}<img {src} alt="" />{/each}
  </div>
  <p class="txt">
    Un onglet avec {plural(games.length, 'jeu', 'jeux')} navigateur connus (OpenFront, Krunker, Slither.io, Skribbl...), à lancer
    sans rien installer. Chaque jeu s'ouvre dans sa propre fenêtre Hangar et garde ta connexion et ta progression.
  </p>
  <p class="hint">Tu pourras changer d'avis dans Paramètres &gt; Général.</p>
  {#snippet footer()}
    <button class="btn" onclick={() => answer(false)}>Non merci</button>
    <button class="btn primary autofocus" onclick={() => answer(true)}>Activer</button>
  {/snippet}
</Modal>

<style>
  .new {
    align-self: flex-start;
    margin-bottom: 12px;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }

  .strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }

  .strip img {
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    border-radius: 8px;
  }

  .txt {
    color: var(--text-3);
    line-height: 1.5;
  }

  .hint {
    margin-top: 10px;
    font-size: 13px;
    color: var(--muted);
  }
</style>
