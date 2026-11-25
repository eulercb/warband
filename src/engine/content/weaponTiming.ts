import type { BladeAreaStyle } from '../core/types';

export function weaponWindup(style: BladeAreaStyle | 'arcaneBolt' | undefined): number {
  switch (style) {
    case 'axeSwing':
      return 0.12;
    case 'cleave':
    case 'holyStrike':
    case 'bardFlourish':
    case 'savageBite':
      return 0.075;
    default:
      return 0;
  }
}
