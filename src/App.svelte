<script lang="ts">
  // Coque de l'app : barre latérale, barre du haut, écran courant, overlays.
  import { onMount } from 'svelte';
  import { checkGameUpdates, rescan } from './lib/actions';
  import { updater } from './lib/stores/update.svelte';
  import { api } from './lib/api';
  import { isLinux } from './lib/util/platform';
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
  import ConfirmUninstall from './lib/modals/ConfirmUninstall.svelte';
  import InstallDir from './lib/modals/InstallDir.svelte';
  import Rename from './lib/modals/Rename.svelte';
  import BugReport from './lib/modals/BugReport.svelte';
  import Onboarding from './lib/modals/Onboarding.svelte';
  import McVersions from './lib/modals/McVersions.svelte';
  import GamePage from './lib/screens/GamePage.svelte';
  import Home from './lib/screens/Home.svelte';
  import Library from './lib/screens/Library.svelte';
  import Settings from './lib/screens/Settings.svelte';
  import WebGames from './lib/screens/WebGames.svelte';
  import Minecraft from './lib/screens/Minecraft.svelte';
  import { library } from './lib/stores/library.svelte';
  import { runner } from './lib/stores/runner.svelte';
  import { accounts } from './lib/stores/accounts.svelte';
  import { ui } from './lib/stores/ui.svelte';
  import BlurImage from './lib/components/BlurImage.svelte';

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

  // Linux : coins arrondis (base.css), sauf fenêtre agrandie ou mode manette en plein écran.
  let maximized = $state(false);
  $effect(() => {
    if (!isLinux) return;
    const root = document.documentElement;
    root.classList.add('rounded');
    root.classList.toggle('square', maximized || ui.big);
  });
  $effect(() => {
    if (!isLinux) return;
    const sync = () => void api.win.isMaximized().then((m) => (maximized = m), () => {});
    sync();
    addEventListener('resize', sync);
    return () => removeEventListener('resize', sync);
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
          if (f) void runner.checkInstalls().then(checkGameUpdates);
          if (f) void runner.resumeDownloads();
        }),
        api.onTrayLaunch((id) => void runner.play(id)),
        // Fenêtre cachée (fermeture, raccourci) : le backend a quitté le plein écran.
        api.onMainHidden(() => (ui.big = false)),
        api.onWebClosed((id) => runner.webClosed(id))
      ]);
      offs.push(a, b, d, c, e, f, g);
      if (!alive) offs.forEach((o) => o());
      await library.load();
      // Configuration en quatre étapes : à l'installation, et une fois pour qui avait déjà Hangar.
      if (!ui.modal && !library.state.onboarded) ui.modal = { kind: 'onboarding' };
      await rescan();
      void updater.check(true);
    })();
    // Mises à jour des jeux : vérifiées toutes les 10 min, même fenêtre cachée dans la zone de notification.
    const updates = setInterval(() => void checkGameUpdates(), 10 * 60_000);
    offs.push(() => clearInterval(updates));
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
        <BlurImage src={ui.ambient} size={16} />
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
      {:else if ui.screen === 'minecraft'}
        <Minecraft />
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

  {#if ui.modal?.kind === 'mcVersions'}
    {@const m = ui.modal}
    <McVersions
      versions={m.versions}
      current={m.current}
      onpick={(v) => {
        m.onpick(v);
        ui.modal = null;
      }}
      onclose={() => (ui.modal = null)}
    />
  {:else if ui.modal?.kind === 'add'}
    <AddGame />
  {:else if ui.modal?.kind === 'rename' && modalGame}
    <Rename game={modalGame} />
  {:else if ui.modal?.kind === 'cover' && modalGame}
    <ChangeCover game={modalGame} />
  {:else if ui.modal?.kind === 'stop' && modalGame}
    <ConfirmStop game={modalGame} />
  {:else if ui.modal?.kind === 'uninstall' && modalGame}
    <ConfirmUninstall game={modalGame} />
  {:else if ui.modal?.kind === 'installDir' && modalGame}
    <InstallDir game={modalGame} targets={ui.modal.targets} />
  {:else if ui.modal?.kind === 'bug'}
    <BugReport />
  {:else if ui.modal?.kind === 'onboarding'}
    <Onboarding />
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

  .ambient :global(canvas) {
    width: 100%;
    height: 100%;
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
