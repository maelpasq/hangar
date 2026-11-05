// Lecture d'une manette « standard » : boutons et stick gauche vers des actions.

export type PadAction = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'start';

/** Disposition « standard » (Xbox, PlayStation, Switch Pro sous Chromium et WebKit). */
const BUTTONS: [number, PadAction][] = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
  [0, 'a'],
  [1, 'b'],
  [2, 'x'],
  [3, 'y'],
  [4, 'lb'],
  [5, 'rb'],
  [9, 'start']
];
export const REPEATS = new Set<PadAction>(['up', 'down', 'left', 'right']);
const DEAD_ZONE = 0.5;

/** Actions enfoncées sur une manette (croix + stick gauche). */
export function pressed(pad: Pick<Gamepad, 'buttons' | 'axes'>): Set<PadAction> {
  const out = new Set<PadAction>();
  for (const [i, a] of BUTTONS) if (pad.buttons[i]?.pressed) out.add(a);
  const [x = 0, y = 0] = pad.axes;
  if (x < -DEAD_ZONE) out.add('left');
  if (x > DEAD_ZONE) out.add('right');
  if (y < -DEAD_ZONE) out.add('up');
  if (y > DEAD_ZONE) out.add('down');
  return out;
}
