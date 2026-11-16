<script lang="ts">
  // Compte Hangar tout juste créé : bienvenue, puis pseudo, avatar et bannière (recadrés ici même).
  import { onDestroy } from 'svelte';
  import Modal from '../components/Modal.svelte';
  import ImageCropper from '../components/ImageCropper.svelte';
  import Icon from '../components/Icon.svelte';
  import { cloud } from '../stores/cloud.svelte';
  import { social } from '../stores/social.svelte';
  import { ui } from '../stores/ui.svelte';
  import { acceptImage, type CropShape } from '../util/avatar';

  let pseudo = $state(cloud.name);
  let busy = $state(false);
  /** Image en cours de recadrage (sinon : le formulaire). */
  let crop = $state<{ file: File; shape: CropShape } | null>(null);
  let cropper = $state<ImageCropper>();
  let bannerUrl = $state<string | null>(null);
  let avatarInput = $state<HTMLInputElement>();
  let bannerInput = $state<HTMLInputElement>();

  const savedBanner = $derived(
    social.settings?.banner && social.me ? social.image('banner', social.me, social.settings.banner) : null
  );
  const banner = $derived(bannerUrl ?? savedBanner);
  const pseudoOk = $derived(pseudo.trim().length >= 2);

  onDestroy(() => {
    if (bannerUrl) URL.revokeObjectURL(bannerUrl);
  });

  const close = () => {
    if (!busy) ui.modal = null;
  };

  function pick(e: Event, shape: CropShape) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!acceptImage(file)) {
      ui.toast('Image illisible ou trop lourde : choisis un PNG, un JPEG ou un WebP de moins de 20 Mo.', { error: true });
      return;
    }
    crop = { file, shape };
  }

  function unreadable() {
    ui.toast('Image illisible : choisis un PNG, un JPEG ou un WebP.', { error: true });
    crop = null;
  }

  async function applyCrop() {
    if (!crop || !cropper || busy) return;
    busy = true;
    try {
      let bytes: Uint8Array;
      try {
        bytes = await cropper.result();
      } catch {
        return unreadable();
      }
      if (crop.shape === 'avatar') {
        if (await cloud.setAvatar(bytes)) crop = null;
      } else if (await social.setBanner(bytes)) {
        if (bannerUrl) URL.revokeObjectURL(bannerUrl);
        bannerUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/webp' }));
        crop = null;
      }
    } finally {
      busy = false;
    }
  }

  async function finish(e: SubmitEvent) {
    e.preventDefault();
    if (busy || !pseudoOk) return;
    const name = pseudo.trim();
    if (name !== cloud.name) {
      busy = true;
      try {
        if (!(await cloud.setName(name))) return;
      } finally {
        busy = false;
      }
    }
    ui.modal = null;
    ui.toast('Profil enregistré. Tu peux le modifier dans Paramètres > Compte.');
  }

  const title = $derived(
    crop ? (crop.shape === 'avatar' ? "Recadrer l'avatar" : 'Recadrer la bannière') : 'Ton compte Hangar est créé'
  );
</script>

<Modal {title} width={crop ? 560 : 480} onclose={() => (crop ? (crop = null) : close())}>
  {#snippet hero()}
    {#if !crop}
      <div class="hero">
        <div class="banner" class:img={!!banner}>
          {#if banner}<img src={banner} alt="" />{/if}
          <button type="button" class="pick-banner" disabled={busy} onclick={() => bannerInput?.click()}
            ><Icon name="image" size={14} />{banner ? 'Changer la bannière' : 'Ajouter une bannière'}</button
          >
        </div>
        <button
          type="button"
          class="avatar"
          disabled={busy}
          aria-label={cloud.avatar ? "Changer l'avatar" : 'Ajouter un avatar'}
          onclick={() => avatarInput?.click()}
        >
          {#if cloud.avatar}<img src={cloud.avatar} alt="" />{:else}<span class="init">{(pseudo.trim() || cloud.name).charAt(0).toUpperCase()}</span>{/if}
          <span class="edit" aria-hidden="true"><Icon name="edit" size={13} /></span>
        </button>
        <span class="done" aria-hidden="true"><Icon name="check" size={13} />Compte créé</span>
      </div>
    {/if}
  {/snippet}

  {#if crop}
    {#key crop.file}
      <ImageCropper bind:this={cropper} file={crop.file} shape={crop.shape} onerror={unreadable} />
    {/key}
  {:else}
    <p class="intro">
      Bienvenue sur Hangar ! Choisis comment les autres te verront : ton pseudo, ton avatar et la bannière de ton
      profil. Tout se change plus tard dans Paramètres > Compte.
    </p>
    <form id="welcome-form" onsubmit={finish}>
      <div class="field">
        <label for="welcome-pseudo">Pseudo</label>
        <input id="welcome-pseudo" maxlength="32" autocomplete="nickname" bind:value={pseudo} />
      </div>
      {#if !pseudoOk}<p class="err" role="alert">Au moins 2 caractères.</p>{/if}
    </form>
    <div class="pics">
      <button type="button" class="btn" disabled={busy} onclick={() => avatarInput?.click()}
        ><Icon name="user" size={15} />{cloud.avatar ? "Changer l'avatar" : 'Choisir un avatar'}</button
      >
      <button type="button" class="btn" disabled={busy} onclick={() => bannerInput?.click()}
        ><Icon name="image" size={15} />{banner ? 'Changer la bannière' : 'Choisir une bannière'}</button
      >
    </div>
  {/if}
  {#snippet footer()}
    {#if crop}
      <span class="grow"></span>
      <button class="btn" disabled={busy} onclick={() => (crop = null)}>Retour</button>
      <button class="btn primary" onclick={applyCrop}>Appliquer</button>
    {:else}
      <span class="grow"></span>
      <button class="btn" disabled={busy} onclick={close}>Plus tard</button>
      <button class="btn primary" type="submit" form="welcome-form" disabled={!pseudoOk}>Terminer</button>
    {/if}
  {/snippet}
</Modal>

<!-- Hors de la fenêtre : le piège à focus ne doit pas s'y arrêter. -->
  <input
    bind:this={avatarInput}
    class="sr-only"
    type="file"
    accept="image/png,image/jpeg,image/webp"
    tabindex="-1"
    aria-hidden="true"
    onchange={(e) => pick(e, 'avatar')}
  />
  <input
    bind:this={bannerInput}
    class="sr-only"
    type="file"
    accept="image/png,image/jpeg,image/webp"
    tabindex="-1"
    aria-hidden="true"
    onchange={(e) => pick(e, 'banner')}
  />

<style>
  .hero {
    position: relative;
    height: 170px;
    flex-shrink: 0;
  }

  .banner {
    position: relative;
    /* Même ratio que le recadrage et que le profil : ce qu'on voit ici est ce qui s'affiche. */
    aspect-ratio: 4 / 1;
    overflow: hidden;
    background:
      radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 55%, transparent), transparent 60%),
      radial-gradient(90% 120% at 100% 100%, color-mix(in srgb, var(--accent) 30%, #0b0d14), transparent 70%),
      var(--surface-2);
  }

  .banner img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pick-banner {
    position: absolute;
    right: 12px;
    bottom: 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 9px;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: rgb(0 0 0 / 0.45);
    backdrop-filter: blur(6px);
  }

  .pick-banner:hover:not(:disabled) {
    background: rgb(0 0 0 / 0.62);
  }

  .avatar {
    position: absolute;
    left: 22px;
    top: 84px;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    padding: 0;
    overflow: visible;
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--panel);
  }

  .avatar img,
  .avatar .init {
    width: 100%;
    height: 100%;
    border-radius: 50%;
  }

  .avatar img {
    object-fit: cover;
  }

  .avatar .init {
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 32px;
    font-weight: 700;
  }

  .avatar .edit {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text);
    background: var(--surface-4);
    background-color: var(--panel);
    box-shadow: inset 0 0 0 1px var(--border-3);
  }

  .avatar:hover:not(:disabled) .edit {
    color: var(--strong);
    background-color: var(--accent);
  }

  .done {
    position: absolute;
    left: 116px;
    top: 138px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--success-text);
  }

  .intro {
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text-3);
  }

  .err {
    margin-top: 6px;
    font-size: 12px;
    color: var(--danger-text);
  }

  .pics {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .pics .btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .grow {
    flex: 1;
  }
</style>
