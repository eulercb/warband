import type { Vec2 } from '../../engine/core/types';
import { sub } from '../../engine/core/torus';

export interface AnimalMotion {
  pos: Vec2;
  now: number;
  facing: number;
  stride: number;
  speed: number;
  phase: number;
}

export function advanceAnimalMotion(
  previous: AnimalMotion | undefined,
  pos: Vec2,
  now: number,
  facing: number,
): AnimalMotion {
  if (!previous) return { pos: { ...pos }, now, facing, stride: 0, speed: 0, phase: 0 };
  const delta = sub(pos, previous.pos);
  const step = Math.hypot(delta.x, delta.y);
  const dt = Math.max(1, now - previous.now);
  // A teleport or a missing render span starts a new stance.
  if (step > 66 || dt > 180) return { pos: { ...pos }, now, facing, stride: 0, speed: 0, phase: 0 };
  const weight = 1 - Math.exp(-dt / 70);
  const speed = previous.speed + (Math.min(900, (step * 1000) / dt) - previous.speed) * weight;
  const target = Math.min(1, speed / 125);
  // Blend walk into a bound without jumping between two phases. Cap cadence
  // when an attack closes a large gap or snapshots arrive in uneven bursts.
  const hz = Math.min(speed / 92, 3.35);

  return {
    pos: { ...pos },
    now,
    facing: blendAnimalFacing(previous.facing, facing, 1 - Math.exp(-dt / 45)),
    speed,
    phase: (previous.phase + (hz * dt * Math.PI * 2) / 1000) % (Math.PI * 2),
    stride: previous.stride + (target - previous.stride) * weight,
  };
}

export function blendAnimalFacing(from: number, to: number, weight: number): number {
  const delta = to - from;
  return from + Math.atan2(Math.sin(delta), Math.cos(delta)) * weight;
}

export interface AnimalStrike {
  angle: number;
  started: number;
}

export function strikeProgress(strike: AnimalStrike | undefined, now: number, duration: number) {
  return strike ? Math.min(1, Math.max(0, (now - strike.started) / duration)) : 1;
}
