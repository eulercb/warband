/**
 * Warband — humanoid (playable hero) rig. A top-down articulated biped: the
 * torso + head + arms track the AIM vector (twin-stick read of where the hero
 * points), while the two legs orient to the TRAVEL direction and step with a
 * walk-cycle gait. Each class carries a distinct simple-shape weapon.
 */
import type { ClassId, MonsterId } from '../../../engine/core/types';
import { CLASS_COLORS } from '../../../engine/core/constants';
import type { RigSpec, WeaponSpec, ArmSpec } from '../types';

function arm(side: 1 | -1): ArmSpec {
  return {
    side,
    l1: 0.7,
    l2: 0.7,
    shoulderLocal: { x: 0.1, y: side * 0.6 },
    grip: 1.5,
    bendOutward: true,
    width: 0.17,
  };
}

/** Per-class weapon (all simple shapes; `style` drives the attack envelope). */
function weaponFor(classId: ClassId): WeaponSpec {
  const c = CLASS_COLORS[classId] ?? 0xffffff;
  switch (classId) {
    case 'knight':
      return { kind: 'sword', length: 2.0, color: c, style: 'melee' };
    case 'paladin':
      return { kind: 'sword', length: 2.0, color: c, style: 'melee', offhand: 'shield' };
    case 'barbarian':
      return { kind: 'axe', length: 1.4, color: c, style: 'melee' };
    case 'rogue':
      return { kind: 'dagger', length: 1.0, color: c, style: 'melee', offhand: 'dagger' };
    case 'ranger':
      return { kind: 'bow', length: 1.2, color: 0x8a5a2a, style: 'ranged' };
    case 'mage':
      return { kind: 'staff', length: 1.8, color: 0x9c5cf0, style: 'ranged' };
    case 'druid':
      return { kind: 'staff', length: 1.7, color: 0x6b8f3a, style: 'melee' };
    case 'cleric':
      return { kind: 'mace', length: 1.3, color: 0xf2c14e, style: 'melee' };
    case 'bard':
      return { kind: 'dagger', length: 1.1, color: c, style: 'ranged' };
    case 'monk':
      return { kind: 'dagger', length: 0.8, color: c, style: 'melee', offhand: 'dagger' };
    case 'sorcerer':
      return { kind: 'staff', length: 1.7, color: c, style: 'ranged' };
    case 'warlock':
      return { kind: 'staff', length: 1.6, color: c, style: 'ranged' };
    default:
      return { kind: 'sword', length: 2.0, color: c, style: 'melee' };
  }
}

function biped(weapon: WeaponSpec, torso?: { rx: number; ry: number }): RigSpec {
  return {
    id: 'humanoid',
    parts: [
      {
        id: 'torso',
        local: { x: 0, y: 0 },
        rx: torso?.rx ?? 0.95,
        ry: torso?.ry ?? 1.0,
        z: 'main',
      },
      { id: 'head', local: { x: 0.5, y: 0 }, rx: 0.42, ry: 0.42, z: 'front' },
    ],
    legs: {
      count: 2,
      anchorPart: 'torso',
      baseAngleDeg: (i) => (i === 0 ? 100 : -100),
      attachDist: 0.35,
      homeDist: () => 1.3,
      l1: 0.75,
      l2: 0.75,
      liftHeight: 0.35,
      legWidthRoot: 0.18,
      legWidthTip: 0.11,
      gait: {
        stepDistance: 0.8,
        stepDuration: 0.14,
        overstep: 0.5,
        maxConcurrent: 1, // true biped: one foot at a time
        partnerStride: 1,
      },
      bendOutward: false, // biped: knees bias toward travel
      around: 'velocity',
    },
    arms: [arm(1), arm(-1)],
    weapon,
    idle: { breatheAmp: 0.015, breatheFreq: 2.0 },
  };
}

export function buildHumanoidSpec(classId: ClassId): RigSpec {
  return biped(weaponFor(classId));
}

/**
 * Per-boss silhouette treatment for `humanoid`-shaped bosses (item 62). The whole
 * expansion humanoid roster used to share ONE grey-axe biped — a Vampire Lord, a
 * Frost Giant and a Demon Lord differed only by tint and radius. Give each a
 * weapon (and, for a few, lean/broad proportions) that reads true to its fantasy,
 * the way `weaponFor` already differentiates the playable classes. Bosses not
 * listed fall back to the neutral heavy axe.
 */
interface BossBuild {
  weapon: WeaponSpec;
  torso?: { rx: number; ry: number };
}
const BOSS_HUMANOID: Partial<Record<MonsterId, BossBuild>> = {
  goblin: { weapon: m('dagger', 1.0, 0x7a9e3a), torso: { rx: 0.8, ry: 0.85 } }, // scrawny cutthroat
  kobold: { weapon: m('dagger', 0.9, 0xc06a2a), torso: { rx: 0.78, ry: 0.82 } }, // small firebrand
  bandit: { weapon: { ...m('sword', 1.5, 0xb0a080), offhand: 'dagger' } }, // sword-and-dirk brigand
  zombie: { weapon: m('claws', 1.0, 0x6a7a4a) }, // shambling, unarmed
  orc: { weapon: m('axe', 1.6, 0x6f8f4a) }, // brutish cleaver
  cyclops: { weapon: m('mace', 2.2, 0x9a8a6a), torso: { rx: 1.15, ry: 1.15 } }, // huge club
  ettin: { weapon: m('mace', 2.0, 0x8a7a5a), torso: { rx: 1.2, ry: 1.1 } }, // two-headed brute's club
  vampire: { weapon: m('sword', 1.9, 0xb0455a), torso: { rx: 0.82, ry: 1.05 } }, // lean, elegant blade
  frostGiant: { weapon: m('mace', 2.6, 0x8ac0e0), torso: { rx: 1.25, ry: 1.2 } }, // oversized maul
  mindflayer: { weapon: mr('staff', 1.9, 0x9c5cf0) }, // psionic caster, no melee weapon
  deathknight: { weapon: { ...m('sword', 2.0, 0x6a7a8a), offhand: 'shield' } }, // sword + shield
  demon: { weapon: m('claws', 1.3, 0xc0402a), torso: { rx: 1.2, ry: 1.15 } }, // clawed, broad
};

/** Shorthand builders for a melee / ranged weapon spec. */
function m(kind: WeaponSpec['kind'], length: number, color: number): WeaponSpec {
  return { kind, length, color, style: 'melee' };
}
function mr(kind: WeaponSpec['kind'], length: number, color: number): WeaponSpec {
  return { kind, length, color, style: 'ranged' };
}

/** A humanoid rig for a `humanoid`-silhouette boss. Differentiated per monster;
 *  omit the id (or pass an unmapped one) for the neutral heavy-axe fallback. */
export function buildBossHumanoidSpec(monsterId?: MonsterId): RigSpec {
  const build = (monsterId && BOSS_HUMANOID[monsterId]) || undefined;
  if (!build) return biped({ kind: 'axe', length: 1.7, color: 0x9aa4b2, style: 'melee' });
  return biped(build.weapon, build.torso);
}
