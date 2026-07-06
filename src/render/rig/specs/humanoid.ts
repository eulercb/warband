/**
 * Warband — humanoid (playable hero) rig. A top-down articulated biped: the
 * torso + head + arms track the AIM vector (twin-stick read of where the hero
 * points), while the two legs orient to the TRAVEL direction and step with a
 * walk-cycle gait. Each class carries a distinct simple-shape weapon.
 */
import type { ClassId } from '../../../engine/types';
import { CLASS_COLORS } from '../../../engine/constants';
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
    default:
      return { kind: 'sword', length: 2.0, color: c, style: 'melee' };
  }
}

function biped(weapon: WeaponSpec): RigSpec {
  return {
    id: 'humanoid',
    parts: [
      { id: 'torso', local: { x: 0, y: 0 }, rx: 0.95, ry: 1.0, z: 'main' },
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

/** A humanoid rig for `humanoid`-silhouette bosses: the biped with a heavy axe. */
export function buildBossHumanoidSpec(): RigSpec {
  return biped({ kind: 'axe', length: 1.7, color: 0x9aa4b2, style: 'melee' });
}
