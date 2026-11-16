<script lang="ts">
  // Vitrine « compte et amis » de la fenêtre des nouveautés : accroche et ce que le compte apporte.
  import Icon, { type IconName } from './Icon.svelte';

  const perks: { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'refresh',
      title: 'Ta bibliothèque partout',
      text: 'Favoris, collections, jaquettes, jeux masqués et réglages te suivent sur tous tes PC.'
    },
    {
      icon: 'users',
      title: 'Tes amis dans Hangar',
      text: 'Ajoute-les par pseudo ou code ami, et vois en direct qui est en ligne et à quoi il joue.'
    },
    {
      icon: 'chat',
      title: 'Discussion en direct',
      text: 'Écris à tes amis et invite-les sur un jeu, sans quitter Hangar.'
    },
    {
      icon: 'user',
      title: 'Ton profil',
      text: 'Pseudo, avatar, jeux favoris et temps de jeu cumulé sur tous tes postes.'
    }
  ];
</script>

<section class="pitch" aria-labelledby="pitch-title">
  <p class="kicker"><span class="new">Nouveau</span>Compte Hangar</p>
  <h3 id="pitch-title">Hangar devient social</h3>
  <p class="lead">
    Crée ton compte Hangar gratuit : ta bibliothèque te suit d'un PC à l'autre, et tes amis te rejoignent dans
    Hangar.
  </p>
  <ul class="perks">
    {#each perks as p, i (p.title)}
      <li style:animation-delay="{0.15 + i * 0.07}s">
        <span class="ico"><Icon name={p.icon} size={17} /></span>
        <span class="txt"><strong>{p.title}</strong><span>{p.text}</span></span>
      </li>
    {/each}
  </ul>
  <p class="note">
    <Icon name="eyeOff" size={13} />
    Facultatif : sans compte, Hangar reste 100 % local, comme avant. Tu choisis ce que tes amis voient.
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

  .perks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
  }

  .perks li {
    display: flex;
    gap: 11px;
    padding: 12px;
    border-radius: 14px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    animation: hgRise 0.5s var(--ease) both;
    transition:
      border-color 0.2s,
      transform 0.2s var(--ease);
  }

  .perks li:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    transform: translateY(-2px);
  }

  .ico {
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .txt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-3);
  }

  .txt strong {
    font-size: 13.5px;
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
    .perks {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pitch *,
    .perks li {
      animation: none !important;
      transition: none;
    }
  }
</style>
