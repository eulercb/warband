import type { Vec2 } from '../../engine/core/types';
import { sub } from '../../engine/core/torus';

export interface AnimalMotion {
  pos: Vec2;
  now: number;
  distance: number;
  stride: number;
}

export function advanceAnimalMotion(
  previous: AnimalMotion | undefined,
  pos: Vec2,
  now: number,
): AnimalMotion {
  if (!previous) return { pos: { ...pos }, now, distance: 0, stride: 0 };
  const delta = sub(pos, previous.pos);
  const step = Math.hypot(delta.x, delta.y);
  const dt = Math.max(1, now - previous.now);
  // A teleport or a missing render span starts a new stance.
  if (step > 66 || dt > 180) return { pos: { ...pos }, now, distance: 0, stride: 0 };
  const weight = 1 - Math.exp(-dt / 70);
  const target = Math.min(1, (step * 8) / dt);
  return {
    pos: { ...pos },
    now,
    distance: previous.distance + step,
    stride: previous.stride + (target - previous.stride) * weight,
  };
}

export function animalPaw(motion: AnimalMotion | undefined, phase: number, cycle: number): number {
  if (!motion) return 0;
  return Math.sin((motion.distance * Math.PI * 2) / cycle + phase) * motion.stride;
}
