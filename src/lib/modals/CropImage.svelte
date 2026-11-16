<script lang="ts">
  // Recadrer l'avatar ou la bannière avant l'envoi (Paramètres > Compte).
  import Modal from '../components/Modal.svelte';
  import ImageCropper from '../components/ImageCropper.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { CropShape } from '../util/avatar';

  let { file, shape, save }: { file: File; shape: CropShape; save: (bytes: Uint8Array) => Promise<boolean> } = $props();

  let cropper = $state<ImageCropper>();
  let busy = $state(false);
  const close = () => {
    if (!busy) ui.modal = null;
  };

  function unreadable() {
    ui.toast('Image illisible : choisis un PNG, un JPEG ou un WebP.', { error: true });
    ui.modal = null;
  }

  async function apply() {
    if (!cropper || busy) return;
    busy = true;
    try {
      let bytes: Uint8Array;
      try {
        bytes = await cropper.result();
      } catch {
        return unreadable();
      }
      if (await save(bytes)) ui.modal = null;
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={shape === 'avatar' ? "Recadrer l'avatar" : 'Recadrer la bannière'} width={560} onclose={close}>
  <ImageCropper bind:this={cropper} {file} {shape} onerror={unreadable} />
  {#snippet footer()}
    <span class="grow"></span>
    <button class="btn" onclick={close} disabled={busy}>Annuler</button>
    <button class="btn primary" onclick={apply}>Enregistrer</button>
  {/snippet}
</Modal>

<style>
  .grow {
    flex: 1;
  }
</style>
