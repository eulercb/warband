/**
 * Warband — data-driven class definitions (Knight / Ranger / Mage / Cleric).
 * All balance numbers per the build brief §7; tweak freely.
 */
import type { ClassId, AbilitySlot, ZoneKind } from '../core/types';
import { PLAYER_RADIUS, CLASS_COLORS } from '../core/constants';

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
  slot: AbilitySlot;
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
];
export const DEFAULT_CLASS: ClassId = 'knight';

export function getClass(id: ClassId): ClassDef {
  return CLASSES[id];
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
