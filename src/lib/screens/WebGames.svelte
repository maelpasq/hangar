<script lang="ts">
  // Jeux web : catalogue fixe (web-games.json), chaque jeu s'ouvre dans sa propre fenêtre Hangar.
  import { api } from '../api';
  import Chip from '../components/Chip.svelte';
  import Icon from '../components/Icon.svelte';
  import { ui } from '../stores/ui.svelte';
  import { generatedBackground } from '../util/color';
  import { plural } from '../util/format';
  import games from '../web-games.json';

  const genres = [...new Set(games.map((g) => g.genre))];
  let genre = $state<string | null>(null);
  const list = $derived(genre ? games.filter((g) => g.genre === genre) : games);

  async function play(id: string) {
    try {
      await api.openWebGame(id);
    } catch (e) {
      ui.toast(String(e), { error: true });
    }
  }
</script>

<div class="screen scroll page">
  <div class="head">
    <h1>Jeux web</h1>
    <p>{plural(games.length, 'jeu', 'jeux')} à lancer sans rien installer, dans une fenêtre Hangar</p>
  </div>

  <div class="chips" role="group" aria-label="Filtrer par genre">
    <Chip on={!genre} color="var(--strong)" count={games.length} onclick={() => (genre = null)}>Tous</Chip>
    {#each genres as g (g)}
      <Chip on={genre === g} count={games.filter((x) => x.genre === g).length} onclick={() => (genre = g)}>{g}</Chip>
    {/each}
  </div>

  <div class="grid">
    {#each list as g, i (g.id)}
      <button class="card rise" style:animation-delay="{Math.min(i, 24) * 35}ms" onclick={() => play(g.id)}>
        <span class="art" style:background={generatedBackground(g.id)}>
          <span class="name">{g.name}</span>
          <span class="play" aria-hidden="true"><Icon name="play" size={12} />Jouer</span>
        </span>
        <span class="meta">{g.genre}</span>
        <span class="desc">{g.desc}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .page {
    flex: 1;
    padding: 8px 28px 48px;
  }

  .head {
    margin-bottom: 20px;
  }

  h1 {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.9px;
  }

  .head p {
    margin-top: 6px;
    color: var(--muted);
  }

  .chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 26px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 26px 20px;
  }

  .card {
    display: flex;
    flex-direction: column;
    text-align: left;
    min-width: 0;
  }

  .art {
    position: relative;
    aspect-ratio: 16 / 10;
    display: flex;
    align-items: flex-end;
    padding: 16px;
    border-radius: var(--r-cover);
    overflow: hidden;
    color: #fff;
    box-shadow: 0 10px 30px -14px rgba(0, 0, 0, 0.9);
    transition:
      transform 0.4s var(--ease),
      box-shadow 0.4s var(--ease);
  }

  .card:hover .art,
  .card:focus-visible .art {
    transform: translateY(-6px) scale(1.025);
    box-shadow:
      0 0 0 2px var(--accent-ring),
      0 26px 50px -16px var(--accent-glow);
  }

  .card:focus-visible {
    outline: none;
  }

  .name {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.4px;
    line-height: 1.05;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
  }

  .play {
    position: absolute;
    top: 12px;
    right: 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(12px);
    font-size: 13px;
    font-weight: 600;
    opacity: 0;
    transition: opacity 0.25s;
  }

  .card:hover .play,
  .card:focus-visible .play {
    opacity: 1;
  }

  .meta {
    margin-top: 12px;
    font-size: 12px;
    color: var(--muted);
  }

  .desc {
    margin-top: 4px;
    font-size: 14px;
    color: var(--text-3);
  }
</style>
