<script lang="ts">
  // Avertit qu'une collection porte déjà ce nom avant d'en créer une autre.
  // Affichée par-dessus la fenêtre de création (qui reste ouverte derrière).
  import Modal from '../components/Modal.svelte';

  let { name, oncancel, onconfirm }: { name: string; oncancel: () => void; onconfirm: () => void } = $props();
</script>

<Modal title="Collection déjà existante" onclose={oncancel} width={420}>
  <p class="txt">
    Tu as déjà une collection nommée « {name.trim()} ». Veux-tu vraiment en créer une autre avec le même nom ?
  </p>
  {#snippet footer()}
    <button class="btn autofocus" onclick={oncancel}>Annuler</button>
    <button class="btn primary" onclick={onconfirm}>Créer quand même</button>
  {/snippet}
</Modal>

<style>
  .txt {
    color: var(--text-3);
    line-height: 1.5;
  }
</style>
