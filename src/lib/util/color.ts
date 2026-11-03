// Jaquette générée : dégradé stable calculé à partir d'un hash du texte.

export function hue(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function generatedBackground(seed: string): string {
  const h = hue(seed);
  return `linear-gradient(160deg, hsl(${h} 75% 50%), hsl(${(h + 45) % 360} 70% 28%) 65%, hsl(${(h + 80) % 360} 60% 12%))`;
}
