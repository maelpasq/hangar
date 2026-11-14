<script lang="ts">
  // Ce qui peut prendre le bouton central de la manette avant Hangar, manette par manette.
  // La Game Bar (Windows) est vérifiée : état relu à chaque retour sur Hangar.
  import { onMount } from 'svelte';
  import { api } from '../api';
  import { padTips } from '../pad-tips';
  import { ui } from '../stores/ui.svelte';
  import Icon from './Icon.svelte';

  let { compact = false }: { compact?: boolean } = $props();

  const tips = padTips();
  /** null : pas encore lu (ou hors Windows). */
  let gameBar = $state<boolean | null>(null);

  function refresh() {
    if (!tips.some((t) => t.id === 'gamebar')) return;
    api.gameBarOnButton().then(
      (on) => (gameBar = on),
      () => (gameBar = null)
    );
  }

  onMount(refresh);
  // Retour depuis les réglages de Windows : la Game Bar a peut-être été désactivée.
  $effect(() => {
    if (ui.windowFocused) refresh();
  });

  function open(link: 'gamebar-settings') {
    api.openLink(link).catch((e) => ui.toast(String(e), { error: true }));
  }
</script>

<ul class="tips" class:compact>
  {#each tips as t (t.id)}
    {@const warn = t.id === 'gamebar' && gameBar === true}
    {@const ok = t.id === 'gamebar' && gameBar === false}
    <li class="tip" class:warn>
      <span class="ico" class:ok aria-hidden="true"><Icon name={ok ? 'check' : warn ? 'alert' : 'gamepad'} size={16} /></span>
      <span class="body">
        <span class="title">
          {t.title}
          {#if warn}<span class="state">encore active</span>{:else if ok}<span class="state on">désactivée</span>{/if}
        </span>
        <span class="text">{t.text}</span>
        {#if t.link && !ok}
          <button class="btn-s link" onclick={() => open(t.link!)}>Ouvrir les réglages de la Game Bar</button>
        {/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  .tips {
    list-style: none;
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
  }

  .tip {
    display: flex;
    gap: 12px;
    padding: 12px 0;
    border-top: 1px solid var(--border-1);
  }

  .tip:first-child {
    border-top: none;
  }

  .compact .tip {
    padding: 9px 0;
  }

  .ico {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: rgb(var(--ink) / 0.05);
    color: var(--text-3);
  }

  .warn .ico {
    color: var(--danger-text);
    background: color-mix(in srgb, var(--danger-text) 12%, transparent);
  }

  .ico.ok {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }

  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }

  .title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text);
  }

  .state {
    margin-left: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--danger-text);
  }

  .state.on {
    color: var(--accent);
  }

  .text {
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--muted);
  }

  .link {
    margin-top: 6px;
  }
</style>
