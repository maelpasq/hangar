<script lang="ts">
  // Coque de l'app : barre latérale, barre du haut, écran courant, overlays.
  import { onMount } from 'svelte';
  import { checkGameUpdates, refreshAll, rescan } from './lib/actions';
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
  import CollectionEdit from './lib/modals/CollectionEdit.svelte';
  import BigPicture from './lib/screens/BigPicture.svelte';
  import PadSetup from './lib/modals/PadSetup.svelte';
  import { gamepad } from './lib/stores/gamepad.svelte';
  import ChangeCover from './lib/modals/ChangeCover.svelte';
  import ConfirmStop from './lib/modals/ConfirmStop.svelte';
  import ConfirmUninstall from './lib/modals/ConfirmUninstall.svelte';
  import InstallDir from './lib/modals/InstallDir.svelte';
  import InstallLink from './lib/modals/InstallLink.svelte';
  import InstallChoice from './lib/modals/InstallChoice.svelte';
  import Rename from './lib/modals/Rename.svelte';
  import BugReport from './lib/modals/BugReport.svelte';
  import CloseAsk from './lib/modals/CloseAsk.svelte';
  import CloudMerge from './lib/modals/CloudMerge.svelte';
  import ConfirmCloudDelete from './lib/modals/ConfirmCloudDelete.svelte';
  import { cloud } from './lib/stores/cloud.svelte';
  import { social } from './lib/stores/social.svelte';
  import Friends from './lib/screens/Friends.svelte';
  import Profile from './lib/screens/Profile.svelte';
  import SocialConfirm from './lib/modals/SocialConfirm.svelte';
  import SocialInvite from './lib/modals/SocialInvite.svelte';
  import ProfileGames from './lib/modals/ProfileGames.svelte';
  import SocialReport from './lib/modals/SocialReport.svelte';
  import HangarMcSoon from './lib/modals/HangarMcSoon.svelte';
  import Onboarding from './lib/modals/Onboarding.svelte';
  import StartPage from './lib/modals/StartPage.svelte';
  import WhatsNew from './lib/modals/WhatsNew.svelte';
  import { openStartPage } from './lib/start-page';
  import { RELEASES, notesBetween } from './lib/util/release-notes';
  import GamePage from './lib/screens/GamePage.svelte';
  import Home from './lib/screens/Home.svelte';
  import Library from './lib/screens/Library.svelte';
  import Settings from './lib/screens/Settings.svelte';
  import WebGames from './lib/screens/WebGames.svelte';
  import { library } from './lib/stores/library.svelte';
  import { runner } from './lib/stores/runner.svelte';
  import { ui } from './lib/stores/ui.svelte';
  import BlurImage from './lib/components/BlurImage.svelte';
  import BusyBar from './lib/components/BusyBar.svelte';
  import { watchGestures } from './lib/stores/busy.svelte';

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
    const { closeAction, globalShortcut, padButton } = library.state.prefs;
    api
      .setDesktop(closeAction, globalShortcut, padButton)
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

  /** Après une mise à jour de Hangar, montre une fois ses notes de version. À l'installation
   * (configuration pas encore faite), retient seulement la version, sans fenêtre. */
  async function whatsNew() {
    let version: string;
    try {
      version = await api.appVersion();
    } catch {
      return;
    }
    const since = library.state.lastVersion;
    if (since === version) return;
    const show = library.state.onboarded && notesBetween(RELEASES, since, version).length > 0;
    if (show && !ui.modal) ui.modal = { kind: 'whatsNew', version, since };
    // Fenêtre déjà prise (configuration, onglet de départ) : les notes attendent le prochain démarrage.
    else if (!show) {
      library.state.lastVersion = version;
      library.save();
    }
  }

  onMount(() => {
    watchGestures();
    const offs: (() => void)[] = [];
    let alive = true;
    (async () => {
      // allSettled : un écouteur qui échoue ne doit pas bloquer le chargement et le scan.
      const listeners = await Promise.allSettled([
        api.onLaunch((e) => runner.handle(e)),
        api.onLauncherPrompt((p) => runner.ask(p)),
        api.onScanPartial((g) => {
          library.mergePartial(g);
        }),
        api.onAccountsSynced(() => {
          // rescan relit aussi l'état des comptes, une fois le scan fini.
          void rescan();
        }),
        api.win.onFocusChange((f) => {
          ui.windowFocused = f;
          if (f) void runner.checkInstalls().then(checkGameUpdates);
          if (f) void runner.resumeDownloads();
        }),
        api.onTrayLaunch((id) => void runner.play(id)),
        // Bouton Xbox depuis une autre app : Hangar revient devant, en mode manette. Le
        // mode manette déjà ouvert mais sans le focus (Game Bar par-dessus) se ferme.
        api.onPadGuide((what) => {
          gamepad.ignoreStart();
          if (what === 'close') ui.closeBig(true);
          else if (!ui.modal && !runner.launching) ui.big = true;
          else void api.padBack(false);
        }),
        // Fenêtre cachée (fermeture, raccourci) : le backend a quitté le plein écran.
        api.onMainHidden(() => (ui.big = false)),
        api.onCloseAsk(() => (ui.modal = { kind: 'closeAsk' })),
        api.onWebClosed((id) => runner.webClosed(id))
      ]);
      for (const l of listeners) {
        if (l.status === 'fulfilled') offs.push(l.value);
        else console.error('listen', l.reason);
      }
      if (!alive) offs.forEach((o) => o());
      await library.load();
      if (library.loadError) ui.toast(library.loadError, { error: true });
      else {
        openStartPage();
        // Configuration de départ : à l'installation, et une fois pour qui avait déjà Hangar.
        if (!ui.modal && !library.state.onboarded) ui.modal = { kind: 'onboarding' };
        // Onglet de départ : proposé une fois à qui avait fait la configuration avant son arrivée.
        else if (!ui.modal && library.state.prefs.startPage === null) ui.modal = { kind: 'startPage' };
        // Lancé avec le système et réglé pour : la fenêtre revient devant, en mode manette.
        // Les notes de version attendent alors le prochain démarrage.
        if (!ui.modal && library.state.prefs.padAtLogin && (await api.padAtLogin().catch(() => false))) ui.big = true;
        else await whatsNew();
      }
      // Compte Hangar : synchro une fois la bibliothèque chargée.
      if (!library.loadError) offs.push(cloud.start(), social.start());
      await rescan();
      void updater.check(true);
    })();
    // Mises à jour des jeux : vérifiées toutes les 10 min, même fenêtre cachée dans la zone de notification.
    const updates = setInterval(() => void checkGameUpdates(), 10 * 60_000);
    offs.push(() => clearInterval(updates));
    // Manette : Start ou Xbox ouvre le mode manette (qui prend ensuite les commandes).
    offs.push(gamepad.start());
    offs.push(
      gamepad.listen((a) => {
        if (a === 'start' && library.state.prefs.padButton && !ui.modal && !runner.launching) ui.big = true;
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
    <!-- Fond sobre hors des pages de jeux (accueil, fiche). -->
    {#if ui.ambient && (ui.screen === 'home' || ui.screen === 'game')}
      {#key ui.ambient}
        <BlurImage src={ui.ambient} size={16} />
      {/key}
    {/if}
  </div>

  <Sidebar {rail} />

  <main>
    <TopBar bind:input={search} onrefresh={() => void refreshAll()} />
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
      {:else if ui.screen === 'friends'}
        <Friends />
      {:else if ui.screen === 'profile' && ui.profileId}
        <Profile id={ui.profileId} />
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
  {:else if ui.modal?.kind === 'installLink' && modalGame}
    <InstallLink game={modalGame} />
  {:else if ui.modal?.kind === 'installChoice' && modalGame}
    <InstallChoice game={modalGame} />
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
  {:else if ui.modal?.kind === 'mcSoon'}
    <HangarMcSoon />
  {:else if ui.modal?.kind === 'onboarding'}
    <Onboarding />
  {:else if ui.modal?.kind === 'startPage'}
    <StartPage />
  {:else if ui.modal?.kind === 'whatsNew'}
    <WhatsNew version={ui.modal.version} since={ui.modal.since} manual={ui.modal.manual === true} />
  {:else if ui.modal?.kind === 'closeAsk'}
    <CloseAsk />
  {:else if ui.modal?.kind === 'cloudMerge'}
    <CloudMerge resolve={ui.modal.resolve} />
  {:else if ui.modal?.kind === 'cloudDelete'}
    <ConfirmCloudDelete />
  {:else if ui.modal?.kind === 'socialReport'}
    <SocialReport userId={ui.modal.userId} name={ui.modal.name} messageId={ui.modal.messageId} />
  {:else if ui.modal?.kind === 'profileGames'}
    <ProfileGames />
  {:else if ui.modal?.kind === 'socialInvite'}
    <SocialInvite userId={ui.modal.userId} name={ui.modal.name} />
  {:else if ui.modal?.kind === 'socialConfirm'}
    <SocialConfirm action={ui.modal.action} userId={ui.modal.userId} name={ui.modal.name} />
  {:else if ui.modal?.kind === 'padSetup'}
    <PadSetup />
  {:else if ui.modal?.kind === 'collections' && modalGame}
    <Collections game={modalGame} />
  {:else if ui.modal?.kind === 'collectionEdit'}
    <CollectionEdit collectionId={ui.modal.collectionId} />
  {/if}

  <Toast />
  <BusyBar />
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
