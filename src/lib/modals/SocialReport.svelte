<script lang="ts">
  // Signaler un compte ou un message : une raison, un détail facultatif. Examiné à la main.
  import Modal from '../components/Modal.svelte';
  import { social } from '../stores/social.svelte';
  import { ui } from '../stores/ui.svelte';

  let { userId, name, messageId }: { userId: string; name: string; messageId?: string } = $props();

  const REASONS = [
    { value: 'spam', label: 'Spam ou publicité' },
    { value: 'harcelement', label: 'Harcèlement ou insultes' },
    { value: 'contenu', label: 'Contenu choquant ou illégal' },
    { value: 'autre', label: 'Autre' }
  ];
  let reason = $state('spam');
  let note = $state('');
  let busy = $state(false);
  let block = $state(false);
  const close = () => (ui.modal = null);

  async function send(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    const ok = await social.report(userId, reason, note, messageId);
    if (ok && block) await social.block({ id: userId, name });
    busy = false;
    if (ok) close();
  }
</script>

<Modal title={messageId ? 'Signaler ce message' : `Signaler ${name}`} onclose={close}>
  <form id="report-form" onsubmit={send}>
    <fieldset>
      <legend>Raison</legend>
      {#each REASONS as r (r.value)}
        <label class="opt"><input type="radio" name="reason" value={r.value} bind:group={reason} />{r.label}</label>
      {/each}
    </fieldset>
    <div class="field">
      <label for="report-note">Précisions (facultatif)</label>
      <textarea id="report-note" maxlength="500" rows="3" bind:value={note}></textarea>
    </div>
    <label class="opt blk"><input type="checkbox" bind:checked={block} />Bloquer aussi {name}</label>
    <p class="hint">
      {messageId ? 'Le texte du message signalé' : 'Ton signalement'} est transmis au développeur de Hangar, sans en avertir {name}.
    </p>
  </form>
  {#snippet footer()}
    <span class="grow"></span>
    <button class="btn" onclick={close}>Annuler</button>
    <button class="btn primary" type="submit" form="report-form" disabled={busy}>Signaler</button>
  {/snippet}
</Modal>

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  legend {
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    padding: 4px 0;
  }

  .opt input {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
  }

  textarea {
    width: 100%;
    resize: vertical;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }

  textarea:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .blk {
    margin-top: 12px;
  }

  .hint {
    margin-top: 10px;
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.5;
  }

  .grow {
    flex: 1;
  }
</style>
