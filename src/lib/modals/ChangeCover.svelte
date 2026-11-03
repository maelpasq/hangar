<script lang="ts">
  // Changer la jaquette : recherche Steam (nom ou ID), image locale, ou jaquette générée.
  import { api } from '../api';
  import { steamCover, type CoverResult } from '../art.svelte';
  import GeneratedCover from '../components/GeneratedCover.svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game, SteamHit } from '../types';

  let { game }: { game: Game } = $props();
  // L'identifiant reste valable même après la fermeture de la modale.
  // svelte-ignore state_referenced_locally
  const gameId = game.id;

  // svelte-ignore state_referenced_locally
  let query = $state(library.name(game));
  let hits = $state<SteamHit[]>([]);
  let previews = $state<Record<number, CoverResult | null>>({});
  let loading = $state(false);
  let seq = 0;

  const close = () => { ui.modal = null; };
  const custom = $derived(library.state.customCovers[gameId]);

  $effect(() => {
    const q = query.trim();
    const my = ++seq;
    if (!q) {
      hits = [];
      return;
    }
    loading = true;
    const t = setTimeout(async () => {
      try {
        const r = await api.searchSteam(q);
        if (my !== seq) return;
        hits = r.slice(0, 5);
        for (const h of hits) {
          if (h.id in previews) continue;
          steamCover(h.id).then((c) => { previews[h.id] = c; });
        }
      } catch {
        if (my === seq) hits = [];
      } finally {
        if (my === seq) loading = false;
      }
    }, 350);
    return () => clearTimeout(t);
  });

  function choose(id: number) {
    library.setCustomCover(gameId, `steam:${id}`);
    close();
    ui.toast('Jaquette mise à jour', { gameId: gameId });
  }

  async function fromFile() {
    const p = await api.pickImage();
    if (!p) return;
    try {
      const saved = await api.importCover(gameId, p);
      library.setCustomCover(gameId, saved);
      close();
      ui.toast('Jaquette mise à jour', { gameId: gameId });
    } catch (e) {
      ui.toast(`Impossible d'utiliser cette image : ${String(e)}`, { error: true });
    }
  }

  function none() {
    library.setCustomCover(gameId, 'none');
    close();
  }

  function auto() {
    library.setCustomCover(gameId, null);
    close();
  }
</script>

<Modal title="Changer la jaquette" onclose={close} width={640}>
  <div class="field">
    <label for="cover-q">Rechercher sur Steam (nom ou ID)</label>
    <div class="search">
      <input id="cover-q" bind:value={query} placeholder="Nom du jeu ou ID Steam" />
      {#if loading}<span class="spin-wrap"><Icon name="refresh" size={16} class="spin" /></span>{/if}
    </div>
  </div>

  <div class="results" aria-live="polite">
    {#each hits as h (h.id)}
      {@const p = previews[h.id]}
      <button class="pick" onclick={() => choose(h.id)} disabled={p === null} title={h.name}>
        <span class="cv">
          {#if p}
            {#if p.landscape}
              <img class="blur" src={p.src} alt="" /><img class="land" src={p.src} alt="" />
            {:else}
              <img class="full" src={p.src} alt="" />
            {/if}
          {:else if p === null}
            <span class="miss">Pas d'image</span>
          {:else}
            <span class="shim"></span>
          {/if}
        </span>
        <span class="nm">{h.name}</span>
      </button>
    {:else}
      {#if !loading && query.trim()}
        <p class="none">Aucun résultat sur Steam.</p>
      {/if}
    {/each}
  </div>

  <div class="others">
    <button class="opt" onclick={fromFile}><Icon name="upload" size={17} />Choisir une image sur le PC</button>
    <button class="opt" onclick={none}>
      <span class="mini"><GeneratedCover {game} showName={false} /></span>Pas de jaquette
    </button>
    {#if custom}
      <button class="opt" onclick={auto}><Icon name="refresh" size={17} />Revenir à la jaquette automatique</button>
    {/if}
  </div>
</Modal>

<style>
  .search {
    position: relative;
    display: flex;
  }

  .search input {
    flex: 1;
  }

  .spin-wrap {
    position: absolute;
    right: 12px;
    top: 12px;
    color: var(--muted);
  }

  .results {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    min-height: 40px;
  }

  .pick {
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
    min-width: 0;
  }

  .cv {
    position: relative;
    display: block;
    aspect-ratio: 2 / 3;
    border-radius: 12px;
    overflow: hidden;
    background: var(--cover-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.09);
    transition:
      transform 0.25s var(--ease),
      box-shadow 0.25s;
  }

  .pick:hover:not(:disabled) .cv,
  .pick:focus-visible .cv {
    transform: translateY(-4px);
    box-shadow:
      0 0 0 2px var(--accent-ring),
      0 18px 40px -14px var(--accent-glow);
  }

  .pick:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .full,
  .blur {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .blur {
    filter: blur(14px) brightness(0.7);
    transform: scale(1.2);
  }

  .land {
    position: absolute;
    top: 50%;
    width: 100%;
    transform: translateY(-50%);
  }

  .miss {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 12px;
    color: var(--muted);
  }

  .shim {
    position: absolute;
    inset: 0;
    background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.05) 50%, transparent 70%);
    background-size: 200% 100%;
    animation: hgShimmer 1.4s linear infinite;
  }

  .nm {
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .none {
    grid-column: 1 / -1;
    color: var(--muted);
    font-size: 13px;
  }

  .others {
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-top: 1px solid var(--border-1);
    padding-top: 8px;
    margin-bottom: 14px;
  }

  .opt {
    height: 42px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    border-radius: 11px;
    color: #d7dae4;
    text-align: left;
    transition: background 0.15s;
  }

  .opt:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .mini {
    position: relative;
    width: 17px;
    height: 24px;
    border-radius: 4px;
    overflow: hidden;
  }
</style>
