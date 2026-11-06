<script lang="ts" generics="T extends string">
  // Liste déroulante aux couleurs de Hangar (remplace <select>, dont la liste native jure avec l'app).
  // Clavier : Entrée / Espace / flèches ouvrent, flèches et Début / Fin pour choisir, Échap ferme.
  import { onMount } from 'svelte';

  let {
    value = $bindable(),
    options,
    label
  }: { value: T; options: { value: T; label: string }[]; label: string } = $props();

  const uid = `dd-${Math.random().toString(36).slice(2, 8)}`;
  let open = $state(false);
  let active = $state(0);
  let root: HTMLDivElement;
  let btn: HTMLButtonElement;
  let list = $state<HTMLUListElement>();

  const current = $derived(options.find((o) => o.value === value) ?? options[0]);

  function show() {
    active = Math.max(0, options.findIndex((o) => o.value === value));
    open = true;
  }

  function choose(i: number) {
    value = options[i].value;
    open = false;
    btn.focus();
  }

  $effect(() => {
    if (open) list?.querySelector<HTMLElement>(`#${uid}-${active}`)?.scrollIntoView({ block: 'nearest' });
  });

  function onkeydown(e: KeyboardEvent) {
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'ArrowDown') active = Math.min(last, active + 1);
    else if (e.key === 'ArrowUp') active = Math.max(0, active - 1);
    else if (e.key === 'Home') active = 0;
    else if (e.key === 'End') active = last;
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.stopPropagation();
      open = false;
      return;
    } else return;
    e.preventDefault();
  }

  onMount(() => {
    const close = (e: Event) => {
      if (open && !(e.target instanceof Node && root.contains(e.target))) open = false;
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
    };
  });
</script>

<div class="dd" bind:this={root}>
  <button
    bind:this={btn}
    type="button"
    class:open
    role="combobox"
    aria-label={label}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls="{uid}-list"
    aria-activedescendant={open ? `${uid}-${active}` : undefined}
    onclick={() => (open ? (open = false) : show())}
    {onkeydown}
  >
    <span class="cur">{current?.label}</span>
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"
      ><path d="m3 4.5 3 3 3-3" stroke-linecap="round" stroke-linejoin="round"></path></svg
    >
  </button>
  {#if open}
    <ul class="list" id="{uid}-list" role="listbox" aria-label={label} bind:this={list}>
      {#each options as o, i (o.value)}
        <!-- svelte-ignore a11y_click_events_have_key_events : le clavier passe par le bouton (aria-activedescendant) -->
        <li
          id="{uid}-{i}"
          role="option"
          aria-selected={o.value === value}
          class:active={i === active}
          onmousemove={() => (active = i)}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => choose(i)}
        >
          <span>{o.label}</span>
          {#if o.value === value}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"
              ><path d="m3 7.2 2.6 2.6L11 4.4" stroke-linecap="round" stroke-linejoin="round"></path></svg
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dd {
    position: relative;
  }

  button {
    height: 34px;
    max-width: 240px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 11px 0 13px;
    border-radius: 10px;
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    color: var(--text);
    font-size: 13px;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  button:hover,
  button.open {
    background: var(--surface-3);
    border-color: var(--border-3);
    color: var(--strong);
  }

  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .cur {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  svg {
    flex-shrink: 0;
    color: var(--muted);
  }

  button.open svg {
    transform: rotate(180deg);
  }

  .list {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 40;
    min-width: 100%;
    max-height: 320px;
    overflow-y: auto;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: rgb(var(--popover) / 0.92);
    backdrop-filter: blur(30px) saturate(1.4);
    border: 1px solid var(--border-3);
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
    animation: hgPopIn 0.16s var(--ease) both;
    transform-origin: top right;
  }

  li {
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 0 10px 0 12px;
    border-radius: 9px;
    font-size: 13px;
    color: var(--text-soft);
    white-space: nowrap;
    cursor: pointer;
  }

  li.active {
    background: var(--surface-3);
    color: var(--strong);
  }

  li[aria-selected='true'] {
    color: var(--strong);
    font-weight: 600;
  }

  li svg {
    color: var(--accent);
  }
</style>
