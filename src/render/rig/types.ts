/**
 * Warband — rig data model.
 *
 * A `RigSpec` is PLAIN, IMMUTABLE data describing a creature/humanoid skeleton
 * as simple shaded shapes plus limb parameters. All dimensions are multiples of
 * the entity's base radius R (so a spec is camera-scale independent and built
 * once); the runtime multiplies by `R = baseRadius * cameraScale` at draw time.
 *
 * Local part coordinates use body-local axes: **x = forward** (the facing/aim
 * direction), **y = lateral**. Angles in `baseAngleDeg` are relative to the
 * body's orientation. Per-frame mutable state (planted feet, step phases, chain
 * points, smoothed velocity) lives on the `CreatureRig` instance, never here.
 */
import type { Vec2 } from './math/vec';
import type { GaitParams } from './math/gait';
import type { BossActionKind, PlayerState, AbilitySlot } from '../../engine/core/types';

export type RigId =
  | 'spider'
  | 'serpent'
  | 'kraken'
  | 'treant'
  | 'insectoid'
  | 'humanoid'
  | 'beast'
  | 'blob'
  | 'golem'
  | 'gem'
  | 'eye'
  | 'dragon';

/** Painter bucket: parts sort back → front as behind → main → front. */
export type PartZ = 'behind' | 'main' | 'front';

/** A shaded ellipse body part (drawn as a tinted sphere sprite). */
export interface BodyPartSpec {
  id: string;
  local: Vec2; // offset from rig origin, body-local (x = forward, y = lateral), × R
  rx: number; // radius along local x, × R
  ry: number; // radius along local y, × R
  z: PartZ;
  /** 'base' (default) tints with the entity colour; a number is an explicit accent. */
  tint?: 'base' | number;
  /**
   * Optional anchor for a decorative dress-up part: when set, `local` is measured
   * from the named part's centre instead of the rig origin, so a hood/hat/plume
   * rides the head and a pauldron rides the torso. Absent = rig-origin relative.
   */
  parent?: 'head' | 'torso';
}

/** A group of `count` IK legs with a shared stepping gait. */
export interface LegGroupSpec {
  count: number;
  anchorPart: string; // part id whose centre legs attach to
  baseAngleDeg: (i: number) => number; // relative to the leg orientation axis
  attachDist: number; // shoulder distance from the anchor, × R
  homeDist: (i: number) => number; // rest foot distance, × R
  l1: number; // upper bone length, × R
  l2: number; // lower bone length, × R
  liftHeight: number; // draw-time vertical pop during a step, × R
  legWidthRoot: number; // × R
  legWidthTip: number; // × R
  /** Gait tuning. `stepDistance` / `overstep` are in R units (scaled at runtime). */
  gait: Omit<GaitParams, 'partnerOf' | 'jitter'> & { partnerStride: number };
  bendOutward: boolean; // true = knees splay from the body centre; false = biped bias
  around: 'facing' | 'velocity'; // orient legs by facing (creatures) or travel dir (biped)
}

/** A distance-constrained tail/body (serpent). */
export interface SpineSpec {
  segments: number;
  spacing: number; // × R
  ease: number; // < 1 = sinuous lag
  rx: number; // head-end segment radius, × R
  ry: number; // head-end segment radius, × R
  taper: number; // 0..1 fraction the tail end shrinks to
  sinAmp: number; // lateral slither amplitude, × R
  sinFreq: number; // slither temporal frequency
}

/** A curling limb radiating from a part (kraken arm / treant branch). */
export interface TentacleSpec {
  anchorPart: string;
  baseAngleDeg: number; // radiating direction, relative to facing
  segments: number;
  segLen: number; // × R
  width: number; // root width, × R
  sinAmp: number; // idle curl amplitude (radians per segment)
  sinFreq: number;
  phase: number; // temporal phase offset
  z?: PartZ; // painter bucket (default 'behind')
  reach?: 'telegraph'; // bias toward the telegraph point during a windup
}

/** A small procedural detail drawn on top of a part. */
export interface DecorSpec {
  kind: 'eyes' | 'marking' | 'horn' | 'mandible' | 'ring';
  anchorPart: string;
  local: Vec2; // offset on the anchor part, body-local, × R
  scale: number; // × R
  color?: number;
  count?: number; // eyes/horns: how many
  /** `ring` only — stroke width, × R (default 0.1). Draws an UNFILLED ring (halo,
   *  pauldron rim, robe/vestment trim). */
  ringWidth?: number;
  /** `ring` only — add a soft outer glow (a lit halo). */
  glow?: boolean;
}

/** One humanoid arm (2-bone IK from a shoulder to the grip). */
export interface ArmSpec {
  side: 1 | -1; // +1 = one side, -1 = the other (front / back hand)
  l1: number; // × R
  l2: number; // × R
  shoulderLocal: Vec2; // shoulder offset, body-local, × R
  grip: number; // grip distance ahead of the body centre, × R
  bendOutward: boolean;
  width: number; // arm stroke width at the shoulder, × R
}

export type WeaponKind = 'sword' | 'bow' | 'staff' | 'mace' | 'axe' | 'dagger' | 'shield' | 'claws';

export interface WeaponSpec {
  kind: WeaponKind;
  length: number; // × R
  color: number;
  /** melee = forward thrust on cast; ranged = pull-back then release. */
  style: 'melee' | 'ranged';
  offhand?: WeaponKind; // e.g. paladin shield, rogue second dagger
  /** Optional decorative trim colour — a shield boss stud, a mace haft band. */
  accent?: number;
}

export interface RigSpec {
  id: RigId;
  parts: BodyPartSpec[];
  legs?: LegGroupSpec;
  spine?: SpineSpec;
  tentacles?: TentacleSpec[];
  decor?: DecorSpec[];
  arms?: ArmSpec[]; // humanoid
  weapon?: WeaponSpec; // humanoid
  /** Subtle idle body-scale breathing. */
  idle?: { breatheAmp: number; breatheFreq: number };
}

/**
 * Per-frame presentation signals the runtime reads to pose the rig. Assembled by
 * the `RigLayer` from the entity view (+ FX). Everything optional so a minimal
 * caller (or a test) can drive a rig with just a colour.
 */
export interface RigDriveCtx {
  color: number; // entity tint (class / monster colour)
  flash: number; // 0..1 hit-flash toward white
  enraged: boolean;
  // Boss
  action?: BossActionKind;
  telegraphT?: number; // 0..1 windup progress (from the telegraph fill)
  // Player
  state?: PlayerState;
  castSlot?: AbilitySlot | null;
  castT?: number; // 0..1 rooted-cast progress
  aim?: Vec2; // aim unit vector (humanoid torso/arms)
  /** Seconds since the fight was WON — drives the procedural victory dance
   * (body hops, weapon pumps). Absent/undefined = not celebrating. */
  cheer?: number;
}
