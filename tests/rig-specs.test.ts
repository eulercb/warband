/**
 * Warband — rig spec-builder + registry unit tests (render/rig).
 *
 * The rig specs are PURE, immutable data (no Pixi/DOM): each `build*Spec()`
 * returns a `RigSpec` of shaded ellipse parts plus optional limb/detail groups,
 * all in base-radius (× R) units. These tests pin:
 *   - generic structural invariants every spec must hold (named parts, positive
 *     segment lengths, valid hex colours, in-range enums, no NaN/Infinity, and
 *     mirror-symmetric limbs where the creature is bilaterally symmetric); and
 *   - the exact per-spec numbers copied from each source module; and
 *   - the registry resolution: `bossRigId` / `classRigId` / `addRigId`, the
 *     `*UsesRig` predicates, and the cached `bossRigSpec` / `classRigSpec`
 *     (including the documented `null` fallback for unmapped silhouettes).
 *
 * Expectations are derived directly from the source, not guessed.
 */
import { describe, it, expect } from 'vitest';

import { buildSpiderSpec } from '../src/render/rig/specs/spider';
import { buildSerpentSpec } from '../src/render/rig/specs/serpent';
import { buildKrakenSpec } from '../src/render/rig/specs/kraken';
import { buildTreantSpec } from '../src/render/rig/specs/treant';
import { buildInsectoidSpec } from '../src/render/rig/specs/insectoid';
import { buildHumanoidSpec, buildBossHumanoidSpec } from '../src/render/rig/specs/humanoid';
import { buildBeastSpec } from '../src/render/rig/specs/beast';
import { buildBlobSpec } from '../src/render/rig/specs/blob';
import { buildGolemSpec } from '../src/render/rig/specs/golem';
import { buildGemSpec } from '../src/render/rig/specs/gem';
import { buildEyeSpec } from '../src/render/rig/specs/eye';
import { buildDragonSpec } from '../src/render/rig/specs/dragon';
import {
  RIG_FLAGS,
  bossRigId,
  classRigId,
  addRigId,
  bossUsesRig,
  playerUsesRig,
  addUsesRig,
  bossRigSpec,
  classRigSpec,
} from '../src/render/rig/registry';
import type {
  RigSpec,
  RigId,
  BodyPartSpec,
  LegGroupSpec,
  SpineSpec,
  TentacleSpec,
  DecorSpec,
  ArmSpec,
  WeaponSpec,
} from '../src/render/rig/types';
import { MONSTERS, getMonster } from '../src/engine/content/monsters';
import { CLASS_COLORS } from '../src/engine/core/constants';
import type {
  ClassId,
  MonsterId,
  BossBodyShape,
  BossView,
  PlayerView,
  AddView,
  PlayerState,
} from '../src/engine/core/types';

// ---------------------------------------------------------------------------
// Reference tables (mirror the type unions / source enums)
// ---------------------------------------------------------------------------

const ALL_CLASS_IDS: ClassId[] = [
  'knight',
  'ranger',
  'mage',
  'cleric',
  'barbarian',
  'rogue',
  'paladin',
  'druid',
];

const ALL_MONSTER_IDS = Object.keys(MONSTERS) as MonsterId[];

const RIG_IDS: RigId[] = [
  'spider',
  'serpent',
  'kraken',
  'treant',
  'insectoid',
  'humanoid',
  'beast',
  'blob',
  'golem',
  'gem',
  'eye',
  'dragon',
];
const PART_Z = ['behind', 'main', 'front'];
const WEAPON_KINDS = ['sword', 'bow', 'staff', 'mace', 'axe', 'dagger', 'shield', 'claws'];
const DECOR_KINDS = ['eyes', 'marking', 'horn', 'mandible'];

// ---------------------------------------------------------------------------
// Generic invariant helpers
// ---------------------------------------------------------------------------

/** Every number reachable in the spec tree (skipping functions) is finite. */
function expectAllFinite(node: unknown): void {
  if (typeof node === 'number') {
    expect(Number.isNaN(node)).toBe(false);
    expect(Number.isFinite(node)).toBe(true);
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node as unknown[]) expectAllFinite(v);
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) expectAllFinite(v);
  }
}

function assertColor(c: number): void {
  expect(Number.isInteger(c)).toBe(true);
  expect(c).toBeGreaterThanOrEqual(0);
  expect(c).toBeLessThanOrEqual(0xffffff);
}

function assertPart(part: BodyPartSpec): void {
  expect(typeof part.id).toBe('string');
  expect(part.id.length).toBeGreaterThan(0);
  expect(Number.isFinite(part.local.x)).toBe(true);
  expect(Number.isFinite(part.local.y)).toBe(true);
  expect(part.rx).toBeGreaterThan(0);
  expect(part.ry).toBeGreaterThan(0);
  expect(PART_Z).toContain(part.z);
  if (part.tint !== undefined && part.tint !== 'base') {
    expect(typeof part.tint).toBe('number');
    assertColor(part.tint);
  }
}

function assertLegs(legs: LegGroupSpec, partIds: Set<string>): void {
  expect(Number.isInteger(legs.count)).toBe(true);
  expect(legs.count).toBeGreaterThan(0);
  expect(partIds.has(legs.anchorPart)).toBe(true);
  expect(legs.attachDist).toBeGreaterThan(0);
  expect(legs.l1).toBeGreaterThan(0);
  expect(legs.l2).toBeGreaterThan(0);
  expect(legs.liftHeight).toBeGreaterThanOrEqual(0);
  expect(legs.legWidthRoot).toBeGreaterThan(0);
  expect(legs.legWidthTip).toBeGreaterThan(0);
  expect(legs.legWidthTip).toBeLessThanOrEqual(legs.legWidthRoot); // limbs taper to the tip
  expect(typeof legs.bendOutward).toBe('boolean');
  expect(['facing', 'velocity']).toContain(legs.around);
  // Gait tuning.
  expect(legs.gait.stepDistance).toBeGreaterThan(0);
  expect(legs.gait.stepDuration).toBeGreaterThan(0);
  expect(legs.gait.overstep).toBeGreaterThanOrEqual(0);
  expect(Number.isInteger(legs.gait.maxConcurrent)).toBe(true);
  expect(legs.gait.maxConcurrent).toBeGreaterThanOrEqual(1);
  expect(legs.gait.maxConcurrent).toBeLessThanOrEqual(legs.count);
  expect(Number.isInteger(legs.gait.partnerStride)).toBe(true);
  expect(legs.gait.partnerStride).toBeGreaterThanOrEqual(1);
  // Per-leg parametric functions resolve to finite numbers for every index.
  for (let i = 0; i < legs.count; i++) {
    const ang = legs.baseAngleDeg(i);
    expect(Number.isFinite(ang)).toBe(true);
    expect(Math.abs(ang)).toBeLessThanOrEqual(360);
    expect(legs.homeDist(i)).toBeGreaterThan(0);
  }
}

function assertSpine(spine: SpineSpec): void {
  expect(Number.isInteger(spine.segments)).toBe(true);
  expect(spine.segments).toBeGreaterThan(0);
  expect(spine.spacing).toBeGreaterThan(0);
  expect(spine.ease).toBeGreaterThan(0);
  expect(spine.ease).toBeLessThanOrEqual(1);
  expect(spine.rx).toBeGreaterThan(0);
  expect(spine.ry).toBeGreaterThan(0);
  expect(spine.taper).toBeGreaterThanOrEqual(0);
  expect(spine.taper).toBeLessThanOrEqual(1);
  expect(spine.sinAmp).toBeGreaterThanOrEqual(0);
  expect(spine.sinFreq).toBeGreaterThanOrEqual(0);
}

function assertTentacle(t: TentacleSpec, partIds: Set<string>): void {
  expect(partIds.has(t.anchorPart)).toBe(true);
  expect(Number.isFinite(t.baseAngleDeg)).toBe(true);
  expect(Number.isInteger(t.segments)).toBe(true);
  expect(t.segments).toBeGreaterThan(0);
  expect(t.segLen).toBeGreaterThan(0);
  expect(t.width).toBeGreaterThan(0);
  expect(t.sinAmp).toBeGreaterThanOrEqual(0);
  expect(t.sinFreq).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(t.phase)).toBe(true);
  if (t.z !== undefined) expect(PART_Z).toContain(t.z);
  if (t.reach !== undefined) expect(t.reach).toBe('telegraph');
}

function assertDecor(d: DecorSpec, partIds: Set<string>): void {
  expect(DECOR_KINDS).toContain(d.kind);
  expect(partIds.has(d.anchorPart)).toBe(true);
  expect(Number.isFinite(d.local.x)).toBe(true);
  expect(Number.isFinite(d.local.y)).toBe(true);
  expect(d.scale).toBeGreaterThan(0);
  if (d.color !== undefined) assertColor(d.color);
  if (d.count !== undefined) {
    expect(Number.isInteger(d.count)).toBe(true);
    expect(d.count).toBeGreaterThan(0);
  }
}

function assertArm(a: ArmSpec): void {
  expect([1, -1]).toContain(a.side);
  expect(a.l1).toBeGreaterThan(0);
  expect(a.l2).toBeGreaterThan(0);
  expect(Number.isFinite(a.shoulderLocal.x)).toBe(true);
  expect(Number.isFinite(a.shoulderLocal.y)).toBe(true);
  expect(a.grip).toBeGreaterThan(0);
  expect(typeof a.bendOutward).toBe('boolean');
  expect(a.width).toBeGreaterThan(0);
}

function assertWeapon(w: WeaponSpec): void {
  expect(WEAPON_KINDS).toContain(w.kind);
  expect(w.length).toBeGreaterThan(0);
  assertColor(w.color);
  expect(['melee', 'ranged']).toContain(w.style);
  if (w.offhand !== undefined) expect(WEAPON_KINDS).toContain(w.offhand);
}

function partIdSet(spec: RigSpec): Set<string> {
  return new Set(spec.parts.map((p) => p.id));
}

/** All the structural invariants that hold for any well-formed rig spec. */
function assertValidRigSpec(spec: RigSpec): void {
  expect(RIG_IDS).toContain(spec.id);

  // Parts: non-empty, uniquely named, each well-formed.
  expect(Array.isArray(spec.parts)).toBe(true);
  expect(spec.parts.length).toBeGreaterThan(0);
  const ids = spec.parts.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length); // unique part ids
  for (const part of spec.parts) assertPart(part);

  const partIds = partIdSet(spec);
  if (spec.legs) assertLegs(spec.legs, partIds);
  if (spec.spine) assertSpine(spec.spine);
  if (spec.tentacles) for (const t of spec.tentacles) assertTentacle(t, partIds);
  if (spec.decor) for (const d of spec.decor) assertDecor(d, partIds);
  if (spec.arms) for (const a of spec.arms) assertArm(a);
  if (spec.weapon) assertWeapon(spec.weapon);
  if (spec.idle) {
    expect(spec.idle.breatheAmp).toBeGreaterThanOrEqual(0);
    expect(spec.idle.breatheFreq).toBeGreaterThan(0);
  }

  // No stray NaN / Infinity anywhere in the static data.
  expectAllFinite(spec);
}

// The full set of built specs, exercised generically.
const BUILT_SPECS: { name: string; spec: RigSpec }[] = [
  { name: 'spider', spec: buildSpiderSpec() },
  { name: 'serpent', spec: buildSerpentSpec() },
  { name: 'kraken', spec: buildKrakenSpec() },
  { name: 'treant', spec: buildTreantSpec() },
  { name: 'insectoid', spec: buildInsectoidSpec() },
  { name: 'beast', spec: buildBeastSpec() },
  { name: 'blob', spec: buildBlobSpec() },
  { name: 'golem', spec: buildGolemSpec() },
  { name: 'gem', spec: buildGemSpec() },
  { name: 'eye', spec: buildEyeSpec() },
  { name: 'dragon', spec: buildDragonSpec() },
  { name: 'bossHumanoid', spec: buildBossHumanoidSpec() },
  ...ALL_CLASS_IDS.map((c) => ({ name: `humanoid:${c}`, spec: buildHumanoidSpec(c) })),
];

// ---------------------------------------------------------------------------
// Generic invariants (data-driven over every spec)
// ---------------------------------------------------------------------------

describe('rig spec generic invariants', () => {
  it.each(BUILT_SPECS)('$name is a structurally valid rig spec', ({ spec }) => {
    assertValidRigSpec(spec);
  });

  it.each(BUILT_SPECS)('$name carries its declared RigId', ({ name, spec }) => {
    expect(RIG_IDS).toContain(spec.id);
    if (name.startsWith('humanoid') || name === 'bossHumanoid') expect(spec.id).toBe('humanoid');
  });

  it('each builder returns a fresh object (specs are built, not shared literals)', () => {
    const a = buildSpiderSpec();
    const b = buildSpiderSpec();
    expect(a).not.toBe(b);
    // Parts carry no closures, so they deep-equal across builds.
    expect(a.parts).toEqual(b.parts);
    expect(a.legs?.gait).toEqual(b.legs?.gait);
  });
});

// ---------------------------------------------------------------------------
// Spider
// ---------------------------------------------------------------------------

describe('buildSpiderSpec', () => {
  const spec = buildSpiderSpec();

  it('has the cephalothorax + abdomen body', () => {
    expect(spec.id).toBe('spider');
    expect(spec.parts.map((p) => p.id)).toEqual(['abdomen', 'cephalothorax']);
    const abdomen = spec.parts[0];
    const ceph = spec.parts[1];
    expect(abdomen.z).toBe('behind');
    expect(abdomen.local.x).toBeCloseTo(-0.9, 6);
    expect(abdomen.rx).toBeCloseTo(1.15, 6);
    expect(abdomen.ry).toBeCloseTo(0.95, 6);
    expect(ceph.z).toBe('main');
    expect(ceph.local.x).toBeCloseTo(0.5, 6);
  });

  it('has eight facing-oriented IK legs on the cephalothorax', () => {
    const legs = spec.legs;
    expect(legs).toBeDefined();
    if (!legs) return;
    expect(legs.count).toBe(8);
    expect(legs.anchorPart).toBe('cephalothorax');
    expect(legs.around).toBe('facing');
    expect(legs.bendOutward).toBe(true);
    expect(legs.l1).toBeCloseTo(1.18, 6);
    expect(legs.l2).toBeCloseTo(1.18, 6);
    expect(legs.gait.maxConcurrent).toBe(3);
    expect(legs.gait.partnerStride).toBe(4);
  });

  it('fans the legs front→back and mirrors the two sides', () => {
    const legs = spec.legs;
    if (!legs) return;
    // Legs 0..3 splay one way at 55 + 32*j; 4..7 mirror.
    expect(legs.baseAngleDeg(0)).toBeCloseTo(55, 6);
    expect(legs.baseAngleDeg(1)).toBeCloseTo(87, 6);
    expect(legs.baseAngleDeg(2)).toBeCloseTo(119, 6);
    expect(legs.baseAngleDeg(3)).toBeCloseTo(151, 6);
    for (let i = 0; i < 4; i++) {
      expect(legs.baseAngleDeg(i)).toBeCloseTo(-legs.baseAngleDeg(i + 4), 6);
      expect(legs.homeDist(i)).toBeCloseTo(legs.homeDist(i + 4), 6);
    }
    expect(legs.homeDist(0)).toBeCloseTo(2.1, 6);
    expect(legs.homeDist(3)).toBeCloseTo(2.64, 6);
  });

  it('paints eyes + marking + mandible decor on the right anchors', () => {
    const decor = spec.decor;
    expect(decor).toBeDefined();
    if (!decor) return;
    expect(decor.map((d) => d.kind)).toEqual(['eyes', 'marking', 'mandible']);
    const eyes = decor[0];
    expect(eyes.anchorPart).toBe('cephalothorax');
    expect(eyes.count).toBe(8);
    expect(eyes.color).toBe(0xbfe9ff);
    expect(decor[1].anchorPart).toBe('abdomen');
    expect(decor[1].color).toBe(0xb23a2e);
  });

  it('is a legged creature with no spine / tentacles / arms / weapon', () => {
    expect(spec.spine).toBeUndefined();
    expect(spec.tentacles).toBeUndefined();
    expect(spec.arms).toBeUndefined();
    expect(spec.weapon).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Serpent
// ---------------------------------------------------------------------------

describe('buildSerpentSpec', () => {
  const spec = buildSerpentSpec();

  it('is a single head plus a tapering follow-spine', () => {
    expect(spec.id).toBe('serpent');
    expect(spec.parts.map((p) => p.id)).toEqual(['head']);
    expect(spec.parts[0].z).toBe('main');
    expect(spec.legs).toBeUndefined();
    expect(spec.tentacles).toBeUndefined();
  });

  it('has the distance-constrained slither spine', () => {
    const spine = spec.spine;
    expect(spine).toBeDefined();
    if (!spine) return;
    expect(spine.segments).toBe(11);
    expect(spine.spacing).toBeCloseTo(0.62, 6);
    expect(spine.ease).toBeCloseTo(0.35, 6);
    expect(spine.ease).toBeLessThan(1); // lag → sinuous follow
    expect(spine.rx).toBeCloseTo(0.82, 6);
    expect(spine.ry).toBeCloseTo(0.7, 6);
    expect(spine.taper).toBeCloseTo(0.24, 6);
    expect(spine.sinAmp).toBeCloseTo(0.22, 6);
    expect(spine.sinFreq).toBeCloseTo(3.2, 6);
  });

  it('gives the head two eyes', () => {
    const decor = spec.decor;
    if (!decor) return;
    expect(decor).toHaveLength(1);
    expect(decor[0].kind).toBe('eyes');
    expect(decor[0].anchorPart).toBe('head');
    expect(decor[0].count).toBe(2);
    expect(decor[0].color).toBe(0xf2d24a);
  });
});

// ---------------------------------------------------------------------------
// Kraken
// ---------------------------------------------------------------------------

describe('buildKrakenSpec', () => {
  const spec = buildKrakenSpec();

  it('is a mantle + hood with no legs / spine', () => {
    expect(spec.id).toBe('kraken');
    expect(spec.parts.map((p) => p.id)).toEqual(['mantle', 'hood']);
    expect(spec.parts[0].z).toBe('main');
    expect(spec.parts[1].z).toBe('front');
    expect(spec.legs).toBeUndefined();
    expect(spec.spine).toBeUndefined();
  });

  it('radiates eight symmetric arms from the mantle', () => {
    const arms = spec.tentacles;
    expect(arms).toBeDefined();
    if (!arms) return;
    expect(arms).toHaveLength(8);
    const angles = [-150, -110, -70, -25, 25, 70, 110, 150];
    arms.forEach((t, i) => {
      expect(t.anchorPart).toBe('mantle');
      expect(t.segments).toBe(5);
      expect(t.segLen).toBeCloseTo(0.72, 6);
      expect(t.width).toBeCloseTo(0.3, 6);
      expect(t.z).toBe('behind');
      expect(t.baseAngleDeg).toBeCloseTo(angles[i], 6);
      expect(t.phase).toBeCloseTo(0.7 * i, 6); // phases march 0, 0.7, 1.4, …
    });
    // Mirror symmetry across the fan.
    for (let i = 0; i < 4; i++) {
      expect(arms[i].baseAngleDeg).toBeCloseTo(-arms[7 - i].baseAngleDeg, 6);
    }
  });

  it('only the two front arms reach toward the telegraph', () => {
    const arms = spec.tentacles;
    if (!arms) return;
    const reaching = arms
      .map((t, i) => ({ i, reach: t.reach }))
      .filter((x) => x.reach === 'telegraph');
    expect(reaching.map((x) => x.i)).toEqual([3, 4]); // the ±25° pair
    expect(arms[0].reach).toBeUndefined();
  });

  it('gives the hood two glowing eyes', () => {
    const decor = spec.decor;
    if (!decor) return;
    expect(decor).toHaveLength(1);
    expect(decor[0].anchorPart).toBe('hood');
    expect(decor[0].count).toBe(2);
    expect(decor[0].color).toBe(0xd7f0ff);
  });
});

// ---------------------------------------------------------------------------
// Treant
// ---------------------------------------------------------------------------

describe('buildTreantSpec', () => {
  const spec = buildTreantSpec();

  it('is a tinted trunk under a tinted canopy', () => {
    expect(spec.id).toBe('treant');
    expect(spec.parts.map((p) => p.id)).toEqual(['trunk', 'canopy']);
    const trunk = spec.parts[0];
    const canopy = spec.parts[1];
    expect(trunk.z).toBe('main');
    expect(trunk.tint).toBe(0x6b5330);
    expect(canopy.z).toBe('front');
    expect(canopy.tint).toBe(0x4f7a2e);
    expect(canopy.local.y).toBeCloseTo(-0.62, 6); // canopy sits high above the trunk
  });

  it('walks on two mirrored root-legs with a big slow gait', () => {
    const legs = spec.legs;
    expect(legs).toBeDefined();
    if (!legs) return;
    expect(legs.count).toBe(2);
    expect(legs.anchorPart).toBe('trunk');
    expect(legs.around).toBe('velocity');
    expect(legs.baseAngleDeg(0)).toBeCloseTo(122, 6);
    expect(legs.baseAngleDeg(1)).toBeCloseTo(-122, 6);
    expect(legs.baseAngleDeg(0)).toBeCloseTo(-legs.baseAngleDeg(1), 6);
    expect(legs.homeDist(0)).toBeCloseTo(1.9, 6);
    expect(legs.homeDist(1)).toBeCloseTo(1.9, 6);
    expect(legs.gait.stepDistance).toBeCloseTo(1.5, 6);
    expect(legs.gait.stepDuration).toBeCloseTo(0.34, 6);
    expect(legs.gait.maxConcurrent).toBe(1);
  });

  it('sways three front branch tentacles from the trunk', () => {
    const t = spec.tentacles;
    expect(t).toBeDefined();
    if (!t) return;
    expect(t).toHaveLength(3);
    expect(t.map((x) => x.baseAngleDeg)).toEqual([-55, 55, 150]);
    expect(t.map((x) => x.segments)).toEqual([3, 3, 3]);
    expect(t.every((x) => x.anchorPart === 'trunk')).toBe(true);
    expect(t.every((x) => x.z === 'front')).toBe(true);
    expect(t[0].segLen).toBeCloseTo(0.62, 6);
    expect(t[2].segLen).toBeCloseTo(0.55, 6);
    expect(t.map((x) => x.phase)).toEqual([0.0, 1.6, 3.0]);
  });

  it('has no spine, decor, arms, or weapon', () => {
    expect(spec.spine).toBeUndefined();
    expect(spec.decor).toBeUndefined();
    expect(spec.arms).toBeUndefined();
    expect(spec.weapon).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Insectoid
// ---------------------------------------------------------------------------

describe('buildInsectoidSpec', () => {
  const spec = buildInsectoidSpec();

  it('is an abdomen + thorax + head three-segment body', () => {
    expect(spec.id).toBe('insectoid');
    expect(spec.parts.map((p) => p.id)).toEqual(['abdomen', 'thorax', 'head']);
    expect(spec.parts[0].z).toBe('behind');
    expect(spec.parts[1].z).toBe('main');
    expect(spec.parts[2].z).toBe('front');
  });

  it('has six facing legs fanned ±(50,90,130)° and mirrored', () => {
    const legs = spec.legs;
    expect(legs).toBeDefined();
    if (!legs) return;
    expect(legs.count).toBe(6);
    expect(legs.anchorPart).toBe('thorax');
    expect(legs.around).toBe('facing');
    expect(legs.gait.maxConcurrent).toBe(2);
    expect(legs.gait.partnerStride).toBe(3);
    expect(legs.baseAngleDeg(0)).toBeCloseTo(50, 6);
    expect(legs.baseAngleDeg(1)).toBeCloseTo(90, 6);
    expect(legs.baseAngleDeg(2)).toBeCloseTo(130, 6);
    for (let i = 0; i < 3; i++) {
      expect(legs.baseAngleDeg(i)).toBeCloseTo(-legs.baseAngleDeg(i + 3), 6);
      expect(legs.homeDist(i)).toBeCloseTo(legs.homeDist(i + 3), 6);
    }
    expect(legs.homeDist(0)).toBeCloseTo(1.8, 6);
    expect(legs.homeDist(2)).toBeCloseTo(2.1, 6);
  });

  it('decorates the head with eyes and a mandible', () => {
    const decor = spec.decor;
    if (!decor) return;
    expect(decor.map((d) => d.kind)).toEqual(['eyes', 'mandible']);
    expect(decor.every((d) => d.anchorPart === 'head')).toBe(true);
    expect(decor[0].count).toBe(2);
    expect(decor[0].color).toBe(0xff6a4a);
  });
});

// ---------------------------------------------------------------------------
// Beast (quadruped)
// ---------------------------------------------------------------------------

describe('buildBeastSpec', () => {
  const spec = buildBeastSpec();

  it('is a haunch → chest → head body', () => {
    expect(spec.id).toBe('beast');
    expect(spec.parts.map((p) => p.id)).toEqual(['haunch', 'chest', 'head']);
    expect(spec.parts[0].z).toBe('behind');
    expect(spec.parts[1].z).toBe('main');
    expect(spec.parts[2].z).toBe('front');
  });

  it('walks on four facing-oriented legs, front + rear pairs mirrored', () => {
    const legs = spec.legs;
    expect(legs).toBeDefined();
    if (!legs) return;
    expect(legs.count).toBe(4);
    expect(legs.anchorPart).toBe('chest');
    expect(legs.around).toBe('facing');
    expect(legs.bendOutward).toBe(true);
    expect(legs.gait.maxConcurrent).toBe(2);
    // Front pair splays ±58°, rear pair ±128°; the two sides mirror.
    expect(legs.baseAngleDeg(0)).toBeCloseTo(58, 6);
    expect(legs.baseAngleDeg(1)).toBeCloseTo(-58, 6);
    expect(legs.baseAngleDeg(2)).toBeCloseTo(128, 6);
    expect(legs.baseAngleDeg(3)).toBeCloseTo(-128, 6);
    expect(legs.homeDist(0)).toBeCloseTo(1.7, 6); // front reach
    expect(legs.homeDist(2)).toBeCloseTo(1.95, 6); // rear reach
  });

  it('has a tail tentacle off the haunch and a horned, eyed head', () => {
    expect(spec.tentacles).toHaveLength(1);
    const tail = spec.tentacles?.[0];
    expect(tail?.anchorPart).toBe('haunch');
    expect(tail?.baseAngleDeg).toBe(180);
    const kinds = spec.decor?.map((d) => d.kind);
    expect(kinds).toEqual(['eyes', 'horn']);
    expect(spec.decor?.every((d) => d.anchorPart === 'head')).toBe(true);
    expect(spec.spine).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Blob (amorphous bruiser)
// ---------------------------------------------------------------------------

describe('buildBlobSpec', () => {
  const spec = buildBlobSpec();

  it('is a belly + two shoulder lumps + head', () => {
    expect(spec.id).toBe('blob');
    expect(spec.parts.map((p) => p.id)).toEqual(['belly', 'lumpL', 'lumpR', 'head']);
    // The lumps mirror across the lateral axis.
    const lumpL = spec.parts[1];
    const lumpR = spec.parts[2];
    expect(lumpL.local.y).toBeCloseTo(-lumpR.local.y, 6);
  });

  it('waddles on two thick splayed legs oriented by travel', () => {
    const legs = spec.legs;
    expect(legs).toBeDefined();
    if (!legs) return;
    expect(legs.count).toBe(2);
    expect(legs.around).toBe('velocity');
    expect(legs.bendOutward).toBe(true);
    expect(legs.gait.maxConcurrent).toBe(1);
    expect(legs.baseAngleDeg(0)).toBeCloseTo(95, 6);
    expect(legs.baseAngleDeg(1)).toBeCloseTo(-95, 6);
  });

  it('swings two telegraph-reaching arms in front', () => {
    const arms = spec.tentacles;
    expect(arms).toHaveLength(2);
    if (!arms) return;
    expect(arms.every((a) => a.anchorPart === 'belly')).toBe(true);
    expect(arms.every((a) => a.z === 'front')).toBe(true);
    expect(arms.every((a) => a.reach === 'telegraph')).toBe(true);
    expect(arms[0].baseAngleDeg).toBeCloseTo(58, 6);
    expect(arms[1].baseAngleDeg).toBeCloseTo(-58, 6);
  });
});

// ---------------------------------------------------------------------------
// Golem (construct)
// ---------------------------------------------------------------------------

describe('buildGolemSpec', () => {
  const spec = buildGolemSpec();

  it('is a core + two shoulders + head', () => {
    expect(spec.id).toBe('golem');
    expect(spec.parts.map((p) => p.id)).toEqual(['core', 'shoulderL', 'shoulderR', 'head']);
    expect(spec.parts[1].local.y).toBeCloseTo(-spec.parts[2].local.y, 6); // mirrored shoulders
  });

  it('plods on two heavy biped-biased legs', () => {
    const legs = spec.legs;
    expect(legs).toBeDefined();
    if (!legs) return;
    expect(legs.count).toBe(2);
    expect(legs.around).toBe('velocity');
    expect(legs.bendOutward).toBe(false);
    expect(legs.gait.maxConcurrent).toBe(1);
    expect(legs.gait.stepDuration).toBeCloseTo(0.24, 6); // ponderous
  });

  it('has two short rigid arms off the shoulders that reach on a windup', () => {
    const arms = spec.tentacles;
    expect(arms).toHaveLength(2);
    if (!arms) return;
    expect(arms.map((a) => a.anchorPart)).toEqual(['shoulderL', 'shoulderR']);
    expect(arms.every((a) => a.segments === 2)).toBe(true);
    expect(arms.every((a) => a.reach === 'telegraph')).toBe(true);
  });

  it('stamps a core sigil and glowing eyes', () => {
    const kinds = spec.decor?.map((d) => d.kind);
    expect(kinds).toEqual(['eyes', 'marking']);
    expect(spec.decor?.find((d) => d.kind === 'marking')?.anchorPart).toBe('core');
  });
});

// ---------------------------------------------------------------------------
// Gem (floating undead relic)
// ---------------------------------------------------------------------------

describe('buildGemSpec', () => {
  const spec = buildGemSpec();

  it('is a core + crown + tinted inner soul-glow, with no legs (it hovers)', () => {
    expect(spec.id).toBe('gem');
    expect(spec.parts.map((p) => p.id)).toEqual(['core', 'crown', 'heart']);
    expect(spec.legs).toBeUndefined();
    expect(spec.spine).toBeUndefined();
    // The heart is an explicit accent tint, not the base monster colour.
    const heart = spec.parts.find((p) => p.id === 'heart');
    expect(typeof heart?.tint).toBe('number');
  });

  it('drifts three spectral tatters behind the core', () => {
    const t = spec.tentacles;
    expect(t).toHaveLength(3);
    if (!t) return;
    expect(t.every((x) => x.anchorPart === 'core')).toBe(true);
    expect(t.every((x) => x.z === 'behind')).toBe(true);
  });

  it('carries a diamond facet marking and two cold eyes', () => {
    const kinds = spec.decor?.map((d) => d.kind);
    expect(kinds).toEqual(['marking', 'eyes']);
    expect(spec.decor?.find((d) => d.kind === 'marking')?.anchorPart).toBe('core');
    expect(spec.decor?.find((d) => d.kind === 'eyes')?.anchorPart).toBe('crown');
  });
});

// ---------------------------------------------------------------------------
// Eye (floating eye-tyrant)
// ---------------------------------------------------------------------------

describe('buildEyeSpec', () => {
  const spec = buildEyeSpec();

  it('is an orb + forward iris + dark pupil, no legs (it hovers)', () => {
    expect(spec.id).toBe('eye');
    expect(spec.parts.map((p) => p.id)).toEqual(['orb', 'iris', 'pupil']);
    expect(spec.legs).toBeUndefined();
    expect(spec.spine).toBeUndefined();
    // Iris + pupil sit toward the facing (positive local x) so it stares forward.
    const iris = spec.parts[1];
    const pupil = spec.parts[2];
    expect(iris.local.x).toBeGreaterThan(0);
    expect(pupil.local.x).toBeGreaterThan(iris.local.x);
    expect(typeof iris.tint).toBe('number');
    expect(typeof pupil.tint).toBe('number');
  });

  it('fans five back-trailing eyestalks off the orb, symmetric about the rear', () => {
    const stalks = spec.tentacles;
    expect(stalks).toHaveLength(5);
    if (!stalks) return;
    expect(stalks.every((s) => s.anchorPart === 'orb')).toBe(true);
    expect(stalks.every((s) => s.z === 'behind')).toBe(true);
    // Angles 130,160,180,-160,-130 mirror across the 180° rear axis.
    expect(stalks[0].baseAngleDeg).toBeCloseTo(-stalks[4].baseAngleDeg, 6);
    expect(stalks[1].baseAngleDeg).toBeCloseTo(-stalks[3].baseAngleDeg, 6);
    expect(stalks[2].baseAngleDeg).toBe(180);
  });
});

// ---------------------------------------------------------------------------
// Dragon (winged serpent — the `star` marquee boss)
// ---------------------------------------------------------------------------

describe('buildDragonSpec', () => {
  const spec = buildDragonSpec();

  it('is a body → chest → brow → snout profile', () => {
    expect(spec.id).toBe('dragon');
    expect(spec.parts.map((p) => p.id)).toEqual(['body', 'chest', 'brow', 'snout']);
    // The snout is the frontmost part.
    expect(spec.parts[3].local.x).toBeGreaterThan(spec.parts[2].local.x);
  });

  it('composes a lashing tail-spine with four facing legs (both primitives at once)', () => {
    expect(spec.spine).toBeDefined();
    expect(spec.spine?.segments).toBe(7);
    const legs = spec.legs;
    expect(legs).toBeDefined();
    if (!legs) return;
    expect(legs.count).toBe(4);
    expect(legs.around).toBe('facing');
    expect(legs.baseAngleDeg(0)).toBeCloseTo(62, 6);
    expect(legs.baseAngleDeg(1)).toBeCloseTo(-62, 6);
    expect(legs.baseAngleDeg(2)).toBeCloseTo(126, 6);
    expect(legs.baseAngleDeg(3)).toBeCloseTo(-126, 6);
  });

  it('beats two broad wings in phase behind the body', () => {
    const wings = spec.tentacles;
    expect(wings).toHaveLength(2);
    if (!wings) return;
    expect(wings.every((w) => w.anchorPart === 'body')).toBe(true);
    expect(wings.every((w) => w.z === 'behind')).toBe(true);
    expect(wings[0].phase).toBe(wings[1].phase); // in phase → a flap, not a slither
    expect(wings[0].baseAngleDeg).toBeCloseTo(-wings[1].baseAngleDeg, 6);
  });

  it('crowns the brow with a fiery eye and horns', () => {
    const kinds = spec.decor?.map((d) => d.kind);
    expect(kinds).toEqual(['eyes', 'horn']);
    expect(spec.decor?.every((d) => d.anchorPart === 'brow')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Humanoid (per-class biped + boss variant)
// ---------------------------------------------------------------------------

const WEAPON_EXPECT: Record<ClassId, WeaponSpec> = {
  knight: { kind: 'sword', length: 2.0, color: CLASS_COLORS.knight, style: 'melee' },
  paladin: {
    kind: 'sword',
    length: 2.0,
    color: CLASS_COLORS.paladin,
    style: 'melee',
    offhand: 'shield',
  },
  barbarian: { kind: 'axe', length: 1.4, color: CLASS_COLORS.barbarian, style: 'melee' },
  rogue: {
    kind: 'dagger',
    length: 1.0,
    color: CLASS_COLORS.rogue,
    style: 'melee',
    offhand: 'dagger',
  },
  ranger: { kind: 'bow', length: 1.2, color: 0x8a5a2a, style: 'ranged' },
  mage: { kind: 'staff', length: 1.8, color: 0x9c5cf0, style: 'ranged' },
  druid: { kind: 'staff', length: 1.7, color: 0x6b8f3a, style: 'melee' },
  cleric: { kind: 'mace', length: 1.3, color: 0xf2c14e, style: 'melee' },
  bard: { kind: 'dagger', length: 1.1, color: CLASS_COLORS.bard, style: 'ranged' },
  monk: {
    kind: 'dagger',
    length: 0.8,
    color: CLASS_COLORS.monk,
    style: 'melee',
    offhand: 'dagger',
  },
  sorcerer: { kind: 'staff', length: 1.7, color: CLASS_COLORS.sorcerer, style: 'ranged' },
  warlock: { kind: 'staff', length: 1.6, color: CLASS_COLORS.warlock, style: 'ranged' },
};

describe('buildHumanoidSpec', () => {
  it('is the aim-tracking biped: torso + head, two legs, two arms, a weapon', () => {
    const spec = buildHumanoidSpec('knight');
    expect(spec.id).toBe('humanoid');
    expect(spec.parts.map((p) => p.id)).toEqual(['torso', 'head']);
    expect(spec.parts[0].z).toBe('main');
    expect(spec.parts[1].z).toBe('front');
    expect(spec.spine).toBeUndefined();
    expect(spec.tentacles).toBeUndefined();
    expect(spec.decor).toBeUndefined();
    expect(spec.weapon).toBeDefined();
  });

  it('has a true biped gait: 2 legs, one foot at a time, orient by travel', () => {
    const legs = buildHumanoidSpec('knight').legs;
    expect(legs).toBeDefined();
    if (!legs) return;
    expect(legs.count).toBe(2);
    expect(legs.anchorPart).toBe('torso');
    expect(legs.around).toBe('velocity');
    expect(legs.bendOutward).toBe(false); // biped: knees bias toward travel
    expect(legs.gait.maxConcurrent).toBe(1);
    expect(legs.baseAngleDeg(0)).toBeCloseTo(100, 6);
    expect(legs.baseAngleDeg(1)).toBeCloseTo(-100, 6);
    expect(legs.baseAngleDeg(0)).toBeCloseTo(-legs.baseAngleDeg(1), 6);
    expect(legs.homeDist(0)).toBeCloseTo(1.3, 6);
    expect(legs.homeDist(1)).toBeCloseTo(1.3, 6);
  });

  it('has two mirror-symmetric arms (front / back hand)', () => {
    const arms = buildHumanoidSpec('knight').arms;
    expect(arms).toBeDefined();
    if (!arms) return;
    expect(arms).toHaveLength(2);
    expect(arms.map((a) => a.side)).toEqual([1, -1]);
    // Same bone lengths / grip / width; shoulders mirrored across the body axis.
    expect(arms[0].l1).toBeCloseTo(arms[1].l1, 6);
    expect(arms[0].l2).toBeCloseTo(arms[1].l2, 6);
    expect(arms[0].grip).toBeCloseTo(arms[1].grip, 6);
    expect(arms[0].width).toBeCloseTo(arms[1].width, 6);
    expect(arms[0].shoulderLocal.x).toBeCloseTo(arms[1].shoulderLocal.x, 6);
    expect(arms[0].shoulderLocal.y).toBeCloseTo(-arms[1].shoulderLocal.y, 6);
    expect(arms[0].shoulderLocal.y).toBeCloseTo(0.6, 6);
  });

  it.each(ALL_CLASS_IDS)('carries the correct weapon for %s', (classId) => {
    const spec = buildHumanoidSpec(classId);
    expect(spec.weapon).toEqual(WEAPON_EXPECT[classId]);
  });

  it('shares the same body across classes (only the weapon differs)', () => {
    const knight = buildHumanoidSpec('knight');
    const mage = buildHumanoidSpec('mage');
    // Function-free portions of the body are identical; only the weapon changes.
    expect(knight.parts).toEqual(mage.parts);
    expect(knight.arms).toEqual(mage.arms);
    expect(knight.legs?.gait).toEqual(mage.legs?.gait);
    expect(knight.idle).toEqual(mage.idle);
    expect(knight.weapon).not.toEqual(mage.weapon);
  });
});

describe('buildBossHumanoidSpec', () => {
  it('is the biped wielding a heavy neutral axe', () => {
    const spec = buildBossHumanoidSpec();
    expect(spec.id).toBe('humanoid');
    expect(spec.parts.map((p) => p.id)).toEqual(['torso', 'head']);
    expect(spec.weapon).toEqual({ kind: 'axe', length: 1.7, color: 0x9aa4b2, style: 'melee' });
    expect(spec.weapon?.offhand).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Registry — bossRigId / classRigId / addRigId
// ---------------------------------------------------------------------------

// Re-derive the documented mapping from the actual monster data so the test
// tracks the source rather than a frozen copy: overrides win, else silhouette.
const BOSS_RIG_OVERRIDE: Partial<Record<MonsterId, RigId>> = {
  spider: 'spider',
  kraken: 'kraken',
  treant: 'treant',
  basilisk: 'serpent',
};
const SHAPE_TO_RIG: Partial<Record<BossBodyShape, RigId>> = {
  insect: 'spider',
  serpent: 'serpent',
  tree: 'treant',
  humanoid: 'humanoid',
  beast: 'beast',
  blob: 'blob',
  construct: 'golem',
  diamond: 'gem',
  orb: 'eye',
  star: 'dragon',
};
function expectedBossRig(id: MonsterId): RigId | null {
  // The practice dummy (a construct-shaped menu target) is the sole documented
  // geometry holdout — it never resolves to a rig even though its shape maps.
  if (id === 'dummy') return null;
  return BOSS_RIG_OVERRIDE[id] ?? SHAPE_TO_RIG[getMonster(id).bodyShape] ?? null;
}

describe('bossRigId', () => {
  it.each(ALL_MONSTER_IDS)('resolves %s per the override + silhouette table', (id) => {
    expect(bossRigId(id)).toBe(expectedBossRig(id));
  });

  it('maps the four explicit boss overrides', () => {
    expect(bossRigId('spider')).toBe('spider');
    expect(bossRigId('kraken')).toBe('kraken'); // override beats its 'serpent' silhouette
    expect(bossRigId('treant')).toBe('treant');
    expect(bossRigId('basilisk')).toBe('serpent');
  });

  it('maps humanoid silhouettes to the humanoid rig', () => {
    expect(bossRigId('goblin')).toBe('humanoid');
    expect(bossRigId('orc')).toBe('humanoid');
    expect(bossRigId('demon')).toBe('humanoid');
  });

  it('maps the formerly geometry-only silhouettes to their new rigs', () => {
    expect(bossRigId('dragon')).toBe('dragon'); // star
    expect(bossRigId('troll')).toBe('blob'); // blob
    expect(bossRigId('lich')).toBe('gem'); // diamond
    expect(bossRigId('direwolf')).toBe('beast'); // beast
    expect(bossRigId('animatedArmor')).toBe('golem'); // construct
    expect(bossRigId('beholder')).toBe('eye'); // orb
  });

  it('keeps only the practice dummy on geometry (no boss rig)', () => {
    expect(bossRigId('dummy')).toBeNull();
    // ...even though the dummy shares the `construct` silhouette that now maps.
    expect(getMonster('dummy').bodyShape).toBe('construct');
    expect(bossRigId('mudGolem')).toBe('golem');
  });

  it('every non-dummy boss now resolves to a rig (no geometry fallback remains)', () => {
    for (const id of ALL_MONSTER_IDS) {
      if (id === 'dummy') {
        expect(bossRigId(id)).toBeNull();
      } else {
        expect(bossRigId(id)).not.toBeNull();
      }
    }
  });

  it('every resolved rig id is a known RigId', () => {
    for (const id of ALL_MONSTER_IDS) {
      const rig = bossRigId(id);
      if (rig !== null) expect(RIG_IDS).toContain(rig);
    }
  });
});

describe('classRigId / addRigId', () => {
  it.each(ALL_CLASS_IDS)('renders %s as the humanoid biped', (classId) => {
    expect(classRigId(classId)).toBe('humanoid');
  });

  it('has no rig for adds', () => {
    expect(addRigId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Registry — cached spec resolution
// ---------------------------------------------------------------------------

describe('bossRigSpec', () => {
  it.each(ALL_MONSTER_IDS)('%s resolves to the expected spec (or null)', (id) => {
    const rig = expectedBossRig(id);
    const spec = bossRigSpec(id);
    if (rig === null) {
      expect(spec).toBeNull();
    } else {
      expect(spec).not.toBeNull();
      if (!spec) return;
      expect(spec.id).toBe(rig);
      assertValidRigSpec(spec);
    }
  });

  it('builds the override creatures with the right shapes', () => {
    expect(bossRigSpec('kraken')?.id).toBe('kraken');
    expect(bossRigSpec('basilisk')?.id).toBe('serpent');
    expect(bossRigSpec('spider')?.id).toBe('spider');
    expect(bossRigSpec('treant')?.id).toBe('treant');
  });

  it('gives each humanoid boss a weapon true to its fantasy (item 62)', () => {
    // The Mind Flayer casts (staff), the Death Knight tanks (sword + shield), the
    // Frost Giant swings an oversized maul — no longer one shared grey axe.
    expect(bossRigSpec('mindflayer')?.weapon?.kind).toBe('staff');
    expect(bossRigSpec('deathknight')?.weapon?.offhand).toBe('shield');
    expect(bossRigSpec('frostGiant')?.weapon?.kind).toBe('mace');
    expect(bossRigSpec('zombie')?.weapon?.kind).toBe('claws');
    expect(bossRigSpec('vampire')?.weapon?.kind).toBe('sword');
  });

  it('caches: repeated lookups return the same instance', () => {
    expect(bossRigSpec('kraken')).toBe(bossRigSpec('kraken')); // creature cache
    expect(bossRigSpec('spider')).toBe(bossRigSpec('spider'));
    expect(bossRigSpec('vampire')).toBe(bossRigSpec('vampire')); // per-monster humanoid cache
  });

  it('no longer collapses humanoid bosses into one identical silhouette (item 62)', () => {
    // A distinct per-boss instance, and — the crux of the fix — no two hard-tier
    // humanoid bosses render silhouette-identical.
    expect(bossRigSpec('goblin')).not.toBe(bossRigSpec('orc'));
    const hardHumanoids = ['vampire', 'frostGiant', 'mindflayer', 'deathknight', 'demon'] as const;
    const sigs = hardHumanoids.map((id) => {
      const w = bossRigSpec(id)!.weapon!;
      const t = bossRigSpec(id)!.parts[0];
      return `${w.kind}:${w.offhand ?? '-'}:${t.rx}:${t.ry}`;
    });
    expect(new Set(sigs).size).toBe(hardHumanoids.length);
  });

  it('builds the newly-mapped silhouette rigs', () => {
    expect(bossRigSpec('dragon')?.id).toBe('dragon');
    expect(bossRigSpec('troll')?.id).toBe('blob');
    expect(bossRigSpec('lich')?.id).toBe('gem');
    expect(bossRigSpec('direwolf')?.id).toBe('beast');
    expect(bossRigSpec('animatedArmor')?.id).toBe('golem');
    expect(bossRigSpec('beholder')?.id).toBe('eye');
  });

  it('returns null only for the practice dummy', () => {
    expect(bossRigSpec('dummy')).toBeNull();
  });
});

describe('classRigSpec', () => {
  it.each(ALL_CLASS_IDS)('%s resolves to a valid humanoid with the right weapon', (classId) => {
    const spec = classRigSpec(classId);
    expect(spec).not.toBeNull();
    if (!spec) return;
    expect(spec.id).toBe('humanoid');
    assertValidRigSpec(spec);
    expect(spec.weapon).toEqual(WEAPON_EXPECT[classId]);
  });

  it.each(ALL_CLASS_IDS)('caches the %s spec', (classId) => {
    expect(classRigSpec(classId)).toBe(classRigSpec(classId));
  });

  it('gives different classes distinct cached specs', () => {
    expect(classRigSpec('knight')).not.toBe(classRigSpec('mage'));
  });
});

// ---------------------------------------------------------------------------
// Registry — per-frame rig predicates
// ---------------------------------------------------------------------------

function bossView(monsterId: MonsterId): BossView {
  return { monsterId } as unknown as BossView;
}
function playerView(state: PlayerState, classId: ClassId = 'knight'): PlayerView {
  return { state, classId } as unknown as PlayerView;
}

describe('rig predicates', () => {
  it('documents the current per-category flags', () => {
    expect(RIG_FLAGS.boss).toBe(true);
    expect(RIG_FLAGS.player).toBe(true);
    expect(RIG_FLAGS.add).toBe(false);
  });

  it.each(ALL_MONSTER_IDS)('bossUsesRig(%s) iff the boss has a rig', (id) => {
    expect(bossUsesRig(bossView(id))).toBe(expectedBossRig(id) !== null);
  });

  it('rig-rendered bosses vs the geometry dummy', () => {
    expect(bossUsesRig(bossView('goblin'))).toBe(true);
    expect(bossUsesRig(bossView('kraken'))).toBe(true);
    expect(bossUsesRig(bossView('dragon'))).toBe(true); // now the winged dragon rig
    expect(bossUsesRig(bossView('dummy'))).toBe(false); // the lone geometry holdout
  });

  it('players use the rig unless dead', () => {
    expect(playerUsesRig(playerView('alive'))).toBe(true);
    expect(playerUsesRig(playerView('downed'))).toBe(true);
    expect(playerUsesRig(playerView('dead'))).toBe(false);
  });

  it('adds never use a rig (flag off)', () => {
    expect(addUsesRig({} as unknown as AddView)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Humanoid — expansion classes (bard / monk / sorcerer / warlock)
// ---------------------------------------------------------------------------

// ALL_CLASS_IDS above pins only the original eight; the four expansion classes
// have their own `weaponFor` switch arms. Exercise them so every class's weapon
// mapping is covered, not just the originals.
const EXPANSION_CLASS_IDS: ClassId[] = ['bard', 'monk', 'sorcerer', 'warlock'];

describe('buildHumanoidSpec — expansion classes', () => {
  it.each(EXPANSION_CLASS_IDS)('carries the correct weapon for %s', (classId) => {
    expect(buildHumanoidSpec(classId).weapon).toEqual(WEAPON_EXPECT[classId]);
  });
});

// ---------------------------------------------------------------------------
// Registry — silhouette arms otherwise shadowed by the boss overrides
// ---------------------------------------------------------------------------

describe('bossRigId — insect / serpent / tree silhouette fallbacks', () => {
  // The insect/serpent/tree body shapes exist in the monster data ONLY on bosses
  // that also carry an explicit rig override (spider → insect, kraken+basilisk →
  // serpent, treant → tree), so those three `bodyShape` switch arms are never hit
  // through the shipped registry. Temporarily retag a plain, non-overridden,
  // non-dummy boss to each shape to drive the silhouette fallback directly.
  it('resolves the three override-shadowed silhouettes to spider / serpent / treant', () => {
    const victim = MONSTERS.goblin; // humanoid, not in the override table, not the dummy
    const original = victim.bodyShape;
    try {
      victim.bodyShape = 'insect';
      expect(bossRigId('goblin')).toBe('spider');
      victim.bodyShape = 'serpent';
      expect(bossRigId('goblin')).toBe('serpent');
      victim.bodyShape = 'tree';
      expect(bossRigId('goblin')).toBe('treant');
    } finally {
      victim.bodyShape = original;
    }
    // Restored: the untouched registry resolves goblin to the humanoid rig again.
    expect(bossRigId('goblin')).toBe('humanoid');
  });
});

// ---------------------------------------------------------------------------
// Registry — addUsesRig with the (shipped-off) add rig flag forced on
// ---------------------------------------------------------------------------

describe('addUsesRig — add rig flag forced on', () => {
  // RIG_FLAGS.add ships OFF, so addUsesRig short-circuits on the first term. Flip
  // it on to drive the rest of the predicate: even then an add has no rig
  // (addRigId() is null), so it still never rig-renders.
  it('still returns false because addRigId() is null even when RIG_FLAGS.add is on', () => {
    const original = RIG_FLAGS.add;
    try {
      RIG_FLAGS.add = true;
      expect(addUsesRig({} as unknown as AddView)).toBe(false);
    } finally {
      RIG_FLAGS.add = original;
    }
    expect(RIG_FLAGS.add).toBe(false); // restored to the shipped default
  });
});

// ---------------------------------------------------------------------------
// Registry — the documented geometry fallback for an unmapped silhouette
// ---------------------------------------------------------------------------

describe('bossRigId — unmapped body shape falls back to geometry (default arm)', () => {
  // Every shipped BossBodyShape now maps to a rig, so the switch's `default:`
  // (return null — "a new one falls back to geometry") is only reachable with a
  // shape outside the union. Retag a plain non-override, non-dummy boss to an
  // unknown shape to drive that documented fallback directly.
  it('returns null for a body shape the silhouette table does not handle', () => {
    const victim = MONSTERS.goblin; // humanoid, not overridden, not the dummy
    const original = victim.bodyShape;
    try {
      victim.bodyShape = 'unmapped' as BossBodyShape;
      expect(bossRigId('goblin')).toBeNull();
    } finally {
      victim.bodyShape = original;
    }
    // Restored: the untouched registry resolves goblin to the humanoid rig again.
    expect(bossRigId('goblin')).toBe('humanoid');
  });
});

// ---------------------------------------------------------------------------
// Humanoid — the weaponFor default arm for an unregistered class
// ---------------------------------------------------------------------------

describe('buildHumanoidSpec — unknown class falls back to the default kit', () => {
  // `weaponFor` has a `default:` arm and a `CLASS_COLORS[classId] ?? 0xffffff`
  // colour fallback for a classId outside the shipped union. Pass an unrecognised
  // class to drive both: a plain white melee sword.
  it('gives an unrecognised class a neutral white melee sword', () => {
    const spec = buildHumanoidSpec('nonesuch' as ClassId);
    expect(spec.id).toBe('humanoid');
    expect(spec.weapon).toEqual({ kind: 'sword', length: 2.0, color: 0xffffff, style: 'melee' });
    // The rest of the biped is still well-formed.
    assertValidRigSpec(spec);
  });
});
