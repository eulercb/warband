/**
 * Warband — data-driven class definitions (Knight / Ranger / Mage / Cleric).
 * All balance numbers per the build brief §7; tweak freely.
 */
import type { ClassId, AbilitySlot, ExtSlot, ZoneKind } from '../core/types';
import { PLAYER_RADIUS, CLASS_COLORS, ATTACK_CD_SCALE } from '../core/constants';
import { procVariant, classVariant } from './procgen';
import { describeComposed, forgeVariant, synthesizeClass, type Donor } from './forge';

/** How an ability resolves. Interpreted by abilities.ts. */
export type AbilityKind =
  | 'meleeCone' // frontal arc hit (Cleave, Shield Bash)
  | 'projectile' // fires 1+ projectiles toward aim (Arrow, Bolt, Fireball, Smite, Multishot)
  | 'groundZone' // spawns a persistent zone (Rain of Arrows, Sanctuary)
  | 'pbaoe' // instant point-blank AoE around self (Frost Nova)
  | 'dash' // move in the move direction, optional i-frames (Roll)
  | 'blink' // teleport toward aim (Blink)
  | 'selfBuff' // buff self (Shield Wall)
  | 'buffAlly' // buff an auto-targeted ally / self (Blessing)
  | 'heal' // heal an auto-targeted ally (Heal)
  | 'taunt'; // force boss focus + top threat (Taunt)

export interface PlayerAbilityDef {
  /** Base kit slot, or a subclass slot (sub1/sub2) once a subclass skill is bound. */
  slot: ExtSlot;
  name: string;
  kind: AbilityKind;
  cooldown: number; // s
  damage: number; // damage or heal magnitude (0 if none)

  // shape / targeting params (all optional; used per kind)
  range?: number; // cone range / dash-blink distance / target search radius
  radius?: number; // pbaoe / zone radius / impact radius
  halfAngleDeg?: number; // cone half-angle
  projSpeed?: number;
  projCount?: number;
  spreadDeg?: number;
  castTime?: number; // rooted cast before firing (Fireball)
  impactRadius?: number; // projectile AoE-on-impact radius

  iframes?: number; // dash i-frame duration
  stun?: number; // applied to boss/adds on hit
  slowMult?: number; // < 1 slows target move speed
  slowDuration?: number;

  buffDamageMult?: number; // e.g. 1.25
  buffDefMult?: number; // damage-taken mult, e.g. 0.8 or 0.5
  buffMoveMult?: number; // move-speed mult granted by a self/ally buff (Rage)
  buffDuration?: number;

  zoneDuration?: number;
  zoneTickDamage?: number; // to enemies inside
  zoneTickHeal?: number; // to allies inside
  /** Explicit zone flavour (drives colour + placement). Inferred if omitted. */
  zoneKind?: ZoneKind;
  /**
   * item 9 — a true ROOT zone: an enemy standing inside is immobilised (base
   * movement AND blink / charge / teleport disabled), not merely slowed. Set on
   * abilities described as roots (Druid's Entangle); ordinary snare zones keep just
   * their `slowMult`. Applied per tick alongside the slow (see world.applyZoneTick).
   */
  roots?: boolean;

  // --- extended mechanics (also the levers character upgrades tug on) ---
  /** Ranged travel cap (world units); falls back to PROJECTILE_MAX_RANGE. */
  maxRange?: number;
  /** Stun/"freeze" seconds applied to enemies a pbaoe or projectile strikes. */
  freeze?: number;
  /** Heal the caster this fraction of the damage this ability deals (melee/pbaoe). */
  lifestealFrac?: number;
  /** Flat self-heal on use (escapes: Roll/Blink/Leap that patch you up). */
  healOnUse?: number;
  /** Point-blank AoE damage dealt on a dash/leap landing (0 = none). */
  landingDamage?: number;

  /**
   * Chaos Forge (docs/CHAOS_FORGE.md) — the recombined component form of a
   * SYNTHESIZED ability: a delivery + an ordered payload of effect components.
   * Present ONLY on procedurally-fused skills; the executor (combat/abilities.ts)
   * dispatches to the component path when it is set, and `describeAbility`
   * regenerates the card text from it. Canonical/authored and numeric-variance
   * content never carries it, so those paths stay byte-for-byte unchanged. The
   * flat fields above are kept in sync (delivery kind + implied numbers) so every
   * component-unaware consumer (cooldown gating, HUD, previews) still works. Typed
   * via a type-only import to avoid a runtime import cycle. */
  components?: import('./forge').AbilityComponents;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  color: number;
  role: string;
  maxHp: number;
  moveSpeed: number;
  threatMult: number;
  radius: number;
  abilities: Record<AbilitySlot, PlayerAbilityDef>;
  blurb: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    color: CLASS_COLORS.knight,
    role: 'Tank / Aggro / Peel',
    maxHp: 240,
    moveSpeed: 190,
    threatMult: 1.5,
    radius: PLAYER_RADIUS,
    blurb: 'Durable frontline. Holds the boss and protects the squishies.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Cleave',
        kind: 'meleeCone',
        cooldown: 0.7,
        damage: 22,
        range: 70,
        halfAngleDeg: 45,
      },
      a1: {
        slot: 'a1',
        name: 'Taunt',
        kind: 'taunt',
        cooldown: 12,
        damage: 0,
        buffDuration: 4,
      },
      a2: {
        slot: 'a2',
        name: 'Shield Wall',
        kind: 'selfBuff',
        cooldown: 16,
        damage: 0,
        buffDefMult: 0.5,
        buffDuration: 4,
      },
      a3: {
        slot: 'a3',
        name: 'Shield Bash',
        kind: 'meleeCone',
        cooldown: 8,
        damage: 30,
        range: 60,
        halfAngleDeg: 40,
        stun: 0.8,
      },
    },
  },

  ranger: {
    id: 'ranger',
    name: 'Ranger',
    color: CLASS_COLORS.ranger,
    role: 'Mobile Ranged DPS',
    maxHp: 130,
    moveSpeed: 240,
    threatMult: 1.0,
    radius: PLAYER_RADIUS,
    blurb: 'Fast, safe, consistent damage from range.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Arrow',
        kind: 'projectile',
        cooldown: 0.5,
        damage: 20,
        projSpeed: 700,
        projCount: 1,
      },
      a1: {
        slot: 'a1',
        name: 'Multishot',
        kind: 'projectile',
        cooldown: 6,
        damage: 16,
        projSpeed: 700,
        projCount: 3,
        spreadDeg: 30,
      },
      a2: {
        slot: 'a2',
        name: 'Rain of Arrows',
        kind: 'groundZone',
        cooldown: 12,
        damage: 0,
        range: 500, // max ground-target distance
        radius: 120,
        zoneDuration: 3,
        zoneTickDamage: 12,
        zoneKind: 'rainOfArrows',
      },
      a3: {
        slot: 'a3',
        name: 'Roll',
        kind: 'dash',
        cooldown: 5,
        damage: 0,
        range: 220,
        iframes: 0.3,
      },
    },
  },

  mage: {
    id: 'mage',
    name: 'Mage',
    color: CLASS_COLORS.mage,
    role: 'Burst DPS + Control',
    maxHp: 100,
    moveSpeed: 200,
    threatMult: 1.0,
    radius: PLAYER_RADIUS,
    blurb: 'Highest burst, lowest HP. Brings crowd control.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Arcane Bolt',
        kind: 'projectile',
        cooldown: 0.45,
        damage: 16,
        projSpeed: 620,
        projCount: 1,
      },
      a1: {
        slot: 'a1',
        name: 'Fireball',
        kind: 'projectile',
        cooldown: 7,
        damage: 70,
        projSpeed: 480,
        projCount: 1,
        castTime: 0.7,
        impactRadius: 100,
      },
      a2: {
        slot: 'a2',
        name: 'Frost Nova',
        kind: 'pbaoe',
        cooldown: 10,
        damage: 20,
        radius: 150,
        slowMult: 0.6,
        slowDuration: 3,
      },
      a3: {
        slot: 'a3',
        name: 'Blink',
        kind: 'blink',
        cooldown: 6,
        damage: 0,
        range: 250,
      },
    },
  },

  cleric: {
    id: 'cleric',
    name: 'Cleric',
    color: CLASS_COLORS.cleric,
    role: 'Healer / Support',
    maxHp: 160,
    moveSpeed: 200,
    threatMult: 0.5,
    radius: PLAYER_RADIUS,
    blurb: 'Keeps the team alive. Light damage, strong buffs.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Smite',
        kind: 'projectile',
        cooldown: 0.6,
        damage: 12,
        projSpeed: 560,
        projCount: 1,
      },
      a1: {
        slot: 'a1',
        name: 'Heal',
        kind: 'heal',
        cooldown: 3,
        damage: 60, // heal amount
        range: 400,
      },
      a2: {
        slot: 'a2',
        name: 'Sanctuary',
        kind: 'groundZone',
        cooldown: 14,
        damage: 0,
        radius: 140,
        zoneDuration: 4,
        zoneTickHeal: 10,
        zoneKind: 'sanctuary',
      },
      a3: {
        slot: 'a3',
        name: 'Blessing',
        kind: 'buffAlly',
        cooldown: 12,
        damage: 0,
        range: 400,
        buffDamageMult: 1.25,
        buffDefMult: 0.8,
        buffDuration: 6,
      },
    },
  },

  // -------------------------------------------------------------------------
  // Expansion classes (DnD / medieval themed)
  // -------------------------------------------------------------------------

  barbarian: {
    id: 'barbarian',
    name: 'Barbarian',
    color: CLASS_COLORS.barbarian,
    role: 'Melee Bruiser / Rage',
    maxHp: 210,
    moveSpeed: 205,
    threatMult: 1.2,
    radius: PLAYER_RADIUS,
    blurb: 'Reckless frontliner. Whirls into the fray and hits like a landslide.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Reckless Swing',
        kind: 'meleeCone',
        cooldown: 0.65,
        damage: 26,
        range: 82,
        halfAngleDeg: 55,
      },
      a1: {
        slot: 'a1',
        name: 'Rage',
        kind: 'selfBuff',
        cooldown: 14,
        damage: 0,
        buffDamageMult: 1.35,
        buffMoveMult: 1.2,
        buffDuration: 6,
      },
      a2: {
        slot: 'a2',
        name: 'Leap',
        kind: 'dash',
        cooldown: 7,
        damage: 0,
        range: 270,
        iframes: 0.25,
        landingDamage: 22,
        radius: 120,
      },
      a3: {
        slot: 'a3',
        name: 'Whirlwind',
        kind: 'pbaoe',
        cooldown: 9,
        damage: 34,
        radius: 135,
      },
    },
  },

  rogue: {
    id: 'rogue',
    name: 'Rogue',
    color: CLASS_COLORS.rogue,
    role: 'Melee Burst / Evasion',
    maxHp: 120,
    moveSpeed: 252,
    threatMult: 0.9,
    radius: PLAYER_RADIUS,
    blurb: 'Strikes from the shadows for huge bursts, then slips away untouched.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Slash',
        kind: 'meleeCone',
        cooldown: 0.42,
        damage: 18,
        range: 62,
        halfAngleDeg: 42,
      },
      a1: {
        slot: 'a1',
        name: 'Backstab',
        kind: 'meleeCone',
        cooldown: 5,
        damage: 58,
        range: 58,
        halfAngleDeg: 32,
      },
      a2: {
        slot: 'a2',
        name: 'Shadowstep',
        kind: 'blink',
        cooldown: 6,
        damage: 0,
        range: 240,
        iframes: 0.3,
      },
      a3: {
        slot: 'a3',
        name: 'Poison Vial',
        kind: 'groundZone',
        cooldown: 10,
        damage: 0,
        range: 420,
        radius: 105,
        zoneDuration: 4,
        zoneTickDamage: 11,
        zoneKind: 'poison',
      },
    },
  },

  paladin: {
    id: 'paladin',
    name: 'Paladin',
    color: CLASS_COLORS.paladin,
    role: 'Off-Tank / Support Hybrid',
    maxHp: 200,
    moveSpeed: 196,
    threatMult: 1.3,
    radius: PLAYER_RADIUS,
    blurb: 'Holy warrior. Shields the band, mends wounds, and smites the wicked.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Holy Strike',
        kind: 'meleeCone',
        cooldown: 0.7,
        damage: 23,
        range: 72,
        halfAngleDeg: 45,
      },
      a1: {
        slot: 'a1',
        name: 'Consecration',
        kind: 'groundZone',
        cooldown: 13,
        damage: 0,
        radius: 150,
        zoneDuration: 5,
        zoneTickDamage: 8,
        zoneTickHeal: 8,
        zoneKind: 'consecration',
      },
      a2: {
        slot: 'a2',
        name: 'Lay on Hands',
        kind: 'heal',
        cooldown: 6,
        damage: 90,
        range: 360,
      },
      a3: {
        slot: 'a3',
        name: 'Divine Shield',
        kind: 'selfBuff',
        cooldown: 16,
        damage: 0,
        buffDefMult: 0.35,
        buffDuration: 4,
      },
    },
  },

  druid: {
    id: 'druid',
    name: 'Druid',
    color: CLASS_COLORS.druid,
    role: 'Nature Caster / Control',
    maxHp: 140,
    moveSpeed: 206,
    threatMult: 0.8,
    radius: PLAYER_RADIUS,
    blurb: 'Bends nature to snare the enemy and knit the wounded back together.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Thornlash',
        kind: 'projectile',
        cooldown: 0.5,
        damage: 17,
        projSpeed: 640,
        projCount: 1,
      },
      a1: {
        slot: 'a1',
        name: 'Entangle',
        kind: 'groundZone',
        cooldown: 10,
        damage: 0,
        range: 460,
        radius: 125,
        zoneDuration: 4,
        zoneTickDamage: 6,
        slowMult: 0.3,
        slowDuration: 1.2,
        zoneKind: 'entangle',
        roots: true, // item 9: a true root — immobilises + locks out blink/charge/teleport
      },
      a2: {
        slot: 'a2',
        name: 'Regrowth',
        kind: 'heal',
        cooldown: 4,
        damage: 55,
        range: 380,
      },
      a3: {
        slot: 'a3',
        name: 'Cyclone',
        kind: 'pbaoe',
        cooldown: 9,
        damage: 24,
        radius: 155,
        slowMult: 0.5,
        slowDuration: 2,
      },
    },
  },

  // -------------------------------------------------------------------------
  // The remaining DnD base classes (Bard / Monk / Sorcerer / Warlock)
  // -------------------------------------------------------------------------

  bard: {
    id: 'bard',
    name: 'Bard',
    color: CLASS_COLORS.bard,
    role: 'Support / Control',
    maxHp: 150,
    moveSpeed: 212,
    threatMult: 0.7,
    radius: PLAYER_RADIUS,
    blurb: 'Weaves song into war: mocks foes, mends allies, and rallies the band.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Vicious Mockery',
        kind: 'projectile',
        cooldown: 0.55,
        damage: 15,
        projSpeed: 600,
        projCount: 1,
        slowMult: 0.8,
        slowDuration: 1,
      },
      a1: {
        slot: 'a1',
        name: 'Inspiration',
        kind: 'buffAlly',
        cooldown: 12,
        damage: 0,
        range: 420,
        buffDamageMult: 1.2,
        buffDefMult: 0.85,
        buffDuration: 6,
      },
      a2: {
        slot: 'a2',
        name: 'Healing Word',
        kind: 'heal',
        cooldown: 4,
        damage: 50,
        range: 420,
      },
      a3: {
        slot: 'a3',
        name: 'Dissonant Whispers',
        kind: 'pbaoe',
        cooldown: 10,
        damage: 22,
        radius: 150,
        slowMult: 0.5,
        slowDuration: 2,
      },
    },
  },

  monk: {
    id: 'monk',
    name: 'Monk',
    color: CLASS_COLORS.monk,
    role: 'Melee Skirmisher',
    maxHp: 150,
    moveSpeed: 250,
    threatMult: 0.95,
    radius: PLAYER_RADIUS,
    blurb: 'Flowing martial artist — a blur of strikes that stuns, then vanishes.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Flurry of Blows',
        kind: 'meleeCone',
        cooldown: 0.4,
        damage: 15,
        range: 66,
        halfAngleDeg: 40,
      },
      a1: {
        slot: 'a1',
        name: 'Stunning Strike',
        kind: 'meleeCone',
        cooldown: 8,
        damage: 34,
        range: 62,
        halfAngleDeg: 36,
        stun: 0.9,
      },
      a2: {
        slot: 'a2',
        name: 'Step of the Wind',
        kind: 'dash',
        cooldown: 5,
        damage: 0,
        range: 250,
        iframes: 0.3,
        healOnUse: 18,
      },
      a3: {
        slot: 'a3',
        name: 'Quivering Palm',
        kind: 'pbaoe',
        cooldown: 9,
        damage: 30,
        radius: 130,
      },
    },
  },

  sorcerer: {
    id: 'sorcerer',
    name: 'Sorcerer',
    color: CLASS_COLORS.sorcerer,
    role: 'Burst DPS + Mobility',
    maxHp: 105,
    moveSpeed: 205,
    threatMult: 1.0,
    radius: PLAYER_RADIUS,
    blurb: 'Raw innate magic — twin chaos bolts, a falling meteor, a blink to safety.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Chaos Bolt',
        kind: 'projectile',
        cooldown: 0.5,
        damage: 15,
        projSpeed: 640,
        projCount: 2,
        spreadDeg: 10,
      },
      a1: {
        slot: 'a1',
        name: 'Meteor',
        kind: 'projectile',
        cooldown: 8,
        damage: 78,
        projSpeed: 460,
        projCount: 1,
        castTime: 0.75,
        impactRadius: 110,
      },
      a2: {
        slot: 'a2',
        name: 'Mirror Image',
        kind: 'selfBuff',
        cooldown: 14,
        damage: 0,
        buffDefMult: 0.6,
        buffMoveMult: 1.15,
        buffDuration: 5,
      },
      a3: {
        slot: 'a3',
        name: 'Arcane Leap',
        kind: 'blink',
        cooldown: 6,
        damage: 0,
        range: 260,
        iframes: 0.2,
      },
    },
  },

  warlock: {
    id: 'warlock',
    name: 'Warlock',
    color: CLASS_COLORS.warlock,
    role: 'Ranged Attrition',
    maxHp: 130,
    moveSpeed: 208,
    threatMult: 1.0,
    radius: PLAYER_RADIUS,
    blurb: 'Pledged to a dark patron: eldritch blasts, cursed ground, and stolen life.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Eldritch Blast',
        kind: 'projectile',
        cooldown: 0.55,
        damage: 22,
        projSpeed: 660,
        projCount: 1,
        lifestealFrac: 0.15,
      },
      a1: {
        slot: 'a1',
        name: 'Hex',
        kind: 'groundZone',
        cooldown: 11,
        damage: 0,
        range: 460,
        radius: 120,
        zoneDuration: 5,
        zoneTickDamage: 12,
        slowMult: 0.7,
        slowDuration: 1,
        zoneKind: 'poison',
      },
      a2: {
        slot: 'a2',
        name: 'Hellish Rebuke',
        kind: 'pbaoe',
        cooldown: 9,
        damage: 30,
        radius: 140,
        lifestealFrac: 0.2,
      },
      a3: {
        slot: 'a3',
        name: "Dark One's Blessing",
        kind: 'selfBuff',
        cooldown: 14,
        damage: 0,
        buffDamageMult: 1.3,
        buffDuration: 6,
      },
    },
  },
};

export const CLASS_IDS: ClassId[] = [
  'knight',
  'ranger',
  'mage',
  'cleric',
  'barbarian',
  'rogue',
  'paladin',
  'druid',
  'bard',
  'monk',
  'sorcerer',
  'warlock',
];
export const DEFAULT_CLASS: ClassId = 'knight';

/**
 * Resolve a class def — the RUN'S rolled variant while a procedural run is
 * active (see content/procgen.ts; numbers + skill names re-rolled from the
 * shared master seed within the class's identity envelope), else the canonical
 * authored def. Every consumer that should follow the run (the sim spawn, the
 * HUD/preview paths, grafts, the balance estimator) resolves through here;
 * identity fields (id/name/colour/role) are unchanged either way, so static
 * `CLASSES[...]` reads of those stay valid.
 */
export function getClass(id: ClassId): ClassDef {
  // Chaos Forge (docs/CHAOS_FORGE.md) takes precedence when its run is active:
  // the class is a component-recombined FUSION (fused kit + fused name) keyed by
  // id, so every "knight" this run plays the same synthesized kit. Falls through
  // to numeric-variance (procgen) then canonical when Forge is off — Forge layers
  // on top of the other modes, it never mutates the canonical data.
  const forged = forgeVariant('class', id, (seed) =>
    synthesizeClass(seed, CLASSES[id], forgeDonors()),
  );
  if (forged) return forged;
  return procVariant('class', id, (seed) => classVariant(seed, CLASSES[id])) ?? CLASSES[id];
}

/**
 * The component library Chaos Forge draws from: every CANONICAL class ability,
 * tagged with its source. Built from the static CLASSES table (NOT getClass, to
 * avoid recursion) and memoized — it is stable for the process, and a class
 * added in a future update joins the pool automatically (req. 10). */
let FORGE_DONORS: Donor[] | null = null;
function forgeDonors(): Donor[] {
  if (FORGE_DONORS) return FORGE_DONORS;
  const out: Donor[] = [];
  for (const cid of CLASS_IDS) {
    const c = CLASSES[cid];
    for (const slot of ['basic', 'a1', 'a2', 'a3'] as AbilitySlot[]) {
      out.push({
        name: c.abilities[slot].name,
        classId: cid,
        className: c.name,
        slot,
        def: c.abilities[slot],
      });
    }
  }
  FORGE_DONORS = out;
  return out;
}

/** Ability kinds that count as a twitchy "attack" for the global CD slow-down. */
const ATTACK_KINDS = new Set<AbilityKind>(['meleeCone', 'projectile', 'pbaoe']);

/**
 * Slow down the direct-damage "attack" cooldowns by ATTACK_CD_SCALE so blows land
 * less often but hit with more weight (see constants). Leaves heals, buffs, taunts
 * and pure mobility untouched. Mutates the table in place; applied AFTER cloning
 * (and after character upgrades) in BOTH the sim spawn and the HUD preview, so the
 * numbers a player sees and the numbers the sim commits always agree.
 */
export function slowAttackCooldowns(abilities: Record<AbilitySlot, PlayerAbilityDef>): void {
  for (const slot of ['basic', 'a1', 'a2', 'a3'] as AbilitySlot[]) {
    const ab = abilities[slot];
    if (slot === 'basic' || ATTACK_KINDS.has(ab.kind)) ab.cooldown *= ATTACK_CD_SCALE;
  }
}

/**
 * Deep-clone a class's ability table so a single hero can carry per-run character
 * upgrades that mutate its own ability numbers/mechanics without touching the
 * shared class data (see engine/charUpgrades.ts). Called once per spawn.
 */
export function cloneAbilities(
  src: Record<AbilitySlot, PlayerAbilityDef>,
): Record<AbilitySlot, PlayerAbilityDef> {
  return {
    basic: { ...src.basic },
    a1: { ...src.a1 },
    a2: { ...src.a2 },
    a3: { ...src.a3 },
  };
}

/**
 * A compact, player-facing effect line for a base-kit ability (item 19) — the
 * concrete numbers behind its icon: damage/heal, projectile count, blast/reach/
 * radius, cast/stun/slow seconds, buff percentages + duration, lifesteal, i-frames
 * and the cooldown. The upgrade cards already read this legibly (upgrades.ts /
 * charUpgrades.ts); this brings the same clarity to the abilities themselves.
 *
 * PURE — it reads only the def, so passing a hero's *resolved* ability (post
 * grafts/boons, e.g. from `previewAbilityTable`) reflects their current numbers.
 * `slot` is ignored, so a subclass skill's ability (which carries no slot)
 * describes fine too. Rounds like the reward cards: magnitudes to whole units,
 * seconds to one decimal, ratios to whole percents.
 */
export function describeAbility(def: Omit<PlayerAbilityDef, 'slot'>): string {
  // Chaos Forge — a synthesized ability regenerates its card text from its
  // recombined component list (there is no author to write copy for a fused
  // skill). Canonical/variance content carries no components and keeps the
  // authored flat-field walk below, so its cards are byte-for-byte unchanged.
  if (def.components) return describeComposed(def.components, def.cooldown);
  const n = (v: number): string => `${Math.round(v)}`;
  // Up to two decimals (trailing zeros drop naturally), so a 0.25s i-frame or a
  // 1.1s cooldown both read exactly, matching the reward cards' precision.
  const s = (v: number): string => `${Math.round(v * 100) / 100}s`;
  const parts: string[] = [];

  // --- Primary magnitude (what it does when it lands) ---
  if (def.kind === 'taunt') parts.push('Pull aggro');
  if (def.kind === 'heal' && def.damage > 0) {
    parts.push(`Heal ${n(def.damage)}`);
  } else if (def.damage > 0) {
    const count = def.projCount ?? 1;
    parts.push(count > 1 ? `${count}× ${n(def.damage)} dmg` : `${n(def.damage)} dmg`);
  }
  if (def.landingDamage) parts.push(`${n(def.landingDamage)} landing dmg`);
  if (def.zoneTickDamage) parts.push(`${n(def.zoneTickDamage)}/tick dmg`);
  if (def.zoneTickHeal) parts.push(`${n(def.zoneTickHeal)}/tick heal`);
  if (def.healOnUse) parts.push(`heal ${n(def.healOnUse)}`);

  // --- Shape / reach ---
  if (def.impactRadius) parts.push(`${n(def.impactRadius)}u blast`);
  else if (def.radius) parts.push(`${n(def.radius)}u radius`);
  if (def.kind === 'meleeCone' && def.range) {
    parts.push(`${n(def.range)}u reach`);
    if (def.halfAngleDeg) parts.push(`${n(def.halfAngleDeg * 2)}° arc`);
  } else if ((def.kind === 'dash' || def.kind === 'blink') && def.range) {
    parts.push(`${n(def.range)}u ${def.kind === 'blink' ? 'blink' : 'dash'}`);
  }

  // --- Timing / control ---
  if (def.castTime) parts.push(`${s(def.castTime)} cast`);
  if (def.stun) parts.push(`${s(def.stun)} stun`);
  if (def.freeze) parts.push(`${s(def.freeze)} freeze`);
  // A true root (item 3) supersedes its slow — the target is held fast (no move,
  // blink, charge or teleport), so read it as "roots" rather than a % slow.
  if (def.roots) {
    parts.push('roots');
  } else if (def.slowMult != null && def.slowMult < 1) {
    const dur = def.slowDuration ? ` for ${s(def.slowDuration)}` : '';
    parts.push(`slow to ${n(def.slowMult * 100)}%${dur}`);
  }

  // --- Buffs (damage/move up, damage-taken down) ---
  if (def.buffDamageMult) parts.push(`+${n((def.buffDamageMult - 1) * 100)}% dmg`);
  if (def.buffMoveMult) parts.push(`+${n((def.buffMoveMult - 1) * 100)}% move`);
  if (def.buffDefMult) parts.push(`${n((1 - def.buffDefMult) * 100)}% less dmg taken`);

  // --- Duration (a buff's or a ground zone's) ---
  if (def.buffDuration) parts.push(`for ${s(def.buffDuration)}`);
  else if (def.zoneDuration) parts.push(`lasts ${s(def.zoneDuration)}`);

  // --- Sustain / evasion / who it can reach ---
  if (def.lifestealFrac) parts.push(`${n(def.lifestealFrac * 100)}% lifesteal`);
  if (def.iframes) parts.push(`${s(def.iframes)} i-frames`);
  if ((def.kind === 'heal' || def.kind === 'buffAlly') && def.range && def.range > 1) {
    parts.push(`${n(def.range)}u range`);
  }

  // --- Cooldown always closes the line ---
  parts.push(`${s(def.cooldown)} cooldown`);

  return parts.join(' · ');
}
