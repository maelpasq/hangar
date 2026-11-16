<script lang="ts">
  // Confirmation avant de retirer un ami ou de bloquer un compte.
  import Modal from '../components/Modal.svelte';
  import { social } from '../stores/social.svelte';
  import { ui } from '../stores/ui.svelte';

  let { action, userId, name }: { action: 'remove' | 'block'; userId: string; name: string } = $props();

  let busy = $state(false);
  const close = () => (ui.modal = null);

  async function go() {
    busy = true;
    const u = { id: userId, name, relation: 'friend' };
    const ok = action === 'block' ? await social.block(u) : await social.removeFriend(u);
    busy = false;
    if (ok) close();
  }
</script>

<Modal title={action === 'block' ? `Bloquer ${name} ?` : `Retirer ${name} de tes amis ?`} onclose={close}>
  <p class="txt">
    {#if action === 'block'}
      {name} ne pourra plus te trouver, voir ton profil, t'envoyer de demande ni t'écrire. Il n'en est pas averti. Tu
      peux le débloquer depuis la page Amis.
    {:else}
      Vous ne verrez plus le statut l'un de l'autre et ne pourrez plus vous écrire. Votre conversation reste visible.
    {/if}
  </p>
  {#snippet footer()}
    <span class="grow"></span>
    <button class="btn" onclick={close}>Annuler</button>
    <button class="btn danger" disabled={busy} onclick={go}>{action === 'block' ? 'Bloquer' : 'Retirer'}</button>
  {/snippet}
</Modal>

<style>
  .txt {
    color: var(--text-3);
    line-height: 1.55;
    font-size: 14px;
  }

  .grow {
    flex: 1;
  }
</style>
