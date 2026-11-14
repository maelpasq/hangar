// Mode manette : ce qui peut déjà utiliser le bouton central de la manette (Xbox, PS, Home)
// et passer devant Hangar, selon le système et la manette. Affiché dans les Paramètres et
// dans la fenêtre qui s'ouvre quand on active le mode manette.

import { isLinux, isMac } from './util/platform';

export interface PadTip {
  id: 'gamebar' | 'steam' | 'playstation' | 'others' | 'handheld' | 'macos' | 'focus';
  /** Manette ou logiciel concerné. */
  title: string;
  text: string;
  /** Page de réglages ouvrable depuis Hangar. */
  link?: 'gamebar-settings';
}

/** Le bouton ramène Hangar depuis une autre app (Windows : manettes vues comme Xbox). */
export const padFromAnywhere = !isMac && !isLinux;

export function padTips(): PadTip[] {
  const steam: PadTip = {
    id: 'steam',
    title: 'Steam, avec toutes les manettes',
    text: "Quand Steam est ouvert, il peut prendre le bouton central (Xbox, PS, Home) et ouvrir Big Picture par-dessus Hangar. Dans Steam > Paramètres > Manette, désactive l'option qui met Steam au premier plan avec le bouton Guide."
  };
  if (isMac)
    return [
      {
        id: 'macos',
        title: 'macOS, bouton Home',
        text: "Le bouton Home de la manette peut ouvrir Launchpad ou l'app Jeux en même temps. Change son action dans Réglages Système > Manettes de jeu, pour ta manette."
      },
      steam,
      {
        id: 'focus',
        title: "Hangar à l'écran",
        text: "Sur Mac, Hangar lit le bouton quand sa fenêtre est devant. Depuis un jeu, passe d'abord sur Hangar."
      }
    ];
  if (isLinux)
    return [
      steam,
      {
        id: 'focus',
        title: "Hangar à l'écran",
        text: "Sous Linux, Hangar lit le bouton quand sa fenêtre est devant. Depuis un jeu, passe d'abord sur Hangar."
      }
    ];
  return [
    {
      id: 'gamebar',
      title: 'Xbox : Game Bar de Windows',
      text: "Par défaut, le bouton Xbox ouvre aussi la Game Bar, qui s'affiche par-dessus Hangar. Dans Paramètres Windows > Jeux > Game Bar, désactive l'ouverture de la Game Bar avec la manette.",
      link: 'gamebar-settings'
    },
    steam,
    {
      id: 'playstation',
      title: 'PlayStation (DualSense, DualShock 4)',
      text: "Windows ne transmet le bouton PS aux autres apps que si la manette passe par Steam Input ou DS4Windows (émulation Xbox). Sans eux, il marche seulement quand Hangar est devant. Avec DS4Windows, le bouton PS ouvre aussi la Game Bar : même réglage que pour Xbox."
    },
    {
      id: 'others',
      title: 'Switch Pro, 8BitDo et autres',
      text: "En mode X-input (Xbox), elles se comportent comme une manette Xbox : même réglage de la Game Bar. Dans les autres modes, le bouton Home marche quand Hangar est devant, ou partout avec Steam Input."
    },
    {
      id: 'handheld',
      title: 'PC portables (ROG Ally, Legion Go, Claw...)',
      text: "La manette intégrée est vue comme une manette Xbox : désactive la Game Bar pour la manette, et vérifie que le logiciel du fabricant (Armoury Crate, Legion Space...) n'utilise pas le même bouton."
    }
  ];
}

/** Rappel court sous la case « Activer le mode manette ». */
export const padNote = isMac
  ? "Pense à changer l'action du bouton Home dans Réglages Système > Manettes de jeu, et dans Steam s'il est ouvert."
  : isLinux
    ? "Pense à désactiver le bouton Guide dans Steam s'il est ouvert, sinon Steam passe devant Hangar."
    : "Pense à désactiver la Game Bar pour la manette (et le bouton Guide dans Steam), sinon elle s'ouvre par-dessus Hangar.";
