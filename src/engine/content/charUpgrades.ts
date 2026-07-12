/**
 * Warband — character (class-specific) upgrades earned between bosses. PURE TS.
 *
 * Alongside the generic run upgrades (engine/upgrades.ts), after every boss each
 * hero also picks ONE character upgrade drawn from their class's pool. These are
 * deliberately more transformative than the generic stat bumps — they retune a
 * class's ability *numbers and mechanics* (a Mage's Frost Nova can be taught to
 * freeze solid; a Fireball's cast time can be shaved down to a snap; a Barbarian's
 * swings can start to drink blood). Picks accumulate across the run and are
 * applied to a hero's private (cloned) ability table when the next fight spawns,
 * so the whole system stays data-driven and unit-testable without any UI.
 */
import type { ClassId, AbilitySlot, Player } from '../core/types';
import type { PlayerAbilityDef } from './classes';
import { CLASSES, cloneAbilities, slowAttackCooldowns, describeAbility } from './classes';
import { applyUpgrades, type UpgradeId } from './upgrades';
import { MAX_SKILL_STACKS } from '../core/constants';

/** What an upgrade's `apply` receives: the hero and their private ability table. */
export interface CharUpgradeCtx {
  player: Player;
  abilities: Record<AbilitySlot, PlayerAbilityDef>;
}

export interface CharUpgradeDef {
  id: string;
  /**
   * Which class may take this upgrade. `'any'` marks a HYBRID upgrade — a
   * cross-class power or whole combat style any hero can adopt (a Knight who
   * learns Fireball, a Cleric who turns vampiric…).
   */
  classId: ClassId | 'any';
  /**
   * Classes a hybrid ('any') upgrade is NEVER offered to or applied on —
   * used to keep grafts from duplicating a class's own kit (a Mage taking
   * Pyromancer's Pact) or bricking its role (a healer replacing their real
   * heal with the field-dressed one).
   */
  exclude?: ClassId[];
  name: string;
  desc: string;
  icon: string;
  /**
   * Most times this upgrade can be taken across a run (class SKILL cap). Once a
   * hero owns this many, it drops out of the offer pool. Defaults to
   * MAX_SKILL_STACKS; one-shot transforms (grafts / whole-kit styles) set 1 so a
   * "replace this slot" pick is never offered again pointlessly.
   */
  maxStacks?: number;
  /**
   * For a graft that swaps out one of the hero's ability slots: which slot it
   * replaces. The reward UI reads this to show the REAL name of the ability being
   * replaced ("Replaces Fireball") instead of a cryptic slot code.
   */
  replaces?: AbilitySlot;
  /**
   * For a graft: the source class + slot the ability is copied FROM. Lets the
   * re-offer roll (items 15 & 17) surface the *source* class's boons for that
   * ability as "graftup" picks, so a grafted skill can be levelled like a native
   * one. Only meaningful alongside `replaces`.
   */
  graftSource?: { classId: ClassId; slot: AbilitySlot };
  /**
   * A GRAND improvement (item 22): a rare, transformative class capstone that can
   * never stack with itself (maxStacks is forced to 1) and is offered as a special
   * one-of-a-kind pick. Each class has a small set; you can hold each at most once.
   */
  grand?: boolean;
  apply: (ctx: CharUpgradeCtx) => void;
}

/** Whether a hero of `classId` may take this upgrade. */
export function upgradeAllowedFor(def: CharUpgradeDef, classId: ClassId): boolean {
  if (def.classId !== 'any') return def.classId === classId;
  return !def.exclude?.includes(classId);
}

/** Small mutation helpers (kept terse; every field defaults sensibly). */
const mul = (ab: PlayerAbilityDef, k: keyof PlayerAbilityDef, f: number): void => {
  (ab[k] as number) = ((ab[k] as number | undefined) ?? 0) * f;
};
const addN = (ab: PlayerAbilityDef, k: keyof PlayerAbilityDef, d: number): void => {
  (ab[k] as number) = ((ab[k] as number | undefined) ?? 0) + d;
};
const setMin = (ab: PlayerAbilityDef, k: keyof PlayerAbilityDef, v: number): void => {
  const cur = ab[k] as number | undefined;
  (ab[k] as number) = cur == null ? v : Math.min(cur, v);
};

// A helper so each definition reads as a one-liner.
function u(
  classId: ClassId | 'any',
  id: string,
  name: string,
  icon: string,
  desc: string,
  apply: (ctx: CharUpgradeCtx) => void,
): CharUpgradeDef {
  return { id, classId, name, icon, desc, apply };
}

/**
 * Graft another class's ability onto a hero's slot: deep-copies the source def
 * (so later mutations stay private) and re-labels its slot. The old ability on
 * that slot is GONE — hybrid picks trade a power for a power.
 */
function graft(
  abilities: Record<AbilitySlot, PlayerAbilityDef>,
  slot: AbilitySlot,
  from: ClassId,
  fromSlot: AbilitySlot,
  tweak?: (ab: PlayerAbilityDef) => void,
): void {
  const src = CLASSES[from].abilities[fromSlot];
  const copy: PlayerAbilityDef = { ...src, slot };
  if (tweak) tweak(copy);
  abilities[slot] = copy;
}

// ---------------------------------------------------------------------------
// The pools (per class). All multipliers are intentionally modest so repeated
// picks compound without trivialising the boss escalation.
// ---------------------------------------------------------------------------

const KNIGHT: CharUpgradeDef[] = [
  u(
    'knight',
    'kn_bulwark',
    'Impenetrable',
    '🛡️',
    'Shield Wall blocks 60% of damage (up from 50%) and lasts 5.5s (up from 4s)',
    ({ abilities: a }) => {
      mul(a.a2, 'buffDefMult', 0.8);
      addN(a.a2, 'buffDuration', 1.5);
    },
  ),
  u(
    'knight',
    'kn_concuss',
    'Concussive Bash',
    '💫',
    'Shield Bash stuns for 1.3s (up from 0.8s) and hits for 42 (up from 30)',
    ({ abilities: a }) => {
      addN(a.a3, 'stun', 0.5);
      addN(a.a3, 'damage', 12);
    },
  ),
  u(
    'knight',
    'kn_widecleave',
    'Sweeping Blows',
    '🌀',
    'Cleave reaches 84u (+14), widens to a 53° arc (+8°), and hits for 27 (+5)',
    ({ abilities: a }) => {
      addN(a.basic, 'range', 14);
      addN(a.basic, 'halfAngleDeg', 8);
      addN(a.basic, 'damage', 5);
    },
  ),
  u(
    'knight',
    'kn_bastion',
    'Bastion',
    '⚔️',
    'Taunt now shields you (−30% damage taken while active) and returns 20% sooner (9.6s)',
    ({ abilities: a }) => {
      mul(a.a1, 'cooldown', 0.8);
      setMin(a.a1, 'buffDefMult', 0.7);
      addN(a.a1, 'buffDuration', 0);
    },
  ),
  u(
    'knight',
    'kn_secondwind',
    'Second Wind',
    '❤️',
    'Regenerate 1.5% of your max HP every second',
    ({ player: p }) => {
      p.regenPerSec += p.maxHp * 0.015;
    },
  ),
];

const RANGER: CharUpgradeDef[] = [
  u(
    'ranger',
    'rg_pierce',
    'Piercing Shots',
    '🎯',
    'Arrow hits for 25 (+5) and flies 13% faster; Multishot arrows deal 20 each (+4)',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 5);
      addN(a.basic, 'projSpeed', 90);
      addN(a.a1, 'damage', 4);
    },
  ),
  u(
    'ranger',
    'rg_frost',
    'Frost Arrows',
    '❄️',
    'Arrow and Multishot chill the target to 60% move speed for 1.5s',
    ({ abilities: a }) => {
      for (const ab of [a.basic, a.a1]) {
        ab.slowMult = Math.min(ab.slowMult ?? 1, 0.6);
        ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1.5);
      }
    },
  ),
  u(
    'ranger',
    'rg_volley',
    'Volley',
    '🏹',
    'Multishot looses 5 arrows (+2) in a wider 38° fan',
    ({ abilities: a }) => {
      addN(a.a1, 'projCount', 2);
      addN(a.a1, 'spreadDeg', 8);
    },
  ),
  u(
    'ranger',
    'rg_barbed',
    'Barbed Rain',
    '🌧️',
    'Rain of Arrows ticks for 19 (+7), lasts 4.5s (+1.5), and covers 135u (+15)',
    ({ abilities: a }) => {
      addN(a.a2, 'zoneTickDamage', 7);
      addN(a.a2, 'zoneDuration', 1.5);
      addN(a.a2, 'radius', 15);
    },
  ),
  u(
    'ranger',
    'rg_fleet',
    'Fleet-footed',
    '🥾',
    'Roll travels 270u (+50), dodges for 0.45s (+0.15), and refreshes 30% faster (3.5s)',
    ({ abilities: a }) => {
      mul(a.a3, 'cooldown', 0.7);
      addN(a.a3, 'range', 50);
      addN(a.a3, 'iframes', 0.15);
    },
  ),
];

const MAGE: CharUpgradeDef[] = [
  u(
    'mage',
    'mg_freeze',
    'Deep Freeze',
    '🧊',
    'Frost Nova freezes solid for 1.1s, hits for 28 (+8), and reaches 168u (+18)',
    ({ abilities: a }) => {
      addN(a.a2, 'freeze', 1.1);
      addN(a.a2, 'radius', 18);
      addN(a.a2, 'damage', 8);
    },
  ),
  u(
    'mage',
    'mg_quickcast',
    'Quickened Casting',
    '⚡',
    'Fireball charges in 0.42s (−40%) and recharges 15% faster (~6s)',
    ({ abilities: a }) => {
      mul(a.a1, 'castTime', 0.6);
      mul(a.a1, 'cooldown', 0.85);
    },
  ),
  u(
    'mage',
    'mg_combust',
    'Combustion',
    '🔥',
    'Fireball erupts for 92 (+22) across a 135u blast (+35)',
    ({ abilities: a }) => {
      addN(a.a1, 'impactRadius', 35);
      addN(a.a1, 'damage', 22);
    },
  ),
  u(
    'mage',
    'mg_arcane',
    'Arcane Surge',
    '✨',
    'Arcane Bolt hits for 22 (+6, ~+38%) and fires 9% more often',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 6);
      mul(a.basic, 'cooldown', 0.91);
    },
  ),
  u(
    'mage',
    'mg_blink',
    'Flicker',
    '🌀',
    'Blink jumps 320u (+70), returns 30% faster (4.2s), and phases you for 0.25s',
    ({ abilities: a }) => {
      addN(a.a3, 'range', 70);
      mul(a.a3, 'cooldown', 0.7);
      addN(a.a3, 'iframes', 0.25);
    },
  ),
];

const CLERIC: CharUpgradeDef[] = [
  u(
    'cleric',
    'cl_greaterheal',
    'Greater Heal',
    '💚',
    'Heal restores 88 HP (+28) from up to 450u away (+50)',
    ({ abilities: a }) => {
      addN(a.a1, 'damage', 28);
      addN(a.a1, 'range', 50);
    },
  ),
  u(
    'cleric',
    'cl_blessing',
    'Exalt',
    '🙏',
    'Blessing grants +40% damage (up from +25%) and 28% damage reduction for 8s (+2)',
    ({ abilities: a }) => {
      addN(a.a3, 'buffDamageMult', 0.15);
      mul(a.a3, 'buffDefMult', 0.9);
      addN(a.a3, 'buffDuration', 2);
    },
  ),
  u(
    'cleric',
    'cl_sanctuary',
    'Hallowed Sanctuary',
    '⛪',
    'Sanctuary heals 17/tick (+7), covers 165u (+25), and lasts 5.5s (+1.5)',
    ({ abilities: a }) => {
      addN(a.a2, 'zoneTickHeal', 7);
      addN(a.a2, 'radius', 25);
      addN(a.a2, 'zoneDuration', 1.5);
    },
  ),
  u(
    'cleric',
    'cl_smite',
    'Holy Wrath',
    '🌟',
    'Smite hits for 20 (+8) and dazes (0.5s stun) what it strikes',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 8);
      addN(a.basic, 'freeze', 0.5);
    },
  ),
  u(
    'cleric',
    'cl_warpriest',
    'War Priest',
    '❤️',
    '+12% max HP and +8% move speed',
    ({ player: p }) => {
      p.maxHp = Math.round(p.maxHp * 1.12);
      p.hp = p.maxHp;
      p.moveSpeed *= 1.08;
    },
  ),
];

const BARBARIAN: CharUpgradeDef[] = [
  u(
    'barbarian',
    'bb_endlessrage',
    'Endless Rage',
    '😤',
    'Rage empowers to +50% damage and +30% move speed, and returns 15% sooner (~12s)',
    ({ abilities: a }) => {
      addN(a.a1, 'buffDamageMult', 0.15);
      addN(a.a1, 'buffMoveMult', 0.1);
      mul(a.a1, 'cooldown', 0.85);
    },
  ),
  u(
    'barbarian',
    'bb_bloodthirst',
    'Bloodthirst',
    '🩸',
    'Reckless Swing and Whirlwind heal you for 15% of the damage they deal',
    ({ abilities: a }) => {
      for (const ab of [a.basic, a.a3]) addN(ab, 'lifestealFrac', 0.15);
    },
  ),
  u(
    'barbarian',
    'bb_seismic',
    'Seismic Leap',
    '💥',
    'Leap slams for 46 landing damage (+24) across 150u (+30), 15% faster',
    ({ abilities: a }) => {
      addN(a.a2, 'landingDamage', 24);
      addN(a.a2, 'radius', 30);
      mul(a.a2, 'cooldown', 0.85);
    },
  ),
  u(
    'barbarian',
    'bb_brutal',
    'Brutal',
    '🪓',
    'Reckless Swing hits for 32 (+6) reaching 92u; Whirlwind hits for 43 (+9) across 150u',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 6);
      addN(a.basic, 'range', 10);
      addN(a.a3, 'damage', 9);
      addN(a.a3, 'radius', 15);
    },
  ),
  u(
    'barbarian',
    'bb_thickhide',
    'Thick Hide',
    '🐻',
    '+12% max HP and −10% damage taken',
    ({ player: p }) => {
      p.maxHp = Math.round(p.maxHp * 1.12);
      p.hp = p.maxHp;
      p.damageTakenMult *= 0.9;
    },
  ),
];

const ROGUE: CharUpgradeDef[] = [
  u(
    'rogue',
    'ro_assassin',
    'Assassinate',
    '🗡️',
    'Backstab bursts for 82 (+24) and returns 22% sooner (3.9s)',
    ({ abilities: a }) => {
      addN(a.a1, 'damage', 24);
      mul(a.a1, 'cooldown', 0.78);
    },
  ),
  u(
    'rogue',
    'ro_poison',
    'Deadly Poison',
    '☠️',
    'Poison Vial ticks for 18 (+7), lasts 5.5s (+1.5), and spreads to 123u (+18)',
    ({ abilities: a }) => {
      addN(a.a3, 'zoneTickDamage', 7);
      addN(a.a3, 'zoneDuration', 1.5);
      addN(a.a3, 'radius', 18);
    },
  ),
  u(
    'rogue',
    'ro_vanish',
    'Vanish',
    '💨',
    'Shadowstep resets 30% faster (4.2s), phases for 0.5s, and heals 22 on use',
    ({ abilities: a }) => {
      mul(a.a2, 'cooldown', 0.7);
      addN(a.a2, 'iframes', 0.2);
      addN(a.a2, 'healOnUse', 22);
    },
  ),
  u(
    'rogue',
    'ro_flurry',
    'Flurry',
    '⚡',
    'Slash strikes 11% faster and hits for 23 (+5)',
    ({ abilities: a }) => {
      mul(a.basic, 'cooldown', 0.89);
      addN(a.basic, 'damage', 5);
    },
  ),
  u(
    'rogue',
    'ro_envenom',
    'Envenomed Blades',
    '🐍',
    'Slash and Backstab siphon 12% of the damage they deal back as health',
    ({ abilities: a }) => {
      for (const ab of [a.basic, a.a1]) addN(ab, 'lifestealFrac', 0.12);
    },
  ),
];

const PALADIN: CharUpgradeDef[] = [
  u(
    'paladin',
    'pa_hallowed',
    'Hallowed Ground',
    '⛪',
    'Consecration scorches for 13 and mends 13 per tick (+5 each), covers 172u (+22), lasts 6.5s',
    ({ abilities: a }) => {
      addN(a.a1, 'zoneTickDamage', 5);
      addN(a.a1, 'zoneTickHeal', 5);
      addN(a.a1, 'radius', 22);
      addN(a.a1, 'zoneDuration', 1.5);
    },
  ),
  u(
    'paladin',
    'pa_aegis',
    'Greater Aegis',
    '🛡️',
    'Divine Shield blocks 72% of damage (up from 65%), lasts 6s (+2), returns 15% sooner',
    ({ abilities: a }) => {
      mul(a.a3, 'buffDefMult', 0.8);
      addN(a.a3, 'buffDuration', 2);
      mul(a.a3, 'cooldown', 0.85);
    },
  ),
  u(
    'paladin',
    'pa_mercy',
    'Merciful Hands',
    '💛',
    'Lay on Hands restores 122 HP (+32) and recharges 15% faster (~5s)',
    ({ abilities: a }) => {
      addN(a.a2, 'damage', 32);
      mul(a.a2, 'cooldown', 0.85);
    },
  ),
  u(
    'paladin',
    'pa_radiant',
    'Radiant Strike',
    '🌟',
    'Holy Strike hits for 29 (+6), dazes (0.4s), and heals you 10% of the damage dealt',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 6);
      addN(a.basic, 'freeze', 0.4);
      addN(a.basic, 'lifestealFrac', 0.1);
    },
  ),
  u(
    'paladin',
    'pa_zeal',
    'Zeal',
    '⚡',
    '+8% move speed and −10% ability cooldowns',
    ({ player: p }) => {
      p.moveSpeed *= 1.08;
      p.cooldownMult *= 0.9;
    },
  ),
];

const DRUID: CharUpgradeDef[] = [
  u(
    'druid',
    'dr_grasp',
    'Thorned Grasp',
    '🌿',
    'Entangle roots to 18% move speed, gnaws for 11/tick (+5), and lasts 5.5s',
    ({ abilities: a }) => {
      a.a1.slowMult = (a.a1.slowMult ?? 1) * 0.6;
      addN(a.a1, 'zoneTickDamage', 5);
      addN(a.a1, 'zoneDuration', 1.5);
    },
  ),
  u(
    'druid',
    'dr_regrowth',
    'Wild Growth',
    '💚',
    'Regrowth heals 81 HP (+26) from 430u (+50), and recharges 15% faster',
    ({ abilities: a }) => {
      addN(a.a2, 'damage', 26);
      addN(a.a2, 'range', 50);
      mul(a.a2, 'cooldown', 0.85);
    },
  ),
  u(
    'druid',
    'dr_gale',
    'Gale Force',
    '🌪️',
    'Cyclone widens to 180u (+25), slows to 35% move speed, and hits for 32 (+8)',
    ({ abilities: a }) => {
      addN(a.a3, 'radius', 25);
      a.a3.slowMult = (a.a3.slowMult ?? 1) * 0.7;
      addN(a.a3, 'damage', 8);
    },
  ),
  u(
    'druid',
    'dr_thorns',
    'Splintering Thorns',
    '🌵',
    'Thornlash splits into 2 thorns in a 14° spread and hits for 22 each (+5)',
    ({ abilities: a }) => {
      addN(a.basic, 'projCount', 1);
      a.basic.spreadDeg = Math.max(a.basic.spreadDeg ?? 0, 14);
      addN(a.basic, 'damage', 5);
    },
  ),
  u(
    'druid',
    'dr_ward',
    "Nature's Ward",
    '🍃',
    '+12% max HP and regenerate 1.5% of max HP per second',
    ({ player: p }) => {
      p.maxHp = Math.round(p.maxHp * 1.12);
      p.hp = p.maxHp;
      p.regenPerSec += p.maxHp * 0.015;
    },
  ),
];

const BARD: CharUpgradeDef[] = [
  u(
    'bard',
    'ba_cutting',
    'Cutting Words',
    '🎭',
    'Vicious Mockery hits for 21 (+6) and chills the target to 60% move speed for 2s',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 6);
      a.basic.slowMult = Math.min(a.basic.slowMult ?? 1, 0.6);
      addN(a.basic, 'slowDuration', 1);
    },
  ),
  u(
    'bard',
    'ba_anthem',
    'Rousing Anthem',
    '🎺',
    'Inspiration grants +35% damage and 23% damage reduction for 8s (+2)',
    ({ abilities: a }) => {
      addN(a.a1, 'buffDamageMult', 0.15);
      mul(a.a1, 'buffDefMult', 0.9);
      addN(a.a1, 'buffDuration', 2);
    },
  ),
  u(
    'bard',
    'ba_song',
    'Song of Rest',
    '🎶',
    'Healing Word restores 74 HP (+24) and recharges 15% faster',
    ({ abilities: a }) => {
      addN(a.a2, 'damage', 24);
      mul(a.a2, 'cooldown', 0.85);
    },
  ),
  u(
    'bard',
    'ba_thunder',
    'Thunderous Chord',
    '⚡',
    'Dissonant Whispers widens to 175u (+25), hits for 32 (+10), and slows to 35%',
    ({ abilities: a }) => {
      addN(a.a3, 'radius', 25);
      addN(a.a3, 'damage', 10);
      a.a3.slowMult = (a.a3.slowMult ?? 1) * 0.7;
    },
  ),
  u(
    'bard',
    'ba_versatile',
    'Jack of All Trades',
    '🃏',
    '+12% max HP and +8% move speed',
    ({ player: p }) => {
      p.maxHp = Math.round(p.maxHp * 1.12);
      p.hp = p.maxHp;
      p.moveSpeed *= 1.08;
    },
  ),
];

const MONK: CharUpgradeDef[] = [
  u(
    'monk',
    'mo_flurry',
    'Empty Body',
    '👊',
    'Flurry of Blows strikes 10% faster and hits for 20 (+5)',
    ({ abilities: a }) => {
      mul(a.basic, 'cooldown', 0.9);
      addN(a.basic, 'damage', 5);
    },
  ),
  u(
    'monk',
    'mo_stun',
    'Stunning Fist',
    '💫',
    'Stunning Strike stuns for 1.4s (+0.5) and hits for 48 (+14)',
    ({ abilities: a }) => {
      addN(a.a1, 'stun', 0.5);
      addN(a.a1, 'damage', 14);
    },
  ),
  u(
    'monk',
    'mo_wind',
    'Wind Walker',
    '🍃',
    'Step of the Wind travels 300u (+50), heals 38 (+20), and refreshes 25% faster',
    ({ abilities: a }) => {
      mul(a.a2, 'cooldown', 0.75);
      addN(a.a2, 'range', 50);
      addN(a.a2, 'healOnUse', 20);
    },
  ),
  u(
    'monk',
    'mo_palm',
    'Quivering Palm',
    '🌀',
    'Quivering Palm widens to 155u (+25), hits for 40 (+10), and briefly stuns (0.6s)',
    ({ abilities: a }) => {
      addN(a.a3, 'radius', 25);
      addN(a.a3, 'damage', 10);
      addN(a.a3, 'freeze', 0.6);
    },
  ),
  u(
    'monk',
    'mo_ki',
    'Ki Flow',
    '🧘',
    '+8% move speed and regenerate 1.5% max HP per second',
    ({ player: p }) => {
      p.moveSpeed *= 1.08;
      p.regenPerSec += p.maxHp * 0.015;
    },
  ),
];

const SORCERER: CharUpgradeDef[] = [
  u(
    'sorcerer',
    'so_twin',
    'Twinned Spell',
    '✨',
    'Chaos Bolt fires 3 bolts (+1) and each hits for 19 (+4)',
    ({ abilities: a }) => {
      addN(a.basic, 'projCount', 1);
      addN(a.basic, 'damage', 4);
    },
  ),
  u(
    'sorcerer',
    'so_meteor',
    'Empowered Meteor',
    '☄️',
    'Meteor erupts for 102 (+24) across a 145u blast (+35) and charges 30% faster',
    ({ abilities: a }) => {
      addN(a.a1, 'impactRadius', 35);
      addN(a.a1, 'damage', 24);
      mul(a.a1, 'castTime', 0.7);
    },
  ),
  u(
    'sorcerer',
    'so_mirror',
    'Greater Mirror Image',
    '🪞',
    'Mirror Image blocks 52% of damage (up from 40%), lasts 7s (+2), and returns 15% sooner',
    ({ abilities: a }) => {
      mul(a.a2, 'buffDefMult', 0.8);
      addN(a.a2, 'buffDuration', 2);
      mul(a.a2, 'cooldown', 0.85);
    },
  ),
  u(
    'sorcerer',
    'so_leap',
    'Distant Leap',
    '🌀',
    'Arcane Leap jumps 330u (+70), returns 30% faster, and phases you for 0.45s',
    ({ abilities: a }) => {
      addN(a.a3, 'range', 70);
      mul(a.a3, 'cooldown', 0.7);
      addN(a.a3, 'iframes', 0.25);
    },
  ),
  u(
    'sorcerer',
    'so_font',
    'Font of Magic',
    '🔮',
    '+8% move speed and −10% ability cooldowns',
    ({ player: p }) => {
      p.moveSpeed *= 1.08;
      p.cooldownMult *= 0.9;
    },
  ),
];

const WARLOCK: CharUpgradeDef[] = [
  u(
    'warlock',
    'wa_blast',
    'Agonizing Blast',
    '💥',
    'Eldritch Blast hits for 30 (+8) and drinks 25% of the damage as health (+10%)',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 8);
      addN(a.basic, 'lifestealFrac', 0.1);
    },
  ),
  u(
    'warlock',
    'wa_hex',
    'Deepening Hex',
    '🕸️',
    'Hex festers for 18/tick (+6), lasts 6.5s (+1.5), and covers 138u (+18)',
    ({ abilities: a }) => {
      addN(a.a1, 'zoneTickDamage', 6);
      addN(a.a1, 'zoneDuration', 1.5);
      addN(a.a1, 'radius', 18);
    },
  ),
  u(
    'warlock',
    'wa_rebuke',
    'Searing Rebuke',
    '🔥',
    'Hellish Rebuke widens to 165u (+25) and hits for 42 (+12)',
    ({ abilities: a }) => {
      addN(a.a2, 'radius', 25);
      addN(a.a2, 'damage', 12);
    },
  ),
  u(
    'warlock',
    'wa_pact',
    'Fiendish Pact',
    '😈',
    "Dark One's Blessing empowers to +45% damage, +15% move speed, and lasts 8s (+2)",
    ({ abilities: a }) => {
      addN(a.a3, 'buffDamageMult', 0.15);
      a.a3.buffMoveMult = Math.max(a.a3.buffMoveMult ?? 1, 1.15);
      addN(a.a3, 'buffDuration', 2);
    },
  ),
  u(
    'warlock',
    'wa_fiend',
    'Fiendish Vigor',
    '🩸',
    '+12% max HP and +10% damage dealt',
    ({ player: p }) => {
      p.maxHp = Math.round(p.maxHp * 1.12);
      p.hp = p.maxHp;
      p.damageMult *= 1.1;
    },
  ),
];

// ---------------------------------------------------------------------------
// HYBRID upgrades — cross-class powers and whole combat styles ANY hero can
// adopt. These are the wild picks: they can graft an ability the class never
// had (replacing a slot outright) or re-flavour the entire kit. Chaos by design.
// ---------------------------------------------------------------------------

const HYBRID: CharUpgradeDef[] = [
  {
    ...u(
      'any',
      'hy_pyromancer',
      "Pyromancer's Pact",
      '☄️',
      'Graft the Mage’s Fireball: a 0.7s-charged bomb bursting for 70 in a 100-radius blast (7s cooldown)',
      ({ abilities: a }) => {
        graft(a, 'a2', 'mage', 'a1');
      },
    ),
    exclude: ['mage', 'sorcerer'], // already own a big bomb (Fireball / Meteor)
    replaces: 'a2',
    graftSource: { classId: 'mage', slot: 'a1' },
    maxStacks: 1,
  },
  {
    ...u(
      'any',
      'hy_shadowpact',
      'Shadow Pact',
      '🌑',
      'Graft the Rogue’s Shadowstep: blink 240u toward your aim with 0.3s of i-frames (6s cooldown)',
      ({ abilities: a }) => {
        graft(a, 'a3', 'rogue', 'a2');
      },
    ),
    exclude: ['rogue', 'mage', 'sorcerer'], // all already carry a blink
    replaces: 'a3',
    graftSource: { classId: 'rogue', slot: 'a2' },
    maxStacks: 1,
  },
  {
    ...u(
      'any',
      'hy_warhowl',
      "Berserker's Howl",
      '📯',
      'Graft the Barbarian’s Rage: +35% damage and +20% move speed for 6s (14s cooldown)',
      ({ abilities: a }) => {
        graft(a, 'a1', 'barbarian', 'a1');
      },
    ),
    exclude: ['barbarian'],
    replaces: 'a1',
    graftSource: { classId: 'barbarian', slot: 'a1' },
    maxStacks: 1,
  },
  {
    ...u(
      'any',
      'hy_fieldmedic',
      'Field Medic',
      '🩹',
      'Graft a field-dressed Heal: restore 45 HP to a hurt ally within 400u (5s cooldown; weaker than a Cleric’s)',
      ({ abilities: a }) => {
        graft(a, 'a2', 'cleric', 'a1', (ab) => {
          ab.damage = Math.round(ab.damage * 0.75);
          ab.cooldown = ab.cooldown + 2;
          ab.name = 'Field Dressing';
        });
      },
    ),
    // Real healers would be trading their actual heal away for a worse one.
    exclude: ['cleric', 'paladin', 'druid', 'bard'],
    replaces: 'a2',
    graftSource: { classId: 'cleric', slot: 'a1' },
    maxStacks: 1,
  },
  {
    ...u(
      'any',
      'hy_vampiric',
      'Vampiric Style',
      '🧛',
      'Your strikes and shots heal you for 10% of the damage dealt — but pale flesh: −10% max HP',
      ({ player: p, abilities: a }) => {
        for (const ab of [a.basic, a.a1, a.a2, a.a3]) {
          // Strikes (melee/pbaoe/dash landings) and shots (projectiles) can
          // drink; ground zones and heals can't, so they stay untouched.
          const drinks =
            ab.damage > 0 &&
            (ab.kind === 'meleeCone' || ab.kind === 'pbaoe' || ab.kind === 'projectile');
          if (drinks) ab.lifestealFrac = (ab.lifestealFrac ?? 0) + 0.1;
        }
        p.maxHp = Math.round(p.maxHp * 0.9);
        p.hp = Math.min(p.hp, p.maxHp);
      },
    ),
    maxStacks: 3,
  },
  {
    ...u(
      'any',
      'hy_frostbrand',
      'Frostbrand Style',
      '❄️',
      'Everything you land chills the target to 72% move speed for 1.4s',
      ({ abilities: a }) => {
        for (const ab of [a.basic, a.a1, a.a2, a.a3]) {
          if (ab.damage > 0 && ab.kind !== 'heal') {
            ab.slowMult = Math.min(ab.slowMult ?? 1, 0.72);
            ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1.4);
          }
        }
      },
    ),
    maxStacks: 1,
  },
  {
    ...u(
      'any',
      'hy_stormsplit',
      'Stormsplit',
      '⚡',
      'Your basic attack forks: +1 projectile in a 12° fan, or (melee) +12° arc, +12 range and +4 damage',
      ({ abilities: a }) => {
        const b = a.basic;
        if (b.kind === 'projectile') {
          b.projCount = (b.projCount ?? 1) + 1;
          b.spreadDeg = Math.max(b.spreadDeg ?? 0, 12);
        } else {
          b.halfAngleDeg = (b.halfAngleDeg ?? 45) + 12;
          b.range = (b.range ?? 70) + 12;
          b.damage += 4;
        }
      },
    ),
    maxStacks: 3,
  },
  {
    ...u(
      'any',
      'hy_juggernaut',
      'Juggernaut Style',
      '🐘',
      'Become a mountain: +25% max HP and −8% damage taken, but −7% move speed',
      ({ player: p }) => {
        p.maxHp = Math.round(p.maxHp * 1.25);
        p.hp = p.maxHp;
        p.damageTakenMult *= 0.92;
        p.moveSpeed *= 0.93;
      },
    ),
    maxStacks: 2,
  },
  {
    ...u(
      'any',
      'hy_glasscannon',
      'Glass Cannon',
      '💎',
      'Hit like a meteor (+25% damage), shatter like glass (+18% damage taken)',
      ({ player: p }) => {
        p.damageMult *= 1.25;
        p.damageTakenMult *= 1.18;
      },
    ),
    maxStacks: 2,
  },
];

// ---------------------------------------------------------------------------
// GRAND improvements (item 22) — a rare, transformative capstone per class. Each
// is unique (never stacks with itself) and offered as a special one-of-a-kind
// pick; a class has a small set and can hold each at most once.
// ---------------------------------------------------------------------------

/** Grand-improvement builder — forces `grand` + a hard stack cap of 1. */
function g(
  classId: ClassId,
  id: string,
  name: string,
  icon: string,
  desc: string,
  apply: (ctx: CharUpgradeCtx) => void,
): CharUpgradeDef {
  return { id, classId, name, icon, desc, apply, grand: true, maxStacks: 1 };
}

const GRAND: CharUpgradeDef[] = [
  g(
    'knight',
    'kn_grand_immovable',
    'Immovable Object',
    '🗿',
    'Become a living fortress: −40% damage taken, +35% max HP, regenerate 2% HP/s',
    ({ player: p }) => {
      p.damageTakenMult *= 0.6;
      p.maxHp = Math.round(p.maxHp * 1.35);
      p.hp = p.maxHp;
      p.regenPerSec += p.maxHp * 0.02;
    },
  ),
  g(
    'knight',
    'kn_grand_wrath',
    "Warlord's Wrath",
    '⚔️',
    'Cleave becomes a 360° whirlwind that drinks 20% as health (+14 dmg, +20 reach)',
    ({ abilities: a }) => {
      a.basic.halfAngleDeg = 180; // full circle
      addN(a.basic, 'range', 20);
      addN(a.basic, 'damage', 14);
      addN(a.basic, 'lifestealFrac', 0.2);
    },
  ),
  g(
    'ranger',
    'rg_grand_deadeye',
    'Deadeye',
    '🎯',
    'Arrows become lightning bolts: +20 dmg, +250 speed, far longer range',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 20);
      addN(a.basic, 'projSpeed', 250);
      addN(a.basic, 'maxRange', 220);
    },
  ),
  g(
    'ranger',
    'rg_grand_storm',
    'Arrow Storm',
    '🌩️',
    'Multishot erupts into a storm — 5 extra arrows across a wide 40° fan (+6 each)',
    ({ abilities: a }) => {
      addN(a.a1, 'projCount', 5);
      addN(a.a1, 'spreadDeg', 25);
      addN(a.a1, 'damage', 6);
    },
  ),
  g(
    'mage',
    'mg_grand_archmage',
    'Archmage',
    '🧙',
    'Spells snap out instantly: −60% cast time, +30% damage, +15% max HP',
    ({ player: p }) => {
      p.castMult *= 0.4;
      p.damageMult *= 1.3;
      p.maxHp = Math.round(p.maxHp * 1.15);
      p.hp = p.maxHp;
    },
  ),
  g(
    'mage',
    'mg_grand_cataclysm',
    'Cataclysm',
    '☄️',
    'Fireball becomes an apocalypse — +55 dmg across a colossal blast (+75 radius)',
    ({ abilities: a }) => {
      addN(a.a1, 'impactRadius', 75);
      addN(a.a1, 'damage', 55);
    },
  ),
  g(
    'cleric',
    'cl_grand_beacon',
    'Beacon of Hope',
    '🕯️',
    'Heal pours for +70 at long range; Sanctuary becomes a vast font (+22/tick, +70 radius, +4s)',
    ({ abilities: a }) => {
      addN(a.a1, 'damage', 70);
      addN(a.a1, 'range', 120);
      addN(a.a2, 'zoneTickHeal', 22);
      addN(a.a2, 'radius', 70);
      addN(a.a2, 'zoneDuration', 4);
    },
  ),
  g(
    'cleric',
    'cl_grand_avatar',
    'Avatar of Faith',
    '👼',
    'Ascend: +25% max HP; Blessing girds the band with +40% dmg AND 30% mitigation, 4s longer',
    ({ player: p, abilities: a }) => {
      p.maxHp = Math.round(p.maxHp * 1.25);
      p.hp = p.maxHp;
      addN(a.a3, 'buffDamageMult', 0.4);
      setMin(a.a3, 'buffDefMult', 0.7);
      addN(a.a3, 'buffDuration', 4);
    },
  ),
  g(
    'barbarian',
    'bb_grand_unstoppable',
    'Unstoppable',
    '🐗',
    'Endless fury: +35% max HP; Rage grants +45% dmg, +20% move and lasts 6s longer',
    ({ player: p, abilities: a }) => {
      p.maxHp = Math.round(p.maxHp * 1.35);
      p.hp = p.maxHp;
      addN(a.a1, 'buffDamageMult', 0.45);
      addN(a.a1, 'buffMoveMult', 0.2);
      addN(a.a1, 'buffDuration', 6);
    },
  ),
  g(
    'barbarian',
    'bb_grand_reaver',
    'Blood Reaver',
    '🩸',
    'Every swing drinks 40% as health; Whirlwind becomes a bloodbath (+30 dmg, +45 radius)',
    ({ abilities: a }) => {
      addN(a.basic, 'lifestealFrac', 0.4);
      addN(a.a3, 'damage', 30);
      addN(a.a3, 'radius', 45);
    },
  ),
  g(
    'rogue',
    'ro_grand_shadow',
    'Shadow Master',
    '🌑',
    'Shadowstep resets almost instantly (−65% cd); Backstab annihilates for +60',
    ({ abilities: a }) => {
      mul(a.a2, 'cooldown', 0.35);
      addN(a.a1, 'damage', 60);
      addN(a.a1, 'lifestealFrac', 0.25);
    },
  ),
  g(
    'rogue',
    'ro_grand_venom',
    'Grand Venom',
    '☠️',
    'Poison Vial becomes a creeping plague — +22/tick, +65 radius, +4s, slows to 50%',
    ({ abilities: a }) => {
      addN(a.a3, 'zoneTickDamage', 22);
      addN(a.a3, 'radius', 65);
      addN(a.a3, 'zoneDuration', 4);
      setMin(a.a3, 'slowMult', 0.5);
      a.a3.slowDuration = Math.max(a.a3.slowDuration ?? 0, 1.5);
    },
  ),
  g(
    'paladin',
    'pa_grand_aegis',
    'Eternal Aegis',
    '🛡️',
    'An unbreakable guardian: Divine Shield nears invulnerability, −20% dmg taken always, +20% max HP',
    ({ player: p, abilities: a }) => {
      mul(a.a3, 'buffDefMult', 0.4);
      p.damageTakenMult *= 0.8;
      p.maxHp = Math.round(p.maxHp * 1.2);
      p.hp = p.maxHp;
    },
  ),
  g(
    'paladin',
    'pa_grand_dawn',
    'Dawnbringer',
    '🌅',
    'Holy Strike smites in a radiant arc healing 25% (+18 dmg, wider); Lay on Hands overflows (+60)',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 18);
      addN(a.basic, 'lifestealFrac', 0.25);
      addN(a.basic, 'halfAngleDeg', 20);
      addN(a.a2, 'damage', 60);
    },
  ),
  g(
    'druid',
    'dr_grand_wild',
    'Wild Shape',
    '🐾',
    'Thornlash becomes a volley of 3 extra thorns (+6 each); Regrowth booms for +60',
    ({ abilities: a }) => {
      addN(a.a2, 'damage', 60);
      addN(a.basic, 'projCount', 3);
      addN(a.basic, 'damage', 6);
    },
  ),
  g(
    'druid',
    'dr_grand_grove',
    'Sacred Grove',
    '🌳',
    'Entangle becomes a vast thornfield — +22/tick, +65 radius, +5s, slows to 40%',
    ({ abilities: a }) => {
      addN(a.a1, 'zoneTickDamage', 22);
      addN(a.a1, 'radius', 65);
      addN(a.a1, 'zoneDuration', 5);
      setMin(a.a1, 'slowMult', 0.4);
    },
  ),
  g(
    'bard',
    'ba_grand_symphony',
    'Grand Symphony',
    '🎼',
    'Inspiration girds the band with +45% dmg AND 25% mitigation, lasting 6s longer',
    ({ abilities: a }) => {
      addN(a.a1, 'buffDamageMult', 0.45);
      setMin(a.a1, 'buffDefMult', 0.75);
      addN(a.a1, 'buffDuration', 6);
    },
  ),
  g(
    'bard',
    'ba_grand_ballad',
    'Ballad of Heroes',
    '🎻',
    'Healing Word pours for +70; Vicious Mockery scatters into 3 mocking bolts (+8 each)',
    ({ abilities: a }) => {
      addN(a.a2, 'damage', 70);
      addN(a.basic, 'projCount', 2);
      addN(a.basic, 'spreadDeg', 12);
      addN(a.basic, 'damage', 8);
    },
  ),
  g(
    'monk',
    'mo_grand_ascend',
    'Ascendant',
    '🕉️',
    'Transcend the flesh: +30% move speed, +8 Flurry dmg, Step of the Wind resets fast (+iframes)',
    ({ player: p, abilities: a }) => {
      p.moveSpeed *= 1.3;
      addN(a.basic, 'damage', 8);
      mul(a.a2, 'cooldown', 0.5);
      addN(a.a2, 'iframes', 0.2);
      addN(a.a2, 'healOnUse', 20);
    },
  ),
  g(
    'monk',
    'mo_grand_thousand',
    'Thousand Palms',
    '🙌',
    'Stunning Strike locks foes down (+1.2s stun, +35 dmg); Quivering Palm devastates (+40 dmg, +55 radius)',
    ({ abilities: a }) => {
      addN(a.a1, 'stun', 1.2);
      addN(a.a1, 'damage', 35);
      addN(a.a3, 'damage', 40);
      addN(a.a3, 'radius', 55);
    },
  ),
  g(
    'sorcerer',
    'so_grand_wild',
    'Wild Magic Surge',
    '🎲',
    'Chaos Bolt splits into a fan of 3 extra bolts (+8 each) across a wide spread',
    ({ abilities: a }) => {
      addN(a.basic, 'projCount', 3);
      addN(a.basic, 'damage', 8);
      addN(a.basic, 'spreadDeg', 12);
    },
  ),
  g(
    'sorcerer',
    'so_grand_cataclysm',
    'Meteor Swarm',
    '💥',
    'Meteor becomes an extinction event — +65 dmg across a colossal blast (+75 radius)',
    ({ abilities: a }) => {
      addN(a.a1, 'impactRadius', 75);
      addN(a.a1, 'damage', 65);
    },
  ),
  g(
    'warlock',
    'wa_grand_pact',
    'Pact of the Fiend',
    '😈',
    'Eldritch Blast forks into 2 soul-draining bolts (+18 dmg, +35% lifesteal)',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 18);
      addN(a.basic, 'projCount', 1);
      addN(a.basic, 'lifestealFrac', 0.35);
    },
  ),
  g(
    'warlock',
    'wa_grand_ruin',
    'Word of Ruin',
    '💀',
    'Hex becomes a vast, lingering curse (+22/tick, +65 radius, +4s); Hellish Rebuke erupts (+40)',
    ({ abilities: a }) => {
      addN(a.a1, 'zoneTickDamage', 22);
      addN(a.a1, 'radius', 65);
      addN(a.a1, 'zoneDuration', 4);
      addN(a.a2, 'damage', 40);
      addN(a.a2, 'radius', 30);
    },
  ),
];

/** Grand improvements grouped by class (item 22). */
export const GRAND_BY_CLASS: Record<ClassId, CharUpgradeDef[]> = GRAND.reduce(
  (acc, d) => {
    (acc[d.classId as ClassId] ??= []).push(d);
    return acc;
  },
  {} as Record<ClassId, CharUpgradeDef[]>,
);

/** All character upgrades, grouped by class. */
export const CHAR_UPGRADES_BY_CLASS: Record<ClassId, CharUpgradeDef[]> = {
  knight: KNIGHT,
  ranger: RANGER,
  mage: MAGE,
  cleric: CLERIC,
  barbarian: BARBARIAN,
  rogue: ROGUE,
  paladin: PALADIN,
  druid: DRUID,
  bard: BARD,
  monk: MONK,
  sorcerer: SORCERER,
  warlock: WARLOCK,
};

/** The class-agnostic hybrid pool (cross-class powers + combat styles). */
export const HYBRID_UPGRADES: CharUpgradeDef[] = HYBRID;

/** Flat lookup by id (across every class + the hybrid pool + grand improvements). */
export const CHAR_UPGRADES: Record<string, CharUpgradeDef> = Object.fromEntries(
  [...Object.values(CHAR_UPGRADES_BY_CLASS).flat(), ...HYBRID, ...GRAND].map((d) => [d.id, d]),
);

// ---------------------------------------------------------------------------
// Skill-keyed progression (items 15 & 17) — the "model change" flagged in #22.
//
// Per-run character upgrades are an ordered id list re-applied from scratch each
// spawn. The naive replay keys progression by *slot*: a numeric boon mutates
// whatever ability currently sits in a slot, and a graft overwrites the slot
// outright. That loses / mis-targets progression when a graft displaces a slot —
// earlier boons meant for the original skill land on the graft, and a displaced
// skill can never be reclaimed with its boons intact.
//
// The replay below keys progression by SKILL IDENTITY instead:
//   • SkillKey — a stable id per ability the hero has held. A native class
//     ability is keyed by its slot ('basic' | 'a1' | 'a2' | 'a3'); a grafted
//     ability is keyed by its graft upgrade id (e.g. 'hy_pyromancer'). The two
//     namespaces never collide.
//   • registry: Map<SkillKey, def> — EVERY skill the hero has touched, whether
//     it is live in a slot or stashed after being displaced. Boons accrue onto
//     the def in the registry, so a stashed skill keeps its progression.
//   • occupant: which SkillKey is live in each slot right now.
//
// Routing an upgrade during replay:
//   • a numeric CLASS boon / grand → the NATIVE skill for the slots it touches
//     (live or stashed), so a later graft can never absorb it (item 17);
//   • a GRAFT → stashes the slot's current occupant and installs the graft (or
//     re-seats a previously-stashed graft, boons intact);
//   • a whole-kit combat/stat STYLE (hybrid, no `replaces`) → the CURRENT
//     occupants, because it re-flavours whatever the hero is actually holding;
//   • a synthetic `restore:<slot>` → re-seats the native skill in its slot (with
//     its stashed boons) — the reclaim path (item 15);
//   • a synthetic `graftup:<slot>:<boonId>` → applies a source-class boon to the
//     graft currently in that slot, so a grafted skill levels like a native one.
// The stash lives only for one replay: the ordered id list is the source of
// truth, so replaying it reconstructs every stash/restore deterministically.
// ---------------------------------------------------------------------------

const SLOTS: readonly AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];

/** A stable identity for a skill the hero holds (native slot name, or graft id). */
type SkillKey = string;

const RESTORE_PREFIX = 'restore:';
const GRAFTUP_PREFIX = 'graftup:';

function isAbilitySlot(x: string): x is AbilitySlot {
  return x === 'basic' || x === 'a1' || x === 'a2' || x === 'a3';
}

/** Parse `restore:<slot>` → the slot whose native skill is being reclaimed. */
function parseRestore(id: string): AbilitySlot | null {
  if (!id.startsWith(RESTORE_PREFIX)) return null;
  const slot = id.slice(RESTORE_PREFIX.length);
  return isAbilitySlot(slot) ? slot : null;
}

/** Parse `graftup:<slot>:<boonId>` → the graft slot + the source boon levelling it. */
function parseGraftup(id: string): { slot: AbilitySlot; boonId: string } | null {
  if (!id.startsWith(GRAFTUP_PREFIX)) return null;
  const rest = id.slice(GRAFTUP_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0) return null;
  const slot = rest.slice(0, sep);
  const boonId = rest.slice(sep + 1);
  if (!isAbilitySlot(slot)) return null;
  if (!Object.prototype.hasOwnProperty.call(CHAR_UPGRADES, boonId)) return null;
  return { slot, boonId };
}

/** A throwaway hero stub with a fresh cloned ability table (preview / occupancy). */
function stubPlayer(classId: ClassId): Player {
  const cls = CLASSES[classId];
  return {
    classId,
    maxHp: cls.maxHp,
    hp: cls.maxHp,
    moveSpeed: cls.moveSpeed,
    cooldownMult: 1,
    castMult: 1,
    damageMult: 1,
    damageTakenMult: 1,
    terrainResist: 0,
    regenPerSec: 0,
    abilities: cloneAbilities(cls.abilities),
  } as unknown as Player;
}

/**
 * Replay an ordered upgrade list onto `player` (its ability table + stats) using
 * the skill-keyed model above. Mutates `player.abilities` in place to the final
 * slot occupants and returns the occupancy map (which SkillKey sits in each slot)
 * so the offer roll can see displaced / grafted slots. Pure aside from `player`.
 */
function replayCharUpgrades(player: Player, ids: readonly string[]): Record<AbilitySlot, SkillKey> {
  const table = player.abilities as Record<AbilitySlot, PlayerAbilityDef>;
  const registry = new Map<SkillKey, PlayerAbilityDef>();
  const occupant: Record<AbilitySlot, SkillKey> = { basic: 'basic', a1: 'a1', a2: 'a2', a3: 'a3' };
  for (const s of SLOTS) registry.set(s, table[s]);

  // The native def for a slot (live or stashed) — where class boons accrue.
  const nativeView = (): Record<AbilitySlot, PlayerAbilityDef> => ({
    basic: registry.get('basic')!,
    a1: registry.get('a1')!,
    a2: registry.get('a2')!,
    a3: registry.get('a3')!,
  });
  // The def currently equipped in each slot — where kit-wide styles land.
  const currentView = (): Record<AbilitySlot, PlayerAbilityDef> => ({
    basic: registry.get(occupant.basic)!,
    a1: registry.get(occupant.a1)!,
    a2: registry.get(occupant.a2)!,
    a3: registry.get(occupant.a3)!,
  });

  for (const id of ids) {
    // Reclaim a displaced native skill, its stashed boons intact (item 15).
    const restoreSlot = parseRestore(id);
    if (restoreSlot) {
      occupant[restoreSlot] = restoreSlot;
      continue;
    }
    // Level the graft currently equipped in a slot with a source-class boon.
    const graftup = parseGraftup(id);
    if (graftup) {
      const boon = CHAR_UPGRADES[graftup.boonId]; // parseGraftup guarantees it exists
      const target = registry.get(occupant[graftup.slot])!;
      // Point every proxy slot at the graft def so the (single-slot) source boon
      // lands on it regardless of which slot it natively targets.
      boon.apply({ player, abilities: { basic: target, a1: target, a2: target, a3: target } });
      continue;
    }
    const def = CHAR_UPGRADES[id];
    if (!def || !upgradeAllowedFor(def, player.classId)) continue;
    if (def.replaces) {
      // A graft: install (or re-seat a previously-stashed) foreign ability. The
      // displaced occupant simply stays in the registry, stashed under its key.
      const slot = def.replaces;
      if (registry.has(id)) {
        occupant[slot] = id;
      } else {
        const scratch = currentView();
        def.apply({ player, abilities: scratch });
        registry.set(id, scratch[slot]);
        occupant[slot] = id;
      }
      continue;
    }
    // A numeric class boon / grand accrues on its NATIVE skill; a whole-kit
    // hybrid style re-flavours the CURRENT kit.
    def.apply({ player, abilities: def.classId === 'any' ? currentView() : nativeView() });
  }

  for (const s of SLOTS) table[s] = registry.get(occupant[s])!;
  return occupant;
}

/** Type guard for an untrusted (networked) character-upgrade id. */
export function isCharUpgradeId(x: unknown): x is string {
  if (typeof x !== 'string') return false;
  if (Object.prototype.hasOwnProperty.call(CHAR_UPGRADES, x)) return true;
  // Synthetic reclaim / grafted-skill upgrades (items 15 & 17) are valid picks
  // too, but only in their exact, well-formed shape — arbitrary strings stay out.
  return parseRestore(x) !== null || parseGraftup(x) !== null;
}

/**
 * Apply an ordered list of character upgrades to a hero's cloned ability table
 * (and, for the stat-flavoured ones, the hero directly). Unknown / mismatched-
 * class ids are skipped. Call after `applyUpgrades` at spawn.
 */
export function applyCharUpgrades(player: Player, ids: string[] | undefined): void {
  if (!ids || !player.abilities) return;
  replayCharUpgrades(player, ids);
}

/**
 * Preview the ability table a hero of `classId` ends up with after taking the
 * given character/hybrid upgrades — WITHOUT a live World. Used by the HUD so
 * ability names/cooldowns follow hybrid grafts (a Knight who learned Fireball
 * should see "Fireball" on the button). Stat-flavoured upgrades mutate a
 * throwaway player stub and are otherwise ignored.
 */
export function previewAbilityTable(
  classId: ClassId,
  ids: string[],
): Record<AbilitySlot, PlayerAbilityDef> {
  const stub = stubPlayer(classId);
  applyCharUpgrades(stub, ids);
  const abilities = stub.abilities as Record<AbilitySlot, PlayerAbilityDef>;
  // Match the sim: the same global attack slow-down the World applies at spawn, so
  // the cooldowns the HUD previews agree with the ones the sim actually commits.
  slowAttackCooldowns(abilities);
  return abilities;
}

/**
 * A hero's resolved persistent stat block after a run's boons are applied. Mirrors
 * the mutable stat fields the World applies at spawn (generic upgrades first, then
 * class-specific ones — the same order), so the pause-menu character sheet can show
 * a player exactly what their picks add up to WITHOUT any of it crossing the wire.
 */
export interface PreviewedStats {
  maxHp: number;
  moveSpeed: number;
  damageMult: number;
  cooldownMult: number;
  castMult: number;
  damageTakenMult: number;
  terrainResist: number;
  regenPerSec: number;
}

/**
 * Resolve the stat block a hero of `classId` ends up with after taking the given
 * generic + character upgrades, off a throwaway stub (no World). For a multiclass
 * hero pass the ACTIVE class — only that class's character boons apply, matching the
 * live sim. Pure.
 */
export function previewPlayerStats(
  classId: ClassId,
  upgrades: string[],
  charUpgrades: string[],
): PreviewedStats {
  const stub = stubPlayer(classId);
  // Generic boons first, then class ones — the exact order World.spawn uses.
  // applyUpgrades skips ids it doesn't recognise, so the loose cast is safe.
  applyUpgrades(stub, upgrades as UpgradeId[]);
  applyCharUpgrades(stub, charUpgrades);
  return {
    maxHp: stub.maxHp,
    moveSpeed: stub.moveSpeed,
    damageMult: stub.damageMult,
    cooldownMult: stub.cooldownMult,
    castMult: stub.castMult,
    damageTakenMult: stub.damageTakenMult,
    terrainResist: stub.terrainResist,
    regenPerSec: stub.regenPerSec,
  };
}

/** Most times a character upgrade may be taken (its `maxStacks`, or the shared cap). */
export function charUpgradeMaxStacks(id: string): number {
  const graftup = parseGraftup(id);
  // A grafted-skill upgrade inherits the source boon's own cap.
  if (graftup) return CHAR_UPGRADES[graftup.boonId]?.maxStacks ?? MAX_SKILL_STACKS;
  // A reclaim is contextual (only offered while a skill is displaced), never "maxed".
  if (parseRestore(id)) return Number.POSITIVE_INFINITY;
  return CHAR_UPGRADES[id]?.maxStacks ?? MAX_SKILL_STACKS;
}

/** Whether the hero already owns `id` at its stacking cap (so it shouldn't reroll). */
export function charUpgradeAtMax(id: string, owned: readonly string[]): boolean {
  const have = owned.reduce((n, o) => (o === id ? n + 1 : n), 0);
  return have >= charUpgradeMaxStacks(id);
}

// ---------------------------------------------------------------------------
// Re-offer of displaced / grafted skills (items 15 & 17). Once a graft displaces
// an ability, the reward roll can surface a RECLAIM of the original (with its
// stashed boons) or a graftup that levels the grafted skill using its source
// class's boons — so a replaced ability is never lost and a grafted one still
// progresses.
// ---------------------------------------------------------------------------

/** Which ability slots a class boon actually mutates — probed once at load, so a
 *  graft can surface exactly the source-class boons that would upgrade it. */
const BOON_SLOTS: Record<string, AbilitySlot[]> = (() => {
  const map: Record<string, AbilitySlot[]> = {};
  for (const def of Object.values(CHAR_UPGRADES_BY_CLASS).flat()) {
    const stub = stubPlayer(def.classId as ClassId);
    const abilities = stub.abilities as Record<AbilitySlot, PlayerAbilityDef>;
    const before = SLOTS.map((s) => JSON.stringify(abilities[s]));
    def.apply({ player: stub, abilities });
    map[def.id] = SLOTS.filter((s, i) => JSON.stringify(abilities[s]) !== before[i]);
  }
  return map;
})();

/** Which SkillKey sits in each slot after a hero's owned upgrades are replayed. */
function occupancyAfter(classId: ClassId, owned: readonly string[]): Record<AbilitySlot, SkillKey> {
  return replayCharUpgrades(stubPlayer(classId), owned);
}

/**
 * The reclaim + grafted-skill upgrade ids a hero currently qualifies for. Empty
 * unless a graft has displaced one of their native abilities (so heroes without
 * grafts never see these picks — and the offer roll's rng stays untouched).
 */
/**
 * Whether a CLASS boon still upgrades a skill the hero can actually use (item 26):
 * a boon that touches ONLY slots whose native skill has been grafted over is dead
 * — the replaced skill is gone, so it must drop out of the offer pool rather than
 * level a skill that isn't in the kit. A stat-only boon (touches no slot) always
 * qualifies. `occupant` is the replayed slot-occupancy map.
 */
function boonUpgradesLiveSkill(occupant: Record<AbilitySlot, SkillKey>, boonId: string): boolean {
  const slots = BOON_SLOTS[boonId] ?? [];
  if (slots.length === 0) return true; // stat-only boon — always relevant
  return slots.some((s) => occupant[s] === s); // ≥1 native slot it touches is still live
}

export function reofferCandidates(classId: ClassId, owned: readonly string[]): string[] {
  if (!CLASSES[classId]) return []; // unrecognised class → no kit to reclaim
  const occupant = occupancyAfter(classId, owned);
  const out: string[] = [];
  for (const slot of SLOTS) {
    const key = occupant[slot];
    if (key === slot) continue; // native still equipped here → nothing displaced
    out.push(`${RESTORE_PREFIX}${slot}`); // reclaim the displaced original
    // Offer the source-class boons that level ONLY the grafted ability (a
    // single-slot boon on the source slot), so a graftup can't smear an
    // unrelated slot's effect onto the graft via the apply proxy.
    const src = CHAR_UPGRADES[key]?.graftSource;
    if (!src) continue;
    for (const b of CHAR_UPGRADES_BY_CLASS[src.classId] ?? []) {
      const touched = BOON_SLOTS[b.id] ?? [];
      if (touched.length !== 1 || touched[0] !== src.slot) continue;
      const gid = `${GRAFTUP_PREFIX}${slot}:${b.id}`;
      if (!charUpgradeAtMax(gid, owned)) out.push(gid);
    }
  }
  return out;
}

/** A resolved label + description for an offer (a real, reclaim, or graftup id). */
export interface CharOfferView {
  id: string;
  label: string;
  desc: string;
}

/**
 * Human-readable label + description for ANY character-upgrade offer id — a real
 * catalog id, a `restore:` reclaim, or a `graftup:` grafted-skill upgrade —
 * resolved against the hero's current (upgrade-applied) kit so a graft names the
 * REAL skill it replaces ("Replaces Fireball", item 18) and a reclaim / graftup
 * names the ability it acts on. Returns null for an unrecognised id.
 */
export function describeCharOffer(
  classId: ClassId,
  ownedChar: readonly string[],
  id: string,
): CharOfferView | null {
  const current = previewAbilityTable(classId, [...ownedChar]);
  const restoreSlot = parseRestore(id);
  if (restoreSlot) {
    const nativeName = CLASSES[classId].abilities[restoreSlot].name;
    const cur = current[restoreSlot]?.name;
    const tail = cur && cur !== nativeName ? `, dropping ${cur}` : '';
    return {
      id,
      label: `↩️ Reclaim ${nativeName}`,
      desc: `Take back ${nativeName}${tail}. Boons you earned on it are restored.`,
    };
  }
  const graftup = parseGraftup(id);
  if (graftup) {
    const boon = CHAR_UPGRADES[graftup.boonId]; // parseGraftup guarantees it exists
    const skillName = current[graftup.slot]?.name ?? 'grafted skill';
    return {
      id,
      label: `${boon.icon} ${boon.name}`,
      desc: `${boon.desc}. Upgrades your grafted ${skillName}.`,
    };
  }
  const def = CHAR_UPGRADES[id];
  if (!def) return null;
  const replaced = def.replaces ? current[def.replaces]?.name : null;
  let desc = replaced ? `${def.desc}. Replaces ${replaced}.` : def.desc;
  if (def.grand) desc = `GRAND — ${desc}`;
  // Current-stats preview (item 4): if this boon retunes ability numbers, append
  // the affected ability's resolved effect line AFTER stacking it on the hero's
  // CURRENT kit — so a repeat pick shows real values ("Arrow → 3× 30 dmg · 0.5s
  // cooldown") instead of a fixed "+5 damage". Grafts already name what they swap.
  if (!def.replaces) {
    const after = previewAbilityTable(classId, [...ownedChar, id]);
    const preview = SLOTS.filter((s) => JSON.stringify(current[s]) !== JSON.stringify(after[s]))
      .map((s) => `${after[s].name}: ${describeAbility(after[s])}`)
      .join(' · ');
    if (preview) desc = `${desc}. Now → ${preview}`;
  }
  const label = def.grand ? `★ ${def.icon} ${def.name}` : `${def.icon} ${def.name}`;
  return { id, label, desc };
}

/** A compact icon + name + tooltip for an owned boon badge (real or synthetic). */
export function charUpgradeBadge(id: string): { icon: string; name: string; desc: string } | null {
  const restoreSlot = parseRestore(id);
  if (restoreSlot)
    return {
      icon: '↩️',
      name: 'Reclaimed skill',
      desc: 'Reclaimed a replaced ability, boons intact.',
    };
  const graftup = parseGraftup(id);
  if (graftup) {
    const boon = CHAR_UPGRADES[graftup.boonId]; // parseGraftup guarantees it exists
    return { icon: boon.icon, name: boon.name, desc: `${boon.desc}. Upgrades your grafted skill.` };
  }
  const def = CHAR_UPGRADES[id];
  if (!def) return null;
  return { icon: def.icon, name: def.name, desc: def.desc };
}

/** Chance one class offer is swapped for a wild cross-class hybrid pick. */
export const HYBRID_OFFER_CHANCE = 0.45;

/** Chance one offer is swapped for a reclaim / grafted-skill upgrade (items 15 & 17). */
export const REOFFER_CHANCE = 0.5;

/**
 * Roll `n` distinct character-upgrade offers from a class's pool. `rnd` returns a
 * float in [0,1). Pure aside from the injected randomness (mirrors upgrades.ts).
 * With `HYBRID_OFFER_CHANCE`, one offer is swapped for a random HYBRID pick —
 * a cross-class power or combat style the class never had.
 */
/** Selection weight for the hero's MAIN class over an extra multiclass (item 23). */
export const MAIN_CLASS_WEIGHT = 2.5;

export function rollCharChoices(
  classId: ClassId,
  n: number,
  rnd: () => number,
  owned: readonly string[] = [],
  extraClasses: readonly ClassId[] = [],
): string[] {
  const out: string[] = [];
  const extras = extraClasses.filter((c) => c !== classId);
  // Slot occupancy after the hero's owned upgrades — drives the item-26 filter that
  // drops boons which only upgrade a skill that's been grafted over. All-native for a
  // graft-less hero, so it never filters anything for the common case.
  const occupant = CLASSES[classId] ? occupancyAfter(classId, owned) : null;
  const liveBoon = (id: string): boolean => !occupant || boonUpgradesLiveSkill(occupant, id);
  if (extras.length > 0) {
    // Multiclass (item 14/23): the pool spans EVERY owned class's upgrades, but the
    // MAIN class's picks are weighted heavier so they surface more often.
    const weighted: Array<{ id: string; w: number }> = [];
    const push = (cid: ClassId, w: number, filterLive: boolean): void => {
      for (const d of CHAR_UPGRADES_BY_CLASS[cid] ?? []) {
        if (charUpgradeAtMax(d.id, owned)) continue;
        if (filterLive && !liveBoon(d.id)) continue; // item 26: replaced skill → drop
        weighted.push({ id: d.id, w });
      }
    };
    push(classId, MAIN_CLASS_WEIGHT, true);
    for (const c of extras) push(c, 1, false);
    const count = Math.min(n, weighted.length);
    while (out.length < count && weighted.length > 0) {
      const total = weighted.reduce((s, x) => s + x.w, 0);
      let roll = rnd() * total;
      let idx = weighted.length - 1;
      for (let i = 0; i < weighted.length; i++) {
        roll -= weighted[i].w;
        if (roll <= 0) {
          idx = i;
          break;
        }
      }
      out.push(weighted[idx].id);
      weighted.splice(idx, 1);
    }
  } else {
    const pool = (CHAR_UPGRADES_BY_CLASS[classId] ?? [])
      .map((d) => d.id)
      .filter((id) => !charUpgradeAtMax(id, owned) && liveBoon(id)); // item 26 filter
    const count = Math.min(n, pool.length);
    while (out.length < count) {
      const i = Math.floor(rnd() * pool.length) % pool.length;
      out.push(pool[i]);
      pool.splice(i, 1);
    }
  }
  const eligible = HYBRID.filter(
    (h) => upgradeAllowedFor(h, classId) && !charUpgradeAtMax(h.id, owned),
  );
  if (out.length > 0 && eligible.length > 0 && rnd() < HYBRID_OFFER_CHANCE) {
    const hy = eligible[Math.floor(rnd() * eligible.length) % eligible.length];
    out[out.length - 1] = hy.id;
  }
  // GRAND improvements are NEVER surfaced in the between-boss pool (item 20): they
  // are prized, transformative capstones handed out only through the run-clear
  // SPECIAL reward flow (see SpecialReward.tsx), so the ordinary shop stays a
  // steady stream of incremental boons.
  // Re-offer (items 15 & 17): if a graft has displaced one of the hero's skills,
  // sometimes surface a reclaim of the original or an upgrade for the graft, so a
  // replaced ability isn't lost and a grafted one can still be levelled. Draws no
  // rng for heroes without a displaced skill, so the base offer stream is intact.
  const reoffers = reofferCandidates(classId, owned);
  if (out.length > 0 && reoffers.length > 0 && rnd() < REOFFER_CHANCE) {
    const pick = reoffers[Math.floor(rnd() * reoffers.length) % reoffers.length];
    // A synthetic reclaim / graftup id never collides with the real base picks;
    // slot it away from the grand (index 0) / hybrid (last) swaps.
    out[out.length > 1 ? 1 : 0] = pick;
  }
  return out;
}
