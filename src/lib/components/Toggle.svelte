<script lang="ts">
  // Interrupteur 44 x 26 (rôle switch).
  let { on, label, onchange }: { on: boolean; label: string; onchange: (v: boolean) => void } = $props();
</script>

<button class="tog" class:on role="switch" aria-checked={on} aria-label={label} onclick={() => onchange(!on)}
></button>

<style>
  .tog {
    width: 44px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 999px;
    background: rgb(var(--ink) / 0.14);
    position: relative;
    transition: background 0.25s;
  }

  .tog::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    transition: transform 0.3s var(--ease);
  }

  .tog.on {
    background: var(--accent);
  }

  .tog.on::after {
    transform: translateX(18px);
  }

  .tog:focus-visible {
    outline-offset: 3px;
    border-radius: 999px;
  }
</style>
