<script lang="ts">
  // Coque de l'app : barre latérale, barre du haut, écran courant, overlays.
  import { onMount } from 'svelte';
  import { rescan } from './lib/actions';
  import { updater } from './lib/stores/update.svelte';
  import { api } from './lib/api';
  import { art } from './lib/art.svelte';
  import ContextMenu from './lib/components/ContextMenu.svelte';
  import LaunchOverlay from './lib/components/LaunchOverlay.svelte';
  import Sidebar from './lib/components/Sidebar.svelte';
  import Toast from './lib/components/Toast.svelte';
  import TopBar from './lib/components/TopBar.svelte';
  import AddGame from './lib/modals/AddGame.svelte';
  import Collections from './lib/modals/Collections.svelte';
  import BigPicture from './lib/screens/BigPicture.svelte';
  import { gamepad } from './lib/stores/gamepad.svelte';
  import ChangeCover from './lib/modals/ChangeCover.svelte';
  import ConfirmStop from './lib/modals/ConfirmStop.svelte';
  import Rename from './lib/modals/Rename.svelte';
  import WebGamesOffer from './lib/modals/WebGamesOffer.svelte';
  import GamePage from './lib/screens/GamePage.svelte';
  import Home from './lib/screens/Home.svelte';
  import Library from './lib/screens/Library.svelte';
  import Settings from './lib/screens/Settings.svelte';
  import WebGames from './lib/screens/WebGames.svelte';
  import { library } from './lib/stores/library.svelte';
  import { runner } from './lib/stores/runner.svelte';
  import { accounts } from './lib/stores/accounts.svelte';
  import { ui } from './lib/stores/ui.svelte';

  let search: HTMLInputElement | undefined = $state();
  let width = $state(1440);

  const rail = $derived(width < 1000);
  const game = $derived(ui.screen === 'game' ? library.get(ui.gameId) : undefined);
  const modalGame = $derived(ui.modal && 'gameId' in ui.modal ? library.get(ui.modal.gameId) : undefined);
  const launchGame = $derived(runner.launching ? library.get(runner.launching.gameId) : undefined);

  // Accent appliqué en direct.
  $effect(() => {
    document.documentElement.style.setProperty('--accent', library.state.accent);
  });

  // Thème : « system » suit l'appareil, y compris quand il change en cours de route.
  $effect(() => {
    const t = library.state.theme;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const apply = () => (document.documentElement.dataset.theme = t === 'system' ? (mq.matches ? 'light' : 'dark') : t);
    apply();
    if (t !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  });

  // Fiche d'un jeu qui a disparu (masqué, store désactivé) : retour.
  $effect(() => {
    if (ui.screen === 'game' && library.ready && !game) ui.home();
  });

  // Bureau : fermeture dans la zone de notification et raccourci global.
  $effect(() => {
    const { closeToTray, globalShortcut } = library.state.prefs;
    api
      .setDesktop(closeToTray, globalShortcut)
      .then((d) => {
        ui.desktop = d;
      })
      .catch(() => {});
  });

  // Menu de l'icône : les 5 derniers jeux lancés, avec leur jaquette, et l'apparence de l'app.
  let trayKey = '';
  $effect(() => {
    const recents = library.installed
      .filter((g) => library.totals(g.id).lastPlayed > 0)
      .sort((a, b) => library.totals(b.id).lastPlayed - library.totals(a.id).lastPlayed)
      .slice(0, 5)
      .map((g) => ({ id: g.id, name: library.name(g), cover: art.cover(g)?.src ?? null }));
    const { theme, accent } = library.state;
    const key = JSON.stringify([recents, theme, accent]);
    if (!library.ready || key === trayKey) return;
    trayKey = key;
    api.setTrayRecents(recents, theme, accent).catch(() => {});
  });

  // Pas d'ambiance propre aux écrans Bibliothèque / Paramètres : on garde la dernière.

  onMount(() => {
    const offs: (() => void)[] = [];
    let alive = true;
    (async () => {
      const [a, b, d, c, e, f, g] = await Promise.all([
        api.onLaunch((e) => runner.handle(e)),
        api.onScanPartial((g) => {
          library.mergePartial(g);
        }),
        api.onAccountsSynced(() => {
          void accounts.refresh();
          void rescan();
        }),
        api.win.onFocusChange((f) => {
          ui.windowFocused = f;
          if (f) void runner.checkInstalls();
        }),
        api.onTrayLaunch((id) => void runner.play(id)),
        // Fenêtre cachée (fermeture, raccourci) : le backend a quitté le plein écran.
        api.onMainHidden(() => (ui.big = false)),
        api.onWebClosed((id) => runner.webClosed(id))
      ]);
      offs.push(a, b, d, c, e, f, g);
      if (!alive) offs.forEach((o) => o());
      await library.load();
      // Jeux web jamais proposés (installation neuve ou mise à jour) : on demande.
      if (library.state.prefs.webGames === null && !ui.modal) ui.modal = { kind: 'webGames' };
      await rescan();
      void updater.check(true);
    })();
    // Manette : Start ouvre le mode manette (qui prend ensuite les commandes).
    offs.push(gamepad.start());
    offs.push(
      gamepad.listen((a) => {
        if (a === 'start' && !ui.modal && !runner.launching) ui.big = true;
      })
    );
    return () => {
      alive = false;
      offs.forEach((o) => o());
    };
  });

  function isTextField(el: EventTarget | null): boolean {
    return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  }

  function onkeydown(e: KeyboardEvent) {
    if (ui.modal || runner.launching || ui.big) return;
    const inField = isTextField(e.target);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      search?.focus();
      search?.select();
      return;
    }
    if (inField || ui.menu) return;
    if (e.key === '/') {
      e.preventDefault();
      search?.focus();
      return;
    }
    if (e.key === 'Escape' && ui.screen === 'game') {
      ui.back();
      return;
    }
    if (e.altKey && e.key === 'ArrowLeft' && ui.screen === 'game') {
      ui.back();
      return;
    }
    // Taper une lettre n'importe où commence une recherche.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
      search?.focus();
    }
  }
</script>

<svelte:window {onkeydown} bind:innerWidth={width} />

<div class="app">
  <div class="ambient" aria-hidden="true">
    {#if ui.ambient}
      {#key ui.ambient}
        <img src={ui.ambient} alt="" />
      {/key}
    {/if}
  </div>

  <Sidebar {rail} />

  <main>
    <TopBar bind:input={search} onrefresh={() => rescan(true)} />
    {#key ui.navKey}
      {#if ui.screen === 'home'}
        <Home />
      {:else if ui.screen === 'library'}
        <Library />
      {:else if ui.screen === 'game' && game}
        <GamePage {game} />
      {:else if ui.screen === 'web'}
        <WebGames />
      {:else if ui.screen === 'settings'}
        <Settings />
      {/if}
    {/key}
  </main>

  {#if ui.big}
    <BigPicture />
  {/if}

  {#if runner.launching && launchGame}
    <LaunchOverlay launching={runner.launching} game={launchGame} />
  {/if}

  {#if ui.menu}
    <ContextMenu gameId={ui.menu.gameId} x={ui.menu.x} y={ui.menu.y} />
  {/if}

  {#if ui.modal?.kind === 'add'}
    <AddGame />
  {:else if ui.modal?.kind === 'rename' && modalGame}
    <Rename game={modalGame} />
  {:else if ui.modal?.kind === 'cover' && modalGame}
    <ChangeCover game={modalGame} />
  {:else if ui.modal?.kind === 'stop' && modalGame}
    <ConfirmStop game={modalGame} />
  {:else if ui.modal?.kind === 'webGames'}
    <WebGamesOffer />
  {:else if ui.modal?.kind === 'collections' && modalGame}
    <Collections game={modalGame} />
  {/if}

  <Toast />
</div>

<style>
  .app {
    position: relative;
    height: 100vh;
    display: flex;
    overflow: hidden;
    background: var(--bg);
  }

  .ambient {
    position: absolute;
    inset: -20%;
    pointer-events: none;
    z-index: 0;
  }

  .ambient img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: blur(120px) saturate(1.5);
    opacity: 0.2;
    animation: ambIn 1s ease both;
  }

  @keyframes ambIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 0.2;
    }
  }

  main {
    position: relative;
    z-index: 1;
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  main :global(.page) {
    min-height: 0;
  }
</style>
