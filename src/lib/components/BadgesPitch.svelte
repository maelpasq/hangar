<script lang="ts">
  // Vitrine « badges » de la fenêtre des nouveautés : accroche et la liste des badges du profil.
  import ArchEmblem from './ArchEmblem.svelte';
  import BadgeIcon from './BadgeIcon.svelte';
  import Icon from './Icon.svelte';
  import type { BadgeIcon as BadgeIconName } from '../util/badges';
  import { TIERS } from '../util/seniority';

  const gold = TIERS.find((t) => t.id === 'or') ?? TIERS[0];

  const badges: { icon: BadgeIconName | 'arch'; color: string; title: string; text: string }[] = [
    {
      icon: 'arch',
      color: '',
      title: 'Ancienneté',
      text: "Ton arche change de matière avec le temps, du bronze à l'opale."
    },
    {
      icon: 'flag',
      color: '#f08a3c',
      title: 'Pionnier',
      text: 'Pour les comptes créés avant le 1er décembre 2026.'
    },
    {
      icon: 'stack',
      color: '#e9b52c',
      title: 'Collectionneur',
      text: 'De 50 à 500 jeux, du bronze au diamant.'
    },
    {
      icon: 'clock',
      color: '#aab3c2',
      title: 'Marathonien',
      text: '100, 500 puis 1000 heures de jeu.'
    },
    {
      icon: 'grid',
      color: '#4f8ff7',
      title: 'Multi-launchers',
      text: 'Des jeux sur 5 launchers ou plus.'
    },
    {
      icon: 'seal',
      color: 'var(--accent)',
      title: 'Compte certifié',
      text: 'Pour les comptes certifiés.'
    },
    {
      icon: 'shield',
      color: '#8d70ff',
      title: 'Équipe Hangar',
      text: "Pour les membres de l'équipe de Hangar."
    },
    {
      icon: 'flask',
      color: '#22b8a6',
      title: 'Testeur',
      text: 'Pour ceux qui testent Hangar avant tout le monde.'
    },
    {
      icon: 'bug',
      color: '#3fb950',
      title: 'Chasseur de bugs',
      text: 'Pour ceux dont les signalements ont amélioré Hangar.'
    }
  ];
</script>

<section class="pitch" aria-labelledby="pitch-title">
  <p class="kicker"><span class="new">Nouveau</span>Badges du profil</p>
  <h3 id="pitch-title">Ton profil a ses badges</h3>
  <p class="lead">
    Ton ancienneté, ta collection, tes heures de jeu : des badges s'affichent maintenant à côté de ton pseudo, sur
    ton profil Hangar et chez tes amis.
  </p>
  <ul class="list">
    {#each badges as b, i (b.title)}
      <li style:animation-delay="{0.15 + i * 0.05}s">
        <span class="ico" style:color={b.color} style:--c={b.color || gold.colors[1]}>
          {#if b.icon === 'arch'}
            <ArchEmblem tier={gold} size={22} />
          {:else}
            <BadgeIcon icon={b.icon} size={22} />
          {/if}
        </span>
        <span class="txt"><strong>{b.title}</strong><span>{b.text}</span></span>
      </li>
    {/each}
  </ul>
  <p class="note">
    <Icon name="eyeOff" size={13} />
    Avec un compte Hangar. Les badges de collection, de temps de jeu et de launchers suivent ta confidentialité.
  </p>
</section>

<style>
  .pitch {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .kicker {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-text);
    animation: hgRise 0.45s var(--ease) both;
  }

  .new {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    box-shadow: 0 0 18px var(--accent-glow);
  }

  h3 {
    font-size: 24px;
    font-weight: 750;
    letter-spacing: -0.5px;
    line-height: 1.15;
    color: var(--strong);
    animation: hgRise 0.5s 0.05s var(--ease) both;
  }

  .lead {
    color: var(--text-2);
    line-height: 1.5;
    font-size: 14px;
    animation: hgRise 0.5s 0.1s var(--ease) both;
  }

  .list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 11px;
    border-radius: 14px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    animation: hgRise 0.5s var(--ease) both;
    transition:
      border-color 0.2s,
      transform 0.2s var(--ease);
  }

  .list li:hover {
    border-color: color-mix(in srgb, var(--c, var(--accent)) 55%, transparent);
    transform: translateY(-2px);
  }

  .ico {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: color-mix(in srgb, var(--c) 16%, transparent);
  }

  .txt {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-3);
  }

  .txt strong {
    font-size: 13px;
    font-weight: 650;
    color: var(--text);
  }

  .note {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.4;
  }

  .note :global(svg) {
    flex-shrink: 0;
  }

  @media (max-width: 560px) {
    .list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pitch *,
    .list li {
      animation: none !important;
      transition: none;
    }
  }
</style>
