import { boundedAbility, ordinaryRecharge } from './abilityLimits';
import { scaleAbsorption } from '../combat/absorption';
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
import { getSubclass, getSubSkill, subclassOfSkill, ALL_SUBCLASSES } from './subclasses';
import { applyUpgrades, type UpgradeId } from './upgrades';
import { refreshComponents, forgeName, forgeVariant } from './forge';
import { Rng, mixSeed } from '../core/math';
import { hashStr } from './procgen';
import {
  MAX_SKILL_STACKS,
  CRIT_CHANCE_BASE,
  CRIT_MULT_BASE,
  PROJECTILE_MAX_RANGE,
} from '../core/constants';

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
   * `hy_pyromancer`). Offered while the hero OWNS that graft and can wield it — it
   * persists through a reclaim (item 8), consistent with the graft itself staying
   * re-offerable — and its `apply` accrues onto the grafted skill itself — live in its
   * slot or stashed after a reclaim — never onto a native skill that has reclaimed the
   * slot. Class-agnostic (`classId: 'any'`). Set by `gg`.
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
/**
 * Extend a projectile's travel cap from its REAL default. An uncapped shot has no
 * `maxRange` field and falls back to PROJECTILE_MAX_RANGE at spawn, so a plain
 * `addN(ab,'maxRange',d)` would read the missing field as 0 and *slash* the cap to
 * `d` (a "+range" boon that collapses range — the Frostlance bug). Seed from the
 * default so a range boon actually lengthens the shot.
 */
const addRange = (ab: PlayerAbilityDef, d: number): void => {
  ab.maxRange = (ab.maxRange ?? PROJECTILE_MAX_RANGE) + d;
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
  return {
    id,
    classId,
    name,
    icon,
    desc,
    apply: (ctx) => {
      const abilities = new Set(Object.values(ctx.abilities));
      const before = new Map([...abilities].map((ab) => [ab, ab.cooldown]));
      const playerCd = ctx.player.cooldownMult;
      apply(ctx);
      if (ctx.player.cooldownMult < playerCd) {
        ctx.player.ordinaryCooldownBase ??= playerCd;
        ctx.player.cooldownMult = Math.max(
          ctx.player.cooldownMult,
          ctx.player.ordinaryCooldownBase * 0.8,
        );
      }
      for (const ab of abilities) {
        const old = before.get(ab)!;
        if (ab.cooldown < old) {
          const factor = ab.cooldown / old;
          ab.cooldown = old;
          ordinaryRecharge(ab, factor);
        }
      }
    },
  };
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
  const copy: PlayerAbilityDef = { ...src, slot, rechargeBase: src.cooldown };
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
    'Shield Wall gains one frontal damage block (cap 4) and 1.5s duration; its counter window also grows by 1.5s',
    ({ abilities: a }) => {
      if (a.a2.frontGuard)
        a.a2.frontGuard = {
          charges: Math.min(4, a.a2.frontGuard.charges + 1),
          duration: Math.min(8, a.a2.frontGuard.duration + 1.5),
        };
      else mul(a.a2, 'cooldown', 0.9); // A forged replacement without directional guard gets real tempo.
      if (a.a2.guardWindow) a.a2.guardWindow += 1.5;
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
    'Taunt shields you for 30% less damage, adds 0.6s duration per pick and gains up to 20% total ordinary recharge reduction',
    ({ abilities: a }) => {
      mul(a.a1, 'cooldown', 0.8);
      setMin(a.a1, 'buffDefMult', 0.7);
      addN(a.a1, 'buffDuration', 0.6);
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
    'Roll travels 270u (+50), dodges for 0.45s (+0.15), while retaining deliberate recharge',
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
    'Fireball charges in 0.42s (−40%)',
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
    'Fireball gains 22 damage, 35u blast radius, and +2% damage against controlled foes',
    ({ abilities: a }) => {
      addN(a.a1, 'impactRadius', 35);
      addN(a.a1, 'damage', 22);
      addN(a.a1, 'controlDamageBonus', 0.02);
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
    'Blink jumps 320u (+70) and phases you for 0.45s',
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
    'Heal restores 138 HP (+38) from 450u (+50); critical rescue bonus gains +5%',
    ({ abilities: a }) => {
      addN(a.a1, 'damage', 38);
      addN(a.a1, 'range', 50);
      if (a.a1.rescueHealBonus) a.a1.rescueHealBonus += 0.05;
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
    'Rage gains +15% damage, +10% movement speed, and 8% faster recharge',
    ({ abilities: a }) => {
      addN(a.a1, 'buffDamageMult', 0.15);
      addN(a.a1, 'buffMoveMult', 0.1);
      mul(a.a1, 'cooldown', 0.92);
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
    'Leap gains +24 landing damage, +30u blast radius and 8% faster recharge',
    ({ abilities: a }) => {
      addN(a.a2, 'landingDamage', 24);
      addN(a.a2, 'radius', 30);
      mul(a.a2, 'cooldown', 0.92);
    },
  ),
  u(
    'barbarian',
    'bb_brutal',
    'Brutal',
    '🪓',
    'Reckless Swing gains +6 damage and +10u reach; Whirlwind gains +9 damage and +15u radius',
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
    'Backstab gains +24 damage, up to 20% total ordinary recharge reduction and +0.1× critical damage per pick; a prepared positive hit refunds 1s of running Shadowstep; if recovery protects it, gain 15% movement for 2s instead, once per cast and 4s',
    ({ abilities: a }) => {
      addN(a.a1, 'damage', 24);
      addN(a.a1, 'critMultBonus', 0.1);
      mul(a.a1, 'cooldown', 0.78);
      a.a1.preparedRefund = 1;
    },
  ),
  u(
    'rogue',
    'ro_poison',
    'Deadly Poison',
    '☠️',
    'Vial gains +7 tick magnitude, +1.5s and +18u; keep full ground damage and add 2s poison on effective exit, up to 3 foes; strongest owner poison wins',
    ({ abilities: a }) => {
      a.a3.zonePoison ??= { share: 0, onExit: true };
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
    'Shadowstep phases longer, heals 22 and extends preparation by 0.4s; its deliberate recharge is retained',
    ({ abilities: a }) => {
      mul(a.a2, 'cooldown', 0.7);
      addN(a.a2, 'iframes', 0.2);
      addN(a.a2, 'healOnUse', 22);
      addN(a.a2, 'prepareCrit', 0.4);
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
    'Divine Shield immunity lasts 0.25s longer (cap 2s), returns 15% sooner; its aura lasts 1s longer and reaches 20u farther',
    ({ abilities: a }) => {
      if (a.a3.iframes) a.a3.iframes = Math.min(2, a.a3.iframes + 0.25);
      mul(a.a3, 'cooldown', 0.85);
      if (a.a3.paladinAura)
        a.a3.paladinAura = {
          ...a.a3.paladinAura,
          radius: a.a3.paladinAura.radius + 20,
          duration: a.a3.paladinAura.duration + 1,
        };
      if (a.a3.allyWard)
        a.a3.allyWard = {
          ...a.a3.allyWard,
          duration: a.a3.allyWard.duration + 1,
          range: a.a3.allyWard.range + 20,
        };
    },
  ),
  u(
    'paladin',
    'pa_mercy',
    'Merciful Hands',
    '💛',
    'Lay on Hands restores 122 HP (+32)',
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
    '+8% move speed per pick and up to 20% total class-wide cooldown reduction',
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
    'Regrowth heals 81 HP (+26) from 430u (+50); recovery grove heals 1 more per tick',
    ({ abilities: a }) => {
      addN(a.a2, 'damage', 26);
      addN(a.a2, 'range', 50);
      mul(a.a2, 'cooldown', 0.85);
      if (a.a2.recoveryZone)
        a.a2.recoveryZone = { ...a.a2.recoveryZone, tickHeal: a.a2.recoveryZone.tickHeal + 1 };
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
    'Healing Word restores 74 HP (+24)',
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
    'Step of the Wind gains +50u travel, +20 healing and 0.5s Flow preparation, with 8% faster recharge',
    ({ abilities: a }) => {
      mul(a.a2, 'cooldown', 0.92);
      addN(a.a2, 'range', 50);
      addN(a.a2, 'healOnUse', 20);
      if (a.a2.prepareFlow) a.a2.prepareFlow += 0.5;
    },
  ),
  u(
    'monk',
    'mo_palm',
    'Quivering Palm',
    '🌀',
    'Quivering Palm gains +25u radius, +10 damage and 0.6s stun',
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
    'Chaos Bolt fires 3 bolts (+1) and each hits for 16 (+4)',
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
    'Mirror Image gains one image (cap 5), lasts 2s longer (cap 9s), returns 15% sooner, and extends surge readiness by 0.4s',
    ({ abilities: a }) => {
      if (a.a2.mirrorImages)
        a.a2.mirrorImages = {
          count: Math.min(5, a.a2.mirrorImages.count + 1),
          duration: Math.min(9, a.a2.mirrorImages.duration + 2),
        };
      addN(a.a2, 'buffDuration', 2);
      addN(a.a2, 'prepareSurge', 0.4);
      mul(a.a2, 'cooldown', 0.85);
    },
  ),
  u(
    'sorcerer',
    'so_leap',
    'Distant Leap',
    '🌀',
    'Arcane Phase blinks 330u (+70) and phases you for 0.45s',
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
    '+8% move speed per pick and up to 20% total class-wide cooldown reduction',
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
    'Hex gains +6/tick magnitude, +1.5s, +12u and +1% owner curse damage; slow, hindrance and curse linger 2s at first pick, +0.5s thereafter up to 4s',
    ({ abilities: a }) => {
      addN(a.a1, 'zoneTickDamage', 6);
      addN(a.a1, 'curseBonus', 0.01);
      addN(a.a1, 'zoneDuration', 1.5);
      addN(a.a1, 'radius', 12);
      a.a1.slowDuration = Math.min(4, Math.max(1.5, a.a1.slowDuration ?? 0) + 0.5);
    },
  ),
  u(
    'warlock',
    'wa_rebuke',
    'Searing Rebuke',
    '🔥',
    'Rebuke gains +25u and +12 damage; its one 3s retort also releases at the next positive direct hit, basics included; incoming damage can consume it first',
    ({ abilities: a }) => {
      addN(a.a2, 'radius', 25);
      addN(a.a2, 'damage', 12);
      a.a2.rebukeDirect = true;
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
      'Graft the Mage’s Fireball: a 0.7s-charged bomb bursting for 80 in a 110-radius blast (7s cooldown)',
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
      'Graft a field-dressed Heal: restore 56 HP to a hurt ally within 400u (5s cooldown; weaker than a Cleric’s)',
      ({ abilities: a }) => {
        graft(a, 'a2', 'cleric', 'a1', (ab) => {
          ab.damage = Math.round(ab.damage * 0.5625);
          ab.cooldown = ab.cooldown + 1;
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
  // item 66: grafts donated by the expansion wave — the donor pool used to be
  // frozen at the four v1 classes (mage/rogue/barbarian/cleric). These add a
  // zone, a mobility escape and an ally-buff from bard/monk/warlock so a hero can
  // bolt on an archetype the roster gained after launch.
  {
    ...u(
      'any',
      'hy_hexbrand',
      'Warlock’s Hex',
      '🟣',
      'Graft the Warlock’s Hex: curse a 120-radius patch that ticks 12 poison and slows, for 5s (11s cooldown)',
      ({ abilities: a }) => {
        graft(a, 'a3', 'warlock', 'a1');
      },
    ),
    exclude: ['warlock', 'ranger', 'druid'], // already field a damaging zone
    replaces: 'a3',
    graftSource: { classId: 'warlock', slot: 'a1' },
    maxStacks: 1,
  },
  {
    ...u(
      'any',
      'hy_windstep',
      'Wind Step',
      '🌀',
      'Graft the Monk’s Step of the Wind: dash 250u with 0.3s of i-frames, mending 18 on use (5s cooldown)',
      ({ abilities: a }) => {
        graft(a, 'a3', 'monk', 'a2');
      },
    ),
    // Everyone who already owns an i-frame escape (dash/blink) gains nothing here.
    exclude: ['monk', 'rogue', 'ranger', 'barbarian', 'mage', 'sorcerer'],
    replaces: 'a3',
    graftSource: { classId: 'monk', slot: 'a2' },
    maxStacks: 1,
  },
  {
    ...u(
      'any',
      'hy_inspire',
      'Borrowed Anthem',
      '🎶',
      'Graft the Bard’s Inspiration: rally an ally within 420u to +20% damage and 15% less damage taken for 6s (12s cooldown)',
      ({ abilities: a }) => {
        graft(a, 'a1', 'bard', 'a1');
      },
    ),
    exclude: ['bard', 'cleric', 'paladin'], // already carry an ally-empowering tool
    replaces: 'a1',
    graftSource: { classId: 'bard', slot: 'a1' },
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

/** Retired pilot IDs remain readable in old histories, but resolve to one authored grand. */
export const PILOT_GRAND_ALIASES: Readonly<Record<string, string>> = {
  cl_grand_beacon: 'cl_gk_a1_a',
  cl_grand_avatar: 'cl_gk_a3_b',
  cl_gk_basic_a: 'cl_gk_basic_b',
  cl_gk_a1_b: 'cl_gk_a1_a',
  cl_gk_a2_a: 'cl_gk_a2_b',
  cl_gk_a3_a: 'cl_gk_a3_b',
  pa_grand_aegis: 'pa_gk_a3_a',
  pa_grand_dawn: 'pa_gk_basic_a',
  pa_gk_basic_b: 'pa_gk_basic_a',
  pa_gk_a1_a: 'pa_gk_a1_b',
  pa_gk_a2_b: 'pa_gk_a2_a',
  pa_gk_a3_b: 'pa_gk_a3_a',
  ba_grand_symphony: 'ba_gk_a1_b',
  ba_grand_ballad: 'ba_gk_basic_b',
  ba_gk_basic_a: 'ba_gk_basic_b',
  ba_gk_a1_a: 'ba_gk_a1_b',
  ba_gk_a2_b: 'ba_gk_a2_a',
  ba_gk_a3_b: 'ba_gk_a3_a',

  kn_grand_immovable: 'kn_gk_a2_a',
  kn_grand_wrath: 'kn_gk_basic_a',
  kn_gk_basic_b: 'kn_gk_basic_a',
  kn_gk_a1_b: 'kn_gk_a1_a',
  kn_gk_a2_b: 'kn_gk_a2_a',
  kn_gk_a3_a: 'kn_gk_a3_b',
  bb_grand_unstoppable: 'bb_gk_a1_a',
  bb_grand_reaver: 'bb_gk_a3_b',
  bb_gk_basic_a: 'bb_gk_basic_b',
  bb_gk_a1_b: 'bb_gk_a1_a',
  bb_gk_a2_a: 'bb_gk_a2_b',
  bb_gk_a3_a: 'bb_gk_a3_b',
  mo_grand_ascend: 'mo_gk_a2_a',
  mo_grand_thousand: 'mo_gk_a3_a',
  mo_gk_basic_a: 'mo_gk_basic_b',
  mo_gk_a1_b: 'mo_gk_a1_a',
  mo_gk_a2_b: 'mo_gk_a2_a',
  mo_gk_a3_b: 'mo_gk_a3_a',

  rg_grand_deadeye: 'rg_gk_basic_b',
  rg_grand_storm: 'rg_gk_a1_b',
  rg_gk_basic_a: 'rg_gk_basic_b',
  rg_gk_a1_a: 'rg_gk_a1_b',
  rg_gk_a2_a: 'rg_gk_a2_b',
  rg_gk_a3_a: 'rg_gk_a3_b',
  dr_grand_wild: 'dr_gk_basic_b',
  dr_grand_grove: 'dr_gk_a1_b',
  dr_gk_basic_a: 'dr_gk_basic_b',
  dr_gk_a1_a: 'dr_gk_a1_b',
  dr_gk_a2_b: 'dr_gk_a2_a',
  dr_gk_a3_b: 'dr_gk_a3_a',

  mg_grand_archmage: 'mg_gk_basic_a',
  mg_grand_cataclysm: 'mg_gk_a1_a',
  mg_gk_basic_b: 'mg_gk_basic_a',
  mg_gk_a1_b: 'mg_gk_a1_a',
  mg_gk_a2_a: 'mg_gk_a2_b',
  mg_gk_a3_a: 'mg_gk_a3_b',
  so_grand_wild: 'so_gk_basic_b',
  so_grand_cataclysm: 'so_gk_a1_a',
  so_gk_basic_a: 'so_gk_basic_b',
  so_gk_a1_b: 'so_gk_a1_a',
  so_gk_a2_b: 'so_gk_a2_a',
  so_gk_a3_a: 'so_gk_a3_b',

  ro_grand_shadow: 'ro_gk_a1_a',
  ro_gk_basic_a: 'ro_gk_basic_b',
  ro_gk_a1_b: 'ro_gk_a1_a',
  ro_gk_a2_a: 'ro_gk_a2_b',
  ro_gk_a3_a: 'ro_grand_venom',
  ro_gk_a3_b: 'ro_grand_venom',
  wa_grand_ruin: 'wa_gk_a1_a',
  wa_gk_basic_a: 'wa_grand_pact',
  wa_gk_basic_b: 'wa_grand_pact',
  wa_gk_a1_b: 'wa_gk_a1_a',
  wa_gk_a2_b: 'wa_gk_a2_a',
  wa_gk_a3_a: 'wa_gk_a3_b',
};
export const canonicalGrandId = (id: string): string =>
  Object.hasOwn(PILOT_GRAND_ALIASES, id) ? PILOT_GRAND_ALIASES[id] : id;

const GRAND: CharUpgradeDef[] = [
  g(
    'rogue',
    'ro_grand_venom',
    'Grand Venom',
    '☠️',
    'Vial gains +22 tick magnitude, +65u, +4s and 50% slow; split 60% ground / 40% following poison, up to 3 foes, lingering 2s; strongest owner poison wins',
    ({ abilities: a }) => {
      a.a3.zonePoison = { share: 0.4, onExit: false };
      addN(a.a3, 'zoneTickDamage', 22);
      addN(a.a3, 'radius', 65);
      addN(a.a3, 'zoneDuration', 4);
      setMin(a.a3, 'slowMult', 0.5);
      a.a3.slowDuration = Math.max(a.a3.slowDuration ?? 0, 1.5);
    },
  ),

  g(
    'warlock',
    'wa_grand_pact',
    'Pact of the Fiend',
    '😈',
    'Eldritch Blast forks into two 18-damage bolts in a 12° fan with +12% lifesteal',
    ({ abilities: a }) => {
      addN(a.basic, 'damage', -4);
      addN(a.basic, 'projCount', 1);
      a.basic.spreadDeg = Math.max(a.basic.spreadDeg ?? 0, 12);
      addN(a.basic, 'lifestealFrac', 0.12);
    },
  ),
];

// ---------------------------------------------------------------------------
// BASE-SKILL grands (item 17) — authored capstones for native base
// skills. Every class has one per skill. Each is a build-defining twist on that
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
    'Cleave sweeps a full circle with +12 damage and +20u reach',
    (ab) => {
      ab.halfAngleDeg = 180;
      addN(ab, 'damage', 12);
      addN(ab, 'range', 20);
    },
  ),

  gk(
    'knight',
    'a1',
    'kn_gk_a1_a',
    'Bulwark’s Call',
    '🛡️',
    'Taunt adds 30 absorption for 4s and challenges foes for 1s longer',
    (ab) => {
      ab.absorption = { amount: (ab.absorption?.amount ?? 0) + 30, duration: 4, target: 'self' };
      addN(ab, 'buffDuration', 1);
    },
  ),

  gk(
    'knight',
    'a2',
    'kn_gk_a2_a',
    'Aegis Eternal',
    '✨',
    'Shield Wall grants you and other allies within 180u 20% mitigation for 4s',
    (ab) => {
      ab.allyWard = { range: 180, mult: 0.8, duration: 4 };
      setMin(ab, 'buffDefMult', 0.8);
      ab.buffDuration = Math.max(ab.buffDuration ?? 0, 4);
    },
  ),

  gk(
    'knight',
    'a3',
    'kn_gk_a3_b',
    'Thunderclap',
    '⚡',
    'Shield Bash gathers foes with a 100u pull, an 80° half-arc, +20u reach and +15 damage',
    (ab) => {
      ab.halfAngleDeg = 80;
      ab.pull = 100;
      delete ab.knockback;
      addN(ab, 'range', 20);
      addN(ab, 'damage', 15);
    },
  ),

  // --- Ranger ---------------------------------------------------------------
  gk(
    'ranger',
    'basic',
    'rg_gk_basic_b',
    'Railshot',
    '🎯',
    'Arrow pierces three additional foes, gains +12 damage and +200 speed, and extends its travel cap by 220u',
    natureGrand('projectile', (ab) => {
      ab.pierce = Math.max(ab.pierce ?? 0, 3);
      addN(ab, 'damage', 12);
      addN(ab, 'projSpeed', 200);
      addRange(ab, 220);
    }),
  ),
  gk(
    'ranger',
    'a1',
    'rg_gk_a1_b',
    'Frostvolley',
    '❄️',
    'Multishot freezes struck foes for 0.6s and gains +8 damage per arrow',
    natureGrand('projectile', (ab) => {
      addN(ab, 'damage', 8);
      addN(ab, 'freeze', 0.6);
    }),
  ),
  gk(
    'ranger',
    'a2',
    'rg_gk_a2_b',
    'Pursuing Rain',
    '🌧️',
    'Rain of Arrows follows its first damaged foe for 3s, then anchors, and deals +8 per tick; overhead arrows still reach flyers',
    natureGrand('groundZone', (ab) => {
      if (ab.zoneTickDamage) {
        ab.zoneFollow = Math.max(ab.zoneFollow ?? 0, 3);
        addN(ab, 'zoneTickDamage', 8);
      } else amplify(ab, 0.25, 0.15);
    }),
  ),
  gk(
    'ranger',
    'a3',
    'rg_gk_a3_b',
    'Detonating Roll',
    '💥',
    'Roll lands with a 40-damage, 130u blast and travels 50u farther; landing near the quarry trades escape distance for pressure',
    natureGrand('dash', (ab) => {
      addN(ab, 'landingDamage', 40);
      ab.radius = Math.max(ab.radius ?? 0, 130);
      addN(ab, 'range', 50);
    }),
  ),

  // --- Mage -----------------------------------------------------------------
  gk(
    'mage',
    'basic',
    'mg_gk_basic_a',
    'Arcane Barrage',
    '✨',
    'Arcane Bolt splits into three lanes across a 14° fan and gains +5 damage per bolt',
    casterGrand('projectile', (ab) => {
      addN(ab, 'projCount', 2);
      ab.spreadDeg = Math.max(ab.spreadDeg ?? 0, 14);
      addN(ab, 'damage', 5);
    }),
  ),
  gk(
    'mage',
    'a1',
    'mg_gk_a1_a',
    'Supernova',
    '🌟',
    'Fireball gains +35 damage and +30u blast radius; struck foes have 40% longer wind-ups for 3s',
    casterGrand(
      'projectile',
      (ab) => {
        addN(ab, 'damage', 35);
        addN(ab, 'impactRadius', 30);
        casterSuppression(ab, 1.4);
      },
      ['impactRadius'],
    ),
  ),
  gk(
    'mage',
    'a2',
    'mg_gk_a2_b',
    'Polar Vortex',
    '🌨️',
    'Frost Nova pulls struck foes 140u inward and gains +20 damage; ordinary freeze still stops their actions',
    casterGrand('pbaoe', (ab) => {
      delete ab.knockback;
      ab.pull = Math.max(ab.pull ?? 0, 140);
      addN(ab, 'damage', 20);
    }),
  ),
  gk(
    'mage',
    'a3',
    'mg_gk_a3_b',
    'Displacement Ward',
    '🛡️',
    'Blink heals you for 45, grants 3s hard-control resistance and reaches 50u farther',
    casterGrand('blink', (ab) => {
      addN(ab, 'healOnUse', 45);
      ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 3);
      addN(ab, 'range', 50);
    }),
  ),

  // --- Cleric ---------------------------------------------------------------
  gk(
    'cleric',
    'basic',
    'cl_gk_basic_b',
    'Judgment',
    '☀️',
    'Smite gains +18 damage, +250 speed and pierces one foe',
    casterGrand(
      'projectile',
      (ab) => {
        addN(ab, 'damage', 18);
        addN(ab, 'projSpeed', 250);
        addN(ab, 'pierce', 1);
      },
      [],
      true,
    ),
  ),
  gk(
    'cleric',
    'a1',
    'cl_gk_a1_a',
    'Miracle',
    '💚',
    'Heal cleanses movement ailments and restores +45 HP from +100u',
    casterGrand(
      'heal',
      (ab) => {
        ab.cleanseOnHeal = true;
        addN(ab, 'damage', 45);
        addN(ab, 'range', 100);
      },
      ['rescueHealBonus'],
    ),
  ),
  gk(
    'cleric',
    'a2',
    'cl_gk_a2_b',
    'Consecrated Bastion',
    '🛡️',
    'Sanctuary damages grounded enemies for 12/tick, slows them 35%, and heals +6/tick',
    casterGrand(
      'groundZone',
      (ab) => {
        addN(ab, 'zoneTickDamage', 12);
        setMin(ab, 'slowMult', 0.65);
        ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1);
        addN(ab, 'zoneTickHeal', 6);
      },
      ['zoneTickHeal'],
    ),
  ),
  gk(
    'cleric',
    'a3',
    'cl_gk_a3_b',
    'Zealotry',
    '⚡',
    'Blessing lifts its recipient into flight for 3s and grants +15% damage',
    casterGrand(
      'buffAlly',
      (ab) => {
        ab.grantsFlight = Math.max(ab.grantsFlight ?? 0, 3);
        addN(ab, 'buffDamageMult', 0.15);
      },
      ['buffDamageMult'],
    ),
  ),

  // --- Barbarian ------------------------------------------------------------

  gk(
    'barbarian',
    'basic',
    'bb_gk_basic_b',
    'Cleaving Fury',
    '🪓',
    'Reckless Swing widens to a 90° half-arc with +16 damage and +15u reach',
    (ab) => {
      ab.halfAngleDeg = 90;
      addN(ab, 'damage', 16);
      addN(ab, 'range', 15);
    },
  ),
  gk(
    'barbarian',
    'a1',
    'bb_gk_a1_a',
    'Undying Rage',
    '😤',
    'Rage drains 2% max HP/s and leeches 20% of effective direct damage for 6s; damage, speed and Momentum windows last 1s longer',
    (ab) => {
      ab.bloodRage = Math.max(ab.bloodRage ?? 0, 6);
      addN(ab, 'buffDuration', 1);
      if (ab.momentumWindow) addN(ab, 'momentumWindow', 1);
    },
  ),

  gk(
    'barbarian',
    'a2',
    'bb_gk_a2_b',
    'Thunderous Leap',
    '⚡',
    'Leap lands for +20 damage and pushes struck foes back at least 120u',
    (ab) => {
      addN(ab, 'landingDamage', 20);
      ab.knockback = Math.max(ab.knockback ?? 0, 120);
      delete ab.pull;
    },
  ),

  gk(
    'barbarian',
    'a3',
    'bb_gk_a3_b',
    'Cyclonic Fury',
    '🌪️',
    'Whirlwind pulls foes 110u inward with +18 damage and +20u radius; still spends Momentum',
    (ab) => {
      ab.pull = 110;
      delete ab.knockback;
      addN(ab, 'damage', 18);
      addN(ab, 'radius', 20);
    },
  ),

  // --- Rogue ----------------------------------------------------------------
  gk(
    'rogue',
    'basic',
    'ro_gk_basic_b',
    'Whirling Blades',
    '🌀',
    'Slash sweeps a full 360° circle: +3 damage, +25u reach',
    (ab) => {
      ab.halfAngleDeg = 180;
      addN(ab, 'damage', 3);
      addN(ab, 'range', 25);
    },
  ),
  gk(
    'rogue',
    'a1',
    'ro_gk_a1_a',
    'Assassinate',
    '🗡️',
    'Backstab gains +45 damage, +15% crit chance and heals you 15% of damage dealt',
    (ab) => {
      addN(ab, 'damage', 45);
      addN(ab, 'critChanceBonus', 0.15);
      addN(ab, 'lifestealFrac', 0.15);
    },
  ),
  gk(
    'rogue',
    'a2',
    'ro_gk_a2_b',
    'Death from Shadow',
    '🥷',
    'Shadowstep leaps +80u, phases +0.25s, heals 25 and holds precision 1s longer',
    (ab) => {
      addN(ab, 'range', 80);
      addN(ab, 'iframes', 0.25);
      addN(ab, 'healOnUse', 25);
      addN(ab, 'prepareCrit', 1);
    },
  ),
  // --- Paladin --------------------------------------------------------------
  gk(
    'paladin',
    'basic',
    'pa_gk_basic_a',
    'Radiant Riposte',
    '🌟',
    'A connecting Holy Strike readies a +30% melee counter and a 0.35s parry; +12 damage',
    casterGrand('meleeCone', (ab) => {
      ab.parryOnHit = Math.max(ab.parryOnHit ?? 0, 0.35);
      addN(ab, 'damage', 12);
    }),
  ),
  gk(
    'paladin',
    'a1',
    'pa_gk_a1_b',
    'Pilgrim Ground',
    '🔥',
    'Consecration follows its first damaged ground foe for up to 6s and burns +4/tick',
    casterGrand(
      'groundZone',
      (ab) => {
        ab.zoneFollow = Math.max(ab.zoneFollow ?? 0, 6);
        addN(ab, 'zoneTickDamage', 4);
      },
      ['zoneTickDamage', 'zoneTickHeal'],
    ),
  ),
  gk(
    'paladin',
    'a2',
    'pa_gk_a2_a',
    'Blessed Hands',
    '💛',
    'Lay on Hands restores +35 HP; a low-health rescue readies the recipient’s next direct hit for +25% damage within 6s',
    casterGrand(
      'heal',
      (ab) => {
        addN(ab, 'damage', 35);
        ab.rescueStrike = { mult: Math.max(ab.rescueStrike?.mult ?? 1, 1.25), duration: 6 };
      },
      ['paladinAura'],
    ),
  ),
  gk(
    'paladin',
    'a3',
    'pa_gk_a3_a',
    'Unbreakable',
    '🛡️',
    'Divine Shield adds two frontal blocks for 4s and 3s hard-control resistance',
    casterGrand(
      'selfBuff',
      (ab) => {
        casterGuard(ab, 2, 4);
        ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 3);
      },
      ['iframes', 'paladinAura'],
    ),
  ),

  // --- Druid ----------------------------------------------------------------
  gk(
    'druid',
    'basic',
    'dr_gk_basic_b',
    'Bramble Spear',
    '🌿',
    'Thornlash pierces two additional foes and deals +30% damage against already controlled targets; ordinary splitting adds more spears',
    natureGrand('projectile', (ab) => {
      ab.pierce = Math.max(ab.pierce ?? 0, 2);
      addN(ab, 'controlDamageBonus', 0.3);
    }),
  ),
  gk(
    'druid',
    'a1',
    'dr_gk_a1_b',
    'Ancient Grove',
    '🍃',
    'Allies standing inside Entangle take 15% less damage and move 20% faster',
    natureGrand('groundZone', (ab) => {
      ab.zoneAllyDefMult = Math.min(ab.zoneAllyDefMult ?? 1, 0.85);
      ab.zoneAllyMoveMult = Math.max(ab.zoneAllyMoveMult ?? 1, 1.2);
    }),
  ),
  gk(
    'druid',
    'a2',
    'dr_gk_a2_a',
    'Wild Bloom',
    '💚',
    'Regrowth grants its selected recipient 35 absorption for 4s, even at full health; protection scales with recipient max-HP growth',
    natureGrand('heal', (ab) => {
      ab.absorption = { amount: (ab.absorption?.amount ?? 0) + 35, duration: 4, target: 'weakest' };
    }),
  ),
  gk(
    'druid',
    'a3',
    'dr_gk_a3_a',
    'Tempest',
    '🌪️',
    'Cyclone pulls struck foes inward by 130u and gains +12 damage; use it to gather foes into your living territory',
    natureGrand('pbaoe', (ab) => {
      ab.pull = Math.max(ab.pull ?? 0, 130);
      delete ab.knockback;
      addN(ab, 'damage', 12);
    }),
  ),

  // --- Bard -----------------------------------------------------------------
  gk(
    'bard',
    'basic',
    'ba_gk_basic_b',
    'Soul-Rending Insult',
    '💔',
    'Vicious Mockery pierces two foes and gains +10 damage and +180 speed',
    casterGrand(
      'projectile',
      (ab) => {
        addN(ab, 'pierce', 2);
        addN(ab, 'damage', 10);
        addN(ab, 'projSpeed', 180);
      },
      [],
      true,
    ),
  ),
  gk(
    'bard',
    'a1',
    'ba_gk_a1_b',
    'Sheltering Cadence',
    '🥁',
    'Inspiration grants the lowest-health ally 45 absorption for 4s',
    casterGrand('buffAlly', (ab) => supportBarrier(ab, 45, 4, 'weakest'), [
      'bardSong',
      'buffDamageMult',
    ]),
  ),
  gk(
    'bard',
    'a2',
    'ba_gk_a2_a',
    'Song of Rebirth',
    '🎶',
    'Effective Healing Word leaves a 90u recovery grove for 3s, healing 5/tick; +20 healing',
    casterGrand(
      'heal',
      (ab) => {
        addN(ab, 'damage', 20);
        ab.recoveryZone = { radius: 90, duration: 3, tickHeal: 5 };
      },
      ['bardSong'],
    ),
  ),
  gk(
    'bard',
    'a3',
    'ba_gk_a3_a',
    'Thunderous Crescendo',
    '⚡',
    'Dissonant Whispers pulls foes 140u inward and deals +10 damage',
    casterGrand(
      'pbaoe',
      (ab) => {
        ab.pull = Math.max(ab.pull ?? 0, 140);
        ab.knockback = undefined;
        addN(ab, 'damage', 10);
      },
      ['bardSong'],
    ),
  ),

  // --- Monk -----------------------------------------------------------------

  gk(
    'monk',
    'basic',
    'mo_gk_basic_b',
    'Whirling Fists',
    '🌀',
    'Flurry of Blows sweeps a full circle with +8 damage and +15u reach; connecting hits still extend existing Flow',
    (ab) => {
      ab.halfAngleDeg = 180;
      addN(ab, 'damage', 8);
      addN(ab, 'range', 15);
    },
  ),
  gk(
    'monk',
    'a1',
    'mo_gk_a1_a',
    'Paralyzing Blow',
    '💫',
    'Stunning Strike gains +18 damage and +35% damage against already controlled foes; its own stun sets up a later hit',
    (ab) => {
      addN(ab, 'damage', 18);
      addN(ab, 'controlDamageBonus', 0.35);
    },
  ),

  gk(
    'monk',
    'a2',
    'mo_gk_a2_a',
    'Gale Walker',
    '🍃',
    'Step of the Wind grants 35% movement for 3s and 2s resistance to hard control',
    (ab) => {
      ab.buffMoveMult = Math.max(ab.buffMoveMult ?? 1, 1.35);
      ab.buffDuration = Math.max(ab.buffDuration ?? 0, 3);
      ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 2);
    },
  ),

  gk(
    'monk',
    'a3',
    'mo_gk_a3_a',
    'Death Touch',
    '💀',
    'Quivering Palm pulls foes 110u inward and gains +20 damage; Flow still makes it instant and wider',
    (ab) => {
      ab.pull = 110;
      delete ab.knockback;
      addN(ab, 'damage', 20);
    },
  ),

  // --- Sorcerer -------------------------------------------------------------
  gk(
    'sorcerer',
    'basic',
    'so_gk_basic_b',
    'Chaos Lance',
    '💠',
    'Chaos Bolt pierces two additional foes, gains +8 damage per bolt and +250 projectile speed',
    casterGrand(
      'projectile',
      (ab) => {
        addN(ab, 'pierce', 2);
        addN(ab, 'damage', 8);
        addN(ab, 'projSpeed', 250);
      },
      [],
      true,
    ),
  ),
  gk(
    'sorcerer',
    'a1',
    'so_gk_a1_a',
    'Extinction',
    '☄️',
    'Meteor gains +30 damage and +40u blast radius and freezes struck foes for 0.8s',
    casterGrand(
      'projectile',
      (ab) => {
        addN(ab, 'damage', 30);
        addN(ab, 'impactRadius', 40);
        addN(ab, 'freeze', 0.8);
      },
      ['impactRadius'],
    ),
  ),
  gk(
    'sorcerer',
    'a2',
    'so_gk_a2_a',
    'Legion of Mirrors',
    '🪞',
    'Mirror Image grants 4s hard-control resistance and other living allies within 180u take 20% less damage for 4s; ordinary picks still grow images',
    casterGrand(
      'selfBuff',
      (ab) => {
        ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 4);
        casterSharedWard(ab);
      },
      ['mirrorImages'],
    ),
  ),
  gk(
    'sorcerer',
    'a3',
    'so_gk_a3_b',
    'Phase Shift',
    '✨',
    'Arcane Phase reaches 70u farther and blocks two frontal damage hits for 3s after the crossing',
    casterGrand('blink', (ab) => {
      addN(ab, 'range', 70);
      casterGuard(ab, 2, 3);
    }),
  ),

  // --- Warlock --------------------------------------------------------------
  gk(
    'warlock',
    'a1',
    'wa_gk_a1_a',
    'Word of Ruin',
    '☠️',
    'Hex festers for +22/tick across +65u for +4s and follows its first damaged foe for 3s',
    (ab) => {
      addN(ab, 'zoneTickDamage', 22);
      addN(ab, 'radius', 65);
      addN(ab, 'zoneDuration', 4);
      ab.zoneFollow = 3;
    },
  ),
  gk(
    'warlock',
    'a2',
    'wa_gk_a2_a',
    'Infernal Cataclysm',
    '🔥',
    'Hellish Rebuke hits +25 across +30u; a successful retort phases you for 0.6s and applies a searing curse',
    (ab) => {
      addN(ab, 'damage', 25);
      addN(ab, 'radius', 30);
      ab.rebukeCurseBonus = Math.max(ab.rebukeCurseBonus ?? 0, 0.15);
      ab.rebukeInvuln = 0.6;
      if (ab.kind === 'pbaoe') ab.rebukeDuration = Math.max(ab.rebukeDuration ?? 0, 3);
    },
  ),
  gk(
    'warlock',
    'a3',
    'wa_gk_a3_b',
    'Eternal Pact',
    '🕯️',
    "Dark One's Blessing recovers 25% faster, grants +25% damage and 20% mitigation, lasts +1s",
    (ab) => {
      mul(ab, 'cooldown', 0.75);
      addN(ab, 'buffDamageMult', 0.25);
      setMin(ab, 'buffDefMult', 0.8);
      addN(ab, 'buffDuration', 1);
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
function isStrike(ab: Pick<PlayerAbilityDef, 'kind'>): boolean {
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
  if (ab.fortune)
    ab.fortune = {
      ...ab.fortune,
      duration: Math.max(ab.fortune.duration, Math.min(8, ab.fortune.duration * (1 + size))),
      debuffDuration: Math.max(
        ab.fortune.debuffDuration,
        Math.min(4, ab.fortune.debuffDuration * (1 + size)),
      ),
    };
  if (ab.relayHeal)
    ab.relayHeal = { ...ab.relayHeal, radius: Math.round(ab.relayHeal.radius * (1 + size)) };
  if (ab.rescueStrike)
    ab.rescueStrike = {
      ...ab.rescueStrike,
      duration: Math.min(8, ab.rescueStrike.duration * (1 + size)),
    };
  if (ab.crossingGuard)
    ab.crossingGuard = {
      ...ab.crossingGuard,
      width: Math.round(ab.crossingGuard.width * (1 + size)),
      duration: Math.min(6, ab.crossingGuard.duration * (1 + size)),
    };
  if (ab.venomCoating)
    ab.venomCoating = {
      ...ab.venomCoating,
      damage: Math.round(ab.venomCoating.damage * (1 + mag)),
    };
  if (ab.warCry) ab.warCry = { ...ab.warCry, radius: Math.round(ab.warCry.radius * (1 + size)) };
  if (ab.momentumFissure) ab.momentumFissure *= 1 + mag;
  scaleField(ab, 'damage', mag);
  scaleField(ab, 'landingDamage', mag);
  scaleField(ab, 'zoneTickDamage', mag);
  scaleField(ab, 'zoneTickHeal', mag);
  scaleField(ab, 'healOnUse', mag);
  if (ab.closeBurst)
    ab.closeBurst = {
      ...ab.closeBurst,
      damage: Math.round(ab.closeBurst.damage * (1 + mag)),
      radius: Math.round(ab.closeBurst.radius * (1 + size)),
    };
  if (ab.mirrorImages)
    ab.mirrorImages = {
      ...ab.mirrorImages,
      duration: Math.min(9, ab.mirrorImages.duration * (1 + size)),
    };
  if (ab.frontGuard)
    ab.frontGuard = {
      ...ab.frontGuard,
      duration: Math.min(8, ab.frontGuard.duration * (1 + size)),
    };
  if (ab.steadfastDuration) ab.steadfastDuration = Math.min(8, ab.steadfastDuration * (1 + size));
  if (ab.kind === 'selfBuff' && ab.iframes) ab.iframes = Math.min(2, ab.iframes * (1 + mag));
  if (ab.recoveryZone)
    ab.recoveryZone = {
      ...ab.recoveryZone,
      radius: Math.round(ab.recoveryZone.radius * (1 + size)),
      tickHeal: Math.round(ab.recoveryZone.tickHeal * (1 + mag)),
    };
  if (ab.paladinAura)
    ab.paladinAura = { ...ab.paladinAura, radius: Math.round(ab.paladinAura.radius * (1 + size)) };
  if (ab.absorption) {
    ab.absorption = scaleAbsorption(ab.absorption, 1 + mag, 1 + size);
    ab.absorption.amount = Math.round(ab.absorption.amount);
    if (ab.absorption.balanceAmount != null)
      ab.absorption.balanceAmount = Math.round(ab.absorption.balanceAmount);
    if (ab.absorption.curseSiphon) {
      ab.absorption.curseSiphon.amount = Math.round(ab.absorption.curseSiphon.amount);
      ab.absorption.curseSiphon.range = Math.round(ab.absorption.curseSiphon.range);
    }
    if (ab.absorption.target !== 'self') scaleField(ab, 'range', size);
  }
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
/** Slow rider — chills whatever the skill can slow (a struck foe, or a hazard zone). */
function slowRider(ab: PlayerAbilityDef, mult: number, dur: number): void {
  if ((ab.damage ?? 0) > 0 || (ab.zoneTickDamage ?? 0) > 0) {
    setMin(ab, 'slowMult', mult);
    ab.slowDuration = Math.max(ab.slowDuration ?? 0, dur);
  }
}

/** Nature recipes require their actual delivery; changed Forge skills get honest generic growth. */
function natureGrand(
  kind: PlayerAbilityDef['kind'],
  tune: (ab: PlayerAbilityDef) => void,
): (ab: PlayerAbilityDef) => void {
  return (ab) => {
    if (ab.kind === kind) tune(ab);
    else amplify(ab, 0.25, 0.15);
  };
}

/** One predicate keeps actual caster recipes and Forge offer wording in agreement. */
function casterPayloadMatches(
  ab: Omit<PlayerAbilityDef, 'slot'>,
  kind: PlayerAbilityDef['kind'],
  hooks: readonly (keyof Omit<PlayerAbilityDef, 'slot'>)[],
  unbursted: boolean,
): boolean {
  return (
    ab.kind === kind &&
    hooks.every((field) => ab[field] != null && ab[field] !== false && ab[field] !== 0) &&
    (!isStrike(ab) || ab.damage > 0) &&
    (!unbursted || (!ab.impactRadius && !ab.components?.effects.some((e) => e.kind === 'zone')))
  );
}

/** Altered Forge payloads receive useful growth instead of unsupported native riders. */
function casterGrand(
  kind: PlayerAbilityDef['kind'],
  tune: (ab: PlayerAbilityDef) => void,
  hooks: readonly (keyof Omit<PlayerAbilityDef, 'slot'>)[] = [],
  unbursted = false,
): (ab: PlayerAbilityDef) => void {
  return (ab) => {
    if (casterPayloadMatches(ab, kind, hooks, unbursted)) tune(ab);
    else amplify(ab, 0.25, 0.15);
  };
}
/** Callers already validate positive direct damage through the recipe predicate or isStrike. */
function casterSuppression(ab: PlayerAbilityDef, mult = 1.3): void {
  ab.castSlow = Math.max(ab.castSlow ?? 1, mult);
  ab.castSlowDuration = Math.max(ab.castSlowDuration ?? 0, 3);
}
function casterSharedWard(ab: PlayerAbilityDef): void {
  ab.allyWard = {
    range: Math.max(ab.allyWard?.range ?? 0, 180),
    mult: Math.min(ab.allyWard?.mult ?? 1, 0.8),
    duration: Math.max(ab.allyWard?.duration ?? 0, 4),
  };
}
function casterGuard(ab: PlayerAbilityDef, charges: number, duration: number): void {
  ab.frontGuard = {
    ...ab.frontGuard,
    charges: Math.max(ab.frontGuard?.charges ?? 0, charges),
    duration: Math.max(ab.frontGuard?.duration ?? 0, duration),
  };
}

/** Suppress enemy wind-ups only on deliveries with an actual direct-hit rider. */
function natureSuppression(ab: PlayerAbilityDef): void {
  if (!isStrike(ab)) return;
  ab.castSlow = Math.max(ab.castSlow ?? 1, 1.3);
  ab.castSlowDuration = Math.max(ab.castSlowDuration ?? 0, 3);
}

/** Native support hooks are shared by authored recipes and Forge offer wording. */
const SUPPORT_RECIPES: Record<
  string,
  {
    kind: PlayerAbilityDef['kind'];
    hooks: readonly (keyof Omit<PlayerAbilityDef, 'slot'>)[];
    unbursted?: boolean;
  }
> = {
  cl_light_flare: { kind: 'pbaoe', hooks: [] },
  cl_light_beam: { kind: 'projectile', hooks: [], unbursted: true },
  cl_light_flash: { kind: 'heal', hooks: ['rescueStrike', 'rescueHealBonus'] },
  cl_light_warding: { kind: 'selfBuff', hooks: ['absorption'] },
  cl_life_bloom: { kind: 'groundZone', hooks: ['zoneTickHeal'] },
  cl_life_mend: { kind: 'heal', hooks: ['relayHeal', 'rescueHealBonus'] },
  cl_life_preserve: { kind: 'selfBuff', hooks: ['absorption'] },
  cl_life_smite: { kind: 'meleeCone', hooks: ['stun'] },
  pa_devotion_smite: { kind: 'meleeCone', hooks: ['lifestealFrac'] },
  pa_devotion_sanctuary: { kind: 'selfBuff', hooks: ['paladinAura', 'buffDamageMult'] },
  pa_devotion_bless: { kind: 'heal', hooks: ['paladinAura'] },
  pa_devotion_aura: { kind: 'selfBuff', hooks: ['paladinAura', 'absorption'] },
  pa_vengeance_hunt: { kind: 'selfBuff', hooks: ['paladinAura', 'buffDamageMult', 'buffMoveMult'] },
  pa_vengeance_shackle: { kind: 'pbaoe', hooks: ['slowMult'] },
  pa_vengeance_charge: { kind: 'dash', hooks: ['landingDamage', 'range'] },
  pa_vengeance_smite: { kind: 'meleeCone', hooks: ['stun'] },
  ba_valor_blade: { kind: 'meleeCone', hooks: ['bardSong'] },
  ba_valor_inspire: { kind: 'selfBuff', hooks: ['bardSong', 'buffDamageMult'] },
  ba_valor_bolster: { kind: 'selfBuff', hooks: ['bardSong', 'cleanseOnHeal', 'steadfastDuration'] },
  ba_valor_shatter: { kind: 'pbaoe', hooks: ['bardSong'] },
  ba_whispers_words: { kind: 'groundZone', hooks: ['zoneTickDamage', 'bardSong', 'airborne'] },
  ba_whispers_wound: { kind: 'projectile', hooks: ['bardSong'], unbursted: true },
  ba_whispers_mantle: { kind: 'blink', hooks: ['whisperRefrain'] },
  ba_whispers_song: { kind: 'heal', hooks: ['bardSong'] },
};
function supportRecipeMatches(subSkillId: string, ab: Omit<PlayerAbilityDef, 'slot'>): boolean {
  const recipe = SUPPORT_RECIPES[subSkillId];
  return casterPayloadMatches(ab, recipe.kind, recipe.hooks, recipe.unbursted ?? false);
}
function supportGrand(
  subSkillId: string,
  tune: (ab: PlayerAbilityDef) => void,
): (ab: PlayerAbilityDef) => void {
  return (ab) => {
    if (supportRecipeMatches(subSkillId, ab)) tune(ab);
    else amplify(ab, 0.25, 0.15);
  };
}

/** Support riders retain their recipient rules when copied or composed. */
function supportBarrier(
  ab: PlayerAbilityDef,
  amount: number,
  duration: number,
  target: NonNullable<PlayerAbilityDef['absorption']>['target'],
): void {
  ab.absorption = {
    ...ab.absorption,
    amount: Math.max(ab.absorption?.amount ?? 0, amount),
    duration: Math.max(ab.absorption?.duration ?? 0, duration),
    target: ab.absorption?.target ?? target,
  };
}
function supportRescue(ab: PlayerAbilityDef, mult: number, duration: number): void {
  ab.rescueStrike = {
    mult: Math.max(ab.rescueStrike?.mult ?? 1, mult),
    duration: Math.max(ab.rescueStrike?.duration ?? 0, duration),
  };
}
function supportHealBoon(
  ab: PlayerAbilityDef,
  field: 'buffMoveMult' | 'buffDefMult' | 'buffDamageMult',
  value: number,
  duration: number,
): void {
  if (field === 'buffDefMult') setMin(ab, field, value);
  else ab[field] = Math.max(ab[field] ?? 1, value);
  ab.buffDuration = Math.max(ab.buffDuration ?? 0, duration);
}
function supportSharedWard(ab: PlayerAbilityDef): void {
  ab.allyWard = {
    range: Math.max(ab.allyWard?.range ?? 0, 180),
    mult: Math.min(ab.allyWard?.mult ?? 1, 0.85),
    duration: Math.max(ab.allyWard?.duration ?? 0, 4),
  };
}

/** Pilot identities tune native base skills during replay and bound subclass skills on rebind. */
function pilotIdentity(
  subclassId: string,
  id: string,
  name: string,
  icon: string,
  desc: string,
  tuneBase: (abilities: Record<AbilitySlot, PlayerAbilityDef>) => void,
  tuneSub: (ab: PlayerAbilityDef) => void,
): CharUpgradeDef {
  return {
    id,
    classId: getSubclass(subclassId)!.classId,
    subclassId,
    name,
    icon,
    desc,
    grand: true,
    maxStacks: 1,
    apply: ({ abilities, subAbilities }) => {
      if (subAbilities) {
        for (const slot of SUB_SLOTS) if (subAbilities[slot]) tuneSub(subAbilities[slot]);
      } else tuneBase(abilities);
    },
  };
}

export const SUBCLASS_GRANDS: CharUpgradeDef[] = [
  // Knight
  pilotIdentity(
    'kn_champion',
    'kn_champion_g_a',
    'Unbroken Champion',
    '⚔️',
    'Taunt and Shield Wall grant 4s hard-control resistance; Champion strikes leech 15%, and Second Wind grants 3s resistance',
    (a) => {
      for (const ab of [a.a1, a.a2]) ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 4);
    },
    (ab) => {
      if (isStrike(ab)) lifeRider(ab, 0.15);
      if (ab.kind === 'selfBuff') ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 3);
    },
  ),
  pilotIdentity(
    'kn_champion',
    'kn_champion_g_b',
    'Warlord’s Tempo',
    '🥁',
    'Taunt challenges nearby foes and readies a counter after your next melee connection; Shield Wall and Second Wind grant +15% damage for 4s; Champion strikes gain +20% damage against controlled foes',
    (a) => {
      a.a1.warCry = { radius: 180, duration: 4 };
      a.a2.buffDamageMult = Math.max(a.a2.buffDamageMult ?? 1, 1.15);
      a.a2.buffDuration = Math.max(a.a2.buffDuration ?? 0, 4);
    },
    (ab) => {
      if (isStrike(ab)) addN(ab, 'controlDamageBonus', 0.2);
      if (ab.kind === 'selfBuff') {
        ab.buffDamageMult = Math.max(ab.buffDamageMult ?? 1, 1.15);
        ab.buffDuration = Math.max(ab.buffDuration ?? 0, 4);
      }
    },
  ),
  pilotIdentity(
    'kn_battlemaster',
    'kn_battlemaster_g_a',
    'Grand Tactician',
    '🎖️',
    'Cleave, Shield Bash and direct Battlemaster strikes gain +25% damage against already controlled foes; Menacing Roar and Rally counter setup lasts 1s longer',
    (a) => {
      for (const ab of [a.basic, a.a3]) addN(ab, 'controlDamageBonus', 0.25);
    },
    (ab) => {
      if (isStrike(ab)) addN(ab, 'controlDamageBonus', 0.25);
      if (ab.warCry) ab.warCry = { ...ab.warCry, duration: Math.min(8, ab.warCry.duration + 1) };
      if (ab.guardWindow) addN(ab, 'guardWindow', 1);
    },
  ),
  pilotIdentity(
    'kn_battlemaster',
    'kn_battlemaster_g_b',
    'Perfect Maneuver',
    '⚙️',
    'Taunt adds 30 absorption for 4s; Shield Bash slows wind-ups by 30% for 3s; Battlemaster direct strikes slow movement to 75% for 2s and utilities share a 15% ward with other allies within 180u',
    (a) => {
      a.a1.absorption = {
        amount: (a.a1.absorption?.amount ?? 0) + 30,
        duration: 4,
        target: 'self',
      };
      a.a3.castSlow = Math.max(a.a3.castSlow ?? 1, 1.3);
      a.a3.castSlowDuration = Math.max(a.a3.castSlowDuration ?? 0, 3);
    },
    (ab) => {
      if (isStrike(ab)) slowRider(ab, 0.75, 2);
      else ab.allyWard = { range: 180, mult: 0.85, duration: 4 };
    },
  ),

  // Ranger
  pilotIdentity(
    'rg_hunter',
    'rg_hunter_g_a',
    'Apex Predator',
    '🎯',
    'Arrow, Multishot and direct Hunter strikes deal +25% damage against already controlled foes; Rain of Arrows supplies setup with any first skill',
    (a) => {
      for (const ab of [a.basic, a.a1]) {
        if (isStrike(ab)) addN(ab, 'controlDamageBonus', 0.25);
        else amplify(ab, 0.2, 0.1);
      }
    },
    (ab) => {
      if (isStrike(ab)) addN(ab, 'controlDamageBonus', 0.25);
    },
  ),
  pilotIdentity(
    'rg_hunter',
    'rg_hunter_g_b',
    'Relentless Hunt',
    '🐾',
    'Roll grants +25% movement for 4s and 2s hard-control resistance; direct Hunter strikes slow enemy wind-ups by 30% for 3s, while allied field speed gains +5%',
    (a) => {
      if (a.a3.kind === 'dash' || a.a3.kind === 'blink') {
        a.a3.buffMoveMult = Math.max(a.a3.buffMoveMult ?? 1, 1.25);
        a.a3.buffDuration = Math.max(a.a3.buffDuration ?? 0, 4);
        a.a3.steadfastDuration = Math.max(a.a3.steadfastDuration ?? 0, 2);
      } else amplify(a.a3, 0.2, 0.1);
    },
    (ab) => {
      natureSuppression(ab);
      if (ab.kind === 'groundZone' && ab.zoneAllyMoveMult) addN(ab, 'zoneAllyMoveMult', 0.05);
    },
  ),
  pilotIdentity(
    'rg_beastmaster',
    'rg_beastmaster_g_a',
    'Alpha’s Fury',
    '🐺',
    'Your spirit wolf commands wind up in 0.15s and deal +50% against controlled quarry instead of +25%, at the same 2.5s command interval; Roll blocks one frontal hit for 3s and direct Beast strikes gain +20% controlled-target damage',
    (a) => {
      if (a.a3.kind === 'dash' || a.a3.kind === 'blink')
        a.a3.frontGuard = { charges: 1, duration: 3 };
      else amplify(a.a3, 0.2, 0.1);
    },
    (ab) => {
      if (isStrike(ab)) addN(ab, 'controlDamageBonus', 0.2);
    },
  ),
  pilotIdentity(
    'rg_beastmaster',
    'rg_beastmaster_g_b',
    'Pack Tactics',
    '🐾',
    'Rain of Arrows gives allies inside 15% mitigation; Roll heals 15; Beast mobility heals 10, dedicated heals gain 15 healing, damaging fields grant +20% allied movement and direct strikes leech 10% more',
    (a) => {
      if (a.a2.kind === 'groundZone')
        a.a2.zoneAllyDefMult = Math.min(a.a2.zoneAllyDefMult ?? 1, 0.85);
      else amplify(a.a2, 0.2, 0.1);
      if (a.a3.kind === 'dash' || a.a3.kind === 'blink') addN(a.a3, 'healOnUse', 15);
      else amplify(a.a3, 0.2, 0.1);
    },
    (ab) => {
      if (ab.kind === 'dash' || ab.kind === 'blink') addN(ab, 'healOnUse', 10);
      else if (ab.kind === 'heal') addN(ab, 'damage', 15);
      else if (ab.kind === 'groundZone')
        ab.zoneAllyMoveMult = Math.max(ab.zoneAllyMoveMult ?? 1, 1.2);
      else lifeRider(ab, 0.1);
    },
  ),

  // Mage — every identity changes a starting-kit route with any first pick.
  pilotIdentity(
    'mg_evoker',
    'mg_evoker_g_a',
    'Arch-Evoker',
    '🔥',
    'Arcane Bolt and Fireball gain +25% damage against controlled foes; direct Evoker strikes gain +20%. Frost Nova supplies setup with any first skill',
    (a) => {
      for (const ab of [a.basic, a.a1]) {
        if (isStrike(ab) && ab.damage > 0) addN(ab, 'controlDamageBonus', 0.25);
        else amplify(ab, 0.2, 0.1);
      }
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) addN(ab, 'controlDamageBonus', 0.2);
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'mg_evoker',
    'mg_evoker_g_b',
    'Overchannel',
    '⚡',
    'Arcane Bolt slows foes 20% for 2s to start Cadence at range; Frost Nova lengthens their wind-ups by 35% for 3s, and direct Evoker strikes by 30%',
    (a) => {
      if (isStrike(a.basic) && a.basic.damage > 0) slowRider(a.basic, 0.8, 2);
      else amplify(a.basic, 0.2, 0.1);
      if (isStrike(a.a2) && a.a2.damage > 0) casterSuppression(a.a2, 1.35);
      else amplify(a.a2, 0.2, 0.1);
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) casterSuppression(ab);
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'mg_abjurer',
    'mg_abjurer_g_a',
    'Grand Warding',
    '🛡️',
    'Blink blocks one frontal damage hit for 4s; Abjurer barriers gain 20% protection and last 1s longer (up to 8s), and Life Transfer cleanses its healed recipient',
    (a) => casterGrand('blink', (ab) => casterGuard(ab, 1, 4))(a.a3),
    (ab) => {
      if (ab.absorption) {
        const barrier = scaleAbsorption(ab.absorption, 1.2, 1);
        barrier.duration = Math.max(barrier.duration, Math.min(8, barrier.duration + 1));
        ab.absorption = barrier;
      } else amplify(ab, 0.2, 0.1);
      if (ab.kind === 'heal') ab.cleanseOnHeal = true;
    },
  ),
  pilotIdentity(
    'mg_abjurer',
    'mg_abjurer_g_b',
    'Binding Dominion',
    '🌀',
    'Arcane Bolt gains +25% controlled-target damage; Frost Nova reaches 35u farther and slows 1s longer. Abjurer strikes exploit control, damaging fields suppress wind-ups, Door heals 20, and dedicated heals gain 15',
    (a) => {
      if (isStrike(a.basic) && a.basic.damage > 0) addN(a.basic, 'controlDamageBonus', 0.25);
      else amplify(a.basic, 0.2, 0.1);
      casterGrand(
        'pbaoe',
        (ab) => {
          addN(ab, 'radius', 35);
          addN(ab, 'slowDuration', 1);
        },
        ['slowMult'],
      )(a.a2);
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) addN(ab, 'controlDamageBonus', 0.2);
      else if (ab.kind === 'groundZone' && ab.zoneTickDamage)
        ab.castSlow = Math.max(ab.castSlow ?? 1, 1.4);
      else if (ab.kind === 'blink') addN(ab, 'healOnUse', 20);
      else if (ab.kind === 'heal') addN(ab, 'damage', 15);
      else amplify(ab, 0.2, 0.1);
    },
  ),

  // Cleric
  pilotIdentity(
    'cl_light',
    'cl_light_g_a',
    'Dawnbreaker',
    '☀️',
    'Smite slows foes 25% for 2s; Sanctuary grants 20% allied movement. Direct Light strikes gain +25% controlled-target damage; Light rescues ready +30% damage and wards grant you 20% movement',
    (a) => {
      if (isStrike(a.basic) && a.basic.damage > 0) slowRider(a.basic, 0.75, 2);
      else amplify(a.basic, 0.2, 0.1);
      if (a.a2.kind === 'groundZone' && a.a2.zoneTickHeal)
        a.a2.zoneAllyMoveMult = Math.max(a.a2.zoneAllyMoveMult ?? 1, 1.2);
      else amplify(a.a2, 0.2, 0.1);
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) addN(ab, 'controlDamageBonus', 0.25);
      else if (ab.kind === 'heal' && ab.rescueStrike)
        ab.rescueStrike = { ...ab.rescueStrike, mult: Math.max(ab.rescueStrike.mult, 1.3) };
      else if (ab.kind === 'selfBuff' && ab.absorption)
        ab.buffMoveMult = Math.max(ab.buffMoveMult ?? 1, 1.2);
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'cl_light',
    'cl_light_g_b',
    'Endless Radiance',
    '🌟',
    'Blessing adds 35 absorption for 4s to the lowest-health ally; Smite delays wind-ups 30% for 3s. Direct Light strikes leech 20%, heals cleanse, and wards give you 3s hard-control resistance',
    (a) => {
      casterGrand('buffAlly', (ab) => supportBarrier(ab, 35, 4, 'weakest'), ['buffDamageMult'])(
        a.a3,
      );
      if (isStrike(a.basic) && a.basic.damage > 0) casterSuppression(a.basic);
      else amplify(a.basic, 0.2, 0.1);
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) lifeRider(ab, 0.2);
      else if (ab.kind === 'heal') ab.cleanseOnHeal = true;
      else if (ab.kind === 'selfBuff' && ab.absorption)
        ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 3);
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'cl_life',
    'cl_life_g_a',
    'Font of Life',
    '💚',
    'Effective Heal leaves a 90u grove for 3s, healing 4/tick; Sanctuary grants 20% mitigation. Life heals grant 20% movement for 3s, fields grant 20% mitigation, wards heal you 20, and direct strikes leech 15%',
    (a) => {
      casterGrand(
        'heal',
        (ab) => {
          ab.recoveryZone = { radius: 90, duration: 3, tickHeal: 4 };
        },
        ['rescueHealBonus'],
      )(a.a1);
      if (a.a2.kind === 'groundZone' && a.a2.zoneTickHeal)
        a.a2.zoneAllyDefMult = Math.min(a.a2.zoneAllyDefMult ?? 1, 0.8);
      else amplify(a.a2, 0.2, 0.1);
    },
    (ab) => {
      if (ab.kind === 'heal') supportHealBoon(ab, 'buffMoveMult', 1.2, 3);
      else if (ab.kind === 'groundZone' && ab.zoneTickHeal)
        ab.zoneAllyDefMult = Math.min(ab.zoneAllyDefMult ?? 1, 0.8);
      else if (ab.kind === 'selfBuff' && ab.absorption) addN(ab, 'healOnUse', 20);
      else if (isStrike(ab) && ab.damage > 0) lifeRider(ab, 0.15);
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'cl_life',
    'cl_life_g_b',
    'Ceaseless Mending',
    '✨',
    'Heal and Life heals ready a low-health recipient’s next direct hit for +25% damage within 6s; Sanctuary and Life fields grant 25% allied movement. Life wards lift you for 3s; direct strikes delay wind-ups 30% for 3s',
    (a) => {
      casterGrand('heal', (ab) => supportRescue(ab, 1.25, 6), ['rescueHealBonus'])(a.a1);
      if (a.a2.kind === 'groundZone' && a.a2.zoneTickHeal)
        a.a2.zoneAllyMoveMult = Math.max(a.a2.zoneAllyMoveMult ?? 1, 1.25);
      else amplify(a.a2, 0.2, 0.1);
    },
    (ab) => {
      if (ab.kind === 'heal') supportRescue(ab, 1.25, 6);
      else if (ab.kind === 'groundZone' && ab.zoneTickHeal)
        ab.zoneAllyMoveMult = Math.max(ab.zoneAllyMoveMult ?? 1, 1.25);
      else if (ab.kind === 'selfBuff' && ab.absorption)
        ab.grantsFlight = Math.max(ab.grantsFlight ?? 0, 3);
      else if (isStrike(ab) && ab.damage > 0) casterSuppression(ab);
      else amplify(ab, 0.2, 0.1);
    },
  ),

  // Barbarian
  pilotIdentity(
    'bb_berserker',
    'bb_berserker_g_a',
    'Avatar of Fury',
    '😤',
    'Rage lasts 2s longer and Whirlwind winds up twice as quickly; Frenzy extends its fury and blood-price windows by 2s, while Berserker strikes gain 15% damage and 10% critical chance',
    (a) => {
      addN(a.a1, 'momentumWindow', 2);
      addN(a.a1, 'buffDuration', 2);
      mul(a.a3, 'castTime', 0.5);
    },
    (ab) => {
      if (isStrike(ab)) {
        mul(ab, 'damage', 1.15);
        addN(ab, 'critChanceBonus', 0.1);
      }
      if (ab.kind === 'selfBuff') {
        for (const field of ['buffDuration', 'momentumWindow', 'bloodRage'] as const)
          if (ab[field]) addN(ab, field, 2);
      }
    },
  ),
  pilotIdentity(
    'bb_berserker',
    'bb_berserker_g_b',
    'Blood Frenzy',
    '🩸',
    'Rage and Frenzy let walking earn Momentum instead of melee hits for 6s; Whirlwind slows foes to 75% for 2s, basics gain +15% damage against controlled foes, and direct Berserker strikes gain +25%',
    (a) => {
      a.a1.wolfHunt = Math.max(a.a1.wolfHunt ?? 0, 6);
      slowRider(a.a3, 0.75, 2);
      addN(a.basic, 'controlDamageBonus', 0.15);
    },
    (ab) => {
      if (ab.kind === 'selfBuff') ab.wolfHunt = Math.max(ab.wolfHunt ?? 0, 6);
      if (isStrike(ab)) addN(ab, 'controlDamageBonus', 0.25);
    },
  ),
  pilotIdentity(
    'bb_totem',
    'bb_totem_g_a',
    'Great Spirit',
    '🐻',
    'Rage blocks one frontal hit for 4s and readies a counter on the block; Reckless Swing and Whirlwind leech 10%; Totem guard, hunt, control-resistance and earth-field windows last 1s longer',
    (a) => {
      a.a1.frontGuard = { charges: 1, duration: 4, counter: 1.3 };
      for (const ab of [a.basic, a.a3]) addN(ab, 'lifestealFrac', 0.1);
    },
    (ab) => {
      if (ab.frontGuard)
        ab.frontGuard = { ...ab.frontGuard, duration: Math.min(8, ab.frontGuard.duration + 1) };
      if (ab.wolfHunt) addN(ab, 'wolfHunt', 1);
      if (ab.steadfastDuration) addN(ab, 'steadfastDuration', 1);
      if (ab.kind === 'groundZone') addN(ab, 'zoneDuration', 1);
    },
  ),
  pilotIdentity(
    'bb_totem',
    'bb_totem_g_b',
    'Ancestral Might',
    '🌍',
    'Rage grants 15% self mitigation and shares a 4s ward with other allies within 180u; Totem self utilities share that ward, while Earth Totem lasts 1s longer with a longer slow linger',
    (a) => {
      setMin(a.a1, 'buffDefMult', 0.85);
      a.a1.allyWard = { range: 180, mult: 0.85, duration: 4 };
    },
    (ab) => {
      if (ab.kind === 'selfBuff') ab.allyWard = { range: 180, mult: 0.85, duration: 4 };
      if (ab.kind === 'groundZone') {
        addN(ab, 'zoneDuration', 1);
        addN(ab, 'slowDuration', 1);
      }
    },
  ),

  // Rogue — both identities retune the starting loop and remain useful with either bound skill.
  pilotIdentity(
    'ro_assassin',
    'ro_assassin_g_a',
    'Shadow Reprise',
    '💀',
    'Shadowstep leaves a 6s departure anchor. A later prepared direct hit unlocks a 2s return: press Shadowstep again. Prepared executions grow stronger',
    (a) => {
      addN(a.basic, 'critChanceBonus', 0.08);
      addN(a.a1, 'critMultBonus', 0.25);
      addN(a.a2, 'prepareCrit', 2);
      a.a2.shadowReprise = {
        lifetime: 6,
        returnWindow: 2,
        range: a.a2.range ?? 250,
        prepared: !a.a2.components,
      };
    },
    (ab) => {
      if (isStrike(ab)) {
        ab.consumesPrecision = true;
        addN(ab, 'critMultBonus', 0.2);
      }
      if (ab.prepareCrit) addN(ab, 'prepareCrit', 2);
      if (ab.venomCoating) ab.prepareCrit = Math.max(ab.prepareCrit ?? 0, 4);
    },
  ),
  pilotIdentity(
    'ro_assassin',
    'ro_assassin_g_b',
    'One with Shadow',
    '🌑',
    'Shadowstep coats your next direct hit with 12/s poison for 4s; Assassin preparation and coatings last longer',
    (a) => {
      a.a2.venomCoating = { damage: 12, duration: 4, window: 6 };
      addN(a.a2, 'prepareCrit', 1);
      addN(a.a1, 'critChanceBonus', 0.08);
    },
    (ab) => {
      if (ab.venomCoating)
        ab.venomCoating = {
          ...ab.venomCoating,
          duration: Math.min(6, ab.venomCoating.duration + 2),
        };
      if (ab.prepareCrit) addN(ab, 'prepareCrit', 1);
      if (isStrike(ab)) addN(ab, 'critChanceBonus', 0.08);
    },
  ),
  pilotIdentity(
    'ro_trickster',
    'ro_trickster_g_a',
    "Archmage's Cunning",
    '✨',
    'Spellblade empowers any positive direct hit and slows its target; prepared base strikes and Trickster spells reach farther',
    (a) => {
      addN(a.basic, 'range', 10);
      addN(a.a1, 'range', 10);
      addN(a.a2, 'prepareCrit', 1);
    },
    (ab) => {
      if (isStrike(ab)) {
        slowRider(ab, 0.65, 2);
        ab.castSlow = Math.max(ab.castSlow ?? 1, 1.3);
      } else if (ab.kind === 'groundZone') addN(ab, 'radius', 15);
      else if (ab.kind === 'blink' || ab.kind === 'selfBuff')
        ab.prepareCrit = Math.max(ab.prepareCrit ?? 0, 5);
    },
  ),
  pilotIdentity(
    'ro_trickster',
    'ro_trickster_g_b',
    'Sleight of Time',
    '⏳',
    'A spent Spellblade grants a frontal block and 25% movement for 2s; Trickster utilities recover sooner',
    (a) => {
      addN(a.a1, 'critChanceBonus', 0.08);
    },
    (ab) => {
      if (ab.kind === 'blink' || ab.kind === 'selfBuff') mul(ab, 'cooldown', 0.85);
      else if (isStrike(ab)) addN(ab, 'critChanceBonus', 0.08);
      else if (ab.kind === 'groundZone')
        ab.zoneAllyMoveMult = Math.max(ab.zoneAllyMoveMult ?? 1, 1.15);
    },
  ),

  // Paladin
  pilotIdentity(
    'pa_devotion',
    'pa_devotion_g_a',
    'Covenant of Steel',
    '🌟',
    'Divine Shield blocks one frontal hit for 4s, readying a +30% melee counter; Consecration grants 20% allied movement. Devotion strikes leech +15%, utilities ready the same counter, and effective Bless grants 20% mitigation for 3s',
    (a) => {
      casterGrand(
        'selfBuff',
        (ab) => {
          casterGuard(ab, 1, 4);
          ab.frontGuard = {
            ...ab.frontGuard!,
            counter: Math.max(ab.frontGuard?.counter ?? 1, 1.3),
          };
        },
        ['iframes', 'paladinAura'],
      )(a.a3);
      if (a.a1.kind === 'groundZone' && a.a1.zoneTickHeal)
        a.a1.zoneAllyMoveMult = Math.max(a.a1.zoneAllyMoveMult ?? 1, 1.2);
      else amplify(a.a1, 0.2, 0.1);
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) lifeRider(ab, 0.15);
      else if (ab.kind === 'selfBuff') ab.guardWindow = Math.max(ab.guardWindow ?? 0, 4);
      else if (ab.kind === 'heal') supportHealBoon(ab, 'buffDefMult', 0.8, 3);
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'pa_devotion',
    'pa_devotion_g_b',
    'Unyielding Faith',
    '🛡️',
    'Divine Shield weakens foes within 180u by 20% for 4s and readies a counter after your next melee connection; effective Lay on Hands grants 20% movement for 3s. Devotion strikes delay wind-ups 30%, utilities ward other allies 15% within 180u for 4s, and Bless cleanses',
    (a) => {
      casterGrand(
        'selfBuff',
        (ab) => {
          ab.warCry = { radius: 180, duration: 4 };
        },
        ['iframes', 'paladinAura'],
      )(a.a3);
      casterGrand('heal', (ab) => supportHealBoon(ab, 'buffMoveMult', 1.2, 3), ['paladinAura'])(
        a.a2,
      );
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) casterSuppression(ab);
      else if (ab.kind === 'selfBuff') supportSharedWard(ab);
      else if (ab.kind === 'heal') ab.cleanseOnHeal = true;
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'pa_vengeance',
    'pa_vengeance_g_a',
    'Avenging Wrath',
    '🔥',
    'Consecration slows foes 30%; Holy Strike and direct Vengeance strikes gain +25% damage against controlled foes. Hunter’s Vow adds 3s hard-control resistance; Charge delays enemy wind-ups 30% for 3s',
    (a) => {
      casterGrand(
        'groundZone',
        (ab) => {
          setMin(ab, 'slowMult', 0.7);
          ab.slowDuration = Math.max(ab.slowDuration ?? 0, 1);
        },
        ['zoneTickDamage'],
      )(a.a1);
      if (isStrike(a.basic) && a.basic.damage > 0) addN(a.basic, 'controlDamageBonus', 0.25);
      else amplify(a.basic, 0.2, 0.1);
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) addN(ab, 'controlDamageBonus', 0.25);
      else if (ab.kind === 'selfBuff')
        ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 3);
      else if (ab.kind === 'dash' && ab.landingDamage) casterSuppression(ab);
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'pa_vengeance',
    'pa_vengeance_g_b',
    'Relentless Vengeance',
    '⚡',
    'Divine Shield grants 25% movement for 3s; Holy Strike leeches 15%. Direct Vengeance strikes leech 20%, Charge grants 20% movement for 3s, and Hunter’s Vow heals you 25',
    (a) => {
      casterGrand(
        'selfBuff',
        (ab) => {
          ab.buffMoveMult = Math.max(ab.buffMoveMult ?? 1, 1.25);
          ab.buffDuration = Math.max(ab.buffDuration ?? 0, 3);
        },
        ['iframes', 'paladinAura'],
      )(a.a3);
      if (isStrike(a.basic) && a.basic.damage > 0) lifeRider(a.basic, 0.15);
      else amplify(a.basic, 0.2, 0.1);
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) lifeRider(ab, 0.2);
      else if (ab.kind === 'dash' && ab.landingDamage) supportHealBoon(ab, 'buffMoveMult', 1.2, 3);
      else if (ab.kind === 'selfBuff') addN(ab, 'healOnUse', 25);
      else amplify(ab, 0.2, 0.1);
    },
  ),

  // Druid
  pilotIdentity(
    'dr_moon',
    'dr_moon_g_a',
    'Primal Avatar',
    '🐾',
    'Moon form and its stride last 8s instead of 6s, with the same 12s entry interval; Cyclone leeches 15%, direct Moon strikes leech 10% more, and recovery groves gain 20u radius',
    (a) => {
      if (isStrike(a.a3)) lifeRider(a.a3, 0.15);
      else amplify(a.a3, 0.2, 0.1);
    },
    (ab) => {
      lifeRider(ab, 0.1);
      if (ab.recoveryZone)
        ab.recoveryZone = { ...ab.recoveryZone, radius: ab.recoveryZone.radius + 20 };
    },
  ),
  pilotIdentity(
    'dr_moon',
    'dr_moon_g_b',
    'Feral Swiftness',
    '🐆',
    'Moon claws reach 125u instead of 95u; Cyclone and direct Moon strikes slow enemy wind-ups by 30% for 3s; Moon heals cleanse, mobility heals 10 and prepared bramble bursts reach 30u farther',
    (a) => {
      if (isStrike(a.a3)) natureSuppression(a.a3);
      else amplify(a.a3, 0.2, 0.1);
    },
    (ab) => {
      natureSuppression(ab);
      if (ab.kind === 'heal') ab.cleanseOnHeal = true;
      if (ab.kind === 'dash' || ab.kind === 'blink') addN(ab, 'healOnUse', 10);
      if (ab.closeBurst) ab.closeBurst = { ...ab.closeBurst, range: ab.closeBurst.range + 30 };
    },
  ),
  pilotIdentity(
    'dr_land',
    'dr_land_g_a',
    'Wrath of the Land',
    '🌋',
    'Thornlash gains +25% damage against controlled foes and Cyclone gains +8 damage; direct Land strikes gain +15% controlled-target damage and damaging Land fields gain +3 per tick',
    (a) => {
      if (isStrike(a.basic)) addN(a.basic, 'controlDamageBonus', 0.25);
      else amplify(a.basic, 0.2, 0.1);
      if (isStrike(a.a3)) addN(a.a3, 'damage', 8);
      else amplify(a.a3, 0.2, 0.1);
    },
    (ab) => {
      if (isStrike(ab)) addN(ab, 'controlDamageBonus', 0.15);
      if (ab.kind === 'groundZone' && ab.zoneTickDamage) addN(ab, 'zoneTickDamage', 3);
    },
  ),
  pilotIdentity(
    'dr_land',
    'dr_land_g_b',
    'Eternal Season',
    '🍃',
    'Regrowth relays 35% of effective primary healing to one other wounded ally within 180u; Entangle heals +3 per tick; Land fields grant +20% allied movement and healing fields gain +2 per tick, while direct strikes slow foes to 75% for 2s',
    (a) => {
      if (a.a2.kind === 'heal') a.a2.relayHeal = { fraction: 0.35, radius: 180 };
      else amplify(a.a2, 0.2, 0.1);
      if (a.a1.kind === 'groundZone' && a.a1.zoneTickHeal) addN(a.a1, 'zoneTickHeal', 3);
    },
    (ab) => {
      if (ab.kind === 'groundZone') {
        ab.zoneAllyMoveMult = Math.max(ab.zoneAllyMoveMult ?? 1, 1.2);
        if (ab.zoneTickHeal) addN(ab, 'zoneTickHeal', 2);
      } else if (isStrike(ab)) slowRider(ab, 0.75, 2);
      else if (ab.kind === 'heal') addN(ab, 'damage', 15);
    },
  ),

  // Bard
  pilotIdentity(
    'ba_valor',
    'ba_valor_g_a',
    'Hero’s Ballad',
    '🎺',
    'Vicious Mockery and direct Valor strikes gain +25% damage against controlled foes; Dissonant Whispers leeches 20%. Valor utilities ready a +30% melee counter after guarded damage within 4s',
    (a) => {
      if (isStrike(a.basic) && a.basic.damage > 0) addN(a.basic, 'controlDamageBonus', 0.25);
      else amplify(a.basic, 0.2, 0.1);
      if (isStrike(a.a3) && a.a3.damage > 0) lifeRider(a.a3, 0.2);
      else amplify(a.a3, 0.2, 0.1);
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) addN(ab, 'controlDamageBonus', 0.25);
      else if (ab.kind === 'selfBuff') ab.guardWindow = Math.max(ab.guardWindow ?? 0, 4);
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'ba_valor',
    'ba_valor_g_b',
    'Battle Rhapsody',
    '🥁',
    'Dissonant Whispers delays wind-ups 30% for 3s; effective Healing Word grants 20% movement for 3s. Direct Valor strikes leech 20%; utilities ward other allies 15% within 180u for 4s',
    (a) => {
      if (isStrike(a.a3) && a.a3.damage > 0) casterSuppression(a.a3);
      else amplify(a.a3, 0.2, 0.1);
      casterGrand('heal', (ab) => supportHealBoon(ab, 'buffMoveMult', 1.2, 3), ['bardSong'])(a.a2);
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) lifeRider(ab, 0.2);
      else if (ab.kind === 'selfBuff') supportSharedWard(ab);
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'ba_whispers',
    'ba_whispers_g_a',
    'Voice of Madness',
    '😱',
    'Private Nightmare projects 100u beyond the marked foe in your aim direction: choose which side it retreats toward. Heal, blink and Discord spends use this directed placement. No extra damage or fear duration.',
    (a) => {
      for (const ab of Object.values(a)) ab.whisperIdentity = 'directed';
    },
    (ab) => {
      ab.whisperIdentity = 'directed';
    },
  ),
  pilotIdentity(
    'ba_whispers',
    'ba_whispers_g_b',
    'Unheard Dirge',
    '🌫️',
    'Spend secrets on a stationary false quarry instead of fear. The marked foe pursues it and aims its next targeted attack there; normal damage still hits anyone nearby. Decoy lasts 6s; committed attacks never retarget.',
    (a) => {
      for (const ab of Object.values(a)) ab.whisperIdentity = 'quarry';
    },
    (ab) => {
      ab.whisperIdentity = 'quarry';
    },
  ),

  // Monk
  pilotIdentity(
    'mo_openhand',
    'mo_openhand_g_a',
    'Perfect Harmony',
    '👊',
    'Step of the Wind and Open Hand Flow utilities prepare Flow 2s longer; basics extend it faster within the same 1s budget; direct specials gain +25% damage against controlled foes',
    (a) => {
      addN(a.a2, 'prepareFlow', 2);
      addN(a.basic, 'flowExtendOnHit', 0.25);
      for (const ab of [a.a1, a.a3]) addN(ab, 'controlDamageBonus', 0.25);
    },
    (ab) => {
      if (ab.prepareFlow) addN(ab, 'prepareFlow', 2);
      if (isStrike(ab)) addN(ab, 'controlDamageBonus', 0.25);
    },
  ),
  pilotIdentity(
    'mo_openhand',
    'mo_openhand_g_b',
    'Flowing Water',
    '🌊',
    'Step of the Wind heals 15 more and resists hard control for 2s; Quivering Palm leeches 20%; Open Hand direct strikes leech 15%, Wind Step resists control, and Wholeness of Body cleanses',
    (a) => {
      a.a2.steadfastDuration = Math.max(a.a2.steadfastDuration ?? 0, 2);
      addN(a.a2, 'healOnUse', 15);
      addN(a.a3, 'lifestealFrac', 0.2);
    },
    (ab) => {
      if (isStrike(ab)) lifeRider(ab, 0.15);
      if (ab.kind === 'dash') ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 2);
      if (ab.kind === 'selfBuff' && ab.healOnUse) ab.cleanseOnHeal = true;
    },
  ),
  pilotIdentity(
    'mo_shadow',
    'mo_shadow_g_a',
    'Shadow Incarnate',
    '🌑',
    'Step of the Wind and Shadow Step prepare a precision critical for 4s; Stunning Strike, Quivering Palm, Shadow Dart and Shadow Strike can spend it; Cloud of Shadow also prepares precision',
    (a) => {
      a.a2.prepareCrit = Math.max(a.a2.prepareCrit ?? 0, 4);
      a.a1.consumesPrecision = true;
      a.a3.consumesPrecision = true;
    },
    (ab) => {
      if (isStrike(ab)) ab.consumesPrecision = true;
      if (ab.kind === 'blink' || ab.kind === 'groundZone')
        ab.prepareCrit = Math.max(ab.prepareCrit ?? 0, 4);
    },
  ),
  pilotIdentity(
    'mo_shadow',
    'mo_shadow_g_b',
    'Silent Death',
    '🥷',
    'Step of the Wind heals 15 more and prepares Flow 0.5s longer; Stunning Strike, Quivering Palm and damaging Shadow skills slow wind-ups by 30%; Shadow Step prepares Flow 0.5s longer and grants 2s hard-control resistance',
    (a) => {
      addN(a.a2, 'healOnUse', 15);
      addN(a.a2, 'prepareFlow', 0.5);
      for (const ab of [a.a1, a.a3]) {
        ab.castSlow = Math.max(ab.castSlow ?? 1, 1.3);
        ab.castSlowDuration = Math.max(ab.castSlowDuration ?? 0, 3);
      }
    },
    (ab) => {
      if (isStrike(ab) || ab.kind === 'groundZone') {
        ab.castSlow = Math.max(ab.castSlow ?? 1, 1.3);
        ab.castSlowDuration = Math.max(ab.castSlowDuration ?? 0, 3);
      }
      if (ab.kind === 'blink') {
        addN(ab, 'prepareFlow', 0.5);
        ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 2);
      }
    },
  ),

  // Sorcerer — actual flight, controlled delivery, basic surge spending and mobility.
  pilotIdentity(
    'so_draconic',
    'so_draconic_g_a',
    'True Dragon',
    '🐉',
    'Surge Ascent grants 4s flight and a 4s shield for 15% max HP (minimum 30); existing flight gains 2s, up to 9s. Mirror Image and Wings gain +10% speed; Draconic strikes deal 10% more damage',
    (a) => casterGrand('selfBuff', (ab) => addN(ab, 'buffMoveMult', 0.1), ['buffMoveMult'])(a.a2),
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) mul(ab, 'damage', 1.1);
      else if (ab.kind === 'selfBuff' && ab.grantsFlight && ab.buffMoveMult)
        addN(ab, 'buffMoveMult', 0.1);
      else amplify(ab, 0.15, 0.1);
    },
  ),
  pilotIdentity(
    'so_draconic',
    'so_draconic_g_b',
    "Wyrm's Pursuit",
    '🌈',
    'Chaos Bolt slows foes 20% for 2s, setting up Meteor for +30% controlled-target damage; direct Draconic strikes gain +25%, and Wings grant 3s hard-control resistance',
    (a) => {
      if (isStrike(a.basic) && a.basic.damage > 0) slowRider(a.basic, 0.8, 2);
      else amplify(a.basic, 0.2, 0.1);
      if (isStrike(a.a1) && a.a1.damage > 0) addN(a.a1, 'controlDamageBonus', 0.3);
      else amplify(a.a1, 0.2, 0.1);
    },
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) addN(ab, 'controlDamageBonus', 0.25);
      else if (ab.kind === 'selfBuff' && ab.grantsFlight)
        ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 3);
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'so_wild',
    'so_wild_g_a',
    'Unbound Chaos',
    '🎲',
    'Chaos Bolt can spend Surge for an extra bolt and +20% total damage. Wild strikes deal 15% more damage; Bend Luck weakens enemy damage by 25%; Wild Ward heals 20% more across a 10% wider area',
    (a) =>
      casterGrand(
        'projectile',
        (ab) => {
          ab.consumesSurge = true;
          ab.surgeTwin = true;
        },
        [],
        true,
      )(a.basic),
    (ab) => {
      if (isStrike(ab) && ab.damage > 0) mul(ab, 'damage', 1.15);
      else if (ab.fortune)
        ab.fortune = { ...ab.fortune, damageMult: Math.min(ab.fortune.damageMult, 0.75) };
      else amplify(ab, 0.2, 0.1);
    },
  ),
  pilotIdentity(
    'so_wild',
    'so_wild_g_b',
    'Chaos Crossing',
    '🌀',
    'Mirror Image gains +15% movement speed; Arcane Phase reaches 50u farther and grants 3s hard-control resistance. Bend Luck heals 25, Wild Ward grants allies 25% movement, and Wild strikes slow foes 25% for 2s',
    (a) => {
      casterGrand('selfBuff', (ab) => addN(ab, 'buffMoveMult', 0.15), ['buffMoveMult'])(a.a2);
      casterGrand('blink', (ab) => {
        addN(ab, 'range', 50);
        ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 3);
      })(a.a3);
    },
    (ab) => {
      if (ab.kind === 'blink' || ab.fortune) addN(ab, 'healOnUse', 25);
      else if (ab.kind === 'groundZone' && ab.zoneTickHeal)
        ab.zoneAllyMoveMult = Math.max(ab.zoneAllyMoveMult ?? 1, 1.25);
      else if (isStrike(ab) && ab.damage > 0) slowRider(ab, 0.75, 2);
      else amplify(ab, 0.2, 0.1);
    },
  ),

  // Warlock — every identity has a base-kit payoff before a second subclass skill.
  pilotIdentity(
    'wa_fiend',
    'wa_fiend_g_a',
    'Infernal Aperture',
    '🔥',
    'Blessing opens a fixed 6s firing conduit, 80u entrance to 320u exit along your aim. Aim shots through its entrance; press Blessing again for one 22-damage ember',
    (a) => {
      a.a3.buffMoveMult = Math.max(a.a3.buffMoveMult ?? 1, 1.2);
      a.a3.infernalAperture = { duration: 6, reach: 320, radius: 24, emberDamage: 22 };
    },
    () => {},
  ),
  pilotIdentity(
    'wa_fiend',
    'wa_fiend_g_b',
    'Infernal Pact',
    '😈',
    'Blessing also grants 20 protection for 6s; direct spells drain health and Resilience siphons more from one cursed foe',
    (a) => {
      a.a3.absorption = { amount: 20, balanceAmount: 0, duration: 6, target: 'self' };
      addN(a.basic, 'lifestealFrac', 0.1);
      addN(a.a2, 'lifestealFrac', 0.1);
    },
    (ab) => {
      lifeRider(ab, 0.1);
      if (ab.kind === 'groundZone') ab.zoneAllyDefMult = Math.min(ab.zoneAllyDefMult ?? 1, 0.9);
      if (ab.absorption?.curseSiphon)
        ab.absorption = {
          ...ab.absorption,
          curseSiphon: {
            ...ab.absorption.curseSiphon,
            amount: ab.absorption.curseSiphon.amount + 10,
          },
        };
    },
  ),
  pilotIdentity(
    'wa_great_old_one',
    'wa_great_old_one_g_a',
    'Elder Mind',
    '🐙',
    'Your direct spells weaken personally cursed foes; Hex and Dissonant Whispers linger 2s longer',
    (a) => {
      a.basic.cursePayoff = Math.max(a.basic.cursePayoff ?? 0, 3);
      a.a2.cursePayoff = Math.max(a.a2.cursePayoff ?? 0, 3);
      addN(a.a1, 'zoneDuration', 2);
    },
    (ab) => {
      if (isStrike(ab)) {
        ab.cursePayoff = Math.max(ab.cursePayoff ?? 0, 3);
        slowRider(ab, 0.75, 2);
      }
      if (ab.kind === 'groundZone') addN(ab, 'zoneDuration', 2);
      if (ab.kind === 'blink') addN(ab, 'healOnUse', 12);
    },
  ),
  pilotIdentity(
    'wa_great_old_one',
    'wa_great_old_one_g_b',
    'Whispered Doom',
    '🔮',
    'Blessing prepares an 8s spell surge; Rebuke or direct Great Old One spells consume it for a stronger, quicker cast',
    (a) => {
      a.a3.prepareSurge = Math.max(a.a3.prepareSurge ?? 0, 8);
      a.a2.consumesSurge = true;
    },
    (ab) => {
      if (ab.kind === 'blink' || ab.kind === 'selfBuff')
        ab.prepareSurge = Math.max(ab.prepareSurge ?? 0, 8);
      else if (ab.kind === 'groundZone') ab.prepareSurge = Math.max(ab.prepareSurge ?? 0, 8);
      else if (isStrike(ab)) ab.consumesSurge = true;
    },
  ),
];

// One authored grand per individual subclass skill; only the equipped recipient is tuned.
function gsk(
  subSkillId: string,
  name: string,
  icon: string,
  desc: string,
  tune: (ab: PlayerAbilityDef) => void,
): CharUpgradeDef {
  return {
    id: `${subSkillId}_g`,
    classId: subclassOfSkill(subSkillId)!.classId,
    subSkillId,
    name,
    icon,
    desc,
    grand: true,
    maxStacks: 1,
    apply: ({ subAbilities }) => {
      if (!subAbilities) return;
      for (const slot of SUB_SLOTS) if (subAbilities[slot]) tune(subAbilities[slot]);
    },
  };
}

export const PILOT_SUB_SKILL_GRANDS: CharUpgradeDef[] = [
  // Cleric, Paladin and Bard — one authored recipe per bound skill.
  gsk(
    'cl_light_flare',
    'Dawning Reversal',
    '🌟',
    'Radiance pushes struck foes 150u outward and deals +8 damage',
    supportGrand('cl_light_flare', (ab) => {
      ab.knockback = Math.max(ab.knockback ?? 0, 150);
      ab.pull = undefined;
      addN(ab, 'damage', 8);
    }),
  ),
  gsk(
    'cl_light_beam',
    'Guiding Lance',
    '☀️',
    'Guiding Bolt pierces two foes and gains +180 speed',
    supportGrand('cl_light_beam', (ab) => {
      addN(ab, 'pierce', 2);
      addN(ab, 'projSpeed', 180);
    }),
  ),
  gsk(
    'cl_light_flash',
    'Afterglow',
    '✨',
    'Effective Flash of Light leaves a 90u recovery grove for 3s, healing 5/tick; +15 healing',
    supportGrand('cl_light_flash', (ab) => {
      ab.recoveryZone = { radius: 90, duration: 3, tickHeal: 5 };
      addN(ab, 'damage', 15);
    }),
  ),
  gsk(
    'cl_light_warding',
    'Flareguard',
    '🛡️',
    'Warding Flare also gives you one frontal block for 4s',
    supportGrand('cl_light_warding', (ab) => {
      casterGuard(ab, 1, 4);
    }),
  ),
  gsk(
    'cl_life_bloom',
    'Pilgrim Bloom',
    '🌸',
    'Blessed Bloom damages grounded foes for 6/tick and follows its first damaged foe for up to 6s',
    supportGrand('cl_life_bloom', (ab) => {
      addN(ab, 'zoneTickDamage', 6);
      ab.zoneFollow = Math.max(ab.zoneFollow ?? 0, 6);
    }),
  ),
  gsk(
    'cl_life_mend',
    'Unburdening Cure',
    '💚',
    'Mass Cure cleanses movement ailments from its primary recipient and restores +20 HP',
    supportGrand('cl_life_mend', (ab) => {
      ab.cleanseOnHeal = true;
      addN(ab, 'damage', 20);
    }),
  ),
  gsk(
    'cl_life_preserve',
    'Life’s Vigil',
    '🕊️',
    'Preserve Life gives you two frontal blocks for 4s',
    supportGrand('cl_life_preserve', (ab) => {
      casterGuard(ab, 2, 4);
    }),
  ),
  gsk(
    'cl_life_smite',
    'Reproving Blow',
    '🔨',
    'Reproach pushes struck foes 140u outward and gains +10 damage',
    supportGrand('cl_life_smite', (ab) => {
      ab.knockback = Math.max(ab.knockback ?? 0, 140);
      ab.pull = undefined;
      addN(ab, 'damage', 10);
    }),
  ),
  gsk(
    'pa_devotion_smite',
    'Magnetic Oath',
    '🌟',
    'Divine Smite pulls struck foes 120u inward and gains +8 damage',
    supportGrand('pa_devotion_smite', (ab) => {
      ab.pull = Math.max(ab.pull ?? 0, 120);
      ab.knockback = undefined;
      addN(ab, 'damage', 8);
    }),
  ),
  gsk(
    'pa_devotion_sanctuary',
    'Guarded Weapon',
    '⚔️',
    'Sacred Weapon blocks one frontal hit for 4s',
    supportGrand('pa_devotion_sanctuary', (ab) => {
      casterGuard(ab, 1, 4);
    }),
  ),
  gsk(
    'pa_devotion_bless',
    'Blessed Reprisal',
    '🙏',
    'Effective Bless grants its recipient +25% damage for 4s and restores +15 HP',
    supportGrand('pa_devotion_bless', (ab) => {
      supportHealBoon(ab, 'buffDamageMult', 1.25, 4);
      addN(ab, 'damage', 15);
    }),
  ),
  gsk(
    'pa_devotion_aura',
    'Unbroken Circle',
    '🛡️',
    'Aura of Protection cleanses you and adds 4s hard-control resistance',
    supportGrand('pa_devotion_aura', (ab) => {
      ab.cleanseOnHeal = true;
      ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 4);
    }),
  ),
  gsk(
    'pa_vengeance_hunt',
    'Unflinching Hunt',
    '🎯',
    'Hunter’s Vow blocks one frontal hit for 4s',
    supportGrand('pa_vengeance_hunt', (ab) => {
      casterGuard(ab, 1, 4);
    }),
  ),
  gsk(
    'pa_vengeance_shackle',
    'Gather the Guilty',
    '⛓️',
    'Vow of Enmity pulls struck foes 140u inward and gains +10 damage',
    supportGrand('pa_vengeance_shackle', (ab) => {
      ab.pull = Math.max(ab.pull ?? 0, 140);
      ab.knockback = undefined;
      addN(ab, 'damage', 10);
    }),
  ),
  gsk(
    'pa_vengeance_charge',
    'Guardian Crossing',
    '💨',
    'Avenging Charge heals you 25, travels +40u, and cleanses and guards the first ally actually crossed for 3s',
    supportGrand('pa_vengeance_charge', (ab) => {
      addN(ab, 'healOnUse', 25);
      addN(ab, 'range', 40);
      ab.crossingGuard = { width: 36, duration: 3 };
    }),
  ),
  gsk(
    'pa_vengeance_smite',
    'Exiling Judgment',
    '🔥',
    'Wrathful Smite pushes struck foes 150u outward and reaches +20u',
    supportGrand('pa_vengeance_smite', (ab) => {
      ab.knockback = Math.max(ab.knockback ?? 0, 150);
      ab.pull = undefined;
      addN(ab, 'range', 20);
    }),
  ),
  gsk(
    'ba_valor_blade',
    'Sweeping Flourish',
    '🗡️',
    'Blade Flourish pushes struck foes 120u outward and deals +10 damage',
    supportGrand('ba_valor_blade', (ab) => {
      ab.knockback = Math.max(ab.knockback ?? 0, 120);
      ab.pull = undefined;
      addN(ab, 'damage', 10);
    }),
  ),
  gsk(
    'ba_valor_inspire',
    'Steadfast Hymn',
    '🎺',
    'Battle Hymn cleanses you and adds 4s hard-control resistance',
    supportGrand('ba_valor_inspire', (ab) => {
      ab.cleanseOnHeal = true;
      ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 4);
    }),
  ),
  gsk(
    'ba_valor_bolster',
    'Resounding Courage',
    '🛡️',
    'Bolster readies a 24-damage, 90u burst for 5s; land a direct hit within 100u to release it, slowing foes 25% for 2s',
    supportGrand('ba_valor_bolster', (ab) => {
      ab.closeBurst = {
        damage: 24,
        radius: 90,
        range: 100,
        duration: 5,
        slowMult: 0.75,
        slowDuration: 2,
      };
    }),
  ),
  gsk(
    'ba_valor_shatter',
    'Shattering Retort',
    '💥',
    'Shatter gains +10 damage and arms a 4s retort for 40% of its damage, released by incoming damage or your next positive direct hit',
    supportGrand('ba_valor_shatter', (ab) => {
      addN(ab, 'damage', 10);
      ab.rebukeDuration = Math.max(ab.rebukeDuration ?? 0, 4);
      ab.rebukeDirect = true;
    }),
  ),
  gsk(
    'ba_whispers_words',
    'Pursuing Dread',
    '😱',
    'Words follows its first damaged foe for up to 6s, gains +15u radius, and charms one damaged add per cast for 4s to fight its former allies. Bosses cannot be converted. A secret apparition stays fixed at its original center',
    supportGrand('ba_whispers_words', (ab) => {
      ab.zoneFollow = Math.max(ab.zoneFollow ?? 0, 6);
      addN(ab, 'radius', 15);
      ab.apparition = { mode: 'charm', duration: 4 };
    }),
  ),
  gsk(
    'ba_whispers_wound',
    'Shattering Secret',
    '🔪',
    'Psychic Blade bursts across 60u on impact and deals +8 damage',
    supportGrand('ba_whispers_wound', (ab) => {
      ab.impactRadius = Math.max(ab.impactRadius ?? 0, 60);
      addN(ab, 'damage', 8);
    }),
  ),
  gsk(
    'ba_whispers_mantle',
    'Lingering Performance',
    '🌫️',
    'Mantle’s chorus afterimage echoes one additional direct cast (4 total)',
    supportGrand('ba_whispers_mantle', (ab) => {
      if (ab.whisperRefrain) ab.whisperRefrain = { ...ab.whisperRefrain, charges: 4 };
    }),
  ),
  gsk(
    'ba_whispers_song',
    'Shared Refrain',
    '🎶',
    'Healing Refrain restores +15 HP and relays 40% of effective primary healing to one other injured ally within 180u',
    supportGrand('ba_whispers_song', (ab) => {
      addN(ab, 'damage', 15);
      ab.relayHeal = {
        fraction: Math.max(ab.relayHeal?.fraction ?? 0, 0.4),
        radius: Math.max(ab.relayHeal?.radius ?? 0, 180),
      };
    }),
  ),
  // Mage and Sorcerer — one authored recipe per bound skill.
  gsk(
    'mg_evoker_lightning',
    'Conducting Lance',
    '⚡',
    'Lightning Bolt pierces three additional foes and travels 150u/s faster',
    casterGrand(
      'projectile',
      (ab) => {
        addN(ab, 'pierce', 3);
        addN(ab, 'projSpeed', 150);
      },
      [],
      true,
    ),
  ),
  gsk(
    'mg_evoker_cone',
    'Crystalline Edge',
    '❄️',
    'Cone of Cold freezes struck foes for 0.9s and reaches 35u farther',
    casterGrand('meleeCone', (ab) => {
      addN(ab, 'freeze', 0.9);
      addN(ab, 'range', 35);
    }),
  ),
  gsk(
    'mg_evoker_sculpt',
    'Sculpted Retort',
    '💥',
    'Sculpted Blast gains +10 damage and arms a 4s retort for 40% of its damage; incoming damage or your next positive direct hit releases it once',
    casterGrand('pbaoe', (ab) => {
      addN(ab, 'damage', 10);
      ab.rebukeDuration = Math.max(ab.rebukeDuration ?? 0, 4);
      ab.rebukeDirect = true;
    }),
  ),
  gsk(
    'mg_evoker_shield',
    'Siphoning Shield',
    '🛡️',
    'Arcane Shield gains +12 cone damage and heals you for 35% of its effective damage',
    casterGrand(
      'meleeCone',
      (ab) => {
        addN(ab, 'damage', 12);
        addN(ab, 'lifestealFrac', 0.35);
      },
      ['absorption', 'knockback'],
    ),
  ),
  gsk(
    'mg_abjurer_ward',
    'Warding Reversal',
    '🔷',
    'Arcane Ward pushes struck foes outward at least 160u and gains +10 burst damage',
    casterGrand(
      'pbaoe',
      (ab) => {
        delete ab.pull;
        ab.knockback = Math.max(ab.knockback ?? 0, 160);
        addN(ab, 'damage', 10);
      },
      ['absorption'],
    ),
  ),
  gsk(
    'mg_abjurer_bind',
    'Sanctum Prison',
    '🌀',
    'Allies inside Otiluke Bind take 20% less damage and its radius grows by 20u',
    casterGrand(
      'groundZone',
      (ab) => {
        ab.zoneAllyDefMult = Math.min(ab.zoneAllyDefMult ?? 1, 0.8);
        addN(ab, 'radius', 20);
      },
      ['zoneTickDamage', 'roots', 'airborne'],
    ),
  ),
  gsk(
    'mg_abjurer_teleport',
    'Guarded Door',
    '🚪',
    'Dimension Door reaches 40u farther and blocks one frontal damage hit for 4s; its endpoint exchange and relocation slow are unchanged',
    casterGrand(
      'blink',
      (ab) => {
        addN(ab, 'range', 40);
        casterGuard(ab, 1, 4);
      },
      ['swap'],
    ),
  ),
  gsk(
    'mg_abjurer_mend',
    'Rescuing Transfer',
    '💚',
    'Life Transfer heals 15 more; effective healing from 35% HP or below readies the recipient’s next direct hit for +25% damage within 5s',
    casterGrand(
      'heal',
      (ab) => {
        addN(ab, 'damage', 15);
        ab.rescueStrike = {
          mult: Math.max(ab.rescueStrike?.mult ?? 1, 1.25),
          duration: Math.max(ab.rescueStrike?.duration ?? 0, 5),
        };
      },
      ['absorption'],
    ),
  ),
  gsk(
    'so_draconic_breath',
    'Driving Breath',
    '🐉',
    'Dragon Breath pushes struck foes at least 150u outward and gains +8 damage',
    casterGrand(
      'meleeCone',
      (ab) => {
        delete ab.pull;
        ab.knockback = Math.max(ab.knockback ?? 0, 150);
        addN(ab, 'damage', 8);
      },
      ['consumesSurge'],
    ),
  ),
  gsk(
    'so_draconic_wing',
    'Sheltering Wings',
    '🪽',
    'Dragon Wings gain +10% movement speed and give other living allies within 180u 20% damage mitigation for 4s',
    casterGrand(
      'selfBuff',
      (ab) => {
        addN(ab, 'buffMoveMult', 0.1);
        casterSharedWard(ab);
      },
      ['grantsFlight', 'buffMoveMult', 'prepareSurge'],
    ),
  ),
  gsk(
    'so_draconic_bolt',
    'Chromatic Hindrance',
    '🌈',
    'Chromatic Bolt gains +12 damage and lengthens struck foes’ wind-ups by 40% for 3s',
    casterGrand(
      'projectile',
      (ab) => {
        addN(ab, 'damage', 12);
        casterSuppression(ab, 1.4);
      },
      ['consumesSurge'],
    ),
  ),
  gsk(
    'so_draconic_scales',
    'Molten Reprisal',
    '🛡️',
    'Draconic Scales gains +18 burst damage and arms one 4s retort for 40% of its damage, released by incoming damage or your next positive direct hit',
    casterGrand(
      'pbaoe',
      (ab) => {
        addN(ab, 'damage', 18);
        ab.rebukeDuration = Math.max(ab.rebukeDuration ?? 0, 4);
        ab.rebukeDirect = true;
      },
      ['absorption', 'consumesSurge'],
    ),
  ),
  gsk(
    'so_wild_surge',
    'Focused Chaos',
    '🎯',
    'Chaos Surge concentrates its six-bolt fan to 14° and gains +150 projectile speed',
    casterGrand(
      'projectile',
      (ab) => {
        ab.spreadDeg = Math.min(ab.spreadDeg ?? 0, 14);
        addN(ab, 'projSpeed', 150);
      },
      ['consumesSurge', 'projCount'],
      true,
    ),
  ),
  gsk(
    'so_wild_tides',
    'Gravitic Tides',
    '🌀',
    'Tides of Chaos pulls struck foes at least 140u inward and gains +10 damage',
    casterGrand(
      'pbaoe',
      (ab) => {
        delete ab.knockback;
        ab.pull = Math.max(ab.pull ?? 0, 140);
        addN(ab, 'damage', 10);
      },
      ['consumesSurge'],
    ),
  ),
  gsk(
    'so_wild_bend',
    'Loaded Fate',
    '🍀',
    'Bend Luck’s fortunate hit marks its victim for 5s: your next direct hit from a later cast deals 20% more damage',
    casterGrand(
      'selfBuff',
      (ab) => {
        ab.fortune = { ...ab.fortune!, markBonus: Math.max(ab.fortune!.markBonus ?? 0, 0.2) };
      },
      ['prepareSurge', 'fortune'],
    ),
  ),
  gsk(
    'so_wild_font',
    'Sheltering Chaos',
    '🛡️',
    'Allies inside Wild Ward take 20% less damage, even at full health',
    casterGrand(
      'groundZone',
      (ab) => {
        ab.zoneAllyDefMult = Math.min(ab.zoneAllyDefMult ?? 1, 0.8);
      },
      ['zoneTickHeal', 'prepareSurge'],
    ),
  ),
  gsk(
    'kn_champion_slam',
    'Turning Earth',
    '💥',
    'Earthshaker draws foes inward with at least a 140u pull instead of pushing them away, and gains +8 damage; Honed force is retained',
    (ab) => {
      ab.pull = Math.max(ab.pull ?? 0, (ab.knockback ?? 110) + 30);
      delete ab.knockback;
      addN(ab, 'damage', 8);
    },
  ),
  gsk(
    'kn_champion_charge',
    'Breakthrough',
    '🐂',
    'Bull Rush gains +10 landing damage and one frontal block for 3s; blocking readies a 30% stronger melee counter',
    (ab) => {
      addN(ab, 'landingDamage', 10);
      ab.frontGuard = { charges: 1, duration: 3, counter: 1.3 };
    },
  ),
  gsk(
    'kn_champion_rally',
    'Unspent Resolve',
    '💚',
    'Second Wind also grants 25 absorption for 4s, even at full health',
    (ab) => {
      ab.absorption = { amount: 25, duration: 4, target: 'self' };
    },
  ),
  gsk(
    'kn_champion_riposte',
    'Reaching Reprise',
    '⚔️',
    'Riposte reaches 25u farther and leeches 20% of its damage',
    (ab) => {
      addN(ab, 'range', 25);
      addN(ab, 'lifestealFrac', 0.2);
    },
  ),
  gsk(
    'kn_battle_trip',
    'Exploit Footing',
    '🔨',
    'Trip Attack gains +12 damage and +25% damage against already controlled foes',
    (ab) => {
      addN(ab, 'damage', 12);
      addN(ab, 'controlDamageBonus', 0.25);
    },
  ),
  gsk(
    'kn_battle_menacing',
    'Guarded Challenge',
    '📣',
    'Menacing Roar grants two frontal blocks for 3s; each block readies a 30% stronger melee counter',
    (ab) => {
      ab.frontGuard = { charges: 2, duration: 3, counter: 1.3 };
    },
  ),
  gsk(
    'kn_battle_precision',
    'Pinning Volley',
    '🎯',
    'Precision Volley pierces one extra foe per blade and slows struck foes to 70% for 2s',
    (ab) => {
      ab.pierce = Math.max(ab.pierce ?? 0, 1);
      slowRider(ab, 0.7, 2);
    },
  ),
  gsk(
    'kn_battle_rally',
    'Rescue Formation',
    '🛡️',
    'Rally cleanses its recipient; an effective rescue at 35% HP or less prepares their next direct hit for +20% damage within 4s',
    (ab) => {
      ab.cleanseOnHeal = true;
      ab.rescueStrike = { mult: 1.2, duration: 4 };
    },
  ),
  gsk(
    'bb_berserker_frenzy',
    'Measured Madness',
    '😤',
    'Frenzy grants one frontal block for 4s; blocking readies a 30% stronger melee counter',
    (ab) => {
      ab.frontGuard = { charges: 1, duration: 4, counter: 1.3 };
    },
  ),
  gsk(
    'bb_berserker_reckless',
    'Reaping Arc',
    '🪓',
    'Reckless Cleave sweeps a full circle and gains +12 damage; Momentum still adds reach',
    (ab) => {
      ab.halfAngleDeg = 180;
      addN(ab, 'damage', 12);
    },
  ),
  gsk(
    'bb_berserker_slam',
    'Lingering Fault',
    '💥',
    'Ground Slam slows struck foes to 70% for 2s; each Momentum stack adds 3 more fissure damage per tick',
    (ab) => {
      addN(ab, 'momentumFissure', 3);
      slowRider(ab, 0.7, 2);
    },
  ),
  gsk(
    'bb_berserker_chain',
    'Binding Chain',
    '⛓️',
    'Chain Pull reaches 60u farther and stuns struck foes for 0.65s',
    (ab) => {
      addN(ab, 'range', 60);
      ab.stun = Math.max(ab.stun ?? 0, 0.65);
    },
  ),
  gsk(
    'bb_totem_bear',
    'Bear’s Reserve',
    '🐻',
    'Bear Spirit adds 25 absorption for 4s to its existing frontal blocks and control resistance',
    (ab) => {
      ab.absorption = { amount: 25, duration: 4, target: 'self' };
    },
  ),
  gsk(
    'bb_totem_wolf',
    'Watchful Hunt',
    '🐺',
    'Wolf Spirit grants one frontal block for 4s; blocking readies a 30% stronger melee counter while you hunt',
    (ab) => {
      ab.frontGuard = { charges: 1, duration: 4, counter: 1.3 };
    },
  ),
  gsk(
    'bb_totem_quake',
    'Sheltering Earth',
    '🌍',
    'Allies inside Earth Totem gain 20% movement speed and 15% damage mitigation',
    (ab) => {
      ab.zoneAllyMoveMult = Math.max(ab.zoneAllyMoveMult ?? 1, 1.2);
      ab.zoneAllyDefMult = Math.min(ab.zoneAllyDefMult ?? 1, 0.85);
    },
  ),
  gsk(
    'bb_totem_mend',
    'Spirit Reserve',
    '💚',
    'Spirit Mend grants 25 absorption for 4s, including at full health',
    (ab) => {
      ab.absorption = { amount: 25, duration: 4, target: 'self' };
    },
  ),
  gsk(
    'mo_openhand_flurry',
    'Parting Barrage',
    '👊',
    'Flurry Barrage gains +12 damage and +15u reach, and pushes struck foes back 120u',
    (ab) => {
      addN(ab, 'damage', 12);
      addN(ab, 'range', 15);
      ab.knockback = 120;
      delete ab.pull;
    },
  ),
  gsk(
    'mo_openhand_wave',
    'Returning Tide',
    '🌊',
    'Wave Palm pulls struck foes at least 140u inward instead of pushing them away, and gains +10 damage; Honed force is retained',
    (ab) => {
      ab.pull = Math.max(ab.pull ?? 0, (ab.knockback ?? 100) + 40);
      delete ab.knockback;
      addN(ab, 'damage', 10);
    },
  ),
  gsk(
    'mo_openhand_wind',
    'Sheltered Crossing',
    '🍃',
    'Wind Step grants you 20 absorption for 4s',
    (ab) => {
      ab.absorption = { amount: 20, duration: 4, target: 'self' };
    },
  ),
  gsk(
    'mo_openhand_ki',
    'Whole in Spirit',
    '💚',
    'Wholeness of Body grants 25 absorption for 4s, even at full health',
    (ab) => {
      ab.absorption = { amount: 25, duration: 4, target: 'self' };
    },
  ),
  gsk(
    'mo_shadow_dart',
    'Splintering Dart',
    '🌑',
    'Shadow Dart gains +10 damage and bursts in a 65u impact radius; Flow still adds its stun',
    (ab) => {
      addN(ab, 'damage', 10);
      ab.impactRadius = Math.max(ab.impactRadius ?? 0, 65);
    },
  ),
  gsk(
    'mo_shadow_step',
    'Guarded Arrival',
    '🌫️',
    'Shadow Step heals 15 on use and blocks one frontal hit for 3s; blocking readies a 30% stronger melee counter',
    (ab) => {
      addN(ab, 'healOnUse', 15);
      ab.frontGuard = { charges: 1, duration: 3, counter: 1.3 };
    },
  ),
  gsk(
    'mo_shadow_cloud',
    'Creeping Shadow',
    '💨',
    'Cloud of Shadow follows its first damaged foe for 3s and lasts 1s longer',
    (ab) => {
      ab.zoneFollow = Math.max(ab.zoneFollow ?? 0, 3);
      addN(ab, 'zoneDuration', 1);
    },
  ),
  gsk(
    'mo_shadow_strike',
    'Unerring Ambush',
    '🥷',
    'Shadow Strike gains 25% critical chance and +15u reach',
    (ab) => {
      addN(ab, 'critChanceBonus', 0.25);
      addN(ab, 'range', 15);
    },
  ),

  gsk(
    'rg_hunter_hail',
    'Driving Hail',
    '🌿',
    'Hail of Thorns pushes 180u instead of 90u, enough to overpower roots, and gains +10 damage',
    natureGrand('pbaoe', (ab) => {
      ab.knockback = Math.max(ab.knockback ?? 0, 90) + 90;
      addN(ab, 'damage', 10);
    }),
  ),
  gsk(
    'rg_hunter_mark',
    'Shattering Quarry',
    '🎯',
    'Quarry Shot bursts across 65u on impact and gains +8 damage',
    natureGrand('projectile', (ab) => {
      ab.impactRadius = Math.max(ab.impactRadius ?? 0, 65);
      addN(ab, 'damage', 8);
    }),
  ),
  gsk(
    'rg_hunter_stand',
    'Sheltering Stand',
    '🛡️',
    'Stand as One gives allies inside 20% damage mitigation',
    natureGrand('groundZone', (ab) => {
      ab.zoneAllyDefMult = Math.min(ab.zoneAllyDefMult ?? 1, 0.8);
    }),
  ),
  gsk(
    'rg_hunter_volley',
    'Concentrated Volley',
    '🏹',
    'Volley narrows to a 14° fan and gains +4 damage per arrow, trading wide coverage for focused pressure',
    natureGrand('projectile', (ab) => {
      ab.spreadDeg = 14;
      addN(ab, 'damage', 4);
    }),
  ),
  gsk(
    'rg_beast_pounce',
    'Pack Crossing',
    '🐺',
    'Pounce cleanses and guards the first living ally actually crossed for 3s along a 45u corridor',
    natureGrand('dash', (ab) => {
      ab.crossingGuard = { width: 45, duration: 3 };
    }),
  ),
  gsk(
    'rg_beast_snare',
    'Clinging Snare',
    '🪤',
    'Snare allocates 40% of its tick damage to strongest-owner poison that lingers for 2s, up to three foes; the remaining damage stays in the ground field',
    natureGrand('groundZone', (ab) => {
      if (ab.zoneTickDamage) ab.zonePoison = { share: 0.4, onExit: false };
      else amplify(ab, 0.25, 0.15);
    }),
  ),
  gsk(
    'rg_beast_bond',
    'Rescuing Bond',
    '💚',
    'Nature’s Bond heals 15 more; an effective rescue from 35% HP or below readies the recipient’s next direct hit for +25% damage within 5s',
    natureGrand('heal', (ab) => {
      addN(ab, 'damage', 15);
      ab.rescueStrike = { mult: 1.25, duration: 5 };
    }),
  ),
  gsk(
    'rg_beast_bite',
    'Defiant Bite',
    '🦷',
    'Savage Bite gains +8 damage and a connecting hit grants 0.6s frontal parry; misses grant no parry',
    natureGrand('meleeCone', (ab) => {
      addN(ab, 'damage', 8);
      ab.parryOnHit = Math.max(ab.parryOnHit ?? 0, 0.6);
    }),
  ),
  gsk(
    'dr_moon_maul',
    'Encircling Maul',
    '🐻',
    'Dire Maul sweeps a full circle and gains +10 damage, letting your close-form window cover threats behind you',
    natureGrand('meleeCone', (ab) => {
      ab.halfAngleDeg = 180;
      addN(ab, 'damage', 10);
    }),
  ),
  gsk(
    'dr_moon_pounce',
    'Unstoppable Pounce',
    '🐆',
    'Feral Pounce grants 2s hard-control resistance and 20 absorption for 4s, scaling with max-HP growth',
    natureGrand('dash', (ab) => {
      ab.steadfastDuration = Math.max(ab.steadfastDuration ?? 0, 2);
      ab.absorption = { amount: (ab.absorption?.amount ?? 0) + 20, duration: 4, target: 'self' };
    }),
  ),
  gsk(
    'dr_moon_roar',
    'Pack Shelter',
    '🦁',
    'Primal Roar grants other allies within 180u a 20% damage ward for 4s while you enter your close-form pressure window',
    natureGrand('selfBuff', (ab) => {
      ab.allyWard = { range: 180, mult: 0.8, duration: 4 };
    }),
  ),
  gsk(
    'dr_moon_regen',
    'Shared Renewal',
    '💚',
    'Frenzied Regen heals 25 more and relays 35% of effective primary healing to one other wounded ally within 180u',
    natureGrand('heal', (ab) => {
      addN(ab, 'damage', 25);
      ab.relayHeal = { fraction: 0.35, radius: 180 };
    }),
  ),
  gsk(
    'dr_land_spike',
    'Staggering Eruption',
    '🌋',
    'Erupting Earth lengthens enemy wind-ups by 35% for 3s and gains +8 damage, leaving its controlled-target bonus available for follow-through',
    natureGrand('projectile', (ab) => {
      ab.castSlow = Math.max(ab.castSlow ?? 1, 1.35);
      ab.castSlowDuration = Math.max(ab.castSlowDuration ?? 0, 3);
      addN(ab, 'damage', 8);
    }),
  ),
  gsk(
    'dr_land_wall',
    'Wandering Briar',
    '🌵',
    'Wall of Thorns follows its first damaged foe for 3s before anchoring, and lasts 1s longer',
    natureGrand('groundZone', (ab) => {
      if (ab.zoneTickDamage) {
        ab.zoneFollow = Math.max(ab.zoneFollow ?? 0, 3);
        addN(ab, 'zoneDuration', 1);
      } else amplify(ab, 0.25, 0.15);
    }),
  ),
  gsk(
    'dr_land_wind',
    'Winter Gale',
    '🌬️',
    'The aimed Gust freezes struck foes for 0.6s and gains 25u reach',
    natureGrand('meleeCone', (ab) => {
      addN(ab, 'freeze', 0.6);
      addN(ab, 'range', 25);
    }),
  ),
  gsk(
    'dr_land_spring',
    'Sheltering Spring',
    '💧',
    'Healing Spring gives allies inside 20% damage mitigation, including at full health',
    natureGrand('groundZone', (ab) => {
      ab.zoneAllyDefMult = Math.min(ab.zoneAllyDefMult ?? 1, 0.8);
    }),
  ),

  gsk(
    'ro_assassin_strike',
    'Perfect Opening',
    '🗡️',
    'Death Strike gains +15% crit chance; a prepared positive hit marks its foe for your next direct hit within 4s to deal +25%',
    (ab) => {
      addN(ab, 'critChanceBonus', 0.15);
      ab.markOnPreparedHit = 0.25;
    },
  ),
  gsk(
    'ro_assassin_throw',
    'Seeking Blade',
    '🔪',
    'Deadly Throw pierces and consumes preparation for a guaranteed crit',
    (ab) => {
      ab.pierce = Math.max(ab.pierce ?? 0, 1);
      ab.consumesPrecision = true;
    },
  ),
  gsk(
    'ro_assassin_poison',
    'Lasting Venom',
    '☠️',
    'Coated Blade prepares precision for 4s; its poison deals 20% more per second and lasts 1s longer, up to 6s',
    (ab) => {
      if (ab.venomCoating)
        ab.venomCoating = {
          ...ab.venomCoating,
          damage: Math.round(ab.venomCoating.damage * 1.2),
          duration: Math.min(6, ab.venomCoating.duration + 1),
        };
      ab.prepareCrit = Math.max(ab.prepareCrit ?? 0, 4);
    },
  ),
  gsk(
    'ro_assassin_smoke',
    'Cover of Night',
    '💨',
    'Smoke Bomb grants allies 40% movement inside and prepares a precision crit for 6s',
    (ab) => {
      ab.zoneAllyMoveMult = Math.max(ab.zoneAllyMoveMult ?? 1, 1.4);
      ab.prepareCrit = Math.max(ab.prepareCrit ?? 0, 6);
    },
  ),
  gsk(
    'ro_trickster_bolt',
    'Threading Bolt',
    '✨',
    'Mage Hand Bolt pierces one foe and slows struck foes to 60% for 2s',
    (ab) => {
      ab.pierce = Math.max(ab.pierce ?? 0, 1);
      slowRider(ab, 0.6, 2);
    },
  ),
  gsk(
    'ro_trickster_snare',
    'Living Snare',
    '🕸️',
    'Ensnaring Strike becomes a self-centered escape web, 35u wider; allies inside move 20% faster',
    (ab) => {
      ab.range = 0;
      addN(ab, 'radius', 35);
      ab.zoneAllyMoveMult = Math.max(ab.zoneAllyMoveMult ?? 1, 1.2);
    },
  ),
  gsk(
    'ro_trickster_step',
    'Echoing Cut',
    '🌫️',
    'Mirror Cut echoes 35% of its positive primary damage as arcane damage to the same foe',
    (ab) => {
      ab.echoFraction = 0.35;
    },
  ),
  gsk(
    'ro_trickster_shield',
    'Double Deception',
    '🛡️',
    'Shield Spell blocks two frontal hits for 4s and prepares precision for 6s',
    (ab) => {
      if (ab.frontGuard) ab.frontGuard = { ...ab.frontGuard, charges: 2 };
      ab.prepareCrit = Math.max(ab.prepareCrit ?? 0, 6);
    },
  ),
  gsk(
    'wa_fiend_hurl',
    'Hellfire Meteor',
    '🔥',
    'Hurl Flame bursts in a 65u radius on impact',
    (ab) => {
      ab.impactRadius = Math.max(ab.impactRadius ?? 0, 65);
    },
  ),
  gsk(
    'wa_fiend_pit',
    'Devouring Pit',
    '🕳️',
    'Fire Pit grants allies inside 20% damage mitigation and deepens its searing curse to +20% owner damage',
    (ab) => {
      ab.zoneAllyDefMult = Math.min(ab.zoneAllyDefMult ?? 1, 0.8);
      ab.curseBonus = Math.max(ab.curseBonus ?? 0, 0.2);
    },
  ),
  gsk(
    'wa_fiend_rebuke',
    'Infernal Ward',
    '💥',
    'Infernal Claim bursts across 110u and stores 25% of effective primary damage as protection for 4s, up to 25 at base health; ceiling scales with max-HP growth',
    (ab) => {
      ab.radius = Math.max(ab.radius ?? 0, 110);
      ab.claimWard = 0.25;
    },
  ),
  gsk(
    'wa_fiend_resilience',
    'Soul Bastion',
    '🛡️',
    'Dark Resilience blocks one frontal hit for 4s, gains 15 initial protection and siphons +10 from one cursed foe',
    (ab) => {
      ab.frontGuard = { charges: 1, duration: 4 };
      if (ab.absorption)
        ab.absorption = {
          ...ab.absorption,
          amount: ab.absorption.amount + 15,
          curseSiphon: ab.absorption.curseSiphon && {
            ...ab.absorption.curseSiphon,
            amount: ab.absorption.curseSiphon.amount + 10,
          },
        };
    },
  ),
  gsk(
    'wa_goo_blast',
    'Rending Thought',
    '🧠',
    'Mind Blast pierces one foe and weakens personally cursed foes for 4s',
    (ab) => {
      ab.pierce = Math.max(ab.pierce ?? 0, 1);
      ab.cursePayoff = Math.max(ab.cursePayoff ?? 0, 4);
    },
  ),
  gsk(
    'wa_goo_tentacle',
    'Dread Reach',
    '🐙',
    'Tentacle of the Deep slows to 30% for 3s and lengthens enemy wind-ups by 40%',
    (ab) => {
      slowRider(ab, 0.3, 3);
      ab.castSlow = Math.max(ab.castSlow ?? 1, 1.4);
    },
  ),
  gsk(
    'wa_goo_whispers',
    'Whispers That Follow',
    '🌀',
    'Dissonant Whispers follows its first damaged foe for 3s and lasts 2s longer',
    (ab) => {
      ab.zoneFollow = 3;
      addN(ab, 'zoneDuration', 2);
    },
  ),
  gsk(
    'wa_goo_flee',
    'Prophetic Ward',
    '🔮',
    'Entropic Ward blocks one frontal hit for 4s and heals 15 more on use',
    (ab) => {
      ab.frontGuard = { charges: 1, duration: 4 };
      addN(ab, 'healOnUse', 15);
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
  ordinaryRecharge(ab, 0.92); // -8% cooldown
}

/** Martial Honed ranks develop the receiving skill’s existing job without duplicating grands. */
const MARTIAL_HONED: Record<string, { desc: string; tune: (ab: PlayerAbilityDef) => void }> = {
  kn_champion_slam: {
    desc: 'Increase damage by 12% and push or pull by 10u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      if (ab.pull) addN(ab, 'pull', 10);
      else addN(ab, 'knockback', 10);
    },
  },
  kn_champion_charge: {
    desc: 'Increase landing damage by 12% and charge reach by 12u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'landingDamage', 1.12);
      addN(ab, 'range', 12);
    },
  },
  kn_champion_rally: {
    desc: 'Increase self-healing by 12% and sprint speed by +3%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'healOnUse', 1.12);
      addN(ab, 'buffMoveMult', 0.03);
    },
  },
  kn_champion_riposte: {
    desc: 'Increase damage by 8% and connecting parry by 0.1s, up to 1.2s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.08);
      ab.parryOnHit = Math.min(1.2, ab.parryOnHit! + 0.1);
    },
  },
  kn_battle_trip: {
    desc: 'Increase damage by 10% and stun by 0.1s, up to 1.6s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      ab.stun = Math.min(1.6, ab.stun! + 0.1);
    },
  },
  kn_battle_menacing: {
    desc: 'Improve the damage buff by +4% and extend challenge reach by 10u and its duration by 0.2s, up to 6s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'buffDamageMult', 0.04);
      const cry = ab.warCry!;
      ab.warCry = {
        ...cry,
        radius: cry.radius + 10,
        duration: Math.min(6, cry.duration + 0.2),
      };
    },
  },
  kn_battle_precision: {
    desc: 'Increase blade damage by 10% and projectile speed by 8%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      mul(ab, 'projSpeed', 1.08);
    },
  },
  kn_battle_rally: {
    desc: 'Increase primary healing and recovery ticks by 12%, and recovery radius by 8u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      const recovery = ab.recoveryZone!;
      ab.recoveryZone = {
        ...recovery,
        tickHeal: recovery.tickHeal * 1.12,
        radius: recovery.radius + 8,
      };
    },
  },
  bb_berserker_frenzy: {
    desc: 'Improve the damage buff by +3% and extend its buff, blood-price and Momentum windows by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'buffDamageMult', 0.03);
      for (const field of ['buffDuration', 'bloodRage', 'momentumWindow'] as const)
        ab[field] = Math.min(8, ab[field]! + 0.25);
    },
  },
  bb_berserker_reckless: {
    desc: 'Increase damage by 12% and half-arc by 3°, up to 90°; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      if ((ab.halfAngleDeg ?? 45) < 90) ab.halfAngleDeg = Math.min(90, (ab.halfAngleDeg ?? 45) + 3);
    },
  },
  bb_berserker_slam: {
    desc: 'Increase burst damage by 8% and fissure damage by 1 per spent Momentum stack per tick; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.08);
      addN(ab, 'momentumFissure', 1);
    },
  },
  bb_berserker_chain: {
    desc: 'Increase damage by 8% and chain reach by 12u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.08);
      addN(ab, 'range', 12);
    },
  },
  bb_totem_bear: {
    desc: 'Take 2% less damage and extend buff, control resistance and guard by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'buffDefMult', 0.98);
      for (const field of ['buffDuration', 'steadfastDuration'] as const)
        ab[field] = Math.min(8, ab[field]! + 0.25);
      const guard = ab.frontGuard!;
      ab.frontGuard = { ...guard, duration: Math.min(8, guard.duration + 0.25) };
    },
  },
  bb_totem_wolf: {
    desc: 'Improve running speed by +3% and extend walking Momentum by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'buffMoveMult', 0.03);
      ab.wolfHunt = Math.min(8, ab.wolfHunt! + 0.25);
    },
  },
  bb_totem_quake: {
    desc: 'Increase field damage by 10% and duration by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'zoneTickDamage', 1.1);
      ab.zoneDuration = Math.min(8, ab.zoneDuration! + 0.25);
    },
  },
  bb_totem_mend: {
    desc: 'Increase self-healing by 12% and control resistance by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'healOnUse', 1.12);
      ab.steadfastDuration = Math.min(8, ab.steadfastDuration! + 0.25);
    },
  },
  mo_openhand_flurry: {
    desc: 'Increase damage by 12% and reach by 4u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      addN(ab, 'range', 4);
    },
  },
  mo_openhand_wave: {
    desc: 'Increase damage by 10% and push or pull by 10u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      if (ab.pull) addN(ab, 'pull', 10);
      else addN(ab, 'knockback', 10);
    },
  },
  mo_openhand_wind: {
    desc: 'Increase self-healing by 12%, crossing width by 4u (cap 65u), crossing guard by 0.2s (cap 6s), and Flow preparation by 0.25s (cap 8s); recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'healOnUse', 1.12);
      const crossing = ab.crossingGuard!;
      ab.crossingGuard = {
        ...crossing,
        width: Math.min(65, crossing.width + 4),
        duration: Math.min(6, crossing.duration + 0.2),
      };
      ab.prepareFlow = Math.min(8, ab.prepareFlow! + 0.25);
    },
  },
  mo_openhand_ki: {
    desc: 'Increase self-healing by 12% and Flow preparation by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'healOnUse', 1.12);
      ab.prepareFlow = Math.min(8, ab.prepareFlow! + 0.25);
    },
  },
  mo_shadow_dart: {
    desc: 'Increase dart damage by 12% and projectile speed by 8%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      mul(ab, 'projSpeed', 1.08);
    },
  },
  mo_shadow_step: {
    desc: 'Extend blink reach by 15u and Flow preparation by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'range', 15);
      ab.prepareFlow = Math.min(8, ab.prepareFlow! + 0.25);
    },
  },
  mo_shadow_cloud: {
    desc: 'Increase poison-field damage by 10% and duration by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'zoneTickDamage', 1.1);
      ab.zoneDuration = Math.min(8, ab.zoneDuration! + 0.25);
    },
  },
  mo_shadow_strike: {
    desc: 'Increase damage by 12% and leech by +2%, up to 25%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      ab.lifestealFrac = Math.max(ab.lifestealFrac!, Math.min(0.25, ab.lifestealFrac! + 0.02));
    },
  },
};

/** Nature Honed ranks grow lane, command, form and territory roles without repeating binary grands. */
const NATURE_HONED: Record<string, { desc: string; tune: (ab: PlayerAbilityDef) => void }> = {
  rg_hunter_hail: {
    desc: 'Increase burst damage by 10% and outward force by 10u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      addN(ab, 'knockback', 10);
    },
  },
  rg_hunter_mark: {
    desc: 'Increase quarry-shot damage by 12% and projectile speed by 8%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      mul(ab, 'projSpeed', 1.08);
    },
  },
  rg_hunter_stand: {
    desc: 'Increase skirmish-field damage by 10% and allied movement by +2%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'zoneTickDamage', 1.1);
      addN(ab, 'zoneAllyMoveMult', 0.02);
    },
  },
  rg_hunter_volley: {
    desc: 'Increase arrow damage by 12% and projectile speed by 8%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      mul(ab, 'projSpeed', 1.08);
    },
  },
  rg_beast_pounce: {
    desc: 'Increase landing damage by 12% and leap distance by 10u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'landingDamage', 1.12);
      addN(ab, 'range', 10);
    },
  },
  rg_beast_snare: {
    desc: 'Increase snare damage by 12% and field duration by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'zoneTickDamage', 1.12);
      ab.zoneDuration = Math.min(8, ab.zoneDuration! + 0.25);
    },
  },
  rg_beast_bond: {
    desc: 'Increase healing by 12% and recipient movement by +2%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      addN(ab, 'buffMoveMult', 0.02);
    },
  },
  rg_beast_bite: {
    desc: 'Increase bite damage by 10% and leech by +2%, up to 40% combined; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      ab.lifestealFrac = Math.max(ab.lifestealFrac!, Math.min(0.4, ab.lifestealFrac! + 0.02));
    },
  },
  dr_moon_maul: {
    desc: 'Increase maul damage by 12% and reach by 4u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      addN(ab, 'range', 4);
    },
  },
  dr_moon_pounce: {
    desc: 'Increase landing damage by 12% and leap distance by 10u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'landingDamage', 1.12);
      addN(ab, 'range', 10);
    },
  },
  dr_moon_roar: {
    desc: 'Improve the damage buff by +3%, bramble-burst damage by 2 and its preparation window by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'buffDamageMult', 0.03);
      const burst = ab.closeBurst!;
      ab.closeBurst = {
        ...burst,
        damage: burst.damage + 2,
        duration: Math.min(8, burst.duration + 0.25),
      };
    },
  },
  dr_moon_regen: {
    desc: 'Increase primary healing and recovery-grove ticks by 12%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      ab.recoveryZone = { ...ab.recoveryZone!, tickHeal: ab.recoveryZone!.tickHeal * 1.12 };
    },
  },
  dr_land_spike: {
    desc: 'Increase eruption damage by 10% and controlled-target bonus by +2%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      addN(ab, 'controlDamageBonus', 0.02);
    },
  },
  dr_land_wall: {
    desc: 'Increase thorn-field damage and healing by 10%, and duration by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'zoneTickDamage', 1.1);
      mul(ab, 'zoneTickHeal', 1.1);
      ab.zoneDuration = Math.min(8, ab.zoneDuration! + 0.25);
    },
  },
  dr_land_wind: {
    desc: 'Increase aimed-wind damage by 10% and push by 10u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      addN(ab, 'knockback', 10);
    },
  },
  dr_land_spring: {
    desc: 'Increase spring healing by 12% and duration by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'zoneTickHeal', 1.12);
      ab.zoneDuration = Math.min(8, ab.zoneDuration! + 0.25);
    },
  },
};

/** Mirror authored grand delivery prerequisites for honest Forge offer text. */
function casterRecipeMatches(subSkillId: string, ab: Omit<PlayerAbilityDef, 'slot'>): boolean {
  const native = subclassOfSkill(subSkillId)!.skills.find(
    (skill) => skill.id === subSkillId,
  )!.ability;
  const required: Partial<Record<string, readonly (keyof Omit<PlayerAbilityDef, 'slot'>)[]>> = {
    mg_evoker_shield: ['absorption', 'knockback'],
    mg_abjurer_ward: ['absorption'],
    mg_abjurer_bind: ['zoneTickDamage', 'roots', 'airborne'],
    mg_abjurer_teleport: ['swap'],
    mg_abjurer_mend: ['absorption'],
    so_draconic_breath: ['consumesSurge'],
    so_draconic_wing: ['grantsFlight', 'buffMoveMult', 'prepareSurge'],
    so_draconic_bolt: ['consumesSurge'],
    so_draconic_scales: ['absorption', 'consumesSurge'],
    so_wild_surge: ['consumesSurge', 'projCount'],
    so_wild_tides: ['consumesSurge'],
    so_wild_bend: ['prepareSurge', 'fortune'],
    so_wild_font: ['zoneTickHeal', 'prepareSurge'],
  };
  return casterPayloadMatches(
    ab,
    native.kind,
    required[subSkillId] ?? [],
    ['mg_evoker_lightning', 'so_wild_surge'].includes(subSkillId),
  );
}

/** Caster Honed grows each native role without duplicating its individual grand. */
const CASTER_HONED: Record<string, { desc: string; tune: (ab: PlayerAbilityDef) => void }> = {
  mg_evoker_lightning: {
    desc: 'Increase lightning damage by 10% and controlled-target bonus by +2%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      addN(ab, 'controlDamageBonus', 0.02);
    },
  },
  mg_evoker_cone: {
    desc: 'Increase cone damage by 10% and reach by 4u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      addN(ab, 'range', 4);
    },
  },
  mg_evoker_sculpt: {
    desc: 'Increase blast damage by 12% and controlled-target bonus by +2%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      addN(ab, 'controlDamageBonus', 0.02);
    },
  },
  mg_evoker_shield: {
    desc: 'Increase peel damage by 10%, barrier protection by 8%, and outward force by 6u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      const barrier = scaleAbsorption(ab.absorption!, 1.08, 1);
      barrier.amount = Math.round(barrier.amount);
      if (barrier.balanceAmount != null) barrier.balanceAmount = Math.round(barrier.balanceAmount);
      ab.absorption = barrier;
      if (ab.pull) addN(ab, 'pull', 6);
      else addN(ab, 'knockback', 6);
    },
  },
  mg_abjurer_ward: {
    desc: 'Increase burst damage by 10%, radius by 4u and barrier duration by 0.2s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      addN(ab, 'radius', 4);
      const barrier = ab.absorption!;
      ab.absorption = {
        ...barrier,
        duration: Math.max(barrier.duration, Math.min(8, barrier.duration + 0.2)),
      };
    },
  },
  mg_abjurer_bind: {
    desc: 'Increase cage damage by 12% and duration by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'zoneTickDamage', 1.12);
      ab.zoneDuration = Math.max(ab.zoneDuration!, Math.min(8, ab.zoneDuration! + 0.25));
    },
  },
  mg_abjurer_teleport: {
    desc: 'Increase Dimension Door travel by 10u and endpoint relocation radius by 4u; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'range', 10);
      addN(ab, 'radius', 4);
    },
  },
  mg_abjurer_mend: {
    desc: 'Increase primary healing by 12%, barrier protection by 8% and recipient reach by 10u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      const barrier = scaleAbsorption(ab.absorption!, 1.08, 1);
      barrier.amount = Math.round(barrier.amount);
      if (barrier.balanceAmount != null) barrier.balanceAmount = Math.round(barrier.balanceAmount);
      ab.absorption = barrier;
      addN(ab, 'range', 10);
    },
  },
  so_draconic_breath: {
    desc: 'Increase breath damage by 12% and widen its arc by 2° per side (cap 75°); recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      ab.halfAngleDeg = Math.max(ab.halfAngleDeg ?? 42, Math.min(75, (ab.halfAngleDeg ?? 42) + 2));
    },
  },
  so_draconic_wing: {
    desc: 'Increase movement by +3% and surge preparation by 0.25s, up to 9s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'buffMoveMult', 0.03);
      ab.prepareSurge = Math.max(ab.prepareSurge!, Math.min(9, ab.prepareSurge! + 0.25));
    },
  },
  so_draconic_bolt: {
    desc: 'Increase chromatic damage by 12% and projectile speed by 8%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      mul(ab, 'projSpeed', 1.08);
    },
  },
  so_draconic_scales: {
    desc: 'Increase scale-burst damage by 12% and barrier duration by 0.2s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      const barrier = ab.absorption!;
      ab.absorption = {
        ...barrier,
        duration: Math.max(barrier.duration, Math.min(8, barrier.duration + 0.2)),
      };
    },
  },
  so_wild_surge: {
    desc: 'Increase chaotic-bolt damage by 10% and projectile speed by 8%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      mul(ab, 'projSpeed', 1.08);
    },
  },
  so_wild_tides: {
    desc: 'Increase wild-burst damage by 12% and radius by 4u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      addN(ab, 'radius', 4);
    },
  },
  so_wild_bend: {
    desc: 'Fortune lasts 0.25s longer (cap 8s), its debuffs last 0.15s longer (cap 4s), and Surge readiness lasts 0.25s longer (cap 9s); recharge improves by 4%',
    tune: (ab) => {
      ab.fortune = {
        ...ab.fortune!,
        duration: Math.max(ab.fortune!.duration, Math.min(8, ab.fortune!.duration + 0.25)),
        debuffDuration: Math.max(
          ab.fortune!.debuffDuration,
          Math.min(4, ab.fortune!.debuffDuration + 0.15),
        ),
      };
      ab.prepareSurge = Math.max(ab.prepareSurge!, Math.min(9, ab.prepareSurge! + 0.25));
    },
  },
  so_wild_font: {
    desc: 'Increase recovery-field healing by 12% and duration by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'zoneTickHeal', 1.12);
      ab.zoneDuration = Math.max(ab.zoneDuration!, Math.min(8, ab.zoneDuration! + 0.25));
    },
  },
};

const SUB_SKILL_TUNE_TEXT: Record<string, string> = {
  cl_life_mend:
    'Increase primary healing by 12%, heal reach and relay radius by 8%, and improve recharge',
  cl_light_flash:
    'Increase healing by 12%, reach and rescue readiness duration by 8% (cap 8s), and improve recharge',
  ro_assassin_poison:
    'First pick extends target poison to 5s; second to 6s. Later picks gain +12% poison damage and faster recharge',

  ro_assassin_smoke: 'Increase smoke radius by 8% and improve recharge',
  ro_trickster_shield: 'Extend the frontal block by 8% (cap 8s) and improve recharge',
  ba_valor_bolster:
    'Improve rally movement, extend self control resistance by 8% (cap 8s), and improve recharge',
  pa_devotion_aura: 'Increase barrier by 12% and barrier/aura reach by 8%, and improve recharge',
  wa_fiend_resilience:
    'Increase base barrier, siphon damage and per-hit protection by 12%, siphon reach by 8%, and improve recharge',
  wa_fiend_pit: 'Increase burning-zone damage by 12% and radius by 8%, and improve recharge',
  wa_goo_blast:
    'Increase damage by 12% and reach by 8%, recharge improves; personally cursed-target weakness and hindrance gain 1s per pick, capped at 5s',
  wa_goo_whispers: 'Increase dread-zone damage by 12% and radius by 8%, and improve recharge',
};

/** Support Honed develops healing, facing, verse and pursuit roles without re-selling flags. */
function supportAuraHoned(ab: PlayerAbilityDef, duration: number): void {
  const aura = ab.paladinAura!;
  ab.paladinAura = {
    ...aura,
    duration: Math.max(aura.duration, Math.min(8, aura.duration + duration)),
  };
}
const SUPPORT_HONED: Record<string, { desc: string; tune: (ab: PlayerAbilityDef) => void }> = {
  cl_light_flare: {
    desc: 'Increase Radiance damage by 10% and radius by 4u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      addN(ab, 'radius', 4);
    },
  },
  cl_light_beam: {
    desc: 'Increase Guiding Bolt damage by 12% and shorten its wind-up by 5%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      mul(ab, 'castTime', 0.95);
    },
  },
  cl_light_flash: {
    desc: 'Increase Flash healing by 8% and rescue readiness by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.08);
      ab.rescueStrike = {
        ...ab.rescueStrike!,
        duration: Math.max(
          ab.rescueStrike!.duration,
          Math.min(8, ab.rescueStrike!.duration + 0.25),
        ),
      };
    },
  },
  cl_light_warding: {
    desc: 'Increase Warding Flare reach by 8u and barrier duration by 0.15s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'range', 8);
      ab.absorption = {
        ...ab.absorption!,
        duration: Math.max(ab.absorption!.duration, Math.min(8, ab.absorption!.duration + 0.15)),
      };
    },
  },
  cl_life_bloom: {
    desc: 'Increase Bloom healing by 8% and duration by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'zoneTickHeal', 1.08);
      ab.zoneDuration = Math.max(ab.zoneDuration!, Math.min(8, ab.zoneDuration! + 0.25));
    },
  },
  cl_life_mend: {
    desc: 'Increase Mass Cure healing by 8% and relay reach by 6u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.08);
      ab.relayHeal = { ...ab.relayHeal!, radius: ab.relayHeal!.radius + 6 };
    },
  },
  cl_life_preserve: {
    desc: 'Increase Preserve Life barrier by 6% and reach by 5u; recharge improves by 4%',
    tune: (ab) => {
      ab.absorption = scaleAbsorption(ab.absorption!, 1.06);
      addN(ab, 'range', 5);
    },
  },
  cl_life_smite: {
    desc: 'Increase Reproach damage by 10% and reach by 3u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      addN(ab, 'range', 3);
    },
  },
  pa_devotion_smite: {
    desc: 'Increase Divine Smite damage by 10% and leech by +2%, up to 30%; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      ab.lifestealFrac = Math.max(ab.lifestealFrac!, Math.min(0.3, ab.lifestealFrac! + 0.02));
    },
  },
  pa_devotion_sanctuary: {
    desc: 'Increase Sacred Weapon damage bonus by +3% and Pursuit duration by 0.2s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'buffDamageMult', 0.03);
      supportAuraHoned(ab, 0.2);
    },
  },
  pa_devotion_bless: {
    desc: 'Increase Bless healing by 8% and Renewal duration by 0.2s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.08);
      supportAuraHoned(ab, 0.2);
    },
  },
  pa_devotion_aura: {
    desc: 'Increase Aura of Protection barrier by 6% and Bulwark duration by 0.2s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      ab.absorption = scaleAbsorption(ab.absorption!, 1.06);
      supportAuraHoned(ab, 0.2);
    },
  },
  pa_vengeance_hunt: {
    desc: 'Increase Vow damage bonus by +3% and Pursuit duration by 0.2s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'buffDamageMult', 0.03);
      supportAuraHoned(ab, 0.2);
    },
  },
  pa_vengeance_shackle: {
    desc: 'Increase Enmity damage by 10% and slow duration by 0.15s, up to 4s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      ab.slowDuration = Math.max(ab.slowDuration!, Math.min(4, ab.slowDuration! + 0.15));
    },
  },
  pa_vengeance_charge: {
    desc: 'Increase Charge landing damage by 10% and travel by 6u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'landingDamage', 1.1);
      addN(ab, 'range', 6);
    },
  },
  pa_vengeance_smite: {
    desc: 'Increase Wrathful Smite damage by 10% and reach by 3u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      addN(ab, 'range', 3);
    },
  },
  ba_valor_blade: {
    desc: 'Increase Flourish damage by 10% and reach by 3u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.1);
      addN(ab, 'range', 3);
    },
  },
  ba_valor_inspire: {
    desc: 'Increase Hymn damage bonus by +3% and duration by 0.2s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'buffDamageMult', 0.03);
      ab.buffDuration = Math.max(ab.buffDuration!, Math.min(8, ab.buffDuration! + 0.2));
    },
  },
  ba_valor_bolster: {
    desc: 'Increase Bolster movement bonus by +2% and rally duration by 0.2s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'buffMoveMult', 0.02);
      ab.buffDuration = Math.max(ab.buffDuration!, Math.min(8, ab.buffDuration! + 0.2));
    },
  },
  ba_valor_shatter: {
    desc: 'Increase Shatter damage by 12% and radius by 3u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      addN(ab, 'radius', 3);
    },
  },
  ba_whispers_words: {
    desc: 'Increase Words damage by 10% and duration by 0.25s, up to 8s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'zoneTickDamage', 1.1);
      ab.zoneDuration = Math.max(ab.zoneDuration!, Math.min(8, ab.zoneDuration! + 0.25));
    },
  },
  ba_whispers_wound: {
    desc: 'Increase Psychic Blade damage by 12% and speed by 20u/s; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.12);
      addN(ab, 'projSpeed', 20);
    },
  },
  ba_whispers_mantle: {
    desc: 'Increase Mantle echo damage by 2%, up to 45%, travel by 8u and phasing by 0.02s, up to 0.6s; recharge improves by 4%',
    tune: (ab) => {
      addN(ab, 'range', 8);
      ab.iframes = Math.max(ab.iframes!, Math.min(0.6, ab.iframes! + 0.02));
      if (ab.whisperRefrain)
        ab.whisperRefrain = {
          ...ab.whisperRefrain,
          fraction: Math.min(0.45, ab.whisperRefrain.fraction + 0.02),
        };
    },
  },
  ba_whispers_song: {
    desc: 'Increase Refrain healing by 8% and reach by 8u; recharge improves by 4%',
    tune: (ab) => {
      mul(ab, 'damage', 1.08);
      addN(ab, 'range', 8);
    },
  },
};

/** Share authored tuning between live replay and Forge offer previews. */
function applyAuthoredHoned(subSkillId: string, ab: PlayerAbilityDef): boolean {
  const profile =
    MARTIAL_HONED[subSkillId] ??
    NATURE_HONED[subSkillId] ??
    CASTER_HONED[subSkillId] ??
    SUPPORT_HONED[subSkillId];
  if (!profile) return false;
  // getSubSkill is Forge-resolved; profiles require the authored delivery AND payload shape.
  const native = subclassOfSkill(subSkillId)!.skills.find((s) => s.id === subSkillId)!.ability;
  const nativeHooks = (
    [
      'healOnUse',
      'buffMoveMult',
      'buffDamageMult',
      'buffDefMult',
      'buffDuration',
      'parryOnHit',
      'stun',
      'warCry',
      'recoveryZone',
      'bloodRage',
      'momentumWindow',
      'frontGuard',
      'steadfastDuration',
      'wolfHunt',
      'zoneTickDamage',
      'zoneDuration',
      'crossingGuard',
      'prepareFlow',
      'projSpeed',
      'lifestealFrac',
      'momentumFissure',
      'landingDamage',
      'range',
    ] as const
  ).filter((field) => native[field] != null);
  const supportHooks = (
    [
      'absorption',
      'rescueHealBonus',
      'rescueStrike',
      'relayHeal',
      'zoneTickHeal',
      'paladinAura',
      'bardSong',
      'cleanseOnHeal',
      'steadfastDuration',
      'iframes',
      'slowMult',
      'slowDuration',
      'airborne',
      'overflowShield',
      'castTime',
    ] as const
  ).filter((field) => SUPPORT_HONED[subSkillId] && native[field] != null);
  const nativeForce = native.knockback != null || native.pull != null;
  const casterHooks = (
    [
      'absorption',
      'zoneTickHeal',
      'prepareSurge',
      'consumesSurge',
      'surgeTwin',
      'fortune',
      'swap',
      'grantsFlight',
      'slowMult',
      'slowDuration',
      'controlDamageBonus',
      'roots',
      'airborne',
      'projCount',
    ] as const
  ).filter((field) => CASTER_HONED[subSkillId] && native[field] != null);
  // Nature profiles also depend on these native hooks. A changed same-kind Forge
  // payload must not acquire a phantom field merely by retaining the original ID.
  const natureHooks = (
    ['closeBurst', 'zoneTickHeal', 'zoneAllyMoveMult', 'controlDamageBonus', 'pierce'] as const
  ).filter((field) => NATURE_HONED[subSkillId] && native[field] != null);
  if (
    ab.kind !== native.kind ||
    !nativeHooks.every((field) => ab[field] != null) ||
    !natureHooks.every((field) => ab[field] != null) ||
    !supportHooks.every((field) => ab[field] != null && ab[field] !== false && ab[field] !== 0) ||
    (!!SUPPORT_HONED[subSkillId] && native.damage > 0 && ab.damage <= 0) ||
    !casterHooks.every((field) => ab[field] != null && ab[field] !== false && ab[field] !== 0) ||
    (!!CASTER_HONED[subSkillId] && native.damage > 0 && ab.damage <= 0) ||
    (nativeForce && ab.knockback == null && ab.pull == null)
  )
    return false;
  profile.tune(ab);
  ordinaryRecharge(ab, 0.96);
  return true;
}

/** First-pick reference for simple Honed boons; live offer previews still resolve owned/rolled skills. */
function simpleHonedText(subSkillId: string): string {
  const skill = getSubSkill(subSkillId)!;
  const before = skill.ability;
  const after = structuredClone(before) as PlayerAbilityDef;
  if (!applyAuthoredHoned(subSkillId, after)) subSkillTune(after);
  const labels: Record<string, string> = {
    damage: before.kind === 'heal' ? 'healing' : 'direct damage',
    zoneTickDamage: 'zone damage per tick',
    zoneTickHeal: 'zone healing per tick',
    healOnUse: 'self-healing',
    radius: 'area radius',
    impactRadius: 'explosion radius',
    range: before.kind === 'dash' || before.kind === 'blink' ? 'travel distance' : 'reach',
    iframes: 'phasing duration',
    cooldown: 'recharge',
    buffDamageMult: 'damage multiplier',
    buffMoveMult: 'movement multiplier',
    buffDefMult: 'damage-taken multiplier',
    knockback: 'push distance',
    pull: 'pull distance',
    zoneDuration: 'field duration',
    zoneAllyMoveMult: 'allied field movement multiplier',
    controlDamageBonus: 'controlled-target damage bonus',
    lifestealFrac: 'leech fraction',
    prepareSurge: 'Surge readiness',
  };
  const number = (n: number) => String(Math.round(n * 100) / 100);
  const changes = Object.entries(labels).flatMap(([key, label]) => {
    const a = before[key as keyof typeof before],
      b = after[key as keyof typeof after];
    return typeof a === 'number' && typeof b === 'number' && a !== b
      ? [
          `${label} ${number(a)} → ${number(b)}${key === 'cooldown' || key === 'iframes' ? 's' : ''}`,
        ]
      : [];
  });
  if (
    before.frontGuard &&
    after.frontGuard &&
    before.frontGuard.duration !== after.frontGuard.duration
  )
    changes.push(
      `block window ${number(before.frontGuard.duration)} → ${number(after.frontGuard.duration)}s`,
    );
  if (before.fortune && after.fortune) {
    for (const [key, label] of [
      ['duration', 'Fortune readiness'],
      ['debuffDuration', 'Fortune debuff duration'],
    ] as const) {
      const a = before.fortune[key],
        b = after.fortune[key];
      if (a !== b) changes.push(`${label} ${number(a)} → ${number(b)}s`);
    }
  }
  return `${skill.name} — first rank: ${changes.join('; ')}`;
}

/** Per-subclass-skill upgrade builder — tied to one sub skill id (non-grand, cap 5). */
function us(subSkillId: string, classId: ClassId, name: string, icon: string): CharUpgradeDef {
  const profile =
    MARTIAL_HONED[subSkillId] ??
    NATURE_HONED[subSkillId] ??
    CASTER_HONED[subSkillId] ??
    SUPPORT_HONED[subSkillId];
  return {
    id: `subup_${subSkillId}`,
    classId,
    subSkillId,
    name: `Honed ${name}`,
    icon,
    desc: profile
      ? `${profile.desc} (stacks to ${MAX_SKILL_STACKS}).`
      : SUB_SKILL_TUNE_TEXT[subSkillId]
        ? `${SUB_SKILL_TUNE_TEXT[subSkillId]} (stacks to ${MAX_SKILL_STACKS}).`
        : `${simpleHonedText(subSkillId)} (stacks to ${MAX_SKILL_STACKS}).`,
    apply: ({ subAbilities }) => {
      if (!subAbilities) return;
      for (const slot of SUB_SLOTS) {
        const ab = subAbilities[slot];
        if (!ab) continue;
        if (profile) {
          if (!applyAuthoredHoned(subSkillId, ab)) subSkillTune(ab);
        } else if (subSkillId === 'ro_assassin_poison' && ab.venomCoating) {
          ab.venomCoating = { ...ab.venomCoating }; // cloned bindings must not mutate authored content
          // First pick trades per-cycle burst for duration; subsequent picks retain rounded growth.
          const picks = (ab.venomHonedStacks ?? 0) + 1;
          ab.venomHonedStacks = picks;
          ab.venomCoating.duration = Math.min(6, ab.venomCoating.duration + 1);
          if (picks > 1) {
            ab.venomCoating.damage = Math.round(ab.venomCoating.damage * 1.12);
            ordinaryRecharge(ab, 0.96);
          }
        } else {
          subSkillTune(ab);
          if (subSkillId === 'wa_goo_blast' && ab.cursePayoff)
            ab.cursePayoff = Math.min(5, ab.cursePayoff + 1);
        }
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

  // Warlock's Hex — grafts the Warlock's Hex (a 120-radius poison field, 5s).
  gg(
    'hy_hexbrand',
    'hy_hexbrand_g_a',
    'Creeping Blight',
    '☠️',
    'Your grafted Hex festers wider and hits harder — +10 poison per tick across a +50 radius',
    (ab) => {
      addN(ab, 'zoneTickDamage', 10);
      addN(ab, 'radius', 50);
    },
  ),
  gg(
    'hy_hexbrand',
    'hy_hexbrand_g_b',
    'Lingering Curse',
    '🕸️',
    'Your grafted Hex clings 4s longer, snares harder (slow to 50%) and recurses 40% faster',
    (ab) => {
      addN(ab, 'zoneDuration', 4);
      setMin(ab, 'slowMult', 0.5);
      mul(ab, 'cooldown', 0.6);
    },
  ),

  // Wind Step — grafts the Monk's Step of the Wind (a 250u i-frame dash + heal).
  gg(
    'hy_windstep',
    'hy_windstep_g_a',
    'Cyclone Step',
    '🌪️',
    'Your grafted Wind Step recharges in a blink (−60% cooldown), phases far longer (+0.4s i-frames) and carries you +120u',
    (ab) => {
      mul(ab, 'cooldown', 0.4);
      addN(ab, 'iframes', 0.4);
      addN(ab, 'range', 120);
    },
  ),
  gg(
    'hy_windstep',
    'hy_windstep_g_b',
    'Mending Gale',
    '🍃',
    'Your grafted Wind Step mends +40 on use and steadies you through the slide (+0.2s i-frames)',
    (ab) => {
      addN(ab, 'healOnUse', 40);
      addN(ab, 'iframes', 0.2);
    },
  ),

  // Borrowed Anthem — grafts the Bard's Inspiration (an ally +dmg / −dmg-taken buff).
  gg(
    'hy_inspire',
    'hy_inspire_g_a',
    'Rousing Chorus',
    '🎺',
    'Your grafted Anthem swells its rally to +45% damage, lasts 4s longer and recharges 30% faster',
    (ab) => {
      addN(ab, 'buffDamageMult', 0.25);
      addN(ab, 'buffDuration', 4);
      mul(ab, 'cooldown', 0.7);
    },
  ),
  gg(
    'hy_inspire',
    'hy_inspire_g_b',
    'Warding Hymn',
    '🛡️',
    'Your grafted Anthem also shields the ally (40% less damage taken), carries +160u, and lasts +3s',
    (ab) => {
      setMin(ab, 'buffDefMult', 0.6);
      addN(ab, 'range', 160);
      addN(ab, 'buffDuration', 3);
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
  ...PILOT_SUB_SKILL_GRANDS,
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
    ...PILOT_SUB_SKILL_GRANDS,
    ...GRAFT_GRANDS,
    ...SUB_SKILL_UPGRADES, // item 6: resolvable by id, but NOT in the always-on class pool
  ].map((d) => [d.id, d]),
);
for (const [alias, canonical] of Object.entries(PILOT_GRAND_ALIASES)) {
  const target = CHAR_UPGRADES[canonical];
  if (target) CHAR_UPGRADES[alias] = { ...target, id: alias };
}

/**
 * How many GRAND capstones a hero holds (item 5 progression gate). Counts real
 * catalog grands of every kind — class, skill, subclass and graft — since
 * CHAR_UPGRADES flattens them all; synthetic ids (`restore:`/`graftup:`) resolve
 * to no def and never count.
 */
export function grandCount(charUpgradeIds: readonly string[] | undefined): number {
  if (!charUpgradeIds) return 0;
  return new Set(charUpgradeIds.filter((id) => CHAR_UPGRADES[id]?.grand).map(canonicalGrandId))
    .size;
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
export function stubPlayer(classId: ClassId): Player {
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
    // item 5: seed the base crit every hero spawns with (world.ts spawn), so
    // Deadeye/procgen crit boons (which do `critChance += …`) stack ON TOP of the
    // base in a preview instead of starting from an undefined-as-0 floor.
    critChance: CRIT_CHANCE_BASE,
    critMult: CRIT_MULT_BASE,
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

  const seenGrands = new Set<string>();
  for (const rawId of ids) {
    const id = canonicalGrandId(rawId);
    if (CHAR_UPGRADES[id]?.grand) {
      if (seenGrands.has(id)) continue;
      seenGrands.add(id);
    }
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
      const key = occupant[graftup.slot];
      // An invalid/stale synthetic pick must not tune a reclaimed native skill.
      if (key === graftup.slot || !CHAR_UPGRADES[key]?.graftSource) continue;
      const target = registry.get(key)!;
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
/** A composed skill's FLAT fields (excluding `components`) as a signature, so we can
 *  tell whether an upgrade actually retuned it. */
function flatSig(ab: PlayerAbilityDef): string {
  const { components: _components, ...flat } = ab;
  return JSON.stringify(flat);
}

/** Re-derive the components of any composed sub-ability a boon just retuned (item: forge
 *  upgrade synthesis), so its zone/heal/buff tweaks reach the component-driven executor.
 *  A no-op off Forge (canonical sub-abilities carry no components). */
function refreshComposedSubs(subs: Partial<Record<SubSlot, PlayerAbilityDef>>): void {
  for (const slot of SUB_SLOTS) {
    const ab = subs[slot];
    if (ab?.components) ab.components = refreshComponents(ab);
  }
}

export function applyCharUpgrades(player: Player, ids: string[] | undefined): void {
  if (!ids || !player.abilities) return;
  const abilities = player.abilities;
  // Chaos Forge (item: forge upgrade synthesis): a fused base skill resolves buffs /
  // zones / heals from its `components`, so a canonical upgrade that only tugs a flat
  // field would be a NO-OP on it. Snapshot each fused skill's flat fields, apply the
  // upgrades, then re-derive the components of any fused skill an upgrade actually
  // retuned — so every offered upgrade meaningfully improves the synthesized skill,
  // re-capped to stay on budget. Only fused skills that CHANGED are refreshed, so a
  // canonical (or un-upgraded Forge) kit is byte-identical.
  const before = new Map<AbilitySlot, string>();
  for (const slot of SLOTS) {
    const ab = abilities[slot];
    if (ab?.components) before.set(slot, flatSig(ab));
  }
  replayCharUpgrades(player, ids);
  for (const slot of SLOTS) {
    const ab = abilities[slot];
    const was = before.get(slot);
    if (ab?.components && was !== undefined && flatSig(ab) !== was) {
      ab.components = refreshComponents(ab);
    }
  }
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
  const seen = new Set<string>();
  for (const rawId of ids) {
    const id = canonicalGrandId(rawId);
    if (seen.has(id)) continue;
    seen.add(id);
    const def = CHAR_UPGRADES[id];
    const subclassId =
      def?.subclassId ??
      (def?.grand && def.subSkillId ? subclassOfSkill(def.subSkillId)?.id : undefined);
    if (!def?.grand || !subclassId || !upgradeAllowedFor(def, player.classId)) continue;
    // Hand the grand only the sub-abilities that belong to its subclass.
    const targeted: Partial<Record<SubSlot, PlayerAbilityDef>> = {};
    for (const slot of SUB_SLOTS) {
      const boundId = active[slot === 'sub1' ? 0 : 1];
      if (
        subs[slot] &&
        slotSubclass[slot] === subclassId &&
        (!def.subSkillId || def.subSkillId === boundId)
      )
        targeted[slot] = subs[slot];
    }
    if (targeted.sub1 || targeted.sub2) {
      def.apply({
        player,
        abilities: (player.abilities ?? {}) as Record<AbilitySlot, PlayerAbilityDef>,
        subAbilities: targeted,
      });
      refreshComposedSubs(targeted); // flow the boon into a fused sub-skill's components
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
    if (!def?.subSkillId || def.grand || !upgradeAllowedFor(def, player.classId)) continue;
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
      refreshComposedSubs(targeted); // flow the boon into a fused sub-skill's components
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
  for (const slot of SLOTS) abilities[slot] = boundedAbility(abilities[slot]);
  return abilities;
}

/**
 * Preview one equipped SUBCLASS skill's resolved ability after the hero's owned
 * per-skill "Honed" boons (`subup_<id>`) and subclass grands are applied to it
 * (item 5) — WITHOUT a live World. Mirrors applySubSkillUpgrades / applySubclassGrands
 * but for a single ability: each matching boon in `ownedChar` is applied once (so a
 * boon taken up to its cap stacks that many times), a subclass grand hits every skill
 * of its subclass. Returns null for an unknown sub-skill id. Reused by the offer cards
 * (describeCharOffer) and the HUD sub-skill tooltip so both agree with the sim.
 */
export function previewSubAbility(
  subSkillId: string,
  ownedChar: readonly string[],
): PlayerAbilityDef | null {
  const sk = getSubSkill(subSkillId);
  const owner = subclassOfSkill(subSkillId);
  if (!sk || !owner) return null;
  // Shallow clone (numeric fields only; see cloneAbilities). Sub-abilities carry no
  // slot; tag it sub1 so it's a full PlayerAbilityDef for the tune ctx (slot is
  // ignored by describeAbility and the tunes alike).
  const ability: PlayerAbilityDef = {
    ...sk.ability,
    slot: 'sub1',
    rechargeBase: sk.ability.cooldown,
  };
  const stub = stubPlayer(owner.classId);
  const abilities = stub.abilities as Record<AbilitySlot, PlayerAbilityDef>;
  let tuned = false;
  const seenGrands = new Set<string>();
  for (const rawId of ownedChar) {
    const boonId = canonicalGrandId(rawId);
    const def = CHAR_UPGRADES[boonId];
    if (!def) continue;
    if (def.grand) {
      if (seenGrands.has(boonId)) continue;
      seenGrands.add(boonId);
    }
    // A "Honed X" boon tunes exactly this skill; a subclass grand tunes every skill
    // of its subclass. Both mutate the ability handed in through the sub1 slot.
    const hits =
      def.subSkillId != null
        ? def.subSkillId === subSkillId
        : def.subclassId != null && def.subclassId === owner.id;
    if (!hits) continue;
    def.apply({ player: stub, abilities, subAbilities: { sub1: ability } });
    tuned = true;
  }
  // Forge run: flow the boons' tweaks into the fused sub-skill's components (item: forge
  // upgrade synthesis), so the preview reads the true empowered numbers.
  if (tuned && ability.components) ability.components = refreshComponents(ability);
  return boundedAbility(ability);
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
  critChance: number; // item 5: [0,1) crit chance (base + Deadeye/procgen boons)
  critMult: number; // item 5: outgoing-damage multiplier on a crit
}

/**
 * Resolve the stat block a hero of `classId` ends up with after taking the given
 * generic + character upgrades, off a throwaway stub (no World). For a multiclass
 * hero pass the SPAWN/identity class, not whichever kit is currently wielded: the sim
 * fixes a hero's persistent stats at spawn and a class swap never recomputes them
 * (`setActiveClass`), so previewing the active class would disagree with the sim after
 * a swap (#70). Pure.
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
    critChance: stub.critChance,
    critMult: stub.critMult,
  };
}

// ---------------------------------------------------------------------------
// Persistent-stat display model (item 5 + future-proofing)
// ---------------------------------------------------------------------------

/** Extra context a row needs beyond the resolved stats (the run-aware move base). */
export interface StatRowCtx {
  /** getClass(identity).moveSpeed — the baseline the move-speed delta is read against. */
  baseMoveSpeed: number;
}

/**
 * One persistent (identity-bound) stat, described ONCE so every surface stays in
 * sync: the pause-menu character sheet (`cell`) and the reward-card before→after
 * readout (`readout`). Adding the next stat mechanic is a single entry here — no
 * edits scattered across the panel and the card. `key` drives the card's changed-
 * stat diff; `panelRow: false` keeps a stat out of the sheet (maxHp lives in its
 * header); `show` hides a sheet row at its neutral default (regen/terrain at 0).
 */
export interface PersistentStatSpec {
  key: keyof PreviewedStats;
  /** Character-sheet row label. */
  label: string;
  /** Reward-card noun that trails the absolute value ("dmg", "max HP", "crit"). */
  readoutNoun: string;
  /** Character-sheet cell: display text + whether the value reads as a boon (green). */
  cell: (s: PreviewedStats, ctx: StatRowCtx) => { text: string; good: boolean };
  /** Reward-card absolute readout of the resolved value ("130%", "240", "12%"). */
  readout: (s: PreviewedStats) => string;
  /** false → not a sheet row (surfaced elsewhere, e.g. maxHp in the header). Default true. */
  panelRow?: boolean;
  /** Show the sheet row only when meaningful (default: always). */
  show?: (s: PreviewedStats) => boolean;
}

/** Signed percent from a multiplier delta (0 → "—", 0.3 → "+30%", -0.18 → "-18%"). */
const pctDelta = (delta: number): string => {
  const n = Math.round(delta * 100);
  return n === 0 ? '—' : `${n > 0 ? '+' : ''}${n}%`;
};
const pctAbs = (v: number): string => `${Math.round(v * 100)}%`;
const whole = (v: number): string => `${Math.round(v)}`;
const critX = (v: number): string => `×${Math.round(v * 100) / 100}`;

/**
 * The persistent stats shown to the player, in display order. Offensive stats
 * (damage + crit) lead; maxHp is readout-only (the sheet shows it in its header).
 */
export const PERSISTENT_STATS: readonly PersistentStatSpec[] = [
  {
    key: 'maxHp',
    label: 'Max HP',
    readoutNoun: 'max HP',
    cell: (s) => ({ text: whole(s.maxHp), good: true }),
    readout: (s) => whole(s.maxHp),
    panelRow: false, // shown in the sheet header ("Class — hp/maxHp HP")
  },
  {
    key: 'damageMult',
    label: 'Damage',
    readoutNoun: 'dmg',
    cell: (s) => ({ text: pctDelta(s.damageMult - 1), good: s.damageMult >= 1 }),
    readout: (s) => pctAbs(s.damageMult),
  },
  {
    key: 'critChance',
    label: 'Crit chance',
    readoutNoun: 'crit',
    cell: (s) => ({ text: pctAbs(s.critChance), good: true }),
    readout: (s) => pctAbs(s.critChance),
  },
  {
    key: 'critMult',
    label: 'Crit damage',
    readoutNoun: 'crit dmg',
    cell: (s) => ({ text: critX(s.critMult), good: true }),
    readout: (s) => critX(s.critMult),
  },
  {
    key: 'damageTakenMult',
    label: 'Damage taken',
    readoutNoun: 'dmg taken',
    cell: (s) => ({ text: pctDelta(s.damageTakenMult - 1), good: s.damageTakenMult <= 1 }),
    readout: (s) => pctAbs(s.damageTakenMult),
  },
  {
    key: 'cooldownMult',
    label: 'Cooldowns',
    readoutNoun: 'cooldowns',
    cell: (s) => ({ text: pctDelta(s.cooldownMult - 1), good: s.cooldownMult <= 1 }),
    readout: (s) => pctAbs(s.cooldownMult),
  },
  {
    key: 'castMult',
    label: 'Cast time',
    readoutNoun: 'cast time',
    cell: (s) => ({ text: pctDelta(s.castMult - 1), good: s.castMult <= 1 }),
    readout: (s) => pctAbs(s.castMult),
  },
  {
    key: 'moveSpeed',
    label: 'Move speed',
    readoutNoun: 'move',
    cell: (s, ctx) => ({
      text: pctDelta(s.moveSpeed / ctx.baseMoveSpeed - 1),
      good: s.moveSpeed >= ctx.baseMoveSpeed,
    }),
    readout: (s) => whole(s.moveSpeed),
  },
  {
    key: 'regenPerSec',
    label: 'Regen',
    readoutNoun: 'regen',
    cell: (s) => ({ text: `${s.regenPerSec.toFixed(1)} HP/s`, good: true }),
    readout: (s) => `${Math.round(s.regenPerSec * 10) / 10}/s`,
    show: (s) => s.regenPerSec > 0,
  },
  {
    key: 'terrainResist',
    label: 'Terrain resist',
    readoutNoun: 'terrain resist',
    cell: (s) => ({ text: pctDelta(s.terrainResist), good: true }),
    readout: (s) => pctAbs(s.terrainResist),
    show: (s) => s.terrainResist > 0,
  },
];

/** Most times a character upgrade may be taken (its `maxStacks`, or the shared cap). */
export function charUpgradeMaxStacks(id: string): number {
  const graftup = parseGraftup(id);
  // A grafted-skill upgrade inherits the source boon's own cap.
  if (graftup) return CHAR_UPGRADES[graftup.boonId]?.maxStacks ?? MAX_SKILL_STACKS;
  // A reclaim is contextual (only offered while a skill is displaced), never "maxed".
  if (parseRestore(id)) return Number.POSITIVE_INFINITY;
  return CHAR_UPGRADES[id]?.maxStacks ?? MAX_SKILL_STACKS;
}

/**
 * item 18/reclaim — whether a GRAFT currently OCCUPIES its replaced slot, computed from
 * the owned list alone (class-agnostic; keys off the `replaces` data model, so a newly
 * added graft is covered automatically). A graft is append-only in `owned`, so its live
 * state is the net of its own picks vs `restore:<slot>` reclaims and any OTHER graft that
 * later seizes the same slot. Distinguishes "installed" from "owned-but-stashed" — the
 * missing distinction behind the reclaim bugs (a stashed graft must stay re-offerable and
 * re-pickable so a hero can swap the skill back and forth). Given the graft's replaced
 * `slot` (the caller already resolved it), so there is no unreachable "not a graft" guard.
 */
function graftHeld(graftId: string, slot: AbilitySlot, owned: readonly string[]): boolean {
  let held = false;
  for (const id of owned) {
    if (id === graftId) held = true;
    else if (parseRestore(id) === slot)
      held = false; // native reclaimed this slot
    else if (CHAR_UPGRADES[id]?.replaces === slot) held = false; // another graft took the slot
  }
  return held;
}

/**
 * Whether `id` is at its stacking cap, so it should not be re-offered / re-picked. A
 * GRAFT (maxStacks 1) is special: "at max" means CURRENTLY INSTALLED, not merely owned —
 * a graft reclaimed off its slot (still in the append-only owned list) is NOT at max, so
 * it can be re-offered and re-grafted (the replay engine re-seats the stashed def with its
 * boons intact). Every other upgrade is the plain owned-count vs its cap.
 */
export function charUpgradeAtMax(id: string, owned: readonly string[]): boolean {
  // A graft is capped only while it occupies its slot (item 18/reclaim); a stashed one
  // is re-offerable so the hero can alternate the skill back and forth.
  const slot = CHAR_UPGRADES[id]?.replaces;
  if (slot) return graftHeld(id, slot, owned);
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
export function occupancyAfter(
  classId: ClassId,
  owned: readonly string[],
): Record<AbilitySlot, SkillKey> {
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
 *   • GRAFT grands (item 18) — while the hero OWNS that graft, even if it is currently
 *     reclaimed off its slot. A stashed graft stays re-offerable (charUpgradeAtMax is
 *     occupancy-aware) and re-seats its grands intact on re-graft, so its grand must
 *     persist across a reclaim too — else the graft returns but its grand stays gone,
 *     the exact path-split of item 8. Class-agnostic, so the SAME graft grand can
 *     surface for more than one owned class; the caller dedupes by id.
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
    if (ownedChar.some((id) => canonicalGrandId(id) === d.id)) continue;
    if (d.subSkillId && !ownedSubSkills.includes(d.subSkillId)) continue;
    // A base-skill grand whose native slot has been grafted over is dead (item 19).
    if (d.skillSlot && occupant[d.skillSlot] !== d.skillSlot) continue;
    // A subclass grand only surfaces once the hero holds a skill of that subclass.
    if (d.subclassId && !pickedSubclasses.has(d.subclassId)) continue;
    out.push(d);
  }
  // Graft grands (item 18): offered while the hero OWNS the graft AND it applies to this
  // class — NOT only while it is live in a slot. A reclaimed graft is owned-but-stashed yet
  // stays re-offerable and re-seats its grands on re-graft, so gating its grand on live
  // occupancy would make the grand vanish after a reclaim while the graft itself came back
  // — item 8's path split. Ownership (append-only list) + applicability is the honest,
  // graft-data-model-driven condition: a graft the hero never took, or one this class can't
  // wield (its `exclude` list, so it never seated), still leaks no grand.
  for (const d of GRAFT_GRANDS) {
    if (charUpgradeAtMax(d.id, ownedChar)) continue;
    if (!ownedChar.includes(d.graftId!)) continue;
    const graft = CHAR_UPGRADES[d.graftId!];
    if (!graft || !upgradeAllowedFor(graft, classId)) continue;
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
  // One readout per stat the pick MOVED — driven by the shared PERSISTENT_STATS
  // model, so a new stat mechanic (e.g. crit) surfaces here automatically. Stats a
  // class upgrade never tugs (terrainResist; crit today) simply never differ, so
  // they never appear — no per-stat wiring needed.
  return PERSISTENT_STATS.filter((r) => after[r.key] !== before[r.key])
    .map((r) => `${r.readout(after)} ${r.readoutNoun}`)
    .join(' · ');
}

/** Salt for the Forge char-upgrade rename stream (decorrelated from ability/class streams). */
const FORGE_CHARUP_SALT = 0xf5e3;

/** The base slot a boon empowers (for the Forge rename), or null for a stat-only /
 *  hybrid / graft boon that doesn't tie to exactly one native slot. */
function boonTargetSlot(def: CharUpgradeDef): AbilitySlot | null {
  if (def.classId === 'any') return null; // grafts / cross-class styles — left as authored
  if (def.skillSlot) return def.skillSlot;
  const slots = BOON_SLOTS[def.id];
  return slots && slots.length > 0 ? slots[0] : null;
}

/**
 * Resolve a character upgrade for the active run (item: forge upgrade synthesis). In a
 * Chaos Forge run a skill-targeting boon is re-presented for the FUSED skill it now
 * empowers: its NAME is blended (the same forgeName method skill names use) from the
 * boon's name + the fused skill's name, and its DESCRIPTION is regenerated to reference
 * that skill — the offer card's "Now →" line already resolves the fused skill's real
 * before→after. The `apply` is unchanged: the flat-field tweak flows to the fused
 * skill's components at spawn (applyCharUpgrades' refresh), so the boon genuinely
 * improves the synthesized skill rather than no-opping. Byte-identical to the canonical
 * def when Forge is off (forgeVariant returns null); stat-only / hybrid boons, which
 * tug player stats or swap whole kits, are left exactly as authored.
 */
export function getCharUpgrade(id: string): CharUpgradeDef | undefined {
  const base = CHAR_UPGRADES[id];
  if (!base) return undefined;
  return forgeVariant('charUpgrade', id, (seed) => forgeCharUpgrade(seed, base)) ?? base;
}

/** Canonical (Forge-independent) NAME of a subclass or one of its skills — from the
 *  static SUBCLASSES data, so a Forge description can swap the ORIGINAL name (which
 *  the authored copy embeds) for the run's blended one (items 3 & 4). */
function canonSubclassName(subclassId: string): string | undefined {
  return ALL_SUBCLASSES.find((s) => s.id === subclassId)?.name;
}
function canonSubSkillName(subSkillId: string): string | undefined {
  for (const sub of ALL_SUBCLASSES) {
    const sk = sub.skills.find((s) => s.id === subSkillId);
    if (sk) return sk.name;
  }
  return undefined;
}
/** Swap the ORIGINAL name for the run's blended one throughout a description; a no-op
 *  when the original doesn't appear (or already equals the new name). */
function swapDescName(desc: string, from: string | undefined, to: string): string {
  return from && from !== to ? desc.split(from).join(to) : desc;
}

/**
 * Re-present a character upgrade for the active Forge run (items: forge upgrade
 * synthesis + naming). A skill-targeting boon / grand is given a NAME blended from
 * the boon + the FUSED thing it now empowers (the same forgeName method skill names
 * use), and a DESCRIPTION regenerated to reference that run's blended content:
 *   • sub-skill "Honed X" upgrades (`subSkillId`, item 3) rename from the fused
 *     sub-skill and swap its name in the copy;
 *   • subclass grands (`subclassId`, item 4) rename from the fused SUBCLASS and swap
 *     its name in the copy (so "Your Champion skills…" names the blended subclass);
 *   • base-skill grands / class boons (a target slot) keep the existing
 *     "empowers your <fused skill>" regeneration;
 *   • stat-only CLASS capstones (`grand`, no slot) rename from the fused class.
 * The `apply` is unchanged — it flows to the fused skill's components at spawn
 * (applyCharUpgrades' refresh, item 2). Byte-identical to the canonical def off Forge;
 * stat-only / hybrid boons are left as authored.
 */
function forgeCharUpgrade(seed: number, base: CharUpgradeDef): CharUpgradeDef {
  const rng = new Rng(mixSeed(seed, FORGE_CHARUP_SALT, hashStr(base.id)));
  const blend = (other: string): string => forgeName([base.name, other], (k) => rng.int(0, k - 1));

  // item 3 — a per-sub-skill "Honed X" upgrade: rename after the fused sub-skill.
  if (base.subSkillId) {
    const fused = getSubSkill(base.subSkillId);
    if (!fused) return base;
    const natureRecipe =
      base.grand &&
      (NATURE_HONED[base.subSkillId] ||
        CASTER_HONED[base.subSkillId] ||
        SUPPORT_HONED[base.subSkillId]);
    const native = natureRecipe
      ? subclassOfSkill(base.subSkillId)!.skills.find((skill) => skill.id === base.subSkillId)!
          .ability
      : undefined;
    const natureFallback =
      native &&
      (fused.ability.kind !== native.kind ||
        (['rg_beast_snare', 'dr_land_wall'].includes(base.subSkillId) &&
          !fused.ability.zoneTickDamage) ||
        (!!CASTER_HONED[base.subSkillId] && !casterRecipeMatches(base.subSkillId, fused.ability)) ||
        (!!SUPPORT_HONED[base.subSkillId] &&
          !supportRecipeMatches(base.subSkillId, fused.ability)));
    const supportHonedFallback =
      !base.grand &&
      SUPPORT_HONED[base.subSkillId] &&
      !applyAuthoredHoned(base.subSkillId, structuredClone(fused.ability) as PlayerAbilityDef);
    return {
      ...base,
      name: blend(fused.name),
      desc: supportHonedFallback
        ? `${simpleHonedText(base.subSkillId)} (stacks to ${MAX_SKILL_STACKS}).`
        : natureFallback
          ? `Reforged capstone — ${fused.name}: +25% damage/healing and +15% area/reach where present; stronger buffs`
          : base.grand || SUB_SKILL_TUNE_TEXT[base.subSkillId] || SUPPORT_HONED[base.subSkillId]
            ? `${fused.name}: ${swapDescName(base.desc, canonSubSkillName(base.subSkillId), fused.name)}`
            : `${simpleHonedText(base.subSkillId)} (stacks to ${MAX_SKILL_STACKS}).`,
    };
  }

  // item 4 — a subclass grand: rename after the fused subclass + swap its name in the copy.
  if (base.subclassId) {
    const fused = getSubclass(base.subclassId);
    if (!fused) return base;
    return {
      ...base,
      name: blend(fused.name),
      desc:
        base.id === 'wa_fiend_g_a'
          ? `${getClass('warlock').abilities.a3.name} opens a fixed firing conduit along your aim; press it again for one aimed ember. See the skill preview for duration, reach and damage`
          : base.id === 'ro_assassin_g_a'
            ? `${getClass('rogue').abilities.a2.name} leaves a 6s departure anchor. A later direct hit unlocks a 2s return: press the same skill again. Prepared executions grow stronger`
            : swapDescName(base.desc, canonSubclassName(base.subclassId), fused.name),
    };
  }

  // Skill-targeting boon / base-skill grand: rename after the fused base skill.
  const slot = boonTargetSlot(base);
  if (slot) {
    const fused = getClass(base.classId as ClassId).abilities[slot];
    const kind = base.grand ? 'Reforged capstone' : 'Reforged boon';
    return { ...base, name: blend(fused.name), desc: `${kind} — empowers your ${fused.name}` };
  }

  // item 4 — a stat-only CLASS capstone: rename after the fused class (its copy names
  // player stats, not a subclass, so it needs no name-swap).
  if (base.grand && base.classId !== 'any') {
    return { ...base, name: blend(getClass(base.classId).name) };
  }

  return base; // stat-only non-grand boon / hybrid — left exactly as authored.
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
/**
 * item 5 — a concrete before→after line for a SUBCLASS upgrade offer, since these
 * tune sub-abilities (sub1/sub2) that the base-slot preview never sees. A per-skill
 * "Honed" boon (`subSkillId`) previews exactly that skill; a subclass grand
 * (`subclassId`) previews every equipped skill of that subclass. Returns null for a
 * non-subclass offer, or if nothing resolves. Formatted to match the base cards' "Now
 * →" convention, plus a "(was …)" so the improvement is explicit.
 */
function describeSubOfferPreview(
  def: CharUpgradeDef,
  ownedChar: readonly string[],
  subSkills: readonly string[],
  beforeMods?: { cooldownMult: number; castMult: number; damageMult: number },
  afterMods?: { cooldownMult: number; castMult: number; damageMult: number },
): string | null {
  let targetIds: string[];
  if (def.subSkillId) targetIds = [def.subSkillId];
  else if (def.subclassId)
    targetIds = subSkills.filter((sid) => subclassOfSkill(sid)?.id === def.subclassId);
  else return null;
  const clauses: string[] = [];
  for (const sid of targetIds) {
    const before = previewSubAbility(sid, ownedChar);
    const after = previewSubAbility(sid, [...ownedChar, def.id]);
    if (!before || !after) continue;
    const beforeLine = describeAbility(before, beforeMods);
    const afterLine = describeAbility(after, afterMods);
    clauses.push(
      beforeLine === afterLine
        ? `${after.name}: ${afterLine}`
        : `${after.name}: ${afterLine} (was ${beforeLine})`,
    );
  }
  return clauses.length > 0 ? `Now → ${clauses.join(' · ')}` : null;
}

export function describeCharOffer(
  classId: ClassId,
  ownedChar: readonly string[],
  id: string,
  /** The hero's equipped sub-skill ids — lets a SUBCLASS-grand offer preview the
   *  actual skills it will retune (item 5). Empty for callers that don't track subs. */
  subSkills: readonly string[] = [],
  genericUpgrades: readonly UpgradeId[] = [],
): CharOfferView | null {
  const current = previewAbilityTable(classId, [...ownedChar]);
  const beforeMods = genericUpgrades.length
    ? previewPlayerStats(classId, [...genericUpgrades], [...ownedChar])
    : undefined;
  const afterMods = genericUpgrades.length
    ? previewPlayerStats(classId, [...genericUpgrades], [...ownedChar, id])
    : undefined;
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
      desc: `${boon.desc}. Upgrades your grafted ${skillName}. Now → ${describeAbility(previewAbilityTable(classId, [...ownedChar, id])[graftup.slot], afterMods)}`,
    };
  }
  const def = getCharUpgrade(id); // Forge run → the boon re-presented for its fused skill
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
      .map((s) => `${after[s].name}: ${describeAbility(after[s], afterMods)}`)
      .join(' · ');
    // A player-stat boon (Thick Hide, War Priest, Second Wind…) touches no slot, so
    // also resolve its stat readout (item 6) — cards show the resulting values, not
    // just the prose delta. A boon that moves both a slot and a stat shows both.
    const statPreview = describeStatReadout(classId, ownedChar, id);
    const preview = [slotPreview, statPreview].filter(Boolean).join(' · ');
    if (preview) desc = `${desc}. Now → ${preview}`;
  }
  // item 5 — subclass upgrades (Honed skills + subclass grands) tune sub-abilities,
  // invisible to the base-slot preview above. Resolve the affected sub-ability(ies)
  // so the card shows the concrete before→after, matching base-class card quality.
  const subPreview = describeSubOfferPreview(def, ownedChar, subSkills, beforeMods, afterMods);
  // Strip a trailing period first (Honed-skill prose ends in one) so the join reads
  // as a single sentence break, not "…).. Now →".
  if (subPreview) desc = `${desc.replace(/\.\s*$/, '')}. ${subPreview}`;
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
  const def = getCharUpgrade(id); // Forge run → the boon re-presented for its fused skill
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

/**
 * item: reroll — return a fresh, mutable copy of `pool` with the `exclude` ids dropped
 * so a re-draw is biased AWAY from the offers currently shown; but if dropping them would
 * leave fewer than `need`, keep them (graceful degradation, so the roll still fills up).
 */
function biasAway<T>(
  pool: readonly T[],
  exclude: readonly string[],
  need: number,
  idOf: (x: T) => string,
): T[] {
  if (exclude.length === 0) return pool.slice();
  const ex = new Set(exclude);
  const fresh = pool.filter((x) => !ex.has(idOf(x)));
  return fresh.length >= need ? fresh : pool.slice();
}

export function rollCharChoices(
  classId: ClassId,
  n: number,
  rnd: () => number,
  owned: readonly string[] = [],
  extraClasses: readonly ClassId[] = [],
  subSkills: readonly string[] = [],
  /**
   * item: reroll — boon ids to BIAS AWAY FROM (the offers currently shown) so a re-roll
   * surfaces different picks. A soft bias applied to the main draw pool: if dropping them
   * would starve `n`, the excluded ids come back (graceful degradation). Empty by default
   * → the seeded offer stream is byte-for-byte unchanged.
   */
  exclude: readonly string[] = [],
): string[] {
  const out: string[] = [];
  const extras = extraClasses.filter((c) => c !== classId);
  // Slot occupancy after the hero's owned upgrades — drives the item-26 filter that
  // drops boons which only upgrade a skill that's been grafted over. Occupancy is
  // PER CLASS: a graft can displace a slot on ANY class the hero owns (item 14/23), so
  // each class must filter against its OWN replayed occupancy — not the main class's.
  // (Filtering only the main class let a grafted-over EXTRA class still offer its now
  // dead boons — #69.) Replayed once per owned class; all-native for a graft-less
  // class, so the common case filters nothing and the seeded offer stream is unchanged.
  const occByClass = new Map<ClassId, Record<AbilitySlot, SkillKey> | null>();
  for (const cid of new Set<ClassId>([classId, ...extras])) {
    occByClass.set(cid, CLASSES[cid] ? occupancyAfter(cid, owned) : null);
  }
  const liveBoonFor = (cid: ClassId, id: string): boolean => {
    const occ = occByClass.get(cid)!; // set above for classId + every extra
    return !occ || boonUpgradesLiveSkill(occ, id);
  };
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
    const push = (cid: ClassId, w: number): void => {
      for (const d of CHAR_UPGRADES_BY_CLASS[cid] ?? []) {
        if (charUpgradeAtMax(d.id, owned)) continue;
        if (!liveBoonFor(cid, d.id)) continue; // item 26/#69: grafted-over slot → drop
        weighted.push({ id: d.id, w });
      }
    };
    push(classId, MAIN_CLASS_WEIGHT);
    for (const c of extras) push(c, 1);
    // item 6: equipped-sub-skill boons weight with the main class.
    for (const id of subEligible) weighted.push({ id, w: MAIN_CLASS_WEIGHT });
    // item: reroll — bias away from the currently-shown ids, unless that starves `n`.
    const drawW = biasAway(weighted, exclude, n, (x) => x.id);
    const count = Math.min(n, drawW.length);
    while (out.length < count && drawW.length > 0) {
      const total = drawW.reduce((s, x) => s + x.w, 0);
      let roll = rnd() * total;
      let idx = drawW.length - 1;
      for (let i = 0; i < drawW.length; i++) {
        roll -= drawW[i].w;
        if (roll <= 0) {
          idx = i;
          break;
        }
      }
      out.push(drawW[idx].id);
      drawW.splice(idx, 1);
    }
  } else {
    const base = [...(CHAR_UPGRADES_BY_CLASS[classId] ?? []).map((d) => d.id), ...subEligible] // item 6
      .filter((id) => !charUpgradeAtMax(id, owned) && liveBoonFor(classId, id)); // item 26 filter
    const pool = biasAway(base, exclude, n, (id) => id); // item: reroll exclude-bias
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
  // Graceful degradation (items 12 & 14): if the normal class pool couldn't supply n
  // picks — every common boon already owned at its cap, or a run deep into Endless —
  // top the offer up from the remaining GENUINE upgrades (the class's eligible cross-
  // class HYBRIDS) and the RESTORE / graftup reoffers. Two invariants shape the fill:
  //   • (late-run offers) genuine upgrades are drawn FIRST, with the SEEDED rng, so the
  //     set never collapses to only skill-change / skill-restore options while a real
  //     upgrade remains, and a deep-run offer stays VARIED between bosses instead of
  //     repeating one fixed list — the old fill drew no rng, so every maxed-out hero saw
  //     the identical degraded set every fight (the reported bug);
  //   • (item 14) one slot is RESERVED for a reoffer whenever a graft has displaced a
  //     skill, so its reclaim keeps surfacing rather than being crowded out by hybrids.
  // Only runs when `out` is short (a pool that already yields n is byte-for-byte the
  // seeded stream it always was). Gated on a recognised class so an unknown class still
  // yields nothing (a hybrid is technically "allowed" for any non-excluded class, which
  // must not resurrect offers for a class that has no kit at all).
  if (CLASSES[classId] && out.length < n) {
    const realFill = eligible.map((h) => h.id).filter((id) => !out.includes(id));
    const swapFill = reoffers.filter((id) => !out.includes(id)); // natural order: reclaim first
    const reserve = swapFill.length > 0 ? 1 : 0; // hold a slot for the reclaim (item 14)
    const drawReals = (limit: number): void => {
      while (out.length < limit && realFill.length > 0) {
        const i = Math.floor(rnd() * realFill.length) % realFill.length;
        out.push(realFill[i]);
        realFill.splice(i, 1);
      }
    };
    drawReals(n - reserve); // genuine upgrades first (leave room for one reclaim)
    for (const id of swapFill) {
      if (out.length >= n) break;
      out.push(id); // reclaim / graftup reoffers — reclaim leads, so item 14 holds
    }
    drawReals(n); // any slot the reoffers didn't need falls back to more genuine picks
  }
  return out;
}
