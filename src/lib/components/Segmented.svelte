<script lang="ts" generics="T extends string">
  // Contrôle segmenté (tri).
  let {
    value,
    options,
    label,
    onchange
  }: { value: T; options: { value: T; label: string }[]; label: string; onchange: (v: T) => void } = $props();
</script>

<div class="seg" role="group" aria-label={label}>
  {#each options as o (o.value)}
    <button class:on={o.value === value} aria-pressed={o.value === value} onclick={() => onchange(o.value)}>
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    width: fit-content;
    padding: 3px;
    border-radius: 11px;
    background: var(--surface-2);
    border: 1px solid var(--surface-3);
  }

  button {
    height: 30px;
    padding: 0 13px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-3);
    transition: all 0.15s;
  }

  button:hover {
    color: var(--strong);
  }

  button.on {
    background: rgb(var(--ink) / 0.12);
    color: var(--strong);
  }
</style>
