/**
 * Warband — rig registry: which entities opt into the RigLayer, and their specs.
 *
 * A category renders a given entity as a rig iff `RIG_FLAGS[cat]` is on AND that
 * entity resolves to a `RigId`. Everything unmapped keeps its immediate-mode
 * geometry (`entityView.ts`), so rollout is per-entity and reversible: flip a
 * flag or drop a mapping and the affected bodies fall straight back to geometry.
 *
 * Specs are immutable, camera-scale-independent data, so they're built once and
 * cached here (shared across every instance of that creature/class).
 */
import type { BossView, PlayerView, AddView, MonsterId, ClassId } from '../../engine/core/types';
import { getMonster } from '../../engine/content/monsters';
import { SPRITE_FLAGS } from '../sprites/manifest';
import type { RigId, RigSpec } from './types';
import { buildSpiderSpec } from './specs/spider';
import { buildSerpentSpec } from './specs/serpent';
import { buildKrakenSpec } from './specs/kraken';
import { buildTreantSpec } from './specs/treant';
import { buildInsectoidSpec } from './specs/insectoid';
import { buildHumanoidSpec, buildBossHumanoidSpec } from './specs/humanoid';

/** Per-category master switches (mirror of `SPRITE_FLAGS`). */
export type RigCategory = 'boss' | 'player' | 'add';
export const RIG_FLAGS: Record<RigCategory, boolean> = {
  boss: true,
  player: true,
  add: false, // adds stay on geometry initially (see spec §8)
};

/** Explicit per-boss overrides that win over the silhouette fallback. */
const BOSS_RIG_OVERRIDE: Partial<Record<MonsterId, RigId>> = {
  spider: 'spider',
  kraken: 'kraken',
  treant: 'treant',
  basilisk: 'serpent',
};

/** The rig a boss uses, or null to keep its geometry silhouette. */
export function bossRigId(id: MonsterId): RigId | null {
  const override = BOSS_RIG_OVERRIDE[id];
  if (override) return override;
  switch (getMonster(id).bodyShape) {
    case 'insect':
      return 'spider';
    case 'serpent':
      return 'serpent';
    case 'tree':
      return 'treant';
    case 'humanoid':
      return 'humanoid';
    default:
      return null; // star / blob / diamond / beast / construct / orb → geometry
  }
}

/** All eight classes render as the humanoid biped. */
export function classRigId(_classId: ClassId): RigId | null {
  return 'humanoid';
}

/** Adds have no rig yet (kept on geometry). */
export function addRigId(): RigId | null {
  return null;
}

// --- per-frame predicates shared by the renderer + RigLayer ------------------
//
// The sprite path takes precedence over the rig path for a category (a `!SPRITE_
// FLAGS[cat]` guard): if both a category's sprite flag AND its rig flag were ever
// turned on, the sprite layer wins and the rig defers, so a body is never drawn
// twice. Today all sprite flags are off, so these guards are no-ops.

export function bossUsesRig(b: BossView): boolean {
  return RIG_FLAGS.boss && !SPRITE_FLAGS.boss && bossRigId(b.monsterId) !== null;
}

/** Dead heroes fall back to the geometry ghost, so they are NOT rig-rendered. */
export function playerUsesRig(p: PlayerView): boolean {
  return (
    RIG_FLAGS.player && !SPRITE_FLAGS.player && p.state !== 'dead' && classRigId(p.classId) !== null
  );
}

export function addUsesRig(_a: AddView): boolean {
  return RIG_FLAGS.add && !SPRITE_FLAGS.add && addRigId() !== null;
}

// --- spec cache --------------------------------------------------------------

const creatureCache = new Map<RigId, RigSpec>();
const classCache = new Map<ClassId, RigSpec>();
let bossHumanoid: RigSpec | null = null;

function buildCreature(id: RigId): RigSpec {
  switch (id) {
    case 'spider':
      return buildSpiderSpec();
    case 'serpent':
      return buildSerpentSpec();
    case 'kraken':
      return buildKrakenSpec();
    case 'treant':
      return buildTreantSpec();
    case 'insectoid':
      return buildInsectoidSpec();
    case 'humanoid':
      return buildBossHumanoidSpec();
  }
}

/** Cached spec for a boss, or null if it isn't rig-rendered. */
export function bossRigSpec(id: MonsterId): RigSpec | null {
  const rig = bossRigId(id);
  if (!rig) return null;
  if (rig === 'humanoid') {
    if (!bossHumanoid) bossHumanoid = buildBossHumanoidSpec();
    return bossHumanoid;
  }
  let spec = creatureCache.get(rig);
  if (!spec) {
    spec = buildCreature(rig);
    creatureCache.set(rig, spec);
  }
  return spec;
}

/** Cached humanoid spec for a class. */
export function classRigSpec(classId: ClassId): RigSpec | null {
  if (classRigId(classId) === null) return null;
  let spec = classCache.get(classId);
  if (!spec) {
    spec = buildHumanoidSpec(classId);
    classCache.set(classId, spec);
  }
  return spec;
}
