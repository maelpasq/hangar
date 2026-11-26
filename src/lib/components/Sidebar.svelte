<script lang="ts">
  import Logo from './Logo.svelte';
  import { isMac } from '../util/platform';
  import { plural } from '../util/format';
  // Barre latérale : navigation, stores, carte « En jeu », bouton « Ajouter un jeu », Amis, compte.
  import { STORES } from '../stores-meta';
  import StoreLogo from './StoreLogo.svelte';
  import { library, presentStores } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import RunningCard from './RunningCard.svelte';
  import AccountMenu from './AccountMenu.svelte';
  import UserName from './UserName.svelte';
  import { cloud } from '../stores/cloud.svelte';
  import { presenceLabel, social } from '../stores/social.svelte';
  import { collectionItems, contextMenu, navItems, storeItems } from '../menus';
  import { runner } from '../stores/runner.svelte';

  cloud.load();

  // `auto` : fenêtre trop étroite, la barre est réduite d'office (pas de bouton pour l'agrandir).
  let { rail = false, auto = false }: { rail?: boolean; auto?: boolean } = $props();

  /** Menu du compte (profil, paramètres du compte, déconnexion). */
  let accountOpen = $state(false);
  let accountBtn = $state<HTMLButtonElement>();

  const current = $derived(
    ui.screen === 'library'
      ? ui.favOnly
        ? 'favorites'
        : ui.toInstall
          ? 'toInstall'
          : ui.updates
            ? 'updates'
          : ui.collection
            ? `c:${ui.collection}`
          : ui.store === 'all'
          ? 'library'
          : ''
      : ui.screen === 'game'
        ? ''
        : ui.screen
  );

  const nav = $derived<{ key: string; label: string; icon: IconName; count?: number; go: () => void }[]>([
    { key: 'home', label: 'Accueil', icon: 'home', go: () => ui.home() },
    { key: 'library', label: 'Bibliothèque', icon: 'grid', count: library.installed.length, go: () => ui.libraryAll() },
    { key: 'favorites', label: 'Favoris', icon: 'star', count: library.favorites.length, go: () => ui.favorites() },
    ...(library.toInstall.length
      ? [{ key: 'toInstall', label: 'À installer', icon: 'download' as const, count: library.toInstall.length, go: () => ui.toInstallList() }]
      : []),
    ...(library.updates.length
      ? [{ key: 'updates', label: 'Mises à jour', icon: 'refresh' as const, count: library.updates.length, go: () => ui.updatesList() }]
      : []),
    ...(library.state.prefs.webGames ? [{ key: 'web', label: 'Jeux web', icon: 'globe' as const, go: () => ui.webGames() }] : []),
    { key: 'settings', label: 'Paramètres', icon: 'sliders', go: () => ui.settings() }
  ]);

  /** Point rouge sur Paramètres tant que la clé SteamGridDB n'est pas ajoutée. */
  const alertOn = (key: string) => key === 'settings' && !library.state.prefs.steamGridDb;

  const collections = $derived(
    library.state.collections.map((c) => ({ ...c, count: library.inCollection(c.id).length }))
  );

  const stores = $derived(presentStores(library.counts));
</script>

<aside class:rail class:mac={isMac} aria-label="Navigation">
  {#if isMac}
    <!-- macOS : bande où se posent les boutons natifs, sert aussi à déplacer la fenêtre -->
    <div class="titlebar" data-tauri-drag-region></div>
  {/if}
  <div class="logo" class:folded={rail && !auto}>
    {#if !auto}
      <!-- Réduire / agrandir la barre latérale. Réduite, le logo devient ce bouton (icône au survol). -->
      <button
        class="fold"
        aria-label={rail ? 'Agrandir la barre latérale' : 'Réduire la barre latérale'}
        title={rail ? 'Agrandir la barre latérale' : 'Réduire la barre latérale'}
        aria-expanded={!rail}
        onclick={() => ui.toggleSidebar()}
      >
        {#if rail}<span class="flogo"><Logo size={30} /></span>{/if}
        <span class="ficon"><Icon name="sidebar" size={rail ? 19 : 18} /></span>
      </button>
    {/if}
    <Logo size={30} />
    {#if !rail}<span>Hangar</span>{/if}
  </div>

  {#if !rail}<p class="sec">Bibliothèque</p>{/if}
  <nav aria-label="Bibliothèque">
    {#each nav as n (n.key)}
      <button
        class="navb"
        class:on={current === n.key}
        {@attach contextMenu(() => {
          const items = navItems(n.key);
          return items && { label: n.label, items: () => items };
        })}
        aria-current={current === n.key ? 'page' : undefined}
        aria-label={rail || alertOn(n.key)
          ? alertOn(n.key)
            ? `${n.label}, clé SteamGridDB à ajouter`
            : n.label
          : undefined}
        title={rail ? n.label : undefined}
        onclick={n.go}
      >
        <span class="ic"><Icon name={n.icon} /></span>
        {#if !rail}
          <span>{n.label}</span>
          {#if alertOn(n.key)}<span class="alert-dot" aria-hidden="true"></span>{:else}<span class="count num">{n.count ?? ''}</span>{/if}
        {:else if alertOn(n.key)}
          <span class="alert-dot rail-dot" aria-hidden="true"></span>
        {/if}
      </button>
    {/each}
  </nav>

  <nav class="scroll list" aria-label="Collections et stores">
    <!-- Toujours présent, même sans collection : le « + » en crée une. -->
    {#if !rail}
      <div class="sech">
        <p class="sec stores">Collections</p>
        <button
          class="ibtn newc"
          aria-label="Nouvelle collection"
          title="Nouvelle collection"
          onclick={() => (ui.modal = { kind: 'collectionEdit' })}><Icon name="plus" size={14} stroke={2.2} /></button
        >
      </div>
    {:else}<div class="sep"></div>{/if}
    {#each collections as c (c.id)}
        {@const on = current === `c:${c.id}`}
        <button
          class="navb store"
          class:on
          aria-current={on ? 'page' : undefined}
          aria-label={rail ? `${c.name}, ${plural(c.count, 'jeu', 'jeux')}` : undefined}
          title={rail ? c.name : undefined}
          onclick={() => ui.collectionView(c.id)}
          {@attach contextMenu(() => ({ label: c.name, items: () => collectionItems(c.id) }))}
        >
          <span class="ic" aria-hidden="true"><Icon name="layers" size={16} /></span>
          {#if !rail}
            <span class="cname">{c.name}</span>
            <span class="count num">{c.count}</span>
          {/if}
        </button>
    {/each}
    {#if rail}
      <button
        class="navb store"
        aria-label="Nouvelle collection"
        title="Nouvelle collection"
        onclick={() => (ui.modal = { kind: 'collectionEdit' })}
      >
        <span class="ic" aria-hidden="true"><Icon name="plus" size={16} stroke={2} /></span>
      </button>
    {/if}
    {#if !rail}<p class="sec stores">Stores</p>{:else}<div class="sep"></div>{/if}
    {#each stores as s (s)}
      {@const on = ui.screen === 'library' && !ui.favOnly && !ui.toInstall && !ui.updates && !ui.collection && ui.store === s}
      <button
        class="navb store"
        class:on
        aria-current={on ? 'page' : undefined}
        aria-label={rail ? `${STORES[s].label}, ${plural(library.counts[s] ?? 0, 'jeu', 'jeux')}` : undefined}
        title={rail ? STORES[s].label : undefined}
        onclick={() => ui.storeFilter(s)}
        {@attach contextMenu(() => ({ label: STORES[s].label, items: () => storeItems(s) }))}
      >
        <span class="ic" aria-hidden="true"><StoreLogo store={s} size={17} glow /></span>
        {#if !rail}
          <span>{STORES[s].label}</span>
          <span class="count num">{library.counts[s]}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <!-- Clic droit sur la carte « En jeu » : le menu du jeu lancé. -->
  <div style:display="contents" {@attach contextMenu(() => (runner.current && library.get(runner.current) ? { gameId: runner.current } : null))}>
    <RunningCard {rail} />
  </div>
  <button
    class="navb add"
    onclick={() => { ui.modal = { kind: 'add' }; }}
    aria-label={rail ? 'Ajouter un jeu' : undefined}
    title={rail ? 'Ajouter un jeu' : undefined}
  >
    <Icon name="plus" size={16} stroke={2} />
    {#if !rail}Ajouter un jeu{/if}
  </button>
  {#if cloud.status.connected}
    <!-- Amis : seulement avec un compte (pas de bouton qui ne mène nulle part). -->
    {@const badge = social.badge}
    {@const on = ui.screen === 'friends'}
    <button
      class="navb friends"
      class:on
      aria-current={on ? 'page' : undefined}
      aria-label={rail || badge ? `Amis${badge ? `, ${badge} nouveauté${badge > 1 ? 's' : ''}` : ''}` : undefined}
      title={rail ? 'Amis' : undefined}
      onclick={() => social.openFriends()}
      {@attach contextMenu(() => ({
        label: 'Amis',
        items: () => [
          { label: 'Ouvrir les amis', icon: 'users', run: () => social.openFriends() },
          { label: 'Mon profil', icon: 'user', run: () => ui.profile(social.me) },
          { label: 'Confidentialité', icon: 'eyeOff', run: () => ui.settings('friends') }
        ]
      }))}
    >
      <span class="ic"><Icon name="users" /></span>
      {#if !rail}
        <span>Amis</span>
        {#if badge}<span class="nbadge num" aria-hidden="true">{badge}</span>{/if}
      {:else if badge}
        <span class="alert-dot rail-dot" aria-hidden="true"></span>
      {/if}
    </button>
    {@const status = social.myPresence}
    {@const label = `Compte de ${cloud.name}, ${presenceLabel(status).toLowerCase()}${cloud.syncState === 'syncing' ? ' (synchronisation)' : ''}`}
    <button
      class="navb me"
      class:open={accountOpen}
      bind:this={accountBtn}
      onclick={() => (accountOpen = !accountOpen)}
      oncontextmenu={(e) => {
        // Clic droit : le même menu du compte.
        e.preventDefault();
        e.stopPropagation();
        accountOpen = true;
      }}
      aria-haspopup="menu"
      aria-expanded={accountOpen}
      aria-controls={accountOpen ? 'account-menu' : undefined}
      aria-label={rail ? label : undefined}
      title={rail ? label : undefined}
    >
      <span class="avatar" aria-hidden="true">
        {#if cloud.avatar}<img src={cloud.avatar} alt="" />{:else}{cloud.initial}{/if}<span
          class="dot {status.state}"
          class:syncing={cloud.syncState === 'syncing'}
        ></span>
      </span>
      {#if !rail}<span class="ell"><UserName name={cloud.name} certified={social.settings?.certified} size={13} /></span>{/if}
    </button>
    {#if accountOpen && accountBtn}
      <AccountMenu
        anchor={accountBtn}
        onclose={(refocus) => {
          accountOpen = false;
          if (refocus) accountBtn?.focus();
        }}
      />
    {/if}
  {:else}
    {@const label = cloud.busy ? 'Connexion en cours' : 'Se connecter'}
    <button
      class="navb me"
      onclick={() => (cloud.busy ? ui.settings('account') : cloud.login())}
      aria-label={rail ? label : undefined}
      title={rail ? label : undefined}
    >
      <span class="ic"><Icon name="user" size={17} /></span>
      {#if !rail}{cloud.busy ? 'Connexion en cours...' : 'Se connecter'}{/if}
    </button>
  {/if}
</aside>

<style>
  aside {
    position: relative;
    z-index: 2;
    width: 248px;
    flex-shrink: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 18px 12px 16px 24px;
    border-right: 1px solid var(--border-1);
    background: var(--sidebar);
    backdrop-filter: blur(30px);
  }

  aside.rail {
    width: 76px;
    padding: 18px 12px 16px;
    align-items: stretch;
  }

  aside.mac {
    padding-top: 56px;
  }

  .titlebar {
    position: absolute;
    inset: 0 0 auto;
    height: 52px;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 2px 4px 22px;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.2px;
  }

  .rail .logo {
    justify-content: center;
    padding: 2px 0 22px;
  }

  /* Bouton pour réduire / agrandir la barre latérale, au bout de la ligne du logo
     (placé à droite par `order`, sans toucher au balisage voisin). */
  .fold {
    order: 1;
    flex: none;
    width: 30px;
    height: 30px;
    margin: 0 -2px 0 auto;
    border-radius: 9px;
    display: grid;
    place-items: center;
    color: var(--muted);
    transition:
      background 0.18s,
      color 0.18s;
  }

  .fold:hover {
    background: var(--surface-3);
    color: var(--text);
  }

  .fold > span {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    transition: opacity 0.18s;
  }

  /* Réduite : seul le bouton reste, avec le logo ; l'icône apparaît au survol. */
  .folded > :global(.logo) {
    display: none;
  }

  .folded .fold {
    width: 40px;
    height: 40px;
    margin: -5px 0;
    border-radius: 12px;
  }

  .folded .ficon {
    opacity: 0;
  }

  .folded .fold:hover .flogo,
  .folded .fold:focus-visible .flogo {
    opacity: 0;
  }

  .folded .fold:hover .ficon,
  .folded .fold:focus-visible .ficon {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .fold,
    .fold > span {
      transition: none;
    }
  }

  .sec {
    padding: 6px 12px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted);
  }

  .sec.stores {
    padding-top: 22px;
  }

  .sech {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }

  .newc {
    width: 26px;
    height: 26px;
    margin: 0 6px 4px 0;
    border-radius: 8px;
    color: var(--muted);
  }

  .newc:hover {
    color: var(--strong);
  }

  .sep {
    height: 1px;
    background: var(--border-1);
    margin: 12px 6px;
  }

  .list {
    flex: 1;
    min-height: 0;
    margin-right: -6px;
    padding-right: 6px;
    padding-bottom: 14px;
    /* Fondu en bas : une liste qui défile ne coupe pas net la dernière entrée. */
    mask-image: linear-gradient(to bottom, #000 calc(100% - 22px), transparent);
  }

  .rail .list {
    margin-right: 0;
    padding-right: 0;
    scrollbar-width: none;
  }

  .navb {
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    border-radius: 11px;
    color: var(--text-nav);
    font-size: 14px;
    text-align: left;
    transition:
      background 0.18s,
      color 0.18s;
    position: relative;
  }

  .navb.store {
    height: 36px;
  }

  .rail .navb {
    justify-content: center;
    padding: 0;
  }

  .navb:hover {
    background: var(--border-1);
    color: var(--text);
  }

  .navb.on {
    background: var(--border-2);
    color: var(--strong);
  }

  .navb.on::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 11px;
    bottom: 11px;
    width: 3px;
    border-radius: 3px;
    background: var(--accent);
  }

  .navb.store.on::before {
    top: 9px;
    bottom: 9px;
  }

  .ic {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
  }

  .cname {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    margin-left: auto;
    font-size: 12px;
    color: var(--muted-2);
  }

  .alert-dot {
    margin-left: auto;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--danger);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 25%, transparent);
  }

  .rail-dot {
    position: absolute;
    top: 8px;
    right: 10px;
  }

  @media (prefers-reduced-motion: no-preference) {
    .alert-dot {
      animation: hgAlertPulse 2s ease-in-out infinite;
    }
  }

  @keyframes hgAlertPulse {
    50% {
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--danger) 10%, transparent);
    }
  }

  .add {
    margin-top: 10px;
    height: 44px;
    border: 1px dashed var(--border-3);
    justify-content: center;
    color: var(--text-3);
  }

  /* Messages non lus et demandes d'ami (entrée Amis). */
  .nbadge {
    margin-left: auto;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: #fff;
    font-size: 11.5px;
    font-weight: 700;
  }

  /* Amis puis compte Hangar, sous « Ajouter un jeu ». */
  .friends {
    margin-top: 6px;
  }

  .me {
    margin-top: 2px;
  }

  /* Menu du compte ouvert : le bouton reste allumé. */
  .me.open {
    background: var(--border-1);
    color: var(--text);
  }

  .me .ell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .avatar {
    position: relative;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
  }

  /* Avatar du compte : rond, la pastille déborde par-dessus. */
  .avatar img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  /* Pastille de statut, mêmes couleurs que chez les amis : vert en ligne ou en jeu, gris hors ligne. */
  .dot {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--muted);
    border: 2px solid var(--bg);
  }

  .dot.online,
  .dot.playing {
    background: var(--success);
  }

  /* Synchro en cours : la pastille respire. */
  .dot.syncing {
    animation: sync-pulse 1.2s ease-in-out infinite;
  }

  @keyframes sync-pulse {
    50% {
      opacity: 0.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot.syncing {
      animation: none;
    }
  }
</style>
