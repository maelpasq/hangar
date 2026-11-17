<script lang="ts">
  // Pastille « Compte certifié », juste après un pseudo (listes, discussion, activité, compte).
  // Sur le profil, elle fait partie des badges (`Badges.svelte`).
  import BadgeIcon from './BadgeIcon.svelte';

  let { size = 14 }: { size?: number } = $props();
</script>

<span class="mark" role="img" aria-label="Compte certifié" title="Compte certifié"><BadgeIcon icon="seal" {size} /></span>

<style>
  .mark {
    display: inline-flex;
    flex-shrink: 0;
    vertical-align: -0.15em;
    margin-left: 4px;
    color: var(--accent);
  }
</style>
