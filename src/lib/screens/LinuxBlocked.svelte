<script lang="ts">
  // Version Linux désactivée (trop de bugs, elle sera refaite) : seul cet écran s'affiche.
  // Il cherche quand même les mises à jour, pour installer la future version Linux.
  import { onMount } from 'svelte';
  import { api } from '../api';
  import Logo from '../components/Logo.svelte';

  let version = $state('');
  let phase = $state<'checking' | 'none' | 'available' | 'installing' | 'error'>('checking');
  let progress = $state<number | null>(null);
  let error = $state('');

  async function check() {
    phase = 'checking';
    try {
      const u = await api.checkUpdate();
      version = u?.version ?? '';
      phase = u ? 'available' : 'none';
    } catch {
      phase = 'none';
    }
  }

  async function install() {
    phase = 'installing';
    progress = null;
    try {
      await api.installUpdate((r) => (progress = r));
    } catch (e) {
      error = String(e);
      phase = 'error';
    }
  }

  onMount(check);
</script>

<main class="blocked" data-tauri-drag-region>
  <section class="card" aria-labelledby="blocked-title">
    <Logo size={56} />
    <h1 id="blocked-title">Hangar fait une pause sous Linux</h1>
    <p>
      La version Linux avait trop de bugs : elle est désactivée le temps de la refaire. Quand elle sera prête, elle
      s'installera d'ici.
    </p>
    <p class="hint">Hangar reste disponible sous Windows et macOS.</p>
    {#if phase === 'error'}
      <p class="error" role="alert">Échec de la mise à jour : {error}</p>
    {/if}
    <div class="actions">
      {#if phase === 'available' || phase === 'error'}
        <button class="btn primary" onclick={install}>Installer la version {version}</button>
      {:else if phase === 'installing'}
        <button class="btn primary" disabled>
          {progress === null ? 'Installation...' : `Téléchargement ${Math.round(progress * 100)} %`}
        </button>
      {:else}
        <button class="btn" disabled={phase === 'checking'} onclick={check}>
          {phase === 'checking' ? 'Recherche en cours...' : 'Rechercher une mise à jour'}
        </button>
      {/if}
      <button class="btn" onclick={() => api.win.close()}>Quitter</button>
    </div>
  </section>
</main>

<style>
  .blocked {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--bg);
    color: var(--text);
  }

  .card {
    max-width: 460px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
  }

  h1 {
    margin: 6px 0 0;
    font-size: 22px;
    font-weight: 700;
    color: var(--strong);
  }

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: var(--text-2);
  }

  .hint {
    color: var(--muted);
  }

  .error {
    color: var(--danger-text);
  }

  .actions {
    display: flex;
    gap: 10px;
    margin-top: 8px;
  }
</style>
