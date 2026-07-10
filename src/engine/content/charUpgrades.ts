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
import { CLASSES, cloneAbilities } from './classes';

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
    'Shield Wall mitigates far more and lasts longer',
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
    'Shield Bash stuns much longer and hits harder',
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
    'Cleave reaches wider and cuts deeper',
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
    'Taunt now also shields you, and comes up faster',
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
    'Steadily regenerate health while you hold the line',
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
    'Arrows fly faster and hit harder',
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
    'Your shots chill whatever they strike, slowing it',
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
    'Multishot looses two extra arrows in a wider fan',
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
    'Rain of Arrows bites harder and lingers',
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
    'Roll travels farther, dodges longer, and refreshes faster',
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
    'Frost Nova now freezes enemies solid for a moment',
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
    'Fireball takes far less time to charge and recharges faster',
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
    'Fireball erupts in a wider, deadlier blast',
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
    'Arcane Bolt hits harder and fires more often',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', 6);
      mul(a.basic, 'cooldown', 0.82);
    },
  ),
  u(
    'mage',
    'mg_blink',
    'Flicker',
    '🌀',
    'Blink jumps farther, comes up faster, and phases you briefly',
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
    'Heal restores much more, from farther away',
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
    'Blessing empowers and shields the ally far more, for longer',
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
    'Sanctuary mends more and covers more ground',
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
    'Smite hits harder and dazes what it strikes',
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
    'Toughen up: more health and swifter footwork',
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
    'Rage burns hotter, drives you faster, and returns sooner',
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
    'Your Swings and Whirlwind heal you for a cut of the damage',
    ({ abilities: a }) => {
      for (const ab of [a.basic, a.a3]) addN(ab, 'lifestealFrac', 0.15);
    },
  ),
  u(
    'barbarian',
    'bb_seismic',
    'Seismic Leap',
    '💥',
    'Leap slams down for heavy area damage on landing',
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
    'Swings and Whirlwind hit harder over a wider arc',
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
    'Shrug off blows: more health, less damage taken',
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
    'Backstab lands for devastating burst, far more often',
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
    'Poison Vial spreads farther and festers longer',
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
    'Shadowstep resets faster, phases longer, and patches you up',
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
    'Slash strikes noticeably faster and harder',
    ({ abilities: a }) => {
      mul(a.basic, 'cooldown', 0.78);
      addN(a.basic, 'damage', 5);
    },
  ),
  u(
    'rogue',
    'ro_envenom',
    'Envenomed Blades',
    '🐍',
    'Your melee strikes siphon life from foes',
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
    'Consecration scorches harder and mends more, for longer',
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
    'Divine Shield blocks far more, lasts longer, and returns faster',
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
    'Lay on Hands restores far more and recharges quicker',
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
    'Holy Strike smites harder, dazes foes, and heals you',
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
    'Move faster and bring every ability off cooldown sooner',
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
    'Entangle roots foes almost solid and gnaws harder',
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
    'Regrowth heals much more from farther away, faster',
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
    'Cyclone widens, bites harder, and slows more sharply',
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
    'Thornlash splits into a spread of extra thorns',
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
    'Grow hardier: more health and steady regeneration',
    ({ player: p }) => {
      p.maxHp = Math.round(p.maxHp * 1.12);
      p.hp = p.maxHp;
      p.regenPerSec += p.maxHp * 0.015;
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
      'REPLACES your A2 with the Mage’s Fireball — whoever you were before',
      ({ abilities: a }) => {
        graft(a, 'a2', 'mage', 'a1');
      },
    ),
    exclude: ['mage'], // already owns the real thing
  },
  {
    ...u(
      'any',
      'hy_shadowpact',
      'Shadow Pact',
      '🌑',
      'REPLACES your A3 with the Rogue’s Shadowstep blink',
      ({ abilities: a }) => {
        graft(a, 'a3', 'rogue', 'a2');
      },
    ),
    exclude: ['rogue', 'mage'], // both already carry a blink
  },
  {
    ...u(
      'any',
      'hy_warhowl',
      "Berserker's Howl",
      '📯',
      'REPLACES your A1 with the Barbarian’s Rage',
      ({ abilities: a }) => {
        graft(a, 'a1', 'barbarian', 'a1');
      },
    ),
    exclude: ['barbarian'],
  },
  {
    ...u(
      'any',
      'hy_fieldmedic',
      'Field Medic',
      '🩹',
      'REPLACES your A2 with a field-dressed Heal (weaker than a Cleric’s)',
      ({ abilities: a }) => {
        graft(a, 'a2', 'cleric', 'a1', (ab) => {
          ab.damage = Math.round(ab.damage * 0.75);
          ab.cooldown = ab.cooldown + 2;
          ab.name = 'Field Dressing';
        });
      },
    ),
    // Real healers would be trading their actual heal away for a worse one.
    exclude: ['cleric', 'paladin', 'druid'],
  },
  u(
    'any',
    'hy_vampiric',
    'Vampiric Style',
    '🧛',
    'Your strikes and shots feed you (10% lifesteal) — but pale flesh: -10% max HP',
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
  u(
    'any',
    'hy_frostbrand',
    'Frostbrand Style',
    '❄️',
    'Everything you land chills the target, slowing it',
    ({ abilities: a }) => {
      for (const ab of [a.basic, a.a1, a.a2, a.a3]) {
        if (ab.damage > 0 && ab.kind !== 'heal') {
          ab.slowMult = Math.min(ab.slowMult ?? 1, 0.72);
          ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1.4);
        }
      }
    },
  ),
  u(
    'any',
    'hy_stormsplit',
    'Stormsplit',
    '⚡',
    'Your basic attack forks: an extra projectile, or a wider heavier swing',
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
  u(
    'any',
    'hy_juggernaut',
    'Juggernaut Style',
    '🐘',
    'Become a mountain: +25% max HP and -8% damage taken, but slower on your feet',
    ({ player: p }) => {
      p.maxHp = Math.round(p.maxHp * 1.25);
      p.hp = p.maxHp;
      p.damageTakenMult *= 0.92;
      p.moveSpeed *= 0.93;
    },
  ),
  u(
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
];

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
};

/** The class-agnostic hybrid pool (cross-class powers + combat styles). */
export const HYBRID_UPGRADES: CharUpgradeDef[] = HYBRID;

/** Flat lookup by id (across every class + the hybrid pool). */
export const CHAR_UPGRADES: Record<string, CharUpgradeDef> = Object.fromEntries(
  [...Object.values(CHAR_UPGRADES_BY_CLASS).flat(), ...HYBRID].map((d) => [d.id, d]),
);

/** Type guard for an untrusted (networked) character-upgrade id. */
export function isCharUpgradeId(x: unknown): x is string {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(CHAR_UPGRADES, x);
}

/**
 * Apply an ordered list of character upgrades to a hero's cloned ability table
 * (and, for the stat-flavoured ones, the hero directly). Unknown / mismatched-
 * class ids are skipped. Call after `applyUpgrades` at spawn.
 */
export function applyCharUpgrades(player: Player, ids: string[] | undefined): void {
  if (!ids || !player.abilities) return;
  for (const id of ids) {
    const def = CHAR_UPGRADES[id];
    if (def && upgradeAllowedFor(def, player.classId)) {
      def.apply({ player, abilities: player.abilities });
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
  const cls = CLASSES[classId];
  const abilities = cloneAbilities(cls.abilities);
  const stub = {
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
    abilities,
  } as unknown as Player;
  for (const id of ids) {
    const def = CHAR_UPGRADES[id];
    if (def && upgradeAllowedFor(def, classId)) {
      def.apply({ player: stub, abilities });
    }
  }
  return abilities;
}

/** Chance one class offer is swapped for a wild cross-class hybrid pick. */
export const HYBRID_OFFER_CHANCE = 0.45;

/**
 * Roll `n` distinct character-upgrade offers from a class's pool. `rnd` returns a
 * float in [0,1). Pure aside from the injected randomness (mirrors upgrades.ts).
 * With `HYBRID_OFFER_CHANCE`, one offer is swapped for a random HYBRID pick —
 * a cross-class power or combat style the class never had.
 */
export function rollCharChoices(classId: ClassId, n: number, rnd: () => number): string[] {
  const pool = [...(CHAR_UPGRADES_BY_CLASS[classId] ?? [])].map((d) => d.id);
  const out: string[] = [];
  const count = Math.min(n, pool.length);
  while (out.length < count) {
    const i = Math.floor(rnd() * pool.length) % pool.length;
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  const eligible = HYBRID.filter((h) => upgradeAllowedFor(h, classId));
  if (out.length > 0 && eligible.length > 0 && rnd() < HYBRID_OFFER_CHANCE) {
    const hy = eligible[Math.floor(rnd() * eligible.length) % eligible.length];
    out[out.length - 1] = hy.id;
  }
  return out;
}
