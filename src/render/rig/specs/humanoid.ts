/**
 * Warband — humanoid (playable hero) rig. A top-down articulated biped: the
 * torso + head + arms track the AIM vector (twin-stick read of where the hero
 * points), while the two legs orient to the TRAVEL direction and step with a
 * walk-cycle gait. Each class carries a distinct simple-shape weapon.
 */
import type { ClassId, MonsterId } from '../../../engine/core/types';
import { CLASS_COLORS } from '../../../engine/core/constants';
import type { RigSpec, WeaponSpec, ArmSpec, BodyPartSpec, DecorSpec } from '../types';

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
      // Sword-and-board tank: a blue kite shield with a gold boss on the off-arm.
      return {
        kind: 'sword',
        length: 2.0,
        color: c,
        style: 'melee',
        offhand: 'shield',
        accent: 0xf2c14e,
      };
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
      return { kind: 'mace', length: 1.3, color: 0xf2c14e, style: 'melee', accent: 0xc99a2e };
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
  const spec = biped(weaponFor(classId));
  dressHero(spec, classId);
  return spec;
}

// --- Per-class field dress-up ------------------------------------------------
//
// Each of the four core classes layers a handful of extra simple-shape parts +
// decorative accents onto the shared biped so it reads distinctly from the top
// down instead of a near-identical ellipse biped — a steel-cuirassed Knight with
// pauldrons + a kite shield, a hooded Ranger with a fletched quiver, a wide-brim-
// hatted Mage with an orb-staff, a haloed Cleric with a chest sigil. Every piece
// is either a tinted sphere part, an unfilled-ring decor, or a weapon trim, so the
// LitMesh lighting + hit-flash pipeline keeps working unchanged. All sizes are in
// R units, so the dress scales with PLAYER_RADIUS like every other part. The class
// aura / tint / HP-bar overlays are untouched. Expansion classes keep the plain
// biped (their recipe follows the same pattern when their turn comes).

/** A solid sphere-sprite dress part (helm, pauldron, hood, hat, quiver, plume…). */
function part(
  id: string,
  parent: 'head' | 'torso',
  local: { x: number; y: number },
  rx: number,
  ry: number,
  z: BodyPartSpec['z'],
  tint: number,
): BodyPartSpec {
  return { id, parent, local, rx, ry, z, tint };
}

/** An unfilled-ring decor accent (halo, pauldron rim, robe / vestment trim). */
function ring(
  anchorPart: string,
  local: { x: number; y: number },
  scale: number,
  color: number,
  ringWidth: number,
  glow = false,
): DecorSpec {
  return { kind: 'ring', anchorPart, local, scale, color, ringWidth, glow };
}

/** Recolour a base body part (torso / head) for a class's material. */
function setTint(spec: RigSpec, id: string, tint: number): void {
  const p = spec.parts.find((q) => q.id === id);
  if (p) p.tint = tint;
}

function dressHero(spec: RigSpec, classId: ClassId): void {
  switch (classId) {
    case 'knight': {
      setTint(spec, 'torso', 0x505c6b); // steel cuirass
      setTint(spec, 'head', 0x8d97a8); // steel helm
      spec.parts.push(
        part('pauldronL', 'torso', { x: 0.05, y: 0.62 }, 0.3, 0.3, 'front', 0x7f8a9c),
        part('pauldronR', 'torso', { x: 0.05, y: -0.62 }, 0.3, 0.3, 'front', 0x7f8a9c),
        part('plume', 'head', { x: 0.42, y: 0 }, 0.2, 0.12, 'front', 0x4a90d9),
      );
      // Blue rim on each steel pauldron. (Shield boss rides the weapon accent.)
      spec.decor = [
        ring('pauldronL', { x: 0, y: 0 }, 0.3, 0x35507a, 0.07),
        ring('pauldronR', { x: 0, y: 0 }, 0.3, 0x35507a, 0.07),
      ];
      break;
    }
    case 'ranger': {
      setTint(spec, 'torso', 0x3e6430); // dark cloak
      setTint(spec, 'head', 0xd9b38c); // skin, peeking under the hood
      spec.parts.push(
        // Hood sits in the body layer so the head (front) draws over it — skin peeks.
        part('hood', 'head', { x: -0.04, y: 0 }, 0.58, 0.54, 'main', 0x2e5426),
        part('quiver', 'torso', { x: -0.1, y: -0.72 }, 0.13, 0.34, 'front', 0x5a3b1e),
        part('fletchA', 'torso', { x: 0.12, y: -0.78 }, 0.06, 0.06, 'front', 0xe6dfc8),
        part('fletchB', 'torso', { x: 0.12, y: -0.66 }, 0.06, 0.06, 'front', 0xc94f3d),
      );
      break;
    }
    case 'mage': {
      setTint(spec, 'torso', 0x4a2d7e); // robe
      setTint(spec, 'head', 0xd9b38c); // skin (mostly hidden by the hat)
      spec.parts.push(
        part('hatBrim', 'head', { x: 0, y: 0 }, 0.62, 0.6, 'front', 0x2c1a4d),
        part('hatCrown', 'head', { x: 0.06, y: 0 }, 0.34, 0.34, 'front', 0x40276e),
      );
      spec.decor = [
        ring('hatCrown', { x: 0, y: 0 }, 0.32, 0xc99a2e, 0.09), // gold hat band
        ring('torso', { x: 0, y: 0 }, 0.66, 0x9c5cf0, 0.06), // robe trim
      ];
      // Orb pulse rides the staff weapon (drawWeapon), so no extra part is needed.
      break;
    }
    case 'cleric': {
      setTint(spec, 'torso', 0xdecfa6); // cream vestment
      setTint(spec, 'head', 0xd9b38c); // skin
      spec.decor = [
        ring('head', { x: -0.05, y: 0 }, 0.52, 0xf2c14e, 0.07, true), // glowing halo
        ring('torso', { x: 0, y: 0 }, 0.68, 0xc99a2e, 0.06), // gold vestment trim
        // Holy diamond sigil on the chest. (Mace haft band rides the weapon accent.)
        {
          kind: 'marking',
          anchorPart: 'torso',
          local: { x: 0.22, y: 0 },
          scale: 0.18,
          color: 0xc99a2e,
        },
      ];
      break;
    }
    default:
      break; // expansion classes keep the plain biped
  }
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
