<script lang="ts">
  // Ajouter un jeu à la main (exe, raccourci, .url, .bat) ou un dossier entier.
  import { addFolder } from '../actions';
  import { api } from '../api';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';
  import { nameFromPath, parentDir } from '../util/games';

  let path = $state('');
  let name = $state('');
  let args = $state('');
  let nameTouched = false;

  const close = () => { ui.modal = null; };

  async function browse() {
    const p = await api.pickExe();
    if (!p) return;
    path = p;
    if (!nameTouched || !name.trim()) name = nameFromPath(p);
  }

  function add(e: SubmitEvent) {
    e.preventDefault();
    if (!path || !name.trim()) return;
    const dir = parentDir(path);
    const g: Game = {
      id: `manual:${path.toLowerCase()}`,
      name: name.trim(),
      store: 'manual',
      installDir: dir,
      launch: { kind: 'exe', target: path, args: args.trim(), cwd: dir },
      launcherName: "l'exécutable du jeu",
      steamAppId: null,
      exePath: path.toLowerCase().endsWith('.exe') ? path : null,
      processNames: [],
      genre: null
    };
    library.addManual(g);
    close();
    ui.toast(`${g.name} ajouté à ta bibliothèque`, { gameId: g.id });
  }
</script>

<Modal title="Ajouter un jeu" onclose={close}>
  <form id="add-form" class="form" onsubmit={add}>
    <div class="field">
      <label for="add-path">Exécutable</label>
      <div class="pick">
        <input id="add-path" class="mono" readonly value={path} placeholder="Aucun fichier choisi" onclick={browse} />
        <button type="button" class="btn" onclick={browse}><Icon name="folder" size={16} />Parcourir</button>
      </div>
    </div>
    <div class="field">
      <label for="add-name">Nom</label>
      <input id="add-name" bind:value={name} oninput={() => (nameTouched = true)} placeholder="Nom du jeu" />
    </div>
    <div class="field">
      <label for="add-args">Arguments <span class="opt">(facultatif)</span></label>
      <input id="add-args" class="mono" bind:value={args} placeholder="-windowed" />
    </div>
    <button
      type="button"
      class="link folder"
      onclick={() => {
        close();
        addFolder();
      }}>ou ajouter un dossier entier</button
    >
  </form>
  {#snippet footer()}
    <button class="btn" onclick={close}>Annuler</button>
    <button class="btn primary" type="submit" form="add-form" disabled={!path || !name.trim()}>Ajouter</button>
  {/snippet}
</Modal>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .pick {
    display: flex;
    gap: 8px;
  }

  .pick input {
    flex: 1;
    cursor: pointer;
    font-size: 12.5px;
  }

  .opt {
    color: var(--muted);
  }

  .folder {
    align-self: flex-start;
    font-weight: 500;
  }
</style>
