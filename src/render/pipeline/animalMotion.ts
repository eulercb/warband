import type { Vec2 } from '../../engine/core/types';
import { sub } from '../../engine/core/torus';

export interface AnimalMotion {
  pos: Vec2;
  now: number;
  facing: number;
  travel: number;
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
  if (!previous)
    return { pos: { ...pos }, now, facing, travel: facing, stride: 0, speed: 0, phase: 0 };
  const delta = sub(pos, previous.pos);
  const step = Math.hypot(delta.x, delta.y);
  const dt = Math.max(1, now - previous.now);
  // A teleport or a missing render span starts a new stance.
  if (step > 66 || dt > 180)
    return { pos: { ...pos }, now, facing, travel: facing, stride: 0, speed: 0, phase: 0 };
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
    travel: step > 0.05 ? Math.atan2(delta.y, delta.x) : previous.travel,
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

/** The airborne half reaches along travel. The planted half sweeps against it. */
export function animalFoot(phase: number, travel: number, facing: number, reach: number) {
  const along = -Math.cos(phase) * reach;
  const angle = travel - facing;
  return {
    x: Math.cos(angle) * along,
    y: Math.sin(angle) * along,
    lift: Math.max(0, Math.sin(phase)),
  };
}

export const MOON_BASIC_POSE_MS = 680;

export function moonBasicPose(castAge: number, swipeAge: number) {
  const ramp = (value: number, from: number, to: number) =>
    Math.max(0, Math.min(1, (value - from) / (to - from)));
  const cast = ramp(castAge, 0, 82) * (1 - ramp(castAge, 116, 211));
  const swing = ramp(swipeAge, 14, 192);
  const sweep = 1 - ramp(swipeAge, 205, 420);
  return { cast, swing, sweep };
}
