<script lang="ts">
  // Coquille du dashboard : barre latérale, page courante, accès refusé.
  import Icon, { type IconName } from '../../src/lib/components/Icon.svelte';
  import { ApiError, api, envName, type Me } from './api';
  import Accueil from './pages/Accueil.svelte';
  import Comptes from './pages/Comptes.svelte';
  import Fiche from './pages/Fiche.svelte';
  import Journal from './pages/Journal.svelte';
  import { href, router } from './router.svelte';

  let me = $state<Me | null>(null);
  let denied = $state(false);
  let failed = $state(false);

  api
    .me()
    .then((m) => (me = m))
    .catch((e) => (e instanceof ApiError && e.status === 403 ? (denied = true) : (failed = true)));

  // Thème du système (les tokens de l'app lisent `data-theme`).
  const light = matchMedia('(prefers-color-scheme: light)');
  const applyTheme = () => (document.documentElement.dataset.theme = light.matches ? 'light' : 'dark');
  applyTheme();
  light.addEventListener('change', applyTheme);

  const nav: { id: string; label: string; icon: IconName; to: string }[] = [
    { id: 'accueil', label: 'Accueil', icon: 'home', to: href.accueil },
    { id: 'comptes', label: 'Comptes', icon: 'users', to: href.comptes() },
    { id: 'journal', label: 'Journal', icon: 'layers', to: href.journal }
  ];
  const current = $derived(router.route.page === 'compte' ? 'comptes' : router.route.page);

  $effect(() => {
    document.title = `${nav.find((n) => n.id === current)?.label ?? 'Admin'} - Hangar Admin`;
  });
</script>

{#if denied}
  <main class="center">
    <h1>Accès refusé</h1>
    <p class="muted">Ce dashboard est réservé au compte administrateur de Hangar.</p>
  </main>
{:else if failed}
  <main class="center">
    <h1>Serveur injoignable</h1>
    <p class="muted">Réessaie dans un instant.</p>
  </main>
{:else}
  <div class="shell">
    <aside>
      <a class="brand" href={href.accueil}>
        <img src="/favicon.svg" alt="" width="26" height="26" />
        <span>Hangar <b>Admin</b></span>
      </a>
      <nav aria-label="Sections">
        {#each nav as n (n.id)}
          <a href={n.to} class:active={current === n.id} aria-current={current === n.id ? 'page' : undefined}>
            <Icon name={n.icon} size={17} />
            {n.label}
          </a>
        {/each}
      </nav>
      <div class="foot">
        <span class="env" class:prod={envName === 'Prod'}>{envName}</span>
        {#if me}<span class="who" title={me.email}>{me.email}</span>{/if}
      </div>
    </aside>
    <main>
      {#if me}
        {#if router.route.page === 'accueil'}
          <Accueil />
        {:else if router.route.page === 'comptes'}
          <Comptes q={router.route.q} />
        {:else if router.route.page === 'compte'}
          {#key router.route.id}
            <Fiche id={router.route.id} badgeIds={me.badges} />
          {/key}
        {:else}
          <Journal />
        {/if}
      {/if}
    </main>
  </div>
{/if}

<style>
  .shell {
    display: grid;
    grid-template-columns: 228px minmax(0, 1fr);
    min-height: 100vh;
  }

  aside {
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 20px 14px;
    background: var(--sidebar);
    border-right: 1px solid var(--border-1);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
    text-decoration: none;
    color: var(--strong);
    font-size: 15px;
    font-weight: 600;
  }

  .brand b {
    color: var(--accent-text);
    font-weight: 600;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  nav a {
    display: flex;
    align-items: center;
    gap: 11px;
    height: 38px;
    padding: 0 11px;
    border-radius: var(--r-btn);
    color: var(--text-nav);
    text-decoration: none;
    font-weight: 500;
    transition: background 0.15s var(--ease), color 0.15s var(--ease);
  }

  nav a:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  nav a.active {
    background: var(--accent-soft);
    color: var(--strong);
  }

  nav a.active :global(svg) {
    color: var(--accent-text);
  }

  .foot {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 8px;
  }

  .env {
    align-self: flex-start;
    padding: 3px 9px;
    border-radius: 99px;
    font-size: 11.5px;
    font-weight: 600;
    background: color-mix(in srgb, var(--star) 18%, transparent);
    color: var(--star);
  }

  .env.prod {
    background: color-mix(in srgb, var(--danger) 18%, transparent);
    color: var(--danger-text);
  }

  .who {
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  main {
    padding: 32px 36px 48px;
    min-width: 0;
  }

  .center {
    display: grid;
    place-content: center;
    gap: 8px;
    min-height: 100vh;
    text-align: center;
  }

  @media (max-width: 760px) {
    .shell {
      grid-template-columns: 1fr;
    }

    aside {
      position: static;
      height: auto;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-right: 0;
      border-bottom: 1px solid var(--border-1);
    }

    nav {
      flex-direction: row;
    }

    .foot {
      display: none;
    }

    main {
      padding: 22px 16px 40px;
    }
  }
</style>
