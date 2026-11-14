<script lang="ts">
  // Notes de version : montrées une fois après chaque mise à jour de Hangar (et à la demande
  // depuis les Paramètres), pour que chacun sache ce qui a changé.
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import { RELEASES, boldParts, notesBetween } from '../util/release-notes';

  /** `manual` : ouverte depuis les Paramètres, pas après une mise à jour. */
  let { version, since, manual = false }: { version: string; since: string | null; manual?: boolean } = $props();

  const notes = $derived(notesBetween(RELEASES, since, version));
  const updated = $derived(!manual);

  function done() {
    if (!manual && library.state.lastVersion !== version) {
      library.state.lastVersion = version;
      library.save();
    }
    ui.modal = null;
  }
</script>

{#snippet rich(text: string)}
  {#each boldParts(text) as p, i (i)}{#if p.bold}<strong>{p.text}</strong>{:else}{p.text}{/if}{/each}
{/snippet}

<Modal title={updated ? 'Hangar a été mis à jour' : 'Nouveautés de Hangar'} onclose={done} width={540}>
  {#each notes as r (r.version)}
    <section class="rel" aria-label="Version {r.version}">
      <p class="ver"><span class="tag">Version {r.version}</span><span class="date">{r.date}</span></p>
      {#if r.intro}<p class="intro">{@render rich(r.intro)}</p>{/if}
      {#each r.sections as s (s.title)}
        <h3>{s.title}</h3>
        <ul>
          {#each s.items as item, i (i)}<li>{@render rich(item)}</li>{/each}
        </ul>
      {/each}
    </section>
  {/each}
  {#snippet footer()}
    <button class="btn primary autofocus" onclick={done}>{updated ? "C'est parti" : 'Fermer'}</button>
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
    gap: 10px;
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

  .date {
    font-size: 12.5px;
    color: var(--muted);
  }

  .intro {
    color: var(--text-2);
    line-height: 1.5;
  }

  h3 {
    margin-top: 4px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--muted);
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
</style>
