<script lang="ts">
  // Signaler un bug : titre, description et capture facultatives, envoyés au développeur.
  import { api } from '../api';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import { ui } from '../stores/ui.svelte';

  let title = $state('');
  let description = $state('');
  let shot = $state<string | null>(null);
  let sending = $state(false);
  let error = $state('');
  const close = () => { ui.modal = null; };
  const shotName = $derived(shot?.split(/[\\/]/).pop() ?? '');

  async function pick() {
    shot = (await api.pickImage().catch(() => null)) ?? shot;
  }

  async function send(e: SubmitEvent) {
    e.preventDefault();
    sending = true;
    error = '';
    try {
      await api.reportBug(title.trim(), description.trim(), shot);
      close();
      ui.toast('Merci, ton signalement est envoyé');
    } catch (err) {
      error = String(err);
    } finally {
      sending = false;
    }
  }
</script>

<Modal title="Signaler un bug" onclose={close} width={480}>
  <form id="bug-form" onsubmit={send}>
    <div class="field">
      <label for="bug-title">Titre</label>
      <input id="bug-title" bind:value={title} maxlength="100" placeholder="Ex. : le jeu ne se lance pas" required />
    </div>
    <div class="field">
      <label for="bug-desc">Description <span class="opt">(facultatif)</span></label>
      <textarea id="bug-desc" bind:value={description} maxlength="1700" rows="5" placeholder="Ce qui s'est passé, et comment le refaire"
      ></textarea>
    </div>
    <div class="field">
      <span id="bug-shot-lbl">Capture d'écran <span class="opt">(facultatif)</span></span>
      <div class="shot" aria-labelledby="bug-shot-lbl" role="group">
        <button type="button" class="btn" onclick={pick}><Icon name="image" size={16} />{shot ? 'Changer' : 'Choisir une image'}</button>
        {#if shot}
          <span class="name" title={shot}>{shotName}</span>
          <button type="button" class="rm" aria-label="Retirer la capture" title="Retirer la capture" onclick={() => (shot = null)}
            ><Icon name="x" size={15} /></button
          >
        {/if}
      </div>
    </div>
    <p class="note">La version de Hangar et ton système sont joints, rien d'autre.</p>
    {#if error}<p class="err" role="alert">{error}</p>{/if}
  </form>
  {#snippet footer()}
    <span class="grow"></span>
    <button class="btn" onclick={close}>Annuler</button>
    <button class="btn primary" type="submit" form="bug-form" disabled={!title.trim() || sending}
      >{sending ? 'Envoi...' : 'Envoyer'}</button
    >
  {/snippet}
</Modal>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  textarea {
    padding: 10px 12px;
    border-radius: 11px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--strong);
    font-size: 14px;
    resize: vertical;
    outline: none;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }

  textarea:focus {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .opt {
    color: var(--muted);
  }

  .shot {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--strong);
  }

  .note {
    font-size: 12.5px;
    color: var(--muted);
  }

  .err {
    font-size: 13px;
    color: var(--danger-text);
  }

  .rm {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: var(--muted);
  }

  .rm:hover {
    color: var(--strong);
    background: var(--surface-2);
  }

  .grow {
    flex: 1;
  }
</style>
