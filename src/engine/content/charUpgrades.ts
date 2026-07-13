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
import type { ClassId, AbilitySlot, SubSlot, Player } from '../core/types';
import type { PlayerAbilityDef } from './classes';
import { CLASSES, getClass, cloneAbilities, slowAttackCooldowns, describeAbility } from './classes';
import { getSubclass, subclassOfSkill, ALL_SUBCLASSES } from './subclasses';
import { applyUpgrades, type UpgradeId } from './upgrades';
import { MAX_SKILL_STACKS } from '../core/constants';

/** What an upgrade's `apply` receives: the hero and their private ability table. */
export interface CharUpgradeCtx {
  player: Player;
  abilities: Record<AbilitySlot, PlayerAbilityDef>;
  /**
   * The hero's bound subclass abilities (sub1/sub2), present ONLY while applying a
   * SUBCLASS grand (item 17). The base-ability replay never sets it, so ordinary
   * boons/grands (which read `abilities`) are unaffected — and a subclass grand is
   * a harmless no-op there. The apply is handed only the sub-abilities that belong
   * to that grand's subclass, so it can tune each one blindly. Mutated in place.
   */
  subAbilities?: Partial<Record<SubSlot, PlayerAbilityDef>>;
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
   * A GRAND improvement (item 22): a rare, transformative capstone that can never
   * stack with itself (maxStacks is forced to 1) and is offered only through the
   * run-clear special reward. Three flavours (item 17): a CLASS grand (neither
   * field below), a base-SKILL grand (`skillSlot` set), or a SUBCLASS grand
   * (`subclassId` set). All carry `grand: true`.
   */
  grand?: boolean;
  /**
   * A base-SKILL grand (item 17): tied to exactly one base slot. Offered only while
   * that slot still holds its NATIVE skill — a grafted-over slot hides its native
   * skill's grand (item 19). Set by the `gk` builder.
   */
  skillSlot?: AbilitySlot;
  /**
   * A SUBCLASS grand (item 17): tied to a subclass id. Its `apply` mutates the
   * hero's bound sub-abilities from that subclass (via `ctx.subAbilities`), and it
   * is offered only for subclasses the hero has actually picked. Set by `gs`.
   */
  subclassId?: string;
  /**
   * A per-SUBCLASS-SKILL upgrade (item 6): tied to exactly one subclass skill id. A
   * normal (non-grand, cap-5) boon that only enters the between-boss pool once the
   * hero has that sub skill EQUIPPED, and whose `apply` tunes just that bound
   * sub-ability (via `ctx.subAbilities`, filled only by `applySubSkillUpgrades`). A
   * harmless no-op in the base-ability replay. Set by `us`.
   */
  subSkillId?: string;
  /**
   * A GRAFT grand (item 18): tied to a skill-replacing hybrid graft by its id (e.g.
   * `hy_pyromancer`). Offered only while the hero currently holds that graft (its id
   * occupies the slot it replaced), and its `apply` accrues onto the grafted skill
   * itself — live in its slot or stashed after a reclaim — never onto a native skill
   * that has reclaimed the slot. Class-agnostic (`classId: 'any'`). Set by `gg`.
   */
  graftId?: string;
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
  // Run-aware source: a graft copies the RUN'S rolled version of the foreign
  // skill (a Knight who learns this run's Fireball gets this run's Fireball).
  const src = getClass(from).abilities[fromSlot];
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
      '🐺', // item 4: was 📯 (a postal horn) — a feral howl now reads true

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

// ---------------------------------------------------------------------------
// BASE-SKILL grands (item 17) — two radical capstones for each of the 48 base
// skills (12 classes × basic/a1/a2/a3). Each is a build-defining twist on that
// SPECIFIC skill (a 360° cleave, an instant Fireball, a freezing nova), not a
// formulaic +X%. Keyed by the slot they touch via the `gk` builder, so the
// offer roll can hide a slot whose native skill has been grafted over (item 19).
// Effects only ever tug levers the sim honours for that ability's kind (see
// combat/abilities.ts): projectiles freeze/chill/pierce but never stun; only a
// dash lands an AoE (a blink can't); a taunt reads only its shield + duration.
// ---------------------------------------------------------------------------

const SUB_SLOTS: readonly SubSlot[] = ['sub1', 'sub2'];

/** Base-skill grand builder — a grand tied to one base slot (forces grand +
 *  maxStacks 1). `tune` mutates the ability that currently sits in that slot. */
function gk(
  classId: ClassId,
  skillSlot: AbilitySlot,
  id: string,
  name: string,
  icon: string,
  desc: string,
  tune: (ab: PlayerAbilityDef) => void,
): CharUpgradeDef {
  return {
    id,
    classId,
    name,
    icon,
    desc,
    grand: true,
    maxStacks: 1,
    skillSlot,
    apply: ({ abilities }) => tune(abilities[skillSlot]),
  };
}

export const SKILL_GRANDS: CharUpgradeDef[] = [
  // --- Knight ---------------------------------------------------------------
  gk(
    'knight',
    'basic',
    'kn_gk_basic_a',
    'Whirlwind of Steel',
    '🌀',
    'Cleave sweeps a full 360° circle, reaches +25u, hits for +12, and drinks 20% as health',
    (ab) => {
      ab.halfAngleDeg = 180;
      addN(ab, 'range', 25);
      addN(ab, 'damage', 12);
      addN(ab, 'lifestealFrac', 0.2);
    },
  ),
  gk(
    'knight',
    'basic',
    'kn_gk_basic_b',
    'Executioner',
    '🪓',
    "Cleave falls like a headsman's axe: +28 damage, +20u reach, and a 0.6s stun",
    (ab) => {
      addN(ab, 'damage', 28);
      addN(ab, 'range', 20);
      addN(ab, 'stun', 0.6);
    },
  ),
  gk(
    'knight',
    'a1',
    'kn_gk_a1_a',
    "Bulwark's Call",
    '🛡️',
    'Taunt wraps you in a lasting 55%-mitigation shield and holds 4s longer',
    (ab) => {
      setMin(ab, 'buffDefMult', 0.45);
      addN(ab, 'buffDuration', 4);
    },
  ),
  gk(
    'knight',
    'a1',
    'kn_gk_a1_b',
    'Vortex of War',
    '🌀',
    'Taunt recharges in a heartbeat (−55% cooldown) and still shields you 30%',
    (ab) => {
      mul(ab, 'cooldown', 0.45);
      setMin(ab, 'buffDefMult', 0.7);
    },
  ),
  gk(
    'knight',
    'a2',
    'kn_gk_a2_a',
    'Aegis Eternal',
    '✨',
    'Shield Wall nears invulnerability (85% mitigation) and holds 3s longer',
    (ab) => {
      mul(ab, 'buffDefMult', 0.3);
      addN(ab, 'buffDuration', 3);
    },
  ),
  gk(
    'knight',
    'a2',
    'kn_gk_a2_b',
    'Living Fortress',
    '🏰',
    'Shield Wall is up far more often (−40% cd), deepens to 25% taken, and lasts +5s',
    (ab) => {
      mul(ab, 'buffDefMult', 0.5);
      addN(ab, 'buffDuration', 5);
      mul(ab, 'cooldown', 0.6);
    },
  ),
  gk(
    'knight',
    'a3',
    'kn_gk_a3_a',
    'Skullcracker',
    '💫',
    'Shield Bash concusses for +1.4s stun and +25 damage',
    (ab) => {
      addN(ab, 'stun', 1.4);
      addN(ab, 'damage', 25);
    },
  ),
  gk(
    'knight',
    'a3',
    'kn_gk_a3_b',
    'Thunderclap',
    '⚡',
    'Shield Bash erupts into a 90°-wide shock: +20 damage, +30u reach, +0.5s stun',
    (ab) => {
      ab.halfAngleDeg = 90;
      addN(ab, 'range', 30);
      addN(ab, 'damage', 20);
      addN(ab, 'stun', 0.5);
    },
  ),

  // --- Ranger ---------------------------------------------------------------
  gk(
    'ranger',
    'basic',
    'rg_gk_basic_a',
    'Splitshaft',
    '🏹',
    'Every Arrow splits into 3 across a 16° fan, each +6 damage',
    (ab) => {
      addN(ab, 'projCount', 2);
      ab.spreadDeg = Math.max(ab.spreadDeg ?? 0, 16);
      addN(ab, 'damage', 6);
    },
  ),
  gk(
    'ranger',
    'basic',
    'rg_gk_basic_b',
    'Railshot',
    '🎯',
    'Arrow becomes a hypersonic lance: +26 damage, +300 speed, far greater range',
    (ab) => {
      addN(ab, 'damage', 26);
      addN(ab, 'projSpeed', 300);
      addN(ab, 'maxRange', 260);
    },
  ),
  gk(
    'ranger',
    'a1',
    'rg_gk_a1_a',
    'Arrowfall',
    '🌩️',
    'Multishot becomes a wall of 6 extra arrows across a 20°-wider fan (+5 each)',
    (ab) => {
      addN(ab, 'projCount', 6);
      addN(ab, 'spreadDeg', 20);
      addN(ab, 'damage', 5);
    },
  ),
  gk(
    'ranger',
    'a1',
    'rg_gk_a1_b',
    'Frostvolley',
    '❄️',
    'Multishot bites deep (+2 arrows, +12 each) and freezes what it strikes for 0.6s',
    (ab) => {
      addN(ab, 'projCount', 2);
      addN(ab, 'damage', 12);
      addN(ab, 'freeze', 0.6);
    },
  ),
  gk(
    'ranger',
    'a2',
    'rg_gk_a2_a',
    'Meteoric Barrage',
    '☄️',
    'Rain of Arrows pours for +16/tick across +50u for +2.5s',
    (ab) => {
      addN(ab, 'zoneTickDamage', 16);
      addN(ab, 'radius', 50);
      addN(ab, 'zoneDuration', 2.5);
    },
  ),
  gk(
    'ranger',
    'a2',
    'rg_gk_a2_b',
    'Tar Volley',
    '🕸️',
    'Rain of Arrows mires the ground: +8/tick and slows to 40% for +2s',
    (ab) => {
      addN(ab, 'zoneTickDamage', 8);
      setMin(ab, 'slowMult', 0.4);
      ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1.5);
      addN(ab, 'zoneDuration', 2);
    },
  ),
  gk(
    'ranger',
    'a3',
    'rg_gk_a3_a',
    'Phantom Step',
    '💨',
    'Roll flickers +130u with +0.4s i-frames and recharges twice as fast',
    (ab) => {
      addN(ab, 'range', 130);
      addN(ab, 'iframes', 0.4);
      mul(ab, 'cooldown', 0.5);
    },
  ),
  gk(
    'ranger',
    'a3',
    'rg_gk_a3_b',
    'Detonating Roll',
    '💥',
    'Roll erupts on landing for 40 across a 130u blast, and travels +80u',
    (ab) => {
      ab.landingDamage = (ab.landingDamage ?? 0) + 40;
      ab.radius = (ab.radius ?? 0) + 130;
      addN(ab, 'range', 80);
    },
  ),

  // --- Mage -----------------------------------------------------------------
  gk(
    'mage',
    'basic',
    'mg_gk_basic_a',
    'Arcane Barrage',
    '✨',
    'Arcane Bolt splits into 3 across a 14° fan (+5 each)',
    (ab) => {
      addN(ab, 'projCount', 2);
      ab.spreadDeg = Math.max(ab.spreadDeg ?? 0, 14);
      addN(ab, 'damage', 5);
    },
  ),
  gk(
    'mage',
    'basic',
    'mg_gk_basic_b',
    'Frostlance',
    '❄️',
    'Arcane Bolt becomes a piercing lance: +18 damage, +350 speed, freezes for 0.4s',
    (ab) => {
      addN(ab, 'damage', 18);
      addN(ab, 'projSpeed', 350);
      addN(ab, 'maxRange', 200);
      addN(ab, 'freeze', 0.4);
    },
  ),
  gk(
    'mage',
    'a1',
    'mg_gk_a1_a',
    'Supernova',
    '🌟',
    'Fireball detonates for +55 across a colossal +80u blast',
    (ab) => {
      addN(ab, 'damage', 55);
      addN(ab, 'impactRadius', 80);
    },
  ),
  gk(
    'mage',
    'a1',
    'mg_gk_a1_b',
    'Chain Ignition',
    '🔥',
    'Fireball snaps out instantly (−80% cast), recharges twice as fast, +20 damage',
    (ab) => {
      mul(ab, 'castTime', 0.2);
      mul(ab, 'cooldown', 0.5);
      addN(ab, 'damage', 20);
    },
  ),
  gk(
    'mage',
    'a2',
    'mg_gk_a2_a',
    'Absolute Zero',
    '🧊',
    'Frost Nova freezes solid for 1.5s, +20 damage, +40u',
    (ab) => {
      addN(ab, 'freeze', 1.5);
      addN(ab, 'damage', 20);
      addN(ab, 'radius', 40);
    },
  ),
  gk(
    'mage',
    'a2',
    'mg_gk_a2_b',
    'Blizzard',
    '🌨️',
    'Frost Nova swells +60u and locks foes to 30% speed for +2s (+12 damage)',
    (ab) => {
      addN(ab, 'radius', 60);
      setMin(ab, 'slowMult', 0.3);
      addN(ab, 'slowDuration', 2);
      addN(ab, 'damage', 12);
    },
  ),
  gk(
    'mage',
    'a3',
    'mg_gk_a3_a',
    'Fold Space',
    '🌀',
    'Blink leaps +150u, recharges in a blink (−60% cd), and phases you 0.4s',
    (ab) => {
      addN(ab, 'range', 150);
      mul(ab, 'cooldown', 0.4);
      addN(ab, 'iframes', 0.4);
    },
  ),
  gk(
    'mage',
    'a3',
    'mg_gk_a3_b',
    'Displacement Ward',
    '🛡️',
    'Blink knits +60 HP on use, phases you 0.5s, and reaches +80u',
    (ab) => {
      addN(ab, 'healOnUse', 60);
      addN(ab, 'iframes', 0.5);
      addN(ab, 'range', 80);
    },
  ),

  // --- Cleric ---------------------------------------------------------------
  gk(
    'cleric',
    'basic',
    'cl_gk_basic_a',
    'Wrath of the Heavens',
    '🌟',
    'Smite splits into 3 holy bolts (+8 each) and dazes struck foes for 0.6s',
    (ab) => {
      addN(ab, 'projCount', 2);
      ab.spreadDeg = Math.max(ab.spreadDeg ?? 0, 12);
      addN(ab, 'damage', 8);
      addN(ab, 'freeze', 0.6);
    },
  ),
  gk(
    'cleric',
    'basic',
    'cl_gk_basic_b',
    'Judgment',
    '☀️',
    'Smite becomes a searing lance: +24 damage, +300 speed, far greater range',
    (ab) => {
      addN(ab, 'damage', 24);
      addN(ab, 'projSpeed', 300);
      addN(ab, 'maxRange', 200);
    },
  ),
  gk(
    'cleric',
    'a1',
    'cl_gk_a1_a',
    'Miracle',
    '💚',
    'Heal pours for +80 HP across almost the whole arena (+250u)',
    (ab) => {
      addN(ab, 'damage', 80);
      addN(ab, 'range', 250);
    },
  ),
  gk(
    'cleric',
    'a1',
    'cl_gk_a1_b',
    'Rapid Mending',
    '✨',
    'Heal recharges almost instantly (−60% cd) and mends +25',
    (ab) => {
      mul(ab, 'cooldown', 0.4);
      addN(ab, 'damage', 25);
    },
  ),
  gk(
    'cleric',
    'a2',
    'cl_gk_a2_a',
    'Hallowed Ground',
    '⛪',
    'Sanctuary mends +22/tick across +70u for +4s',
    (ab) => {
      addN(ab, 'zoneTickHeal', 22);
      addN(ab, 'radius', 70);
      addN(ab, 'zoneDuration', 4);
    },
  ),
  gk(
    'cleric',
    'a2',
    'cl_gk_a2_b',
    'Consecrated Bastion',
    '🛡️',
    'Sanctuary also scorches enemies 16/tick, slows them to 50%, and mends +8',
    (ab) => {
      addN(ab, 'zoneTickDamage', 16);
      setMin(ab, 'slowMult', 0.5);
      ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1);
      addN(ab, 'zoneTickHeal', 8);
    },
  ),
  gk(
    'cleric',
    'a3',
    'cl_gk_a3_a',
    'Divine Favor',
    '🙏',
    'Blessing girds an ally with +45% damage AND 40% mitigation, lasting 4s longer',
    (ab) => {
      addN(ab, 'buffDamageMult', 0.45);
      setMin(ab, 'buffDefMult', 0.6);
      addN(ab, 'buffDuration', 4);
    },
  ),
  gk(
    'cleric',
    'a3',
    'cl_gk_a3_b',
    'Zealotry',
    '⚡',
    'Blessing also grants +25% move speed, +15% damage, and returns twice as fast',
    (ab) => {
      ab.buffMoveMult = Math.max(ab.buffMoveMult ?? 1, 1.25);
      mul(ab, 'cooldown', 0.5);
      addN(ab, 'buffDamageMult', 0.15);
    },
  ),

  // --- Barbarian ------------------------------------------------------------
  gk(
    'barbarian',
    'basic',
    'bb_gk_basic_a',
    'Bloodstorm',
    '🩸',
    'Reckless Swing becomes a 360° blood-whirl: +12 damage, +25u, drinks 30% as health',
    (ab) => {
      ab.halfAngleDeg = 180;
      addN(ab, 'range', 25);
      addN(ab, 'damage', 12);
      addN(ab, 'lifestealFrac', 0.3);
    },
  ),
  gk(
    'barbarian',
    'basic',
    'bb_gk_basic_b',
    'Cleaving Fury',
    '🪓',
    'Reckless Swing hits for +22 across a wider 75° arc, +18u reach',
    (ab) => {
      addN(ab, 'damage', 22);
      addN(ab, 'halfAngleDeg', 20);
      addN(ab, 'range', 18);
    },
  ),
  gk(
    'barbarian',
    'a1',
    'bb_gk_a1_a',
    'Undying Rage',
    '😤',
    'Rage swells with +55% damage and +40% move, and lasts 5s longer',
    (ab) => {
      addN(ab, 'buffDamageMult', 0.55);
      addN(ab, 'buffMoveMult', 0.4);
      addN(ab, 'buffDuration', 5);
    },
  ),
  gk(
    'barbarian',
    'a1',
    'bb_gk_a1_b',
    'Bloodlust',
    '🔥',
    'Rage is nearly always up (−45% cd), adds +35% damage, and lasts +2s',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      addN(ab, 'buffDamageMult', 0.35);
      addN(ab, 'buffDuration', 2);
    },
  ),
  gk(
    'barbarian',
    'a2',
    'bb_gk_a2_a',
    'Seismic Crash',
    '💥',
    'Leap slams for +45 landing damage across +50u',
    (ab) => {
      addN(ab, 'landingDamage', 45);
      addN(ab, 'radius', 50);
    },
  ),
  gk(
    'barbarian',
    'a2',
    'bb_gk_a2_b',
    'Thunderous Leap',
    '⚡',
    'Leap lands stunning foes for 1s and +25 damage, and recharges 40% faster',
    (ab) => {
      addN(ab, 'landingDamage', 25);
      addN(ab, 'stun', 1);
      mul(ab, 'cooldown', 0.6);
    },
  ),
  gk(
    'barbarian',
    'a3',
    'bb_gk_a3_a',
    'Endless Whirlwind',
    '🌀',
    'Whirlwind roars to +55u and +26 damage, drinking 25% as health',
    (ab) => {
      addN(ab, 'radius', 55);
      addN(ab, 'damage', 26);
      addN(ab, 'lifestealFrac', 0.25);
    },
  ),
  gk(
    'barbarian',
    'a3',
    'bb_gk_a3_b',
    'Cyclonic Fury',
    '🌪️',
    'Whirlwind hits +18, slows to 45%, widens +20u, and spins up 40% faster',
    (ab) => {
      addN(ab, 'damage', 18);
      setMin(ab, 'slowMult', 0.45);
      ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1.5);
      addN(ab, 'radius', 20);
      mul(ab, 'cooldown', 0.6);
    },
  ),

  // --- Rogue ----------------------------------------------------------------
  gk(
    'rogue',
    'basic',
    'ro_gk_basic_a',
    'Thousand Cuts',
    '⚡',
    'Slash strikes twice as fast (−50% cd) for +6 and drinks 15% as health',
    (ab) => {
      mul(ab, 'cooldown', 0.5);
      addN(ab, 'damage', 6);
      addN(ab, 'lifestealFrac', 0.15);
    },
  ),
  gk(
    'rogue',
    'basic',
    'ro_gk_basic_b',
    'Whirling Blades',
    '🌀',
    'Slash sweeps a full 360° circle: +8 damage, +25u reach',
    (ab) => {
      ab.halfAngleDeg = 180;
      addN(ab, 'damage', 8);
      addN(ab, 'range', 25);
    },
  ),
  gk(
    'rogue',
    'a1',
    'ro_gk_a1_a',
    'Assassinate',
    '🗡️',
    'Backstab annihilates for +70 and heals you 25% of the damage dealt',
    (ab) => {
      addN(ab, 'damage', 70);
      addN(ab, 'lifestealFrac', 0.25);
    },
  ),
  gk(
    'rogue',
    'a1',
    'ro_gk_a1_b',
    'Deathblow',
    '💀',
    'Backstab hits for +40, dazes 0.8s, and returns 45% sooner',
    (ab) => {
      addN(ab, 'damage', 40);
      addN(ab, 'stun', 0.8);
      mul(ab, 'cooldown', 0.55);
    },
  ),
  gk(
    'rogue',
    'a2',
    'ro_gk_a2_a',
    'Nightstalker',
    '🌑',
    'Shadowstep resets almost at once (−65% cd), phases +0.4s, and heals 25',
    (ab) => {
      mul(ab, 'cooldown', 0.35);
      addN(ab, 'iframes', 0.4);
      addN(ab, 'healOnUse', 25);
    },
  ),
  gk(
    'rogue',
    'a2',
    'ro_gk_a2_b',
    'Death from Shadow',
    '🥷',
    'Shadowstep leaps +160u, phases +0.5s, and mends +40',
    (ab) => {
      addN(ab, 'range', 160);
      addN(ab, 'iframes', 0.5);
      addN(ab, 'healOnUse', 40);
    },
  ),
  gk(
    'rogue',
    'a3',
    'ro_gk_a3_a',
    'Plaguebringer',
    '☠️',
    'Poison Vial festers for +22/tick across +65u for +4s',
    (ab) => {
      addN(ab, 'zoneTickDamage', 22);
      addN(ab, 'radius', 65);
      addN(ab, 'zoneDuration', 4);
    },
  ),
  gk(
    'rogue',
    'a3',
    'ro_gk_a3_b',
    'Crippling Toxin',
    '🕸️',
    'Poison Vial slows foes to 40%, ticks +10, and spreads +40u',
    (ab) => {
      setMin(ab, 'slowMult', 0.4);
      ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1.5);
      addN(ab, 'zoneTickDamage', 10);
      addN(ab, 'radius', 40);
    },
  ),

  // --- Paladin --------------------------------------------------------------
  gk(
    'paladin',
    'basic',
    'pa_gk_basic_a',
    'Radiant Arc',
    '🌟',
    'Holy Strike sweeps a wide 90° arc for +16, +15u, healing 20% of the damage',
    (ab) => {
      addN(ab, 'halfAngleDeg', 45);
      addN(ab, 'damage', 16);
      addN(ab, 'range', 15);
      addN(ab, 'lifestealFrac', 0.2);
    },
  ),
  gk(
    'paladin',
    'basic',
    'pa_gk_basic_b',
    'Hammer of Justice',
    '🔨',
    'Holy Strike smites for +22 and stuns for 0.8s',
    (ab) => {
      addN(ab, 'damage', 22);
      addN(ab, 'stun', 0.8);
    },
  ),
  gk(
    'paladin',
    'a1',
    'pa_gk_a1_a',
    'Hallowed Sanctuary',
    '⛪',
    'Consecration scorches +14 and mends +14 per tick across +60u, lasting +3s',
    (ab) => {
      addN(ab, 'zoneTickDamage', 14);
      addN(ab, 'zoneTickHeal', 14);
      addN(ab, 'radius', 60);
      addN(ab, 'zoneDuration', 3);
    },
  ),
  gk(
    'paladin',
    'a1',
    'pa_gk_a1_b',
    'Searing Ground',
    '🔥',
    'Consecration burns +18/tick, holds foes to 50% speed, and widens +30u',
    (ab) => {
      addN(ab, 'zoneTickDamage', 18);
      setMin(ab, 'slowMult', 0.5);
      ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1);
      addN(ab, 'radius', 30);
    },
  ),
  gk(
    'paladin',
    'a2',
    'pa_gk_a2_a',
    'Miraculous Mending',
    '💛',
    'Lay on Hands overflows for +90 HP at far greater range',
    (ab) => {
      addN(ab, 'damage', 90);
      addN(ab, 'range', 200);
    },
  ),
  gk(
    'paladin',
    'a2',
    'pa_gk_a2_b',
    'Blessed Hands',
    '✨',
    'Lay on Hands recharges more than twice as fast (−55% cd) and mends +30',
    (ab) => {
      mul(ab, 'cooldown', 0.45);
      addN(ab, 'damage', 30);
    },
  ),
  gk(
    'paladin',
    'a3',
    'pa_gk_a3_a',
    'Unbreakable',
    '🛡️',
    'Divine Shield nears invulnerability (86% mitigation) and holds 3s longer',
    (ab) => {
      mul(ab, 'buffDefMult', 0.4);
      addN(ab, 'buffDuration', 3);
    },
  ),
  gk(
    'paladin',
    'a3',
    'pa_gk_a3_b',
    'Bastion of Light',
    '🌅',
    'Divine Shield is up far more often (−45% cd), deepens, and holds +4s',
    (ab) => {
      mul(ab, 'buffDefMult', 0.6);
      addN(ab, 'buffDuration', 4);
      mul(ab, 'cooldown', 0.55);
    },
  ),

  // --- Druid ----------------------------------------------------------------
  gk(
    'druid',
    'basic',
    'dr_gk_basic_a',
    'Thorn Barrage',
    '🌵',
    'Thornlash splits into 4 thorns across a 16° fan (+6 each)',
    (ab) => {
      addN(ab, 'projCount', 3);
      ab.spreadDeg = Math.max(ab.spreadDeg ?? 0, 16);
      addN(ab, 'damage', 6);
    },
  ),
  gk(
    'druid',
    'basic',
    'dr_gk_basic_b',
    'Bramble Spear',
    '🌿',
    'Thornlash becomes a heavy spear: +22 damage, +250 speed, slows to 55%',
    (ab) => {
      addN(ab, 'damage', 22);
      addN(ab, 'projSpeed', 250);
      setMin(ab, 'slowMult', 0.55);
      ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1.5);
    },
  ),
  gk(
    'druid',
    'a1',
    'dr_gk_a1_a',
    'Strangleroots',
    '🌳',
    'Entangle roots to 15% speed and gnaws +18/tick across +60u for +3s',
    (ab) => {
      setMin(ab, 'slowMult', 0.15);
      addN(ab, 'zoneTickDamage', 18);
      addN(ab, 'radius', 60);
      addN(ab, 'zoneDuration', 3);
    },
  ),
  gk(
    'druid',
    'a1',
    'dr_gk_a1_b',
    'Ancient Grove',
    '🍃',
    'Entangle sprawls +65u and lingers +5s, biting +12/tick',
    (ab) => {
      addN(ab, 'radius', 65);
      addN(ab, 'zoneDuration', 5);
      addN(ab, 'zoneTickDamage', 12);
    },
  ),
  gk(
    'druid',
    'a2',
    'dr_gk_a2_a',
    'Wild Bloom',
    '💚',
    'Regrowth surges for +75 HP at far greater range',
    (ab) => {
      addN(ab, 'damage', 75);
      addN(ab, 'range', 200);
    },
  ),
  gk(
    'druid',
    'a2',
    'dr_gk_a2_b',
    'Rapid Regrowth',
    '✨',
    'Regrowth mends +30 and recharges twice as fast',
    (ab) => {
      addN(ab, 'damage', 30);
      mul(ab, 'cooldown', 0.5);
    },
  ),
  gk(
    'druid',
    'a3',
    'dr_gk_a3_a',
    'Tempest',
    '🌪️',
    'Cyclone widens +60u, hits +24, and rips foes to 30% speed',
    (ab) => {
      addN(ab, 'radius', 60);
      addN(ab, 'damage', 24);
      setMin(ab, 'slowMult', 0.3);
      addN(ab, 'slowDuration', 1);
    },
  ),
  gk(
    'druid',
    'a3',
    'dr_gk_a3_b',
    'Hurricane',
    '🌀',
    'Cyclone hits +14, freezes for 0.8s, widens +20u, and recharges 40% faster',
    (ab) => {
      addN(ab, 'damage', 14);
      addN(ab, 'freeze', 0.8);
      addN(ab, 'radius', 20);
      mul(ab, 'cooldown', 0.6);
    },
  ),

  // --- Bard -----------------------------------------------------------------
  gk(
    'bard',
    'basic',
    'ba_gk_basic_a',
    'Cacophony',
    '🎭',
    'Vicious Mockery scatters 3 bolts (+7 each) and chills to 50%',
    (ab) => {
      addN(ab, 'projCount', 2);
      ab.spreadDeg = Math.max(ab.spreadDeg ?? 0, 14);
      addN(ab, 'damage', 7);
      setMin(ab, 'slowMult', 0.5);
      addN(ab, 'slowDuration', 1);
    },
  ),
  gk(
    'bard',
    'basic',
    'ba_gk_basic_b',
    'Soul-Rending Insult',
    '💔',
    'Vicious Mockery cuts for +18, +200 speed, and freezes for 0.5s',
    (ab) => {
      addN(ab, 'damage', 18);
      addN(ab, 'projSpeed', 200);
      addN(ab, 'freeze', 0.5);
    },
  ),
  gk(
    'bard',
    'a1',
    'ba_gk_a1_a',
    'Anthem of Legends',
    '🎺',
    'Inspiration girds an ally with +45% damage AND 35% mitigation, lasting +4s',
    (ab) => {
      addN(ab, 'buffDamageMult', 0.45);
      setMin(ab, 'buffDefMult', 0.65);
      addN(ab, 'buffDuration', 4);
    },
  ),
  gk(
    'bard',
    'a1',
    'ba_gk_a1_b',
    'Marching Cadence',
    '🥁',
    'Inspiration also grants +30% move, +15% damage, and returns twice as fast',
    (ab) => {
      ab.buffMoveMult = Math.max(ab.buffMoveMult ?? 1, 1.3);
      mul(ab, 'cooldown', 0.5);
      addN(ab, 'buffDamageMult', 0.15);
    },
  ),
  gk(
    'bard',
    'a2',
    'ba_gk_a2_a',
    'Song of Rebirth',
    '🎶',
    'Healing Word pours for +75 HP across the whole arena',
    (ab) => {
      addN(ab, 'damage', 75);
      addN(ab, 'range', 200);
    },
  ),
  gk(
    'bard',
    'a2',
    'ba_gk_a2_b',
    'Rapid Refrain',
    '✨',
    'Healing Word mends +28 and recharges twice as fast',
    (ab) => {
      addN(ab, 'damage', 28);
      mul(ab, 'cooldown', 0.5);
    },
  ),
  gk(
    'bard',
    'a3',
    'ba_gk_a3_a',
    'Thunderous Crescendo',
    '⚡',
    'Dissonant Whispers swells +60u, hits +18, and rips foes to 30% speed',
    (ab) => {
      addN(ab, 'radius', 60);
      addN(ab, 'damage', 18);
      setMin(ab, 'slowMult', 0.3);
      addN(ab, 'slowDuration', 1);
    },
  ),
  gk(
    'bard',
    'a3',
    'ba_gk_a3_b',
    'Maddening Dirge',
    '🎻',
    'Dissonant Whispers hits +12, freezes 0.7s, widens +20u, and recharges 40% faster',
    (ab) => {
      addN(ab, 'damage', 12);
      addN(ab, 'freeze', 0.7);
      addN(ab, 'radius', 20);
      mul(ab, 'cooldown', 0.6);
    },
  ),

  // --- Monk -----------------------------------------------------------------
  gk(
    'monk',
    'basic',
    'mo_gk_basic_a',
    'Hundred Hands',
    '👊',
    'Flurry of Blows strikes twice as fast (−50% cd) for +5 and drinks 15% as health',
    (ab) => {
      mul(ab, 'cooldown', 0.5);
      addN(ab, 'damage', 5);
      addN(ab, 'lifestealFrac', 0.15);
    },
  ),
  gk(
    'monk',
    'basic',
    'mo_gk_basic_b',
    'Whirling Fists',
    '🌀',
    'Flurry of Blows sweeps a full 360° circle for +8, +25u reach',
    (ab) => {
      ab.halfAngleDeg = 180;
      addN(ab, 'damage', 8);
      addN(ab, 'range', 25);
    },
  ),
  gk(
    'monk',
    'a1',
    'mo_gk_a1_a',
    'Paralyzing Blow',
    '💫',
    'Stunning Strike locks foes for +1.4s and hits for +25',
    (ab) => {
      addN(ab, 'stun', 1.4);
      addN(ab, 'damage', 25);
    },
  ),
  gk(
    'monk',
    'a1',
    'mo_gk_a1_b',
    'Palm of Ruin',
    '👊',
    'Stunning Strike widens to an 80° arc, hits +18, +15u, +0.5s stun',
    (ab) => {
      addN(ab, 'halfAngleDeg', 44);
      addN(ab, 'damage', 18);
      addN(ab, 'range', 15);
      addN(ab, 'stun', 0.5);
    },
  ),
  gk(
    'monk',
    'a2',
    'mo_gk_a2_a',
    'Gale Walker',
    '🍃',
    'Step of the Wind travels +130u, mends +40, and resets 50% faster',
    (ab) => {
      addN(ab, 'range', 130);
      addN(ab, 'healOnUse', 40);
      mul(ab, 'cooldown', 0.5);
    },
  ),
  gk(
    'monk',
    'a2',
    'mo_gk_a2_b',
    'Comet Step',
    '💫',
    'Step of the Wind slams on landing for 34 across a 130u blast (+70u travel)',
    (ab) => {
      ab.landingDamage = (ab.landingDamage ?? 0) + 34;
      ab.radius = (ab.radius ?? 0) + 130;
      addN(ab, 'range', 70);
    },
  ),
  gk(
    'monk',
    'a3',
    'mo_gk_a3_a',
    'Death Touch',
    '💀',
    'Quivering Palm devastates for +40 across +55u',
    (ab) => {
      addN(ab, 'damage', 40);
      addN(ab, 'radius', 55);
    },
  ),
  gk(
    'monk',
    'a3',
    'mo_gk_a3_b',
    'Quaking Palm',
    '💥',
    'Quivering Palm hits +18, stuns 1s, widens +20u, and recharges 40% faster',
    (ab) => {
      addN(ab, 'damage', 18);
      addN(ab, 'stun', 1);
      addN(ab, 'radius', 20);
      mul(ab, 'cooldown', 0.6);
    },
  ),

  // --- Sorcerer -------------------------------------------------------------
  gk(
    'sorcerer',
    'basic',
    'so_gk_basic_a',
    'Chaos Storm',
    '🎲',
    'Chaos Bolt hurls 5 bolts across a wide fan (+5 each)',
    (ab) => {
      addN(ab, 'projCount', 3);
      addN(ab, 'spreadDeg', 18);
      addN(ab, 'damage', 5);
    },
  ),
  gk(
    'sorcerer',
    'basic',
    'so_gk_basic_b',
    'Chaos Lance',
    '💠',
    'Chaos Bolt screams out +20 harder and +300 faster, freezing for 0.4s',
    (ab) => {
      addN(ab, 'damage', 20);
      addN(ab, 'projSpeed', 300);
      addN(ab, 'maxRange', 200);
      addN(ab, 'freeze', 0.4);
    },
  ),
  gk(
    'sorcerer',
    'a1',
    'so_gk_a1_a',
    'Extinction',
    '☄️',
    'Meteor falls for +65 across a cataclysmic +80u blast',
    (ab) => {
      addN(ab, 'damage', 65);
      addN(ab, 'impactRadius', 80);
    },
  ),
  gk(
    'sorcerer',
    'a1',
    'so_gk_a1_b',
    'Meteor Shower',
    '💥',
    'Meteor snaps down instantly (−75% cast), recharges twice as fast, +22 damage',
    (ab) => {
      mul(ab, 'castTime', 0.25);
      mul(ab, 'cooldown', 0.5);
      addN(ab, 'damage', 22);
    },
  ),
  gk(
    'sorcerer',
    'a2',
    'so_gk_a2_a',
    'Legion of Mirrors',
    '🪞',
    'Mirror Image blocks 76%, grants +35% move, and holds 4s longer',
    (ab) => {
      mul(ab, 'buffDefMult', 0.4);
      ab.buffMoveMult = Math.max(ab.buffMoveMult ?? 1, 1.35);
      addN(ab, 'buffDuration', 4);
    },
  ),
  gk(
    'sorcerer',
    'a2',
    'so_gk_a2_b',
    'Blurred Form',
    '💨',
    'Mirror Image is up far more often (−45% cd), deepens to ~35% taken, +30% move',
    (ab) => {
      mul(ab, 'buffDefMult', 0.58);
      mul(ab, 'cooldown', 0.55);
      ab.buffMoveMult = Math.max(ab.buffMoveMult ?? 1, 1.3);
      addN(ab, 'buffDuration', 2);
    },
  ),
  gk(
    'sorcerer',
    'a3',
    'so_gk_a3_a',
    'Warp',
    '🌀',
    'Arcane Leap jumps +150u, phases +0.4s, and recharges 60% faster',
    (ab) => {
      addN(ab, 'range', 150);
      addN(ab, 'iframes', 0.4);
      mul(ab, 'cooldown', 0.4);
    },
  ),
  gk(
    'sorcerer',
    'a3',
    'so_gk_a3_b',
    'Phase Shift',
    '✨',
    'Arcane Leap mends +50 on use, phases +0.5s, and reaches +80u',
    (ab) => {
      addN(ab, 'healOnUse', 50);
      addN(ab, 'iframes', 0.5);
      addN(ab, 'range', 80);
    },
  ),

  // --- Warlock --------------------------------------------------------------
  gk(
    'warlock',
    'basic',
    'wa_gk_basic_a',
    'Eldritch Barrage',
    '💥',
    'Eldritch Blast forks into 3 soul-bolts (+8 each), draining 30% total',
    (ab) => {
      addN(ab, 'projCount', 2);
      ab.spreadDeg = Math.max(ab.spreadDeg ?? 0, 14);
      addN(ab, 'damage', 8);
      addN(ab, 'lifestealFrac', 0.15);
    },
  ),
  gk(
    'warlock',
    'basic',
    'wa_gk_basic_b',
    'Soul Ruin',
    '💀',
    'Eldritch Blast hits for +24, +300 speed, and drinks 40% as health',
    (ab) => {
      addN(ab, 'damage', 24);
      addN(ab, 'projSpeed', 300);
      addN(ab, 'lifestealFrac', 0.25);
    },
  ),
  gk(
    'warlock',
    'a1',
    'wa_gk_a1_a',
    'Word of Ruin',
    '☠️',
    'Hex festers for +22/tick across +65u for +4s',
    (ab) => {
      addN(ab, 'zoneTickDamage', 22);
      addN(ab, 'radius', 65);
      addN(ab, 'zoneDuration', 4);
    },
  ),
  gk(
    'warlock',
    'a1',
    'wa_gk_a1_b',
    'Crippling Curse',
    '🕸️',
    'Hex locks foes to 35% speed and festers +12/tick over +55u',
    (ab) => {
      setMin(ab, 'slowMult', 0.35);
      ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1.5);
      addN(ab, 'zoneTickDamage', 12);
      addN(ab, 'radius', 55);
    },
  ),
  gk(
    'warlock',
    'a2',
    'wa_gk_a2_a',
    'Infernal Cataclysm',
    '🔥',
    'Hellish Rebuke erupts for +40 across +55u, drinking 35% total',
    (ab) => {
      addN(ab, 'damage', 40);
      addN(ab, 'radius', 55);
      addN(ab, 'lifestealFrac', 0.15);
    },
  ),
  gk(
    'warlock',
    'a2',
    'wa_gk_a2_b',
    'Searing Retort',
    '💥',
    'Hellish Rebuke hits +18, freezes 0.7s, widens +20u, and recharges 40% faster',
    (ab) => {
      addN(ab, 'damage', 18);
      addN(ab, 'freeze', 0.7);
      addN(ab, 'radius', 20);
      mul(ab, 'cooldown', 0.6);
    },
  ),
  gk(
    'warlock',
    'a3',
    'wa_gk_a3_a',
    'Fiendish Ascension',
    '😈',
    "Dark One's Blessing swells to +50% damage, +25% move, and lasts 5s longer",
    (ab) => {
      addN(ab, 'buffDamageMult', 0.5);
      ab.buffMoveMult = Math.max(ab.buffMoveMult ?? 1, 1.25);
      addN(ab, 'buffDuration', 5);
    },
  ),
  gk(
    'warlock',
    'a3',
    'wa_gk_a3_b',
    'Eternal Pact',
    '🕯️',
    "Dark One's Blessing is nearly always up (−45% cd), +30% damage, 30% mitigation",
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      addN(ab, 'buffDamageMult', 0.3);
      setMin(ab, 'buffDefMult', 0.7);
      addN(ab, 'buffDuration', 2);
    },
  ),
];

// ---------------------------------------------------------------------------
// SUBCLASS grands (item 17) — two capstones for each of the 24 subclasses, each
// transforming the hero's BOUND sub1/sub2 skills of that subclass. A subclass
// grand can't know which two of the four skills a hero picked, so its `apply`
// tunes each bound sub-ability adaptively (`amplify` scales whatever magnitude/
// area/buff the skill carries; riders add lifesteal/control/slow only where the
// skill's kind honours them). Applied host-side after the sub skills bind (see
// applySubclassGrands + world.rebindActiveSubs), never through the base replay.
// ---------------------------------------------------------------------------

/** True for a hit-landing ability that can carry a lifesteal / stun / freeze rider. */
function isStrike(ab: PlayerAbilityDef): boolean {
  return ab.kind === 'meleeCone' || ab.kind === 'pbaoe' || ab.kind === 'projectile';
}

/** Scale one numeric field by `frac` (rounded), leaving an absent field absent. */
function scaleField(ab: PlayerAbilityDef, k: keyof PlayerAbilityDef, frac: number): void {
  const v = ab[k] as number | undefined;
  if (v) (ab[k] as number) = Math.round(v * (1 + frac));
}

/**
 * Adaptively enlarge a subclass skill — the "make it huge" lever a subclass grand
 * pulls regardless of the skill's kind. `mag` scales its magnitude (damage, heal,
 * zone ticks, landing/on-use heal) and deepens its buffs; `size` scales its
 * footprint (radius, blast, melee reach) and — for a dash/blink — its leap and
 * i-frames, so even a magnitude-less mobility skill transforms measurably.
 */
function amplify(ab: PlayerAbilityDef, mag: number, size: number): void {
  scaleField(ab, 'damage', mag);
  scaleField(ab, 'landingDamage', mag);
  scaleField(ab, 'zoneTickDamage', mag);
  scaleField(ab, 'zoneTickHeal', mag);
  scaleField(ab, 'healOnUse', mag);
  scaleField(ab, 'radius', size);
  scaleField(ab, 'impactRadius', size);
  if (ab.kind === 'meleeCone') scaleField(ab, 'range', size);
  if (ab.kind === 'dash' || ab.kind === 'blink') {
    scaleField(ab, 'range', Math.max(size, mag * 0.5));
    ab.iframes = Math.round(((ab.iframes ?? 0) + 0.15) * 100) / 100;
  }
  if (ab.buffDamageMult)
    ab.buffDamageMult = Math.round((ab.buffDamageMult + mag * 0.6) * 100) / 100;
  if (ab.buffMoveMult) ab.buffMoveMult = Math.round((ab.buffMoveMult + mag * 0.4) * 100) / 100;
  if (ab.buffDefMult) ab.buffDefMult = Math.round(ab.buffDefMult * (1 - mag * 0.4) * 100) / 100;
}

/** Lifesteal rider — only on a damage-dealing strike (heals/buffs/zones can't drink). */
function lifeRider(ab: PlayerAbilityDef, frac: number): void {
  if (isStrike(ab) && ab.damage > 0) addN(ab, 'lifestealFrac', frac);
}
/** Control rider — a stun on a melee/pbaoe strike, a freeze on a projectile (the
 *  only riders the sim applies for each; projectiles never stun). */
function ctrlRider(ab: PlayerAbilityDef, secs: number): void {
  if (ab.kind === 'meleeCone' || ab.kind === 'pbaoe') addN(ab, 'stun', secs);
  else if (ab.kind === 'projectile') addN(ab, 'freeze', secs);
}
/** Slow rider — chills whatever the skill can slow (a struck foe, or a hazard zone). */
function slowRider(ab: PlayerAbilityDef, mult: number, dur: number): void {
  if ((ab.damage ?? 0) > 0 || (ab.zoneTickDamage ?? 0) > 0) {
    setMin(ab, 'slowMult', mult);
    ab.slowDuration = Math.max(ab.slowDuration ?? 0, dur);
  }
}

/** Subclass-grand builder — a grand tied to a subclass (forces grand + maxStacks
 *  1). Its `apply` tunes each bound sub-ability of that subclass (ctx.subAbilities,
 *  filled only by applySubclassGrands); a harmless no-op anywhere else. */
function gs(
  subclassId: string,
  id: string,
  name: string,
  icon: string,
  desc: string,
  tune: (ab: PlayerAbilityDef) => void,
): CharUpgradeDef {
  const classId = getSubclass(subclassId)!.classId;
  return {
    id,
    classId,
    subclassId,
    name,
    icon,
    desc,
    grand: true,
    maxStacks: 1,
    apply: ({ subAbilities }) => {
      if (!subAbilities) return;
      for (const slot of SUB_SLOTS) {
        const ab = subAbilities[slot];
        if (ab) tune(ab);
      }
    },
  };
}

export const SUBCLASS_GRANDS: CharUpgradeDef[] = [
  // Knight
  gs(
    'kn_champion',
    'kn_champion_g_a',
    'Unbroken Champion',
    '⚔️',
    'Your Champion skills strike 50% harder across a wider field and drink 25% as health',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      lifeRider(ab, 0.25);
    },
  ),
  gs(
    'kn_champion',
    'kn_champion_g_b',
    "Warlord's Tempo",
    '🥁',
    'Your Champion skills recharge 40% faster, hit 30% harder, and stun on impact',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
      ctrlRider(ab, 0.6);
    },
  ),
  gs(
    'kn_battlemaster',
    'kn_battlemaster_g_a',
    'Grand Tactician',
    '🎖️',
    "Your Battlemaster skills hit 50% harder, spread wider, and shatter foes' footing to 45%",
    (ab) => {
      amplify(ab, 0.5, 0.3);
      slowRider(ab, 0.45, 1.5);
    },
  ),
  gs(
    'kn_battlemaster',
    'kn_battlemaster_g_b',
    'Perfect Maneuver',
    '⚙️',
    'Your Battlemaster skills recharge 40% faster, hit 30% harder, and stun on impact',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
      ctrlRider(ab, 0.7);
    },
  ),

  // Ranger
  gs(
    'rg_hunter',
    'rg_hunter_g_a',
    'Apex Predator',
    '🎯',
    'Your Hunter skills hit 50% harder over a wider area and pin the quarry (0.7s)',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      ctrlRider(ab, 0.7);
    },
  ),
  gs(
    'rg_hunter',
    'rg_hunter_g_b',
    'Relentless Hunt',
    '🐾',
    'Your Hunter skills recharge 40% faster, hit 30% harder, and cripple prey to 50%',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
      slowRider(ab, 0.5, 1.5);
    },
  ),
  gs(
    'rg_beastmaster',
    'rg_beastmaster_g_a',
    "Alpha's Fury",
    '🐺',
    'Your Beast Master skills maul 50% harder over a wider area and drink 25% as health',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      lifeRider(ab, 0.25);
    },
  ),
  gs(
    'rg_beastmaster',
    'rg_beastmaster_g_b',
    'Pack Tactics',
    '🐾',
    'Your Beast Master skills recharge 40% faster, hit 30% harder, and hamstring foes to 50%',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
      slowRider(ab, 0.5, 1.5);
    },
  ),

  // Mage
  gs(
    'mg_evoker',
    'mg_evoker_g_a',
    'Arch-Evoker',
    '🔥',
    'Your Evoker skills detonate 60% harder across a vast area, freezing/stunning struck foes',
    (ab) => {
      amplify(ab, 0.6, 0.35);
      ctrlRider(ab, 0.6);
    },
  ),
  gs(
    'mg_evoker',
    'mg_evoker_g_b',
    'Overchannel',
    '⚡',
    'Your Evoker skills recharge 45% faster and hit 30% harder',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.3, 0.15);
    },
  ),
  gs(
    'mg_abjurer',
    'mg_abjurer_g_a',
    'Grand Warding',
    '🛡️',
    'Your Abjurer skills swell 50%, their wards deepen, and their snares lock to 30%',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      slowRider(ab, 0.3, 1.5);
    },
  ),
  gs(
    'mg_abjurer',
    'mg_abjurer_g_b',
    'Ceaseless Ward',
    '♾️',
    'Your Abjurer skills recharge 45% faster and their wards/blasts grow 30%',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.3, 0.15);
    },
  ),

  // Cleric
  gs(
    'cl_light',
    'cl_light_g_a',
    'Dawnbreaker',
    '☀️',
    'Your Light skills blaze 55% brighter over a wider area, dazing/freezing foes',
    (ab) => {
      amplify(ab, 0.55, 0.3);
      ctrlRider(ab, 0.6);
    },
  ),
  gs(
    'cl_light',
    'cl_light_g_b',
    'Endless Radiance',
    '🌟',
    'Your Light skills recharge 45% faster and burn 30% brighter',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.3, 0.15);
    },
  ),
  gs(
    'cl_life',
    'cl_life_g_a',
    'Font of Life',
    '💚',
    'Your Life skills heal and shield 60% more across a wider field',
    (ab) => {
      amplify(ab, 0.6, 0.3);
    },
  ),
  gs(
    'cl_life',
    'cl_life_g_b',
    'Ceaseless Mending',
    '✨',
    'Your Life skills recharge 45% faster and mend 35% more',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.35, 0.15);
    },
  ),

  // Barbarian
  gs(
    'bb_berserker',
    'bb_berserker_g_a',
    'Avatar of Fury',
    '😤',
    'Your Berserker skills hit 55% harder over a wider area and drink 30% as health',
    (ab) => {
      amplify(ab, 0.55, 0.3);
      lifeRider(ab, 0.3);
    },
  ),
  gs(
    'bb_berserker',
    'bb_berserker_g_b',
    'Blood Frenzy',
    '🩸',
    'Your Berserker skills recharge 40% faster, hit 30% harder, and leech 20%',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
      lifeRider(ab, 0.2);
    },
  ),
  gs(
    'bb_totem',
    'bb_totem_g_a',
    'Great Spirit',
    '🐻',
    'Your Totem skills swell 50%, deepen their wards, and root foes to 45%',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      slowRider(ab, 0.45, 1.5);
    },
  ),
  gs(
    'bb_totem',
    'bb_totem_g_b',
    'Ancestral Might',
    '🌍',
    'Your Totem skills recharge 40% faster and grow 35% stronger',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.35, 0.15);
    },
  ),

  // Rogue
  gs(
    'ro_assassin',
    'ro_assassin_g_a',
    'Death Incarnate',
    '💀',
    'Your Assassin skills devastate for 55% more over a wider area and drink 30% as health',
    (ab) => {
      amplify(ab, 0.55, 0.3);
      lifeRider(ab, 0.3);
    },
  ),
  gs(
    'ro_assassin',
    'ro_assassin_g_b',
    'One with Shadow',
    '🌑',
    'Your Assassin skills recharge 40% faster, hit 30% harder, and daze on strike',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
      ctrlRider(ab, 0.6);
    },
  ),
  gs(
    'ro_trickster',
    'ro_trickster_g_a',
    "Archmage's Cunning",
    '✨',
    'Your Trickster skills hit 50% harder over a wider area and ensnare foes to 40%',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      slowRider(ab, 0.4, 1.5);
      ctrlRider(ab, 0.5);
    },
  ),
  gs(
    'ro_trickster',
    'ro_trickster_g_b',
    'Sleight of Time',
    '⏳',
    'Your Trickster skills recharge 45% faster and grow 30%',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.3, 0.15);
    },
  ),

  // Paladin
  gs(
    'pa_devotion',
    'pa_devotion_g_a',
    'Avatar of Devotion',
    '🌟',
    'Your Devotion skills strike 50% harder over a wider area and heal 20% of the damage',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      lifeRider(ab, 0.2);
    },
  ),
  gs(
    'pa_devotion',
    'pa_devotion_g_b',
    'Unyielding Faith',
    '🛡️',
    'Your Devotion skills recharge 40% faster and their blessings/blows grow 30%',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
    },
  ),
  gs(
    'pa_vengeance',
    'pa_vengeance_g_a',
    'Avenging Wrath',
    '🔥',
    'Your Vengeance skills hit 55% harder over a wider area and stun the wicked',
    (ab) => {
      amplify(ab, 0.55, 0.3);
      ctrlRider(ab, 0.7);
    },
  ),
  gs(
    'pa_vengeance',
    'pa_vengeance_g_b',
    'Relentless Vengeance',
    '⚡',
    'Your Vengeance skills recharge 40% faster, hit 30% harder, and leech 20%',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
      lifeRider(ab, 0.2);
    },
  ),

  // Druid
  gs(
    'dr_moon',
    'dr_moon_g_a',
    'Primal Avatar',
    '🐾',
    'Your Moon skills maul 55% harder over a wider area and drink 25% as health',
    (ab) => {
      amplify(ab, 0.55, 0.3);
      lifeRider(ab, 0.25);
    },
  ),
  gs(
    'dr_moon',
    'dr_moon_g_b',
    'Feral Swiftness',
    '🐆',
    'Your Moon skills recharge 40% faster, hit 30% harder, and stagger on strike',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
      ctrlRider(ab, 0.5);
    },
  ),
  gs(
    'dr_land',
    'dr_land_g_a',
    'Wrath of the Land',
    '🌋',
    'Your Land skills erupt 55% harder across a vast area and root foes to 40%',
    (ab) => {
      amplify(ab, 0.55, 0.35);
      slowRider(ab, 0.4, 1.5);
    },
  ),
  gs(
    'dr_land',
    'dr_land_g_b',
    'Eternal Season',
    '🍃',
    'Your Land skills recharge 45% faster and their zones/blasts grow 30%',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.3, 0.15);
    },
  ),

  // Bard
  gs(
    'ba_valor',
    'ba_valor_g_a',
    "Hero's Ballad",
    '🎺',
    'Your Valor skills hit 50% harder over a wider area and empower the band far more',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      lifeRider(ab, 0.15);
    },
  ),
  gs(
    'ba_valor',
    'ba_valor_g_b',
    'Battle Rhapsody',
    '🥁',
    'Your Valor skills recharge 45% faster and grow 30%',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.3, 0.15);
    },
  ),
  gs(
    'ba_whispers',
    'ba_whispers_g_a',
    'Voice of Madness',
    '😱',
    'Your Whispers skills hit 50% harder over a wider area and terrify foes to 35%',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      slowRider(ab, 0.35, 1.5);
      ctrlRider(ab, 0.5);
    },
  ),
  gs(
    'ba_whispers',
    'ba_whispers_g_b',
    'Unheard Dirge',
    '🌫️',
    'Your Whispers skills recharge 45% faster and grow 30%',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.3, 0.15);
    },
  ),

  // Monk
  gs(
    'mo_openhand',
    'mo_openhand_g_a',
    'Perfect Harmony',
    '👊',
    'Your Open Hand skills strike 50% harder over a wider area and stun with each blow',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      ctrlRider(ab, 0.7);
    },
  ),
  gs(
    'mo_openhand',
    'mo_openhand_g_b',
    'Flowing Water',
    '🌊',
    'Your Open Hand skills recharge 45% faster, hit 30% harder, and mend you',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.3, 0.15);
      lifeRider(ab, 0.15);
    },
  ),
  gs(
    'mo_shadow',
    'mo_shadow_g_a',
    'Shadow Incarnate',
    '🌑',
    'Your Shadow skills strike 55% harder from the dark over a wider area and leech 20%',
    (ab) => {
      amplify(ab, 0.55, 0.3);
      lifeRider(ab, 0.2);
    },
  ),
  gs(
    'mo_shadow',
    'mo_shadow_g_b',
    'Silent Death',
    '🥷',
    'Your Shadow skills recharge 40% faster, hit 30% harder, and daze on strike',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
      ctrlRider(ab, 0.6);
    },
  ),

  // Sorcerer
  gs(
    'so_draconic',
    'so_draconic_g_a',
    'True Dragon',
    '🐉',
    'Your Draconic skills erupt 55% harder across a vast area, freezing/stunning struck foes',
    (ab) => {
      amplify(ab, 0.55, 0.35);
      ctrlRider(ab, 0.6);
    },
  ),
  gs(
    'so_draconic',
    'so_draconic_g_b',
    "Dragon's Cadence",
    '🪽',
    'Your Draconic skills recharge 45% faster and grow 30%',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.3, 0.15);
    },
  ),
  gs(
    'so_wild',
    'so_wild_g_a',
    'Unbound Chaos',
    '🎲',
    'Your Wild Magic skills surge 60% harder across a chaotic, wide area',
    (ab) => {
      amplify(ab, 0.6, 0.35);
    },
  ),
  gs(
    'so_wild',
    'so_wild_g_b',
    'Cascading Surge',
    '🌀',
    'Your Wild Magic skills recharge 45% faster, hit 35% harder, and freeze/stun foes',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.35, 0.15);
      ctrlRider(ab, 0.5);
    },
  ),

  // Warlock
  gs(
    'wa_fiend',
    'wa_fiend_g_a',
    'Hellfire Ascendant',
    '🔥',
    'Your Fiend skills scorch 55% harder over a wider area and drink 25% as health',
    (ab) => {
      amplify(ab, 0.55, 0.3);
      lifeRider(ab, 0.25);
    },
  ),
  gs(
    'wa_fiend',
    'wa_fiend_g_b',
    'Infernal Pact',
    '😈',
    'Your Fiend skills recharge 40% faster, hit 30% harder, and leech 20%',
    (ab) => {
      mul(ab, 'cooldown', 0.6);
      amplify(ab, 0.3, 0.15);
      lifeRider(ab, 0.2);
    },
  ),
  gs(
    'wa_great_old_one',
    'wa_great_old_one_g_a',
    'Elder Mind',
    '🐙',
    'Your Great Old One skills hit 50% harder over a wider area and madden foes to 35%',
    (ab) => {
      amplify(ab, 0.5, 0.3);
      slowRider(ab, 0.35, 1.5);
      ctrlRider(ab, 0.5);
    },
  ),
  gs(
    'wa_great_old_one',
    'wa_great_old_one_g_b',
    'Whispered Doom',
    '🔮',
    'Your Great Old One skills recharge 45% faster and grow 30%',
    (ab) => {
      mul(ab, 'cooldown', 0.55);
      amplify(ab, 0.3, 0.15);
    },
  ),
];

// ---------------------------------------------------------------------------
// Per-subclass-SKILL upgrades (item 6) — a normal (non-grand, cap-5) boon for each
// of the subclass skills, generated from the subclass catalogue. Each hones ONE
// specific sub skill (harder, wider, quicker) and only enters the between-boss pool
// once the hero has EQUIPPED that skill (rollCharChoices gates on the passed-in
// subSkills). Applied — like the subclass grands — to the hero's bound sub-abilities
// via `applySubSkillUpgrades`, so it is a harmless no-op in the base-ability replay.
// ---------------------------------------------------------------------------

/** Modest, kind-adaptive tune for a per-stack sub-skill boon (stacks compound). */
function subSkillTune(ab: PlayerAbilityDef): void {
  amplify(ab, 0.12, 0.08); // +12% magnitude, +8% footprint
  mul(ab, 'cooldown', 0.92); // -8% cooldown
}

/** Per-subclass-skill upgrade builder — tied to one sub skill id (non-grand, cap 5). */
function us(subSkillId: string, classId: ClassId, name: string, icon: string): CharUpgradeDef {
  return {
    id: `subup_${subSkillId}`,
    classId,
    subSkillId,
    name: `Honed ${name}`,
    icon,
    desc: `Hone ${name} — it strikes harder, reaches wider and recharges faster (stacks to ${MAX_SKILL_STACKS}).`,
    apply: ({ subAbilities }) => {
      if (!subAbilities) return;
      for (const slot of SUB_SLOTS) {
        const ab = subAbilities[slot];
        if (ab) subSkillTune(ab);
      }
    },
  };
}

export const SUB_SKILL_UPGRADES: CharUpgradeDef[] = ALL_SUBCLASSES.flatMap((sub) =>
  sub.skills.map((sk) => us(sk.id, sub.classId, sk.name, sk.icon)),
);

// ---------------------------------------------------------------------------
// GRAFT grands (item 18) — two radical capstones for each skill-replacing hybrid
// graft (a graft with a `replaces` slot: Pyromancer's Pact, Shadow Pact,
// Berserker's Howl, Field Medic). Where a class capstone owns a native skill, a
// graft grand owns the FOREIGN skill a hero bolted on — so it is class-agnostic and
// surfaces only while that graft is actually held (occupancy in offerableGrands).
// Unlike the subclass grands, the grafted skill lives in a real ability slot, so a
// graft grand needs no `subAbilities` plumbing — it just tunes the slot's occupant
// through the standard `abilities` path. To keep it welded to the graft (and never
// bleed onto a native skill reclaimed into the slot), the replay routes it onto the
// graft's own def, exactly like a `graftup` (see replayCharUpgrades). Each pulls
// only levers the sim honours for that skill's kind: a Fireball bomb freezes/enlarges
// (projectile), a blink gains i-frames/reach/heal, a self-buff deepens its buffs, a
// heal pours harder or faster.
// ---------------------------------------------------------------------------

/** Graft-grand builder — a grand welded to a skill-replacing graft (forces grand +
 *  maxStacks 1, classId 'any'). `tune` mutates whatever grafted skill sits in the
 *  slot that graft replaced; the replay hands it that skill via the standard path. */
function gg(
  graftId: string,
  id: string,
  name: string,
  icon: string,
  desc: string,
  tune: (ab: PlayerAbilityDef) => void,
): CharUpgradeDef {
  const slot = HYBRID.find((h) => h.id === graftId)!.replaces!;
  return {
    id,
    classId: 'any',
    graftId,
    name,
    icon,
    desc,
    grand: true,
    maxStacks: 1,
    apply: ({ abilities }) => tune(abilities[slot]),
  };
}

export const GRAFT_GRANDS: CharUpgradeDef[] = [
  // Pyromancer's Pact — grafts the Mage's Fireball (a 0.7s-charged 70-dmg bomb).
  gg(
    'hy_pyromancer',
    'hy_pyromancer_g_a',
    'Living Cataclysm',
    '🌋',
    'Your grafted Fireball becomes an apocalypse — +60 damage across a colossal blast (+80 radius)',
    (ab) => {
      addN(ab, 'damage', 60);
      addN(ab, 'impactRadius', 80);
    },
  ),
  gg(
    'hy_pyromancer',
    'hy_pyromancer_g_b',
    'Chain Ignition',
    '🔥',
    'Your grafted Fireball snaps out near-instantly (−65% charge), recharges twice as fast, and freezes what it engulfs (0.9s)',
    (ab) => {
      mul(ab, 'castTime', 0.35);
      mul(ab, 'cooldown', 0.5);
      addN(ab, 'freeze', 0.9);
    },
  ),

  // Shadow Pact — grafts the Rogue's Shadowstep (a 240u blink with 0.3s i-frames).
  gg(
    'hy_shadowpact',
    'hy_shadowpact_g_a',
    'Ceaseless Shadow',
    '🌑',
    'Your grafted Shadowstep resets in a blink (−65% cooldown) and phases you far longer (+0.5s i-frames)',
    (ab) => {
      mul(ab, 'cooldown', 0.35);
      addN(ab, 'iframes', 0.5);
    },
  ),
  gg(
    'hy_shadowpact',
    'hy_shadowpact_g_b',
    'Umbral Reservoir',
    '🩸',
    'Your grafted Shadowstep hurls you +160u and drinks the dark, mending 45 on use (+0.25s i-frames)',
    (ab) => {
      addN(ab, 'range', 160);
      addN(ab, 'healOnUse', 45);
      addN(ab, 'iframes', 0.25);
    },
  ),

  // Berserker's Howl — grafts the Barbarian's Rage (+35% dmg / +20% move self-buff).
  gg(
    'hy_warhowl',
    'hy_warhowl_g_a',
    'Avatar of Wrath',
    '😤',
    'Your grafted Rage erupts to +70% damage and +35% move speed, lasting 5s longer',
    (ab) => {
      addN(ab, 'buffDamageMult', 0.35);
      addN(ab, 'buffMoveMult', 0.15);
      addN(ab, 'buffDuration', 5);
    },
  ),
  gg(
    'hy_warhowl',
    'hy_warhowl_g_b',
    'Undying Fury',
    '🛡️',
    'Your grafted Rage now steels you too (−45% damage taken while raging), recharges 35% faster, and lasts 4s longer',
    (ab) => {
      setMin(ab, 'buffDefMult', 0.55);
      mul(ab, 'cooldown', 0.65);
      addN(ab, 'buffDuration', 4);
    },
  ),

  // Field Medic — grafts a field-dressed Heal (a weakened 45-HP mend, 5s cooldown).
  gg(
    'hy_fieldmedic',
    'hy_fieldmedic_g_a',
    'Battlefield Surgeon',
    '🏥',
    'Your grafted Field Dressing becomes a true mend — +75 healing at far greater reach (+150u)',
    (ab) => {
      addN(ab, 'damage', 75);
      addN(ab, 'range', 150);
    },
  ),
  gg(
    'hy_fieldmedic',
    'hy_fieldmedic_g_b',
    'Combat Medic',
    '⚡',
    'Your grafted Field Dressing patches wounds in a heartbeat (−55% cooldown) and pours +45 more',
    (ab) => {
      mul(ab, 'cooldown', 0.45);
      addN(ab, 'damage', 45);
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

/**
 * Every grand grouped by class — the class capstones (GRAND_BY_CLASS) plus the
 * base-skill and subclass grands (item 17). Consumed by `offerableGrands` to
 * assemble the run-clear special-reward offer with the right accessibility gates.
 */
const GRAND_ALL_BY_CLASS: Record<ClassId, CharUpgradeDef[]> = [
  ...GRAND,
  ...SKILL_GRANDS,
  ...SUBCLASS_GRANDS,
].reduce(
  (acc, d) => {
    (acc[d.classId as ClassId] ??= []).push(d);
    return acc;
  },
  {} as Record<ClassId, CharUpgradeDef[]>,
);

/** Flat lookup by id (across every class + the hybrid pool + all grand kinds). */
export const CHAR_UPGRADES: Record<string, CharUpgradeDef> = Object.fromEntries(
  [
    ...Object.values(CHAR_UPGRADES_BY_CLASS).flat(),
    ...HYBRID,
    ...GRAND,
    ...SKILL_GRANDS,
    ...SUBCLASS_GRANDS,
    ...GRAFT_GRANDS,
    ...SUB_SKILL_UPGRADES, // item 6: resolvable by id, but NOT in the always-on class pool
  ].map((d) => [d.id, d]),
);

/**
 * How many GRAND capstones a hero holds (item 5 progression gate). Counts real
 * catalog grands of every kind — class, skill, subclass and graft — since
 * CHAR_UPGRADES flattens them all; synthetic ids (`restore:`/`graftup:`) resolve
 * to no def and never count.
 */
export function grandCount(charUpgradeIds: readonly string[] | undefined): number {
  if (!charUpgradeIds) return 0;
  let n = 0;
  for (const id of charUpgradeIds) if (CHAR_UPGRADES[id]?.grand) n++;
  return n;
}

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

/** A throwaway hero stub with a fresh cloned ability table (preview / occupancy).
 *  Resolves the class through `getClass`, so every preview (HUD, reward cards,
 *  balance estimator, multiclass tables) follows the active run's rolled kit. */
function stubPlayer(classId: ClassId): Player {
  const cls = getClass(classId);
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
    if (def.graftId) {
      // A GRAFT grand (item 18): accrue onto the grafted skill's OWN def — live in
      // its slot or stashed after a reclaim — via the same all-slot proxy a graftup
      // uses, so it can never bleed onto a native skill that reclaimed the slot. A
      // no-op until the graft is installed (its key is in the registry).
      const target = registry.get(def.graftId);
      if (target)
        def.apply({ player, abilities: { basic: target, a1: target, a2: target, a3: target } });
      continue;
    }
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
 * Apply a hero's owned SUBCLASS grands (item 17) to their bound sub-abilities.
 * Called AFTER the sub skills are bound (world.rebindActiveSubs — so it re-runs on
 * every spawn and every class swap). Each subclass grand is handed only the bound
 * sub-abilities whose skill belongs to its subclass, so a grand for a subclass the
 * hero isn't currently wielding is a no-op. Sub-abilities are rebuilt fresh on each
 * rebind, so re-applying the ordered grand list is idempotent. Pure aside from the
 * in-place mutation of `player.subAbilities`.
 */
export function applySubclassGrands(player: Player, ids: readonly string[] | undefined): void {
  const subs = player.subAbilities;
  if (!ids || ids.length === 0 || !subs) return;
  // Which chosen sub-skill sits in each bound slot: the hero's ACTIVE-class skills,
  // in order (sub1, then sub2) — mirrors world.rebindActiveSubs' binding.
  const active = (player.subSkillIds ?? [])
    .filter((sid) => subclassOfSkill(sid)?.classId === player.classId)
    .slice(0, 2);
  const slotSubclass: Partial<Record<SubSlot, string>> = {};
  active.forEach((sid, i) => {
    const scId = subclassOfSkill(sid)?.id;
    if (scId) slotSubclass[i === 0 ? 'sub1' : 'sub2'] = scId;
  });
  for (const id of ids) {
    const def = CHAR_UPGRADES[id];
    if (!def?.subclassId || !upgradeAllowedFor(def, player.classId)) continue;
    // Hand the grand only the sub-abilities that belong to its subclass.
    const targeted: Partial<Record<SubSlot, PlayerAbilityDef>> = {};
    for (const slot of SUB_SLOTS) {
      if (subs[slot] && slotSubclass[slot] === def.subclassId) targeted[slot] = subs[slot];
    }
    if (targeted.sub1 || targeted.sub2) {
      def.apply({
        player,
        abilities: (player.abilities ?? {}) as Record<AbilitySlot, PlayerAbilityDef>,
        subAbilities: targeted,
      });
    }
  }
}

/**
 * Apply a hero's owned per-SUBCLASS-SKILL upgrades (item 6) to their bound
 * sub-abilities. Sibling of `applySubclassGrands` — called right after it on every
 * rebind (world.rebindActiveSubs) — but keyed by the EXACT sub skill in each bound
 * slot rather than by subclass, so a boon only tunes the one skill it hones. Each
 * occurrence in `ids` applies once (so a boon taken up to its cap stacks that many
 * times). Idempotent because sub-abilities are rebuilt fresh on each rebind. A no-op
 * for a skill the hero isn't currently wielding.
 */
export function applySubSkillUpgrades(player: Player, ids: readonly string[] | undefined): void {
  const subs = player.subAbilities;
  if (!ids || ids.length === 0 || !subs) return;
  // The exact sub-skill id in each bound slot (active-class skills, in order).
  const active = (player.subSkillIds ?? [])
    .filter((sid) => subclassOfSkill(sid)?.classId === player.classId)
    .slice(0, 2);
  const slotSkill: Partial<Record<SubSlot, string>> = {};
  active.forEach((sid, i) => {
    slotSkill[i === 0 ? 'sub1' : 'sub2'] = sid;
  });
  for (const id of ids) {
    const def = CHAR_UPGRADES[id];
    if (!def?.subSkillId || !upgradeAllowedFor(def, player.classId)) continue;
    // Hand the boon only the sub-ability whose skill id it hones.
    const targeted: Partial<Record<SubSlot, PlayerAbilityDef>> = {};
    for (const slot of SUB_SLOTS) {
      if (subs[slot] && slotSkill[slot] === def.subSkillId) targeted[slot] = subs[slot];
    }
    if (targeted.sub1 || targeted.sub2) {
      def.apply({
        player,
        abilities: (player.abilities ?? {}) as Record<AbilitySlot, PlayerAbilityDef>,
        subAbilities: targeted,
      });
    }
  }
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

/**
 * The grand improvements a hero of `classId` may be OFFERED at a run-clear, given
 * their owned character upgrades (grafts) + subclass skills (items 17, 18 & 19):
 *   • CLASS capstones — always (item 19 only gates them to owned classes, done by
 *     the caller iterating the hero's classes);
 *   • base-SKILL grands — only while that slot still holds its NATIVE skill, so a
 *     grafted-over slot never offers its lost skill's grand;
 *   • SUBCLASS grands — only for subclasses the hero has actually picked;
 *   • GRAFT grands (item 18) — only while the hero currently holds that graft (its
 *     id occupies the slot it replaced). These are class-agnostic, so the SAME graft
 *     grand can surface for more than one owned class; the caller dedupes by id.
 * A grand already held at its (1) cap drops out. Pure. See SpecialReward.tsx.
 */
export function offerableGrands(
  classId: ClassId,
  ownedChar: readonly string[],
  ownedSubSkills: readonly string[],
): CharUpgradeDef[] {
  if (!CLASSES[classId]) return [];
  const occupant = occupancyAfter(classId, ownedChar);
  const pickedSubclasses = new Set(
    ownedSubSkills.map((s) => subclassOfSkill(s)?.id).filter((x): x is string => x != null),
  );
  const out: CharUpgradeDef[] = [];
  for (const d of GRAND_ALL_BY_CLASS[classId] ?? []) {
    if (charUpgradeAtMax(d.id, ownedChar)) continue;
    // A base-skill grand whose native slot has been grafted over is dead (item 19).
    if (d.skillSlot && occupant[d.skillSlot] !== d.skillSlot) continue;
    // A subclass grand only surfaces once the hero holds a skill of that subclass.
    if (d.subclassId && !pickedSubclasses.has(d.subclassId)) continue;
    out.push(d);
  }
  // Graft grands (item 18): offered only while the graft is live in the kit — its id
  // sits in an occupied slot. An excluded or reclaimed graft leaves no such slot, so
  // its grand stays hidden; a per-class occupancy replay keeps that honest.
  const held = new Set<SkillKey>(Object.values(occupant));
  for (const d of GRAFT_GRANDS) {
    if (charUpgradeAtMax(d.id, ownedChar)) continue;
    if (!held.has(d.graftId!)) continue;
    out.push(d);
  }
  return out;
}

/**
 * Resolved before→after readout for a PLAYER-STAT boon (item 6): the boons that
 * tug maxHp / move / damage / mitigation / regen rather than an ability slot, and
 * so never produce a "Now →" ability line. Diffs the hero's resolved stats with vs
 * without the pick and lists each CHANGED stat's RESULTING absolute — so the card
 * shows the value you'll have, not just the prose delta. '' when nothing moved.
 */
function describeStatReadout(classId: ClassId, ownedChar: readonly string[], id: string): string {
  const before = previewPlayerStats(classId, [], [...ownedChar]);
  const after = previewPlayerStats(classId, [], [...ownedChar, id]);
  const parts: string[] = [];
  const whole = (v: number): string => `${Math.round(v)}`;
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  if (after.maxHp !== before.maxHp) parts.push(`${whole(after.maxHp)} max HP`);
  if (after.moveSpeed !== before.moveSpeed) parts.push(`${whole(after.moveSpeed)} move`);
  if (after.damageMult !== before.damageMult) parts.push(`${pct(after.damageMult)} dmg`);
  if (after.damageTakenMult !== before.damageTakenMult) {
    parts.push(`${pct(after.damageTakenMult)} dmg taken`);
  }
  if (after.cooldownMult !== before.cooldownMult) parts.push(`${pct(after.cooldownMult)} cooldowns`);
  if (after.castMult !== before.castMult) parts.push(`${pct(after.castMult)} cast time`);
  if (after.regenPerSec !== before.regenPerSec) {
    parts.push(`${Math.round(after.regenPerSec * 10) / 10}/s regen`);
  }
  // (terrainResist is only tugged by GENERIC boons like Surefooted, never a class
  // upgrade, so it never moves here — and those have their own reward-card path.)
  return parts.join(' · ');
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
    const nativeName = getClass(classId).abilities[restoreSlot].name;
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
    const slotPreview = SLOTS.filter((s) => JSON.stringify(current[s]) !== JSON.stringify(after[s]))
      .map((s) => `${after[s].name}: ${describeAbility(after[s])}`)
      .join(' · ');
    // A player-stat boon (Thick Hide, War Priest, Second Wind…) touches no slot, so
    // also resolve its stat readout (item 6) — cards show the resulting values, not
    // just the prose delta. A boon that moves both a slot and a stat shows both.
    const statPreview = describeStatReadout(classId, ownedChar, id);
    const preview = [slotPreview, statPreview].filter(Boolean).join(' · ');
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
  subSkills: readonly string[] = [],
): string[] {
  const out: string[] = [];
  const extras = extraClasses.filter((c) => c !== classId);
  // Slot occupancy after the hero's owned upgrades — drives the item-26 filter that
  // drops boons which only upgrade a skill that's been grafted over. All-native for a
  // graft-less hero, so it never filters anything for the common case.
  const occupant = CLASSES[classId] ? occupancyAfter(classId, owned) : null;
  const liveBoon = (id: string): boolean => !occupant || boonUpgradesLiveSkill(occupant, id);
  // item 6: per-subclass-skill upgrades enter the pool ONLY for sub skills the hero
  // has equipped (and for the active class). Empty for a hero with no sub skills, so
  // the common case is untouched.
  const subEligible = SUB_SKILL_UPGRADES.filter(
    (u) =>
      u.subSkillId != null &&
      subSkills.includes(u.subSkillId) &&
      upgradeAllowedFor(u, classId) &&
      !charUpgradeAtMax(u.id, owned),
  ).map((u) => u.id);
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
    // item 6: equipped-sub-skill boons weight with the main class.
    for (const id of subEligible) weighted.push({ id, w: MAIN_CLASS_WEIGHT });
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
    const pool = [...(CHAR_UPGRADES_BY_CLASS[classId] ?? []).map((d) => d.id), ...subEligible] // item 6
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
  // Graceful degradation (items 12 & 14): if the normal class pool couldn't supply
  // n picks — every common boon already owned at its cap, or a run deep into Endless
  // — top the offer up from the remaining RESTORE (reclaim / graftup) and RARE
  // (cross-class hybrid, incl. skill-REPLACE grafts) candidates. This guarantees the
  // class-boon relic is never left blank while ANY eligible upgrade still exists, and
  // keeps skill-replace / restore offers surfacing even once the ordinary pool is
  // exhausted. Restore/reoffer candidates come first so a hero with a displaced skill
  // always sees the reclaim (item 14). Deterministic (draws no rng), so the carefully
  // seeded reward stream is unchanged for the common case where `out` already holds n.
  // Gated on a recognised class so an unknown class still yields nothing (a hybrid is
  // technically "allowed" for any non-excluded class, which must not resurrect offers
  // for a class that has no kit at all).
  if (CLASSES[classId] && out.length < n) {
    for (const id of reoffers) {
      if (out.length >= n) break;
      if (!out.includes(id)) out.push(id);
    }
    for (const h of eligible) {
      if (out.length >= n) break;
      if (!out.includes(h.id)) out.push(h.id);
    }
  }
  return out;
}
