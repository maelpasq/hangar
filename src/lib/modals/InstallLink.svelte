<script lang="ts">
  // Lien d'installation d'un jeu hors store : la page où le retrouver. Trouvé automatiquement
  // (registre, raccourci Internet, site officiel ou page Steam), modifiable, jamais obligatoire.
  import Modal from '../components/Modal.svelte';
  import { library } from '../stores/library.svelte';
  import { ui } from '../stores/ui.svelte';
  import type { Game } from '../types';
  import { httpsLink } from '../util/sync';

  let { game }: { game: Game } = $props();

  // svelte-ignore state_referenced_locally
  let value = $state(library.installLink(game) ?? '');
  const custom = $derived(game.id in library.state.installLinks);
  const clean = $derived(value.trim());
  const invalid = $derived(!!clean && !httpsLink(clean));
  const close = () => { ui.modal = null; };

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (invalid) return;
    // Lien inchangé : on ne fige pas le lien automatique en choix de l'utilisateur.
    if (clean !== (library.installLink(game) ?? '')) library.setInstallLink(game.id, clean);
    close();
  }

  function reset() {
    library.setInstallLink(game.id, null);
    close();
  }
</script>

<Modal title="Lien d'installation" onclose={close}>
  <form id="link-form" onsubmit={save}>
    <div class="field">
      <label for="link-url">Page où retrouver {library.name(game)}</label>
      <input
        id="link-url"
        type="url"
        inputmode="url"
        spellcheck="false"
        placeholder="https://"
        bind:value
        aria-invalid={invalid}
        aria-describedby="link-help"
      />
    </div>
    <p id="link-help" class="help" class:bad={invalid}>
      {#if invalid}
        Le lien doit commencer par https://
      {:else}
        Il s'ouvre dans ton navigateur. Laisse vide pour ne garder aucun lien.
      {/if}
    </p>
  </form>
  {#snippet footer()}
    <button class="btn reset" onclick={reset} disabled={!custom}>Lien automatique</button>
    <span class="grow"></span>
    <button class="btn" onclick={close}>Annuler</button>
    <button class="btn primary" type="submit" form="link-form" disabled={invalid}>Enregistrer</button>
  {/snippet}
</Modal>

<style>
  .help {
    margin-top: 10px;
    font-size: 12.5px;
    color: var(--muted);
  }

  .help.bad {
    color: var(--danger-text);
  }

  .grow {
    flex: 1;
  }
</style>
