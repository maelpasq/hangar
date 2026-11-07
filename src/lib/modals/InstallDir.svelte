<script lang="ts">
  // Choix du dossier d'installation parmi ceux du launcher du jeu.
  import { untrack } from 'svelte';
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { runner } from '../stores/runner.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game, InstallTarget } from '../types';
  import { sizeLabel } from '../util/format';

  let { game, targets }: { game: Game; targets: InstallTarget[] } = $props();

  // Dossier par défaut du launcher (le premier), choisi une seule fois à l'ouverture.
  let chosen = $state(untrack(() => targets[0]?.path ?? ''));
  const close = () => {
    ui.modal = null;
  };
  // Taille connue du jeu : un disque trop petit est signalé.
  const tooSmall = (t: InstallTarget) => !!game.sizeBytes && t.free > 0 && t.free < game.sizeBytes;
</script>

<Modal title="Installer {library.name(game)}" onclose={close} width={460}>
  <fieldset>
    <legend>Dossier d'installation ({game.launcherName})</legend>
    {#each targets as t (t.path)}
      <label class="opt" class:on={chosen === t.path}>
        <input type="radio" name="install-dir" value={t.path} bind:group={chosen} />
        <span class="path">{t.label}</span>
        <span class="free" class:warn={tooSmall(t)}>
          {#if t.free > 0}{sizeLabel(t.free)} libres{/if}{#if tooSmall(t)} · trop peu de place{/if}
        </span>
      </label>
    {/each}
  </fieldset>
  {#snippet footer()}
    <button class="btn" onclick={close}>Annuler</button>
    <button
      class="btn primary"
      disabled={!chosen}
      onclick={() => {
        const [id, dir] = [game.id, chosen];
        close();
        void runner.installTo(id, dir);
      }}>Installer</button
    >
  {/snippet}
</Modal>

<style>
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  legend {
    color: var(--text-3);
    margin-bottom: 10px;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--r-btn);
    background: var(--surface-1);
    border: 1px solid var(--border-1);
    cursor: pointer;
    transition: border-color 0.15s var(--ease), background 0.15s var(--ease);
  }

  .opt:hover {
    background: var(--surface-2);
  }

  .opt.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .opt:has(input:focus-visible) {
    box-shadow: 0 0 0 3px var(--accent-ring);
  }

  input {
    accent-color: var(--accent);
    margin: 0;
  }

  .path {
    flex: 1;
    min-width: 0;
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .free {
    color: var(--text-3);
    font-size: 12px;
    white-space: nowrap;
  }

  .free.warn {
    color: var(--danger-text);
  }

  @media (prefers-reduced-motion: reduce) {
    .opt {
      transition: none;
    }
  }
</style>
