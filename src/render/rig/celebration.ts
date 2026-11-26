import type { ClassId } from '../../engine/core/types';

type Rhythm = readonly [
  rate: number,
  turn: number,
  hop: number,
  left: number,
  right: number,
  offset: number,
];

const RHYTHMS: Record<ClassId, Rhythm> = {
  knight: [4, 0.12, 0.08, 0.92, 0.55, 0.3],
  ranger: [5, 0.42, 0.31, 0.45, 0.88, 0.8],
  mage: [3, 0.34, 0.06, 1.02, 0.67, 1.6],
  cleric: [2.3, 0.05, 0.02, 0.84, 0.78, 0],
  barbarian: [5.5, 0.29, 0.32, 1.08, 1.08, 0],
  rogue: [6.8, 0.62, 0.18, 0.78, 0.75, Math.PI],
  paladin: [2.7, 0.14, 0.04, 0.44, 1.14, 0.2],
  druid: [3.2, 0.61, 0.14, 0.93, 0.36, 1.6],
  bard: [7.2, 0.64, 0.19, 0.12, 0.28, Math.PI],
  monk: [4.6, 0.24, 0.09, 0.74, 0.74, Math.PI],
  sorcerer: [3.8, 0.8, 0.18, 0.97, 0.54, 2.2],
  warlock: [2.6, 0.22, 0.045, 0.95, 0.32, 0.5],
};

export interface CelebrationPose {
  turn: number;
  lift: number;
  left: number;
  right: number;
}

export function celebrationPose(classId: ClassId, elapsed: number): CelebrationPose {
  const [rate, turn, hop, left, right, offset] = RHYTHMS[classId];
  const phase = elapsed * rate;
  const entry = Math.min(1, elapsed / 0.18);
  const beat = (angle: number) => (1 - Math.cos(angle)) / 2;
  return {
    turn: Math.sin(phase * 0.63) * turn * entry,
    lift: beat(phase) * hop * entry,
    left: beat(phase) * left * entry,
    right: beat(phase + offset) * right * entry,
  };
}
