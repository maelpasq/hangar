<script lang="ts">
  // Illustration animée de la vitrine « compte et amis » (fenêtre des nouveautés) : le logo au
  // centre, des amis en orbite reliés par des flux, leurs statuts et quelques messages.
  // Personnages inventés, aucun compte réel. Tout est décoratif (aria-hidden).
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';

  // Repère de 600 x 220 (même rapport que le bandeau).
  const W = 600;
  const H = 220;
  const C = { x: 300, y: 104 };

  type Friend = { x: number; y: number; name: string; hue: string; state: 'game' | 'online' | 'offline'; size: number };
  const friends: Friend[] = [
    { x: 116, y: 66, name: 'Nova', hue: 'linear-gradient(135deg, #a855f7, #ec4899)', state: 'game', size: 46 },
    { x: 162, y: 168, name: 'Kenji', hue: 'linear-gradient(135deg, #14b8a6, #0ea5e9)', state: 'online', size: 40 },
    { x: 486, y: 62, name: 'Lou', hue: 'linear-gradient(135deg, #f59e0b, #ef4444)', state: 'game', size: 46 },
    { x: 452, y: 170, name: 'Sam', hue: 'linear-gradient(135deg, #6366f1, #22d3ee)', state: 'online', size: 40 },
    { x: 38, y: 132, name: 'Iris', hue: 'linear-gradient(135deg, #64748b, #94a3b8)', state: 'offline', size: 30 },
    { x: 566, y: 128, name: 'Max', hue: 'linear-gradient(135deg, #22c55e, #84cc16)', state: 'offline', size: 30 }
  ];

  // Courbe douce du centre vers chaque ami.
  const path = (f: Friend) => `M${C.x},${C.y} Q${(C.x + f.x) / 2},${f.y < C.y ? C.y - 46 : C.y + 46} ${f.x},${f.y}`;

  const stars = [
    [24, 22], [72, 190], [204, 18], [252, 196], [348, 14], [392, 204], [540, 20], [586, 196], [12, 84], [588, 70], [236, 120], [366, 82]
  ];

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
</script>

<div class="art on-dark" aria-hidden="true">
  <div class="glow"></div>
  <div class="aurora"></div>

  {#each stars as [x, y], i (i)}
    <span class="star" style:left={pct(x, W)} style:top={pct(y, H)} style:animation-delay="{(i * 0.37) % 3}s"></span>
  {/each}

  <svg class="links" viewBox="0 0 {W} {H}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="sa-line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.15" />
        <stop offset="0.5" stop-color="var(--accent)" stop-opacity="0.75" />
        <stop offset="1" stop-color="var(--accent)" stop-opacity="0.15" />
      </linearGradient>
    </defs>
    {#each friends as f, i (f.name)}
      <path
        id="sa-p{i}"
        class="link"
        class:dim={f.state === 'offline'}
        d={path(f)}
        style:animation-delay="{0.2 + i * 0.08}s, 0s"
      />
      {#if f.state !== 'offline'}
        <circle class="pkt" r="2.6">
          <animateMotion
            dur="{2.4 + i * 0.3}s"
            begin="{0.9 + i * 0.45}s"
            repeatCount="indefinite"
            keyPoints={i % 2 ? '0;1' : '1;0'}
            keyTimes="0;1"
            calcMode="linear"
          >
            <mpath href="#sa-p{i}" />
          </animateMotion>
        </circle>
      {/if}
    {/each}
  </svg>

  <div class="core" style:left={pct(C.x, W)} style:top={pct(C.y, H)}>
    <span class="ring"></span>
    <span class="ring r2"></span>
    <span class="ring r3"></span>
    <span class="disc"><Logo size={46} /></span>
  </div>

  {#each friends as f, i (f.name)}
    <span
      class="friend {f.state}"
      style:left={pct(f.x, W)}
      style:top={pct(f.y, H)}
      style:--s="{f.size}px"
      style:animation-delay="{0.25 + i * 0.09}s"
    >
      <span class="av" style:background={f.hue}>{f.name.charAt(0)}</span>
      <span class="dot"></span>
      {#if f.state === 'game'}<span class="pad"><Icon name="gamepad" size={10} /></span>{/if}
    </span>
  {/each}

  <span class="bubble left" style:left={pct(60, W)} style:top={pct(10, H)} style:animation-delay="1.2s">GG !</span>
  <span class="bubble" style:left={pct(436, W)} style:top={pct(8, H)} style:animation-delay="3.4s">On lance une partie ?</span>
  <span class="tag" style:left={pct(486, W)} style:top={pct(98, H)}>En jeu</span>

  <span class="sync" style:left={pct(C.x, W)} style:top={pct(190, H)}>
    <span class="spin-ico"><Icon name="refresh" size={11} /></span>
    Synchronisé sur tes PC
  </span>
</div>

<style>
  .art {
    position: relative;
    flex-shrink: 0;
    aspect-ratio: 600 / 220;
    overflow: hidden;
    background: linear-gradient(180deg, #15131f 0%, #0c0d13 100%);
    border-bottom: 1px solid var(--border-2);
    isolation: isolate;
  }

  .glow {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 47%, color-mix(in srgb, var(--accent) 42%, transparent) 0%, transparent 34%),
      radial-gradient(ellipse at 50% 120%, color-mix(in srgb, var(--accent) 30%, transparent) 0%, transparent 60%);
    animation: saBreath 5s ease-in-out infinite;
  }

  .aurora {
    position: absolute;
    left: 50%;
    top: 47%;
    width: 420px;
    height: 420px;
    margin: -210px 0 0 -210px;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      transparent 0deg,
      color-mix(in srgb, var(--accent) 22%, transparent) 60deg,
      transparent 140deg,
      color-mix(in srgb, #ec4899 14%, transparent) 220deg,
      transparent 300deg
    );
    filter: blur(28px);
    animation: hgSpin 18s linear infinite;
    z-index: -1;
  }

  .star {
    position: absolute;
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: #fff;
    opacity: 0.25;
    animation: saTwinkle 3s ease-in-out infinite;
  }

  .links {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .link {
    fill: none;
    stroke: url(#sa-line);
    stroke-width: 1.4;
    stroke-dasharray: 3 6;
    opacity: 0;
    animation:
      hgFade 0.6s var(--ease) forwards,
      saFlow 1.6s linear infinite;
  }

  .link.dim {
    stroke: rgb(255 255 255 / 0.12);
  }

  .pkt {
    fill: #fff;
    filter: drop-shadow(0 0 4px var(--accent));
  }

  .core {
    position: absolute;
    width: 0;
    height: 0;
  }

  .disc {
    position: absolute;
    left: -38px;
    top: -38px;
    width: 76px;
    height: 76px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 35%, #232233, #12121a);
    border: 1px solid rgb(255 255 255 / 0.14);
    box-shadow:
      0 0 0 6px rgb(255 255 255 / 0.03),
      0 0 40px var(--accent-glow);
    animation: hgPopIn 0.5s var(--ease-pop) both;
  }

  .ring {
    position: absolute;
    left: -38px;
    top: -38px;
    width: 76px;
    height: 76px;
    border-radius: 50%;
    border: 1.5px solid var(--accent);
    opacity: 0;
    animation: saRing 3.6s var(--ease) infinite;
  }

  .ring.r2 {
    animation-delay: 1.2s;
  }

  .ring.r3 {
    animation-delay: 2.4s;
  }

  .friend {
    position: absolute;
    width: var(--s);
    height: var(--s);
    margin: calc(var(--s) / -2) 0 0 calc(var(--s) / -2);
    animation: saPop 0.55s var(--ease-pop) both;
  }

  .friend .av {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 2px solid #14161d;
    box-shadow: 0 8px 22px rgb(0 0 0 / 0.45);
    color: #fff;
    font-weight: 700;
    font-size: calc(var(--s) * 0.4);
    animation: hgFloat 5s ease-in-out infinite;
  }

  .friend:nth-of-type(odd) .av {
    animation-duration: 6s;
    animation-delay: -2s;
  }

  .friend.offline {
    opacity: 0.55;
  }

  .dot {
    position: absolute;
    right: 0;
    bottom: 0;
    width: calc(var(--s) * 0.28);
    height: calc(var(--s) * 0.28);
    border-radius: 50%;
    border: 2px solid #14161d;
    background: #6b7080;
  }

  .online .dot,
  .game .dot {
    background: var(--success);
  }

  .game .dot::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    border: 2px solid var(--success);
    animation: saPing 1.8s var(--ease) infinite;
  }

  .pad {
    position: absolute;
    left: -6px;
    top: -6px;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    border: 2px solid #14161d;
  }

  .bubble {
    position: absolute;
    padding: 5px 10px;
    border-radius: 12px 12px 12px 4px;
    background: rgb(255 255 255 / 0.94);
    color: #14161d;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 10px 24px rgb(0 0 0 / 0.35);
    transform-origin: 0% 100%;
    opacity: 0;
    animation: saBubble 6s var(--ease) infinite;
  }

  .bubble.left {
    border-radius: 12px 12px 4px 12px;
    transform-origin: 100% 100%;
  }

  .tag {
    position: absolute;
    transform: translateX(-50%);
    padding: 2px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--success) 18%, #0c0d13);
    border: 1px solid color-mix(in srgb, var(--success) 45%, transparent);
    color: var(--success-text);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    animation: hgFade 0.5s 0.9s both;
  }

  .sync {
    position: absolute;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.06);
    border: 1px solid rgb(255 255 255 / 0.1);
    backdrop-filter: blur(6px);
    color: var(--text-2);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    animation: hgFade 0.5s 0.7s both;
  }

  .spin-ico {
    display: grid;
    color: var(--accent-text);
    animation: hgSpin 2.4s linear infinite;
  }

  @keyframes saFlow {
    to {
      stroke-dashoffset: -18;
    }
  }

  @keyframes saRing {
    0% {
      opacity: 0.55;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(2.6);
    }
  }

  @keyframes saPop {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes saPing {
    0% {
      opacity: 0.8;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(2.2);
    }
  }

  @keyframes saBubble {
    0% {
      opacity: 0;
      transform: scale(0.5) translateY(6px);
    }
    8%,
    58% {
      opacity: 1;
      transform: none;
    }
    68%,
    100% {
      opacity: 0;
      transform: scale(0.9) translateY(-4px);
    }
  }

  @keyframes saTwinkle {
    0%,
    100% {
      opacity: 0.15;
    }
    50% {
      opacity: 0.7;
    }
  }

  @keyframes saBreath {
    0%,
    100% {
      opacity: 0.85;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .art *,
    .art::before,
    .art::after {
      animation: none !important;
    }

    .link,
    .bubble {
      opacity: 1;
    }

    .pkt {
      display: none;
    }
  }
</style>
