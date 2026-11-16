<script lang="ts">
  // Notes de version : montrées une fois après chaque mise à jour de Hangar (et à la demande
  // depuis les Paramètres), pour que chacun sache ce qui a changé.
  import Modal from '../components/Modal.svelte';
  import SocialArt from '../components/SocialArt.svelte';
  import SocialPitch from '../components/SocialPitch.svelte';
  import { cloud } from '../stores/cloud.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import { RELEASES, boldParts, notesBetween } from '../util/release-notes';

  /** `manual` : ouverte depuis les Paramètres, pas après une mise à jour. */
  let { version, since, manual = false }: { version: string; since: string | null; manual?: boolean } = $props();

  const notes = $derived(notesBetween(RELEASES, since, version));
  const updated = $derived(!manual);
  // Grosse mise à jour : vitrine illustrée en tête (la plus récente des notes montrées qui en a une).
  const spotlight = $derived(notes.find((r) => r.spotlight)?.spotlight ?? null);
  const social = $derived(spotlight === 'social');

  function done() {
    if (!manual && library.state.lastVersion !== version) {
      library.state.lastVersion = version;
      library.save();
    }
    ui.modal = null;
  }

  function join() {
    done();
    if (cloud.status.connected) ui.friends();
    else void cloud.login();
  }
</script>

{#snippet art()}
  <SocialArt />
{/snippet}

{#snippet rich(text: string)}
  {#each boldParts(text) as p, i (i)}{#if p.bold}<strong>{p.text}</strong>{:else}{p.text}{/if}{/each}
{/snippet}

<Modal
  title={updated ? 'Hangar a été mis à jour' : 'Nouveautés de Hangar'}
  onclose={done}
  width={social ? 620 : 540}
  maxHeight={social ? 760 : 560}
  hero={social ? art : undefined}
>
  {#if social}
    <SocialPitch />
    <p class="all">Toutes les nouveautés</p>
  {/if}
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
    {#if social}
      <button class="btn" onclick={done}>{cloud.status.connected ? 'Fermer' : 'Plus tard'}</button>
      <button class="btn primary autofocus" onclick={join}>
        {cloud.status.connected ? 'Voir mes amis' : 'Créer mon compte'}
      </button>
    {:else}
      <button class="btn primary autofocus" onclick={done}>{updated ? "C'est parti" : 'Fermer'}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .all {
    margin-top: 6px;
    padding-top: 14px;
    border-top: 1px solid var(--border-2);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--muted);
  }

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
