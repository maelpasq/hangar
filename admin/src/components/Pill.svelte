<script lang="ts">
  // Puce : point de couleur + libellé clair sur fond teinté (statut, badge, action du journal).
  let { color, label, dot = true }: { color: string; label: string; dot?: boolean } = $props();
</script>

<span class="pill" style:--c={color}>{#if dot}<i></i>{/if}{label}</span>
