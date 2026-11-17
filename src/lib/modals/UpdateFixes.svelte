<script lang="ts">
  // Avant d'installer un correctif (4e chiffre, sans patch note) : la liste de ses corrections,
  // lue dans le texte de sa release, puis « Mettre à jour » ou « Annuler ».
  import Modal from '../components/Modal.svelte';
  import { ui } from '../stores/ui.svelte';
  import { updater } from '../stores/update.svelte';
  import { boldParts } from '../util/release-notes';

  const fixes = $derived(updater.fixes);
  const close = () => { ui.modal = null; };
</script>

{#snippet rich(text: string)}
  {#each boldParts(text) as p, i (i)}{#if p.bold}<strong>{p.text}</strong>{:else}{p.text}{/if}{/each}
{/snippet}

<Modal title="Correctif {updater.version} disponible" onclose={close} width={480} maxHeight={520}>
  {#if fixes.length}
    {#each fixes as f (f.version)}
      <section class="rel" aria-label="Version {f.version}">
        {#if fixes.length > 1}<p class="ver"><span class="tag">Version {f.version}</span></p>{/if}
        <ul>
          {#each f.items as item, i (i)}<li>{@render rich(item)}</li>{/each}
        </ul>
      </section>
    {/each}
  {:else}
    <p class="txt">Corrections de bugs, sans nouveauté.</p>
  {/if}
  <p class="txt">Hangar va redémarrer pour installer le correctif.</p>
  {#snippet footer()}
    <button class="btn" onclick={close}>Annuler</button>
    <button
      class="btn primary autofocus"
      onclick={() => {
        close();
        void updater.install();
      }}>Mettre à jour</button
    >
  {/snippet}
</Modal>

<style>
  .rel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rel + .rel {
    padding-top: 14px;
    border-top: 1px solid var(--border-2);
  }

  .ver {
    display: flex;
    align-items: center;
  }

  .tag {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 18px;
    list-style: disc;
    color: var(--text-3);
    line-height: 1.5;
    font-size: 13.5px;
  }

  strong {
    color: var(--text);
    font-weight: 600;
  }

  .txt {
    color: var(--text-3);
    line-height: 1.5;
  }
</style>
