<script lang="ts">
  // Overlay plein écran pendant le lancement d'un jeu.
  import { art } from '../art.svelte';
  import { library } from '../stores/library.svelte';
  import { runner, type Launching } from '../stores/runner.svelte';
  import type { Game } from '../types';
  import Cover from './Cover.svelte';
  import StoreLogo from './StoreLogo.svelte';
  import { STORE_LOGOS } from '../store-logos';
  import BlurImage from './BlurImage.svelte';

  let { launching, game }: { launching: Launching; game: Game } = $props();

  const hero = $derived(art.hero(game));
  const cover = $derived(art.cover(game));
  const bg = $derived(hero || cover?.src || null);
  const name = $derived(library.name(game));
  const steps = $derived([`Ouverture de ${game.launcherName}`, 'Démarrage du jeu', 'Bon jeu !']);
  // Questions de Steam Cloud, posées ici plutôt que dans la boîte de Steam (cachée).
  const PROMPTS = {
    syncFailed: {
      title: 'Synchronisation impossible',
      text: (n: string) =>
        `Steam n'a pas pu synchroniser tes sauvegardes de ${n} avec Steam Cloud. Si tu joues maintenant, tu risques de ne pas retrouver ta progression, voire de la perdre.`,
      go: 'Jouer quand même'
    },
    pending: {
      title: 'Cloud obsolète',
      text: (n: string) =>
        `Ta dernière partie de ${n} sur un autre appareil n'est pas encore dans Steam Cloud. Tu peux jouer quand même, mais un conflit de sauvegardes apparaîtra quand elle arrivera.`,
      go: 'Jouer quand même'
    },
    conflict: {
      title: 'Conflit avec le cloud',
      text: (n: string) => `Les sauvegardes de ${n} sur ce PC et dans Steam Cloud ne sont pas les mêmes. Choisis lesquelles garder.`,
      go: 'Choisir mes sauvegardes'
    }
  };
  const prompt = $derived(launching.prompt ? PROMPTS[launching.prompt.kind] : null);
  const text = $derived(
    launching.inLauncher
      ? `Confirme ton choix dans la fenêtre de ${game.launcherName}…`
      : launching.step === 0
      ? `Ouverture de ${game.launcherName}…`
      : launching.step === 1
        ? `Démarrage de ${name}…`
        : 'Bon jeu !'
  );
</script>

<div class="launch on-dark" role="dialog" aria-modal="true" aria-label="Lancement de {name}">
  {#if bg}<BlurImage class="bg" src={bg} size={32} brightness={0.45} />{/if}
  <div class="shade" aria-hidden="true"></div>
  <div class="center">
    <div class="wrap">
      <div class="glow" aria-hidden="true"></div>
      <div class="lcover cv">
        <Cover {game} fontSize={24} eager />
      </div>
    </div>
    <h2>{name}</h2>
    {#if prompt}
      <div class="ask" role="alertdialog" aria-labelledby="ask-title" aria-describedby="ask-text">
        <h3 id="ask-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
            ><path d="M12 9v4M12 17h.01"></path><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path></svg
          >{prompt.title}</h3>
        <p id="ask-text">{prompt.text(name)}</p>
        <div class="ask-btns">
          <button class="btn" onclick={() => runner.answer(false)}>Annuler</button>
          <!-- svelte-ignore a11y_autofocus -->
          <button class="btn primary" autofocus onclick={() => runner.answer(true)}>{prompt.go}</button>
        </div>
      </div>
    {:else}
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
    {/if}
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

  .launch :global(.bg) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
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
    /* Halo en dégradé radial : même rendu qu'un flou, sans filtre recalculé à chaque image. */
    inset: -80px;
    background: radial-gradient(closest-side, var(--accent) 35%, transparent);
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
    transform-origin: left;
    animation: hgBar 3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
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

  .ask {
    max-width: 440px;
    margin-top: 6px;
    padding: 20px 22px;
    border-radius: 16px;
    background: rgba(10, 10, 14, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
    text-align: left;
    animation: hgFade 0.3s ease both;
  }

  .ask h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 700;
    color: #fff;
  }

  .ask h3 svg {
    flex: none;
    color: var(--danger-text);
  }

  .ask p {
    margin: 0;
    color: var(--text-2);
    font-size: 14px;
    line-height: 1.5;
  }

  .ask-btns {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 18px;
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
