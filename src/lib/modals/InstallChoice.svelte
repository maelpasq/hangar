<script lang="ts">
  // Jeu du compte Hangar absent de ce PC : la personne choisit d'où l'installer. Les sites
  // officiels trouvés automatiquement d'abord (là où se télécharge l'exe officiel), la page
  // Steam à part, son exécutable s'il est déjà là, ou un autre lien saisi à la main.
  // Jeu vu chez un ami et absent d'ici (`social`) : mêmes choix, plus sa page dans son launcher ;
  // l'exécutable choisi l'ajoute à la bibliothèque.
  import { untrack } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { attachElsewhere } from '../ghosts';
  import { api } from '../api';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import { STORES } from '../stores-meta';
  import type { Game, SocialGame } from '../types';
  import { manualGameFrom } from '../util/games';
  import { isLinux, isMac } from '../util/platform';
  import { linkDomain, storePageOf } from '../util/sync';

  let { game, social }: { game?: Game; social?: SocialGame } = $props();

  const name = $derived(game ? library.name(game) : (social?.name ?? ''));
  // Recalculé quand les recherches remplissent le cache (état réactif de la bibliothèque).
  const choices = $derived(
    game ? library.installChoices(game) : social ? library.socialInstallChoices(social) : { sites: [], steam: null }
  );
  const store = $derived(social ? storePageOf(social.id, !isMac && !isLinux) : null);
  const storeLabel = $derived(store === 'xbox' ? 'Microsoft Store' : store ? STORES[store].launcher : '');
  const webSearch = $derived(`https://duckduckgo.com/?q=${encodeURIComponent(`${name} site officiel`)}`);
  let searching = $state(true);
  let failed = $state(false);
  $effect(() => {
    const [g, s] = untrack(() => [game, social] as const);
    (g ? library.findInstallChoices(g) : s ? library.findSocialInstallChoices(s) : Promise.resolve())
      .catch(() => (failed = true))
      .finally(() => (searching = false));
  });

  const close = () => {
    ui.modal = null;
  };

  const fail = (e: unknown) => ui.toast(String(e).replace(/^Error:\s*/, ''), { error: true });

  function open(url: string) {
    close();
    api.openGameLink(url).catch(fail);
  }

  // Les props (`game`, `social`) se lisent AVANT `close()` : une fois la popup fermée, `social`
  // relit `ui.modal.game` sur une popup nulle et l'appel s'arrête sur une erreur muette.
  function openStore() {
    const s = social;
    if (!s) return;
    close();
    api.openStorePage(s.id, s.name).catch(fail);
  }

  // Page Steam du jeu : dans le client Steam (démarré au besoin), le navigateur en secours.
  function openSteam() {
    const url = choices.steam;
    if (!url) return;
    const appid = /\/app\/(\d+)/.exec(url)?.[1];
    if (!appid) return open(url);
    const n = name;
    close();
    api.openStorePage(`steam:${appid}`, n).catch(() => api.openGameLink(url).catch(fail));
  }

  async function chooseExe() {
    const [g0, s] = [game, social];
    close();
    if (g0) return attachElsewhere(g0.id);
    if (!s) return;
    const path = await api.pickExe().catch(() => null);
    if (!path) return;
    const g = manualGameFrom(path, s.name);
    library.addManual(g);
    ui.toast(`${g.name} ajouté à ta bibliothèque`, { gameId: g.id });
  }

  function otherLink() {
    if (game) ui.modal = { kind: 'installLink', gameId: game.id };
  }
</script>

<Modal title="Installer {name}" onclose={close} width={480}>
  <p class="intro">
    {game ? "Ce jeu est sur un autre de tes PC. Choisis d'où l'installer ici." : "Ce jeu n'est pas dans ta bibliothèque. Choisis d'où l'installer."}
  </p>
  <div class="choices">
    {#each choices.sites as url (url)}
      <button class="opt" onclick={() => open(url)}>
        <span class="ico"><Icon name="globe" size={18} /></span>
        <span class="txt"><strong>Site officiel</strong><span class="sub">{linkDomain(url)}</span></span>
      </button>
    {:else}
      {#if searching}
        <div class="opt empty" role="status">
          <span class="ico"><Icon name="globe" size={18} /></span>
          <span class="txt"><strong>Site officiel</strong><span class="sub">Recherche du site officiel…</span></span>
        </div>
      {:else}
        <!-- Rien trouvé automatiquement : recherche web dans le navigateur de la personne. -->
        <button class="opt" onclick={() => open(webSearch)}>
          <span class="ico"><Icon name="search" size={18} /></span>
          <span class="txt">
            <strong>Chercher le site officiel</strong>
            <span class="sub">
              {failed ? 'Recherche automatique impossible (connexion)' : 'Pas trouvé automatiquement'} : recherche web dans ton navigateur
            </span>
          </span>
        </button>
      {/if}
    {/each}
    {#if store}
      <button class="opt" onclick={openStore}>
        <span class="ico"><Icon name="download" size={18} /></span>
        <span class="txt"><strong>{storeLabel}</strong><span class="sub">Ouvrir sa page dans le launcher</span></span>
      </button>
    {/if}
    {#if choices.steam && store !== 'steam'}
      <button class="opt" onclick={openSteam}>
        <span class="ico"><Icon name="download" size={18} /></span>
        <span class="txt"><strong>Steam</strong><span class="sub">Ouvrir sa page dans Steam</span></span>
      </button>
    {/if}
    <button class="opt" onclick={chooseExe}>
      <span class="ico"><Icon name="folder" size={18} /></span>
      <span class="txt">
        <strong>Exécutable local</strong>
        <span class="sub">Le jeu est déjà sur ce PC : choisir son exécutable</span>
      </span>
    </button>
  </div>
  {#snippet footer()}
    {#if game}<button class="btn" onclick={otherLink}>Autre lien…</button>{/if}
    <span class="grow"></span>
    <button class="btn" onclick={close}>Annuler</button>
  {/snippet}
</Modal>

<style>
  .intro {
    color: var(--text-3);
    margin-bottom: 14px;
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 12px 14px;
    border-radius: var(--r-btn);
    background: var(--surface-1);
    border: 1px solid var(--border-1);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s var(--ease), background 0.15s var(--ease);
  }

  button.opt:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }

  button.opt:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-ring);
  }

  .opt.empty {
    cursor: default;
    opacity: 0.6;
  }

  .ico {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
  }

  .txt {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .sub {
    color: var(--text-3);
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }

  .grow {
    flex: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .opt {
      transition: none;
    }
  }
</style>
