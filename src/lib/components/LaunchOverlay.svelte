<script lang="ts">
  // Overlay plein écran pendant le lancement d'un jeu.
  import { art } from '../art.svelte';
  import { library } from '../stores/library.svelte';
  import { runner, type Launching } from '../stores/runner.svelte';
  import type { Game } from '../types';
  import Cover from './Cover.svelte';
  import StoreLogo from './StoreLogo.svelte';
  import { STORE_LOGOS } from '../store-logos';

  let { launching, game }: { launching: Launching; game: Game } = $props();

  const hero = $derived(art.hero(game));
  const cover = $derived(art.cover(game));
  const bg = $derived(hero || cover?.src || null);
  const name = $derived(library.name(game));
  const steps = $derived([`Ouverture de ${game.launcherName}`, 'Démarrage du jeu', 'Bon jeu !']);
  const text = $derived(
    launching.step === 0
      ? `Ouverture de ${game.launcherName}…`
      : launching.step === 1
        ? `Démarrage de ${name}…`
        : 'Bon jeu !'
  );
</script>

<div class="launch" role="dialog" aria-modal="true" aria-label="Lancement de {name}">
  {#if bg}<img class="bg" src={bg} alt="" />{/if}
  <div class="shade" aria-hidden="true"></div>
  <div class="center">
    <div class="wrap">
      <div class="glow" aria-hidden="true"></div>
      <div class="lcover cv">
        <Cover {game} fontSize={24} eager />
      </div>
    </div>
    <h2>{name}</h2>
    <div class="status" aria-live="polite">
      <svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"
        ><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.15)"></circle><path d="M21 12a9 9 0 0 0-9-9" stroke="#fff"
        ></path></svg
      >
      {#if launching.step === 0 && STORE_LOGOS[game.store]}<StoreLogo store={game.store} size={16} />{/if}
      <span>{text}</span>
    </div>
    <div class="track"><div class="prog"></div></div>
    <div class="steps">
      {#each steps as s, i (i)}
        {@const color = i < launching.step ? 'var(--success-text)' : i === launching.step ? '#ffffff' : 'var(--muted-2)'}
        <span class="step" style:color style:opacity={i <= launching.step ? 1 : 0.6}
          ><span class="d" style:background={color}></span>{#if i === 0 && STORE_LOGOS[game.store]}<StoreLogo store={game.store} size={12} />{/if}{s}</span
        >
      {/each}
    </div>
    <button class="cancel" onclick={() => runner.cancel()}>Annuler</button>
  </div>
</div>

<style>
  .launch {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--bg);
    animation: hgFade 0.4s ease both;
  }

  .bg {
    position: absolute;
    inset: -40px;
    width: calc(100% + 80px);
    height: calc(100% + 80px);
    object-fit: cover;
    filter: blur(40px) saturate(1.4) brightness(0.45);
    transform: scale(1.1);
  }

  .shade {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 45%, rgba(10, 11, 15, 0.2), rgba(10, 11, 15, 0.92) 70%);
  }

  .center {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .wrap {
    position: relative;
  }

  .glow {
    position: absolute;
    inset: -30px;
    border-radius: 40px;
    background: var(--accent);
    filter: blur(50px);
    opacity: 0.7;
    animation: hgGlow 2.2s ease-in-out infinite;
  }

  .cv {
    position: relative;
    width: 210px;
    aspect-ratio: 2 / 3;
    border-radius: 20px;
    overflow: hidden;
    box-shadow:
      0 40px 90px -20px rgba(0, 0, 0, 0.9),
      0 0 0 1px rgba(255, 255, 255, 0.15);
  }

  h2 {
    margin: 40px 0 6px;
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.6px;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-2);
    font-size: 15px;
  }

  .track {
    width: 280px;
    height: 4px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
    margin-top: 22px;
    overflow: hidden;
  }

  .prog {
    height: 100%;
    border-radius: 4px;
    background: var(--accent);
    animation: hgProg 3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  .steps {
    display: flex;
    gap: 18px;
    margin-top: 22px;
    font-size: 12.5px;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 6px;
    transition:
      opacity 0.4s,
      color 0.4s;
  }

  .d {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    transition: background 0.4s;
  }

  .cancel {
    margin-top: 30px;
    font-size: 13px;
    color: var(--text-3);
    padding: 8px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    transition: background 0.15s;
  }

  .cancel:hover {
    background: var(--surface-3);
    color: #fff;
  }

  @media (prefers-reduced-motion: reduce) {
    .glow {
      animation: none;
    }
  }
</style>
