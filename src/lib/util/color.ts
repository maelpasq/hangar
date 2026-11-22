// Jaquette générée : dégradé stable calculé à partir d'un hash du texte.

export function hue(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

/** Teinte dominante d'une icône d'exe : [teinte 0-359, saturation 0-100] (backend `icon_tint`). */
export type Tint = [number, number];

/** Icône d'exe : image affichable et teinte dominante (dégradé de la jaquette générée). */
export interface ExeIcon {
  src: string;
  tint: Tint | null;
}

/**
 * Dégradé de la jaquette générée : d'après la teinte du logo du jeu quand elle est connue (même
 * famille de couleurs, du clair au sombre), sinon une teinte stable tirée du texte.
 */
export function generatedBackground(seed: string, tint?: Tint | null): string {
  if (tint) {
    const [h, s] = tint;
    const sat = Math.max(0, Math.min(75, s));
    return `linear-gradient(160deg, hsl(${h} ${sat}% 50%), hsl(${(h + 15) % 360} ${Math.round(sat * 0.9)}% 28%) 65%, hsl(${(h + 30) % 360} ${Math.round(sat * 0.75)}% 12%))`;
  }
  const h = hue(seed);
  return `linear-gradient(160deg, hsl(${h} 75% 50%), hsl(${(h + 45) % 360} 70% 28%) 65%, hsl(${(h + 80) % 360} 60% 12%))`;
}
