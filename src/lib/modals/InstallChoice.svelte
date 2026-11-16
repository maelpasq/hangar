<script lang="ts">
  // Jeu du compte Hangar absent de ce PC : la personne choisit d'où l'installer. Les sites
  // officiels trouvés automatiquement d'abord (là où se télécharge l'exe officiel), la page
  // Steam à part, son exécutable s'il est déjà là, ou un autre lien saisi à la main.
  import { untrack } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { attachElsewhere } from '../ghosts';
  import { api } from '../api';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';
  import { linkDomain } from '../util/sync';

  let { game }: { game: Game } = $props();

  // Recalculé quand les recherches remplissent le cache (état réactif de la bibliothèque).
  const choices = $derived(library.installChoices(game));
  let searching = $state(true);
  let failed = $state(false);
  $effect(() => {
    const g = untrack(() => game);
    library
      .findInstallChoices(g)
      .catch(() => (failed = true))
      .finally(() => (searching = false));
  });

  const close = () => {
    ui.modal = null;
  };

  function open(url: string) {
    close();
    api.openGameLink(url).catch((e) => ui.toast(String(e).replace(/^Error:\s*/, ''), { error: true }));
  }

  function chooseExe() {
    const id = game.id;
    close();
    void attachElsewhere(id);
  }

  function otherLink() {
    ui.modal = { kind: 'installLink', gameId: game.id };
  }
</script>

<Modal title="Installer {library.name(game)}" onclose={close} width={480}>
  <p class="intro">Ce jeu est sur un autre de tes PC. Choisis d'où l'installer ici.</p>
  <div class="choices">
    {#each choices.sites as url (url)}
      <button class="opt" onclick={() => open(url)}>
        <span class="ico"><Icon name="globe" size={18} /></span>
        <span class="txt"><strong>Site officiel</strong><span class="sub">{linkDomain(url)}</span></span>
      </button>
    {:else}
      <div class="opt empty" role="status">
        <span class="ico"><Icon name="globe" size={18} /></span>
        <span class="txt">
          <strong>Site officiel</strong>
          <span class="sub">
            {#if searching}Recherche du site officiel…{:else if failed}Recherche impossible pour l'instant (connexion){:else}Aucun site officiel trouvé{/if}
          </span>
        </span>
      </div>
    {/each}
    {#if choices.steam}
      <button class="opt" onclick={() => open(choices.steam!)}>
        <span class="ico"><Icon name="globe" size={18} /></span>
        <span class="txt"><strong>Page Steam</strong><span class="sub">store.steampowered.com</span></span>
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
    <button class="btn" onclick={otherLink}>Autre lien…</button>
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
