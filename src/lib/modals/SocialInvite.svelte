<script lang="ts">
  // Inviter un ami sur un jeu : les jeux installés, les plus récents d'abord, avec recherche.
  import Cover from '../components/Cover.svelte';
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { social } from '../stores/social.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';
  import { portableId } from '../util/sync';

  let { userId, name }: { userId: string; name: string } = $props();

  let query = $state('');
  let busy = $state(false);
  const close = () => (ui.modal = null);

  const games = $derived(
    library.installed
      .filter((g) => portableId(library.state, g.id))
      .filter((g) => !query.trim() || library.name(g).toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => library.totals(b.id).lastPlayed - library.totals(a.id).lastPlayed)
      .slice(0, 40)
  );

  async function pick(g: Game) {
    busy = true;
    const ok = await social.invite(userId, g);
    busy = false;
    if (ok) {
      ui.toast(`Invitation envoyée à ${name} pour ${library.name(g)}.`, { gameId: g.id });
      close();
    }
  }
</script>

<Modal title="Inviter {name} sur un jeu" onclose={close} width={560}>
  <div class="field">
    <label for="invite-search">Rechercher dans tes jeux installés</label>
    <input id="invite-search" type="search" autocomplete="off" bind:value={query} />
  </div>
  <ul class="list scroll">
    {#each games as g (g.id)}
      <li>
        <!-- Pas de classe « row » : c'est une classe globale (rangée de jaquettes, marges négatives). -->
        <button class="pick" disabled={busy} onclick={() => pick(g)}>
          <span class="cv"><Cover game={g} showName={false} /></span>
          <span class="nm">{library.name(g)}</span>
        </button>
      </li>
    {:else}
      <li class="none">Aucun jeu installé ne correspond.</li>
    {/each}
  </ul>
</Modal>

<style>
  .list {
    list-style: none;
    padding: 0;
    margin: 12px 0 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 380px;
    overflow-y: auto;
  }

  .list > li {
    flex-shrink: 0;
  }

  .pick {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    border-radius: 11px;
    text-align: left;
  }

  .pick:hover:not(:disabled) {
    background: var(--surface-3);
  }

  .cv {
    position: relative;
    width: 34px;
    aspect-ratio: 2 / 3;
    border-radius: 7px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .nm {
    font-weight: 600;
    font-size: 14px;
  }

  .none {
    color: var(--muted);
    font-size: 13px;
    padding: 8px;
  }
</style>
