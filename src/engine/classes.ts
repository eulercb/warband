/**
 * Warband — data-driven class definitions (Knight / Ranger / Mage / Cleric).
 * All balance numbers per the build brief §7; tweak freely.
 */
import type { ClassId, AbilitySlot } from './types';
import { PLAYER_RADIUS, CLASS_COLORS } from './constants';

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
  buffDuration?: number;

  zoneDuration?: number;
  zoneTickDamage?: number; // to enemies inside
  zoneTickHeal?: number; // to allies inside
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
};

export const CLASS_IDS: ClassId[] = ['knight', 'ranger', 'mage', 'cleric'];
export const DEFAULT_CLASS: ClassId = 'knight';

export function getClass(id: ClassId): ClassDef {
  return CLASSES[id];
}
