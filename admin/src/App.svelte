<script lang="ts">
  // Coquille du dashboard : barre latérale, page courante, accès refusé.
  import Icon, { type IconName } from '../../src/lib/components/Icon.svelte';
  import { ApiError, api, envName, type Me } from './api';
  import { num } from './format';
  import { badgeDefs } from './badges.svelte';
  import Accueil from './pages/Accueil.svelte';
  import Badges from './pages/Badges.svelte';
  import Bugs from './pages/Bugs.svelte';
  import Comptes from './pages/Comptes.svelte';
  import Journal from './pages/Journal.svelte';
  import Signalements from './pages/Signalements.svelte';
  import { href, router } from './router.svelte';
  import { loadStats, stats } from './stats.svelte';

  let me = $state<Me | null>(null);
  let denied = $state(false);
  let failed = $state(false);

  api
    .me()
    .then((m) => {
      me = m;
      badgeDefs.list = m.badges;
      loadStats();
    })
    .catch((e) => (e instanceof ApiError && e.status === 403 ? (denied = true) : (failed = true)));

  // Thème, comme le bouton de la barre du haut de l'app : sombre, clair ou celui de l'appareil
  // (les tokens de l'app lisent `data-theme`). Le choix reste dans ce navigateur.
  type Theme = 'dark' | 'light' | 'system';
  const THEMES: Record<Theme, { label: string; icon: IconName; next: Theme }> = {
    dark: { label: 'sombre', icon: 'moon', next: 'light' },
    light: { label: 'clair', icon: 'sun', next: 'system' },
    system: { label: "celui de l'appareil", icon: 'monitor', next: 'dark' }
  };
  const readTheme = (): Theme => {
    try {
      const t = localStorage.getItem('hangar-admin-theme');
      if (t === 'dark' || t === 'light' || t === 'system') return t;
    } catch {
      // Stockage indisponible : thème de l'appareil.
    }
    return 'system';
  };
  let theme = $state<Theme>(readTheme());
  const light = matchMedia('(prefers-color-scheme: light)');
  let systemLight = $state(light.matches);
  light.addEventListener('change', () => (systemLight = light.matches));
  $effect(() => {
    document.documentElement.dataset.theme = theme === 'system' ? (systemLight ? 'light' : 'dark') : theme;
  });
  function cycleTheme() {
    theme = THEMES[theme].next;
    try {
      localStorage.setItem('hangar-admin-theme', theme);
    } catch {
      // Tant pis : le choix vaut pour cette visite.
    }
  }

  // Bascule entre les deux dashboards : chacun lit sa propre base (Test ou Prod).
  const ENVS = [
    { id: 'Test', url: 'https://hangar-admin-test.pamalstudio.fr' },
    { id: 'Prod', url: 'https://hangar-admin.pamalstudio.fr' }
  ];

  const host = envName === 'Prod' ? 'hangar-api' : envName === 'Test' ? 'hangar-api-test' : 'démo locale';

  const nav = $derived<{ id: string; label: string; icon: IconName; to: string; n?: number }[]>([
    { id: 'accueil', label: 'Accueil', icon: 'home', to: href.accueil },
    { id: 'bugs', label: 'Bugs', icon: 'bug', to: href.bugs(), n: stats.data?.bugsOpen },
    { id: 'signalements', label: 'Signalements', icon: 'flag', to: href.signalements(), n: stats.data?.reportsOpen },
    { id: 'comptes', label: 'Comptes', icon: 'users', to: href.comptes(), n: stats.data?.users },
    { id: 'badges', label: 'Badges', icon: 'shieldCheck', to: href.badges(), n: badgeDefs.list.filter((b) => b.active).length },
    { id: 'journal', label: 'Journal', icon: 'list', to: href.journal }
  ]);
  const current = $derived(
    router.route.page === 'compte' ? 'comptes' : router.route.page === 'bug' ? 'bugs' : router.route.page
  );

  $effect(() => {
    document.title = `${nav.find((n) => n.id === current)?.label ?? 'Admin'} - Hangar Admin`;
  });
</script>

{#snippet themeBtn(extra: string)}
  <button
    class="theme {extra}"
    onclick={cycleTheme}
    aria-label="Thème : {THEMES[theme].label}. Passer en {THEMES[THEMES[theme].next].label}"
    title="Thème : {THEMES[theme].label}"><Icon name={THEMES[theme].icon} size={18} /></button
  >
{/snippet}

{#if denied || failed}
  <main class="center">
    <h1>{denied ? 'Accès refusé' : 'Serveur injoignable'}</h1>
    <p class="muted">
      {denied ? 'Ce dashboard est réservé au compte administrateur de Hangar.' : 'Réessaie dans un instant.'}
    </p>
  </main>
{:else}
  <div class="shell">
    <aside>
      <div class="top">
        <a class="brand" href={href.accueil}>
          <img src="/favicon.svg" alt="" width="30" height="30" />
          <span class="name">Hangar</span>
          <span class="tag">Admin</span>
        </a>
        <!-- En étroit seulement : en large, le bouton est en bas (pas la place à côté de la marque). -->
        {@render themeBtn('narrow')}
      </div>
      <p class="over section">Administration</p>
      <nav aria-label="Sections">
        {#each nav as n (n.id)}
          <a href={n.to} class="nav" class:on={current === n.id} aria-current={current === n.id ? 'page' : undefined}>
            <Icon name={n.icon} size={18} />
            <span>{n.label}</span>
            {#if n.n}<span class="count">{num(n.n)}</span>{/if}
          </a>
        {/each}
      </nav>
      <div class="foot">
        <div class="api">
          <span class="dot" class:pulse={!!me}></span>
          <div>
            <span class="state">{me ? 'API en ligne' : 'Connexion…'}</span>
            <span class="mono host">{host}</span>
          </div>
        </div>
        <div class="envs" role="group" aria-label="Environnement">
          {#each ENVS as e (e.id)}
            <a
              href={e.url}
              class="env"
              class:prod={e.id === 'Prod'}
              class:on={envName === e.id}
              aria-current={envName === e.id ? 'page' : undefined}
            >
              {e.id}
            </a>
          {/each}
          {#if envName === 'Démo'}<span class="env on">Démo</span>{/if}
        </div>
        <div class="me">
          {#if me}<span class="email" title={me.email}>{me.email}</span>{/if}
          {@render themeBtn('')}
        </div>
      </div>
    </aside>
    {#key router.route.page === 'bug' ? 'bugs' : router.route.page === 'compte' ? 'comptes' : router.route.page}
      <main class="screen">
        {#if me}
          {#if router.route.page === 'accueil'}
            <Accueil />
          {:else if router.route.page === 'bugs' || router.route.page === 'bug'}
            <Bugs route={router.route} />
          {:else if router.route.page === 'signalements'}
            <Signalements statut={router.route.statut} />
          {:else if router.route.page === 'comptes' || router.route.page === 'compte'}
            <Comptes route={router.route} />
          {:else if router.route.page === 'badges'}
            <Badges id={router.route.id} />
          {:else}
            <Journal />
          {/if}
        {/if}
      </main>
    {/key}
  </div>
{/if}

<style>
  .shell {
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    min-height: 100vh;
  }

  aside {
    position: sticky;
    top: 0;
    height: 100vh;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px 12px 18px 26px;
    border-right: 1px solid var(--border-1);
    background: var(--sidebar);
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 22px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 2px 4px;
    text-decoration: none;
    color: var(--strong);
  }

  .theme {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border-radius: 10px;
    color: var(--muted);
    transition:
      background 0.15s,
      color 0.15s;
  }

  .theme:hover {
    background: rgb(var(--ink) / 0.06);
    color: var(--strong);
  }

  .brand:hover {
    color: var(--strong);
  }

  .name {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.2px;
  }

  .tag {
    height: 22px;
    display: inline-flex;
    align-items: center;
    padding: 0 8px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent-text);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .section {
    padding: 6px 12px 8px;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav {
    height: 40px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    border-radius: var(--r-btn);
    color: var(--text-nav);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    position: relative;
    transition:
      background 0.18s,
      color 0.18s;
  }

  .nav:hover {
    background: rgb(var(--ink) / 0.05);
    color: var(--text);
  }

  .nav.on {
    background: rgb(var(--ink) / 0.08);
    color: var(--strong);
  }

  .nav.on::before {
    content: '';
    position: absolute;
    left: -14px;
    top: 11px;
    bottom: 11px;
    width: 3px;
    border-radius: 3px;
    background: var(--accent);
  }

  .nav.on :global(svg) {
    color: var(--accent-text);
  }

  .count {
    margin-left: auto;
    font-size: 12px;
    color: var(--muted-2);
    font-variant-numeric: tabular-nums;
  }

  .foot {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 12px 0;
  }

  .api {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border-radius: 14px;
    background: var(--surface-1);
    border: 1px solid rgb(var(--ink) / 0.06);
  }

  .api > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    flex-shrink: 0;
  }

  .state {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
  }

  .host {
    font-size: 11.5px;
    color: var(--muted);
  }

  .envs {
    display: flex;
    gap: 6px;
  }

  .env {
    height: 24px;
    display: inline-flex;
    align-items: center;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--border-2);
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 600;
    text-decoration: none;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .env:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .env.on {
    border-color: transparent;
    background: color-mix(in srgb, var(--star) 16%, transparent);
    color: var(--star);
  }

  .env.prod.on {
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    color: var(--danger-text);
  }

  .me {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-right: -8px;
  }

  .theme.narrow {
    display: none;
  }

  .email {
    min-width: 0;
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  main {
    position: relative;
    z-index: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 34px 40px 48px;
  }

  .center {
    display: grid;
    place-content: center;
    gap: 8px;
    min-height: 100vh;
    text-align: center;
  }

  .center h1 {
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.6px;
    color: var(--strong);
  }

  @media (max-width: 760px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
    }

    aside {
      position: static;
      height: auto;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
      padding: 14px 16px;
      border-right: 0;
      border-bottom: 1px solid var(--border-1);
    }

    .top {
      width: 100%;
      padding-bottom: 0;
    }

    .theme.narrow {
      display: grid;
    }

    .section,
    .foot {
      display: none;
    }

    nav {
      flex-direction: row;
      flex-wrap: wrap;
    }

    .nav.on::before {
      display: none;
    }

    main {
      padding: 22px 16px 40px;
    }
  }
</style>
