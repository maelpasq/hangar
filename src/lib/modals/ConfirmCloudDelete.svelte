<script lang="ts">
  // Confirmation avant de supprimer le compte Hangar : définitif, donc une case à cocher en plus.
  import Modal from '../components/Modal.svelte';
  import { cloud } from '../stores/cloud.svelte';
  import { ui } from '../stores/ui.svelte';

  let sure = $state(false);
  let busy = $state(false);

  const close = () => {
    if (!busy) ui.modal = null;
  };

  async function remove() {
    busy = true;
    const ok = await cloud.deleteAccount();
    busy = false;
    if (ok) ui.modal = null;
  }
</script>

<Modal title="Supprimer ton compte Hangar ?" onclose={close} width={440}>
  <p class="txt">
    Le compte et tout ce qu'il garde sont effacés du serveur : favoris, collections, renommages, jaquettes, temps de jeu
    de tous tes PC, profil et avatar. Tes autres PC seront déconnectés. Ce n'est pas annulable.
  </p>
  <p class="txt">Ce PC garde ses jeux, ses réglages et son temps de jeu.</p>
  <label class="sure">
    <input type="checkbox" bind:checked={sure} disabled={busy} />
    Je comprends que mon compte sera supprimé définitivement.
  </label>
  {#snippet footer()}
    <button class="btn autofocus" disabled={busy} onclick={close}>Annuler</button>
    <button class="btn danger" disabled={!sure || busy} aria-busy={busy} onclick={remove}
      >{busy ? 'Suppression...' : 'Supprimer le compte'}</button
    >
  {/snippet}
</Modal>

<style>
  .txt {
    color: var(--text-3);
    line-height: 1.5;
    margin: 0 0 10px;
  }
  .sure {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-top: 14px;
    color: var(--text-2);
    line-height: 1.4;
    cursor: pointer;
  }
  .sure input {
    margin-top: 2px;
    accent-color: var(--accent);
  }
</style>
