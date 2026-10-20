import { curseDescription, type CurseStyle } from '../core/curses';
import { absorptionDescription } from '../combat/absorption';
import { auraText } from './paladinText';
import type { AbsorptionGrant } from '../combat/absorption';
/**
 * Warband — data-driven class definitions (Knight / Ranger / Mage / Cleric).
 * All balance numbers per the build brief §7; tweak freely.
 */
import { flowPayoff } from './martialRules';
import { bardSongText } from './bardText';
import type { ClassId, AbilitySlot, ExtSlot, ZoneKind, CloseBurst } from '../core/types';
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
  /** Resolved-cast metadata, never authored or retained between casts. */
  momentumUsed?: number;
  flowUsed?: boolean;
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

  iframes?: number; // dash or timed self-immunity duration
  /**
   * item 2 — marks a dash-nature mover (kind:'dash') as a LEAP/JUMP: it clears LOW
   * cover mid-flight and lands at the target (tall silhouettes — pillars, monoliths,
   * crystals — still stop it), rather than a roll/dash/charge which ends at the first
   * obstacle. Ignored for kind:'blink' (a teleport passes through everything).
   * Absent = a grounded dash/roll/charge that stops at cover.
   */
  leap?: boolean;
  stun?: number; // applied to boss/adds on hit
  slowMult?: number; // < 1 slows target move speed
  slowDuration?: number;
  /**
   * item 11 — FORCED MOVEMENT on struck enemies (players can now shove, not just
   * bosses). `knockback` pushes them this many units AWAY from the caster; `pull`
   * drags them this many units TOWARD the caster. Mutually exclusive per ability.
   * A rooted target resists unless the impulse ≥ FORCE_OVERCOME_ROOT (see
   * combat/world). Applied by applyStrikeRiders on a melee/pbaoe/dash-landing hit.
   */
  knockback?: number;
  pull?: number;
  /**
   * item 11 — a `blink` that SWAPS space: on arrival, every enemy within `range`
   * of the caster is reflected across the caster's position (front ↔ back), a
   * dimension-shuffle peel (Mage Dimension Door). Absent = a plain blink.
   */
  swap?: boolean;
  /**
   * item 9 — SLUGGISH: a wind-up / cast-time factor (≥ 1) this ability inflicts on
   * enemies it affects, stretching their telegraphed wind-up (Warlock Hex, Rogue
   * Poison Vial). On a `groundZone` it rides the spawned zone (re-applied per tick
   * while an enemy stands inside); on a direct hit (meleeCone/projectile/pbaoe) it
   * applies once as a timed debuff (`castSlowDuration`). Absent / ≤ 1 = none.
   */
  castSlow?: number;
  /** item 9 — seconds a direct-hit `castSlow` debuff lasts (zone casts re-tick, so
   * they ignore this). Defaults to a short window when the rider is present. */
  castSlowDuration?: number;
  /**
   * item 7 — FLIGHT: seconds of airborne flight this ability grants its caster (a
   * selfBuff / buffAlly). While flying the hero soars over ground hazards + ground
   * zones (Sorcerer Dragon Wings). Absent = grants no flight.
   */
  grantsFlight?: number;
  /**
   * item 8 — a `groundZone` ability whose zone reaches AIRBORNE targets too (Ranger
   * Rain of Arrows rains on flyers; Mage Otiluke Bind is a floating cage). Absent =
   * a GROUND effect that flyers hover over (the default for most zone kinds).
   */
  airborne?: boolean;

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
   * item 13 — a SIGNATURE crit lean this ability carries, ADDED to the hero's base
   * crit stats for its own hits: `critChanceBonus` raises the crit chance (0.25 =
   * +25% chance), `critMultBonus` sharpens the crit (0.5 = +0.5× on a crit). Lets a
   * precision strike crit more often / harder than the basic — the modern way to
   * key an ability off crit (the Rogue's identity). Absent = plain crit stats.
   */
  critChanceBonus?: number;
  critMultBonus?: number;
  /** Guarded real damage readies one +30% connecting melee counter for 4s. */
  guardWindow?: number;
  mirrorImages?: { count: number; duration: number };
  frontGuard?: { charges: number; duration: number; counter?: number };
  steadfastDuration?: number;
  cleanseOnHeal?: boolean;
  /** A connecting cone readies a counter AFTER the entire strike and a short parry. */
  parryOnHit?: number;
  /** Fixed 2% max-HP/s cost and 20% effective direct-damage leech, duration in seconds. */
  bloodRage?: number;
  /** Walking, rather than melee hits, builds momentum during this window. */
  wolfHunt?: number;
  /** Connecting hits extend existing Flow by this amount, at most 1s per preparation. */
  flowExtendOnHit?: number;
  /** During this window, melee hits build up to 3 finisher momentum stacks. */
  momentumWindow?: number;
  spendsMomentum?: boolean;
  /** Successful mobility prepares an instant, wider/longer special for this long. */
  prepareFlow?: number;
  consumesFlow?: boolean;
  /** Additional distinct bodies a direct projectile may pass through (no blast/zone). */
  pierce?: number;
  /** Extra direct healing at <=35% HP, plus a 15% ward for 2s after effective rescue. */
  /** Preserve pre-buff adaptive difficulty credit while retaining real combat values. */
  balanceDamageScale?: number;
  balanceZoneHealScale?: number;
  paladinAura?: { kind: 'bulwark' | 'pursuit' | 'renewal'; radius: number; duration: number };
  absorption?: AbsorptionGrant;
  overflowShield?: boolean;
  rescueHealBonus?: number;
  /** One non-stacking recovery grove at the healed ally's location. */
  recoveryZone?: { radius: number; duration: number; tickHeal: number; balanceHealScale?: number };
  /** Share a timed ward with nearby OTHER allies when this utility resolves. */
  allyWard?: { range: number; mult: number; duration: number };
  /** Mitigation refreshed on allies standing in this ground zone. */
  zoneAllyDefMult?: number;
  zoneAllyMoveMult?: number;
  balanceZoneDamageScale?: number;
  /** Two timed verses empower a subsequent group rally; basics never contribute. */
  bardSong?: 'harmony' | 'discord' | 'chorus';
  /** Extra damage against currently slowed, rooted or stunned enemies. */
  controlDamageBonus?: number;
  /** Seconds of one-use spell surge granted by a utility ability. */
  prepareSurge?: number;
  /** Consume surge +20% direct damage and half wind-up for this spell. */
  consumesSurge?: boolean;
  /** Surge adds one projectile, sharing its enhanced damage budget. */
  surgeTwin?: boolean;
  /** Prepare one guaranteed critical precision strike for this many seconds. */
  prepareCrit?: number;
  /** Only marked melee skills consume preparation; basics leave it available. */
  consumesPrecision?: boolean;
  /** A damaging burst also arms one counterburst (40% damage) for this window. */
  rebukeDuration?: number;
  /** Counterburst applies a personal searing curse before its damage. */
  rebukeCurseBonus?: number;
  closeBurst?: CloseBurst;
  /** Radius and duration of a weakening challenge; next connecting melee readies a counter. */
  warCry?: { radius: number; duration: number };
  /** Single-target poison prepared for the next appropriate positive direct hit. */
  venomCoating?: { damage: number; duration: number; window: number };
  /** Per-stack tick damage of a short ground fissure after spending Momentum. */
  momentumFissure?: number;
  /** A positive direct hit on a personally cursed foe weakens it for this duration. */
  cursePayoff?: number;
  /** This zone marks enemies: only its owner deals this much extra damage. */
  curseBonus?: number;
  curseStyle?: CurseStyle;

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
    blurb:
      'Guard incoming hits, then counter with a stronger melee strike while holding the frontline.',
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
        guardWindow: 4,
        frontGuard: { charges: 1, duration: 4 },
        kind: 'taunt',
        cooldown: 12,
        damage: 0,
        buffDuration: 4,
      },
      a2: {
        slot: 'a2',
        name: 'Shield Wall',
        guardWindow: 4,
        kind: 'selfBuff',
        cooldown: 16,
        damage: 0,
        frontGuard: { charges: 2, duration: 4 },
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
    blurb: 'Hold firing lanes with Rain of Arrows and send piercing volleys through enemy ranks.',
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
        pierce: 1,
        kind: 'projectile',
        cooldown: 6,
        // item 10 — an AIMED volley: the archer draws (a brief wind-up) then looses
        // a heavier three-arrow spread. Winding up at range is far safer than in
        // melee, so the aimed-shot fantasy fits the Ranger, and Focus finds a home.
        damage: 19,
        projSpeed: 700,
        projCount: 3,
        spreadDeg: 30,
        castTime: 0.3,
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
        slowMult: 0.75,
        slowDuration: 0.8,
        // item 8 — arrows raining from above hit flyers too. AIRBORNE by its
        // zoneKind ('rainOfArrows' → isAirborneZoneKind), so no explicit flag needed.
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
    blurb: 'Control the enemy, then exploit the opening with a devastating spell.',
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
        controlDamageBonus: 0.25,
        kind: 'projectile',
        cooldown: 7,
        // item 56: the Mage's blurb promises "highest burst"; keep its bomb the
        // single biggest hit in the game (just above the Sorcerer's Meteor 78/110)
        // so the claim is honest rather than out-classed by the newer caster.
        damage: 80,
        projSpeed: 480,
        projCount: 1,
        castTime: 0.7,
        impactRadius: 110,
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
        // item 56: every other escape in the game grants brief i-frames; Blink was
        // the lone exception, leaving the "lowest HP" glass cannon with the least
        // safe getaway. Give it a short invuln window so escapes are at parity.
        iframes: 0.2,
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
    blurb: 'Rescues the critically wounded and creates safe healing ground.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Smite',
        kind: 'projectile',
        cooldown: 0.6,
        damage: 16,
        balanceDamageScale: 12 / 16,
        projSpeed: 560,
        projCount: 1,
      },
      a1: {
        slot: 'a1',
        name: 'Heal',
        rescueHealBonus: 0.3,
        kind: 'heal',
        cooldown: 3,
        damage: 75, // heal amount
        balanceDamageScale: 60 / 75,
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
        zoneTickHeal: 14,
        balanceZoneHealScale: 10 / 14,
        overflowShield: true,
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
    blurb: 'Build momentum with melee hits during Rage, then spend it on a larger finisher.',
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
        momentumWindow: 6,
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
        leap: true, // item 2: a jump — clears low cover, lands at the target
      },
      a3: {
        slot: 'a3',
        name: 'Whirlwind',
        spendsMomentum: true,
        kind: 'pbaoe',
        cooldown: 9,
        // item 10 — a WIND-UP heavy hit: the Barbarian rears back and revs the
        // spin (rooted, telegraphed) for a landslide blow. A committed trade a
        // bruiser can afford, and the wind-up gives Focus a home on the class.
        damage: 40,
        radius: 135,
        castTime: 0.4,
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
        // item 13 — the Rogue lands its blade precisely: a touch of extra crit even
        // on the basic, keying the class off the (previously barely-used) crit stat.
        critChanceBonus: 0.12,
      },
      a1: {
        slot: 'a1',
        name: 'Backstab',
        consumesPrecision: true,
        kind: 'meleeCone',
        cooldown: 5,
        // item 13 — the flagship CRIT strike. Lower flat damage, a big crit lean:
        // Backstab crits ~35% of the time for ~1.8×, so it reads as a devastating
        // gamble (its namesake) rather than a flat nuke — same-ish output, far more
        // crit-driven. The Rogue's identity, modernized around crit.
        damage: 50,
        range: 58,
        halfAngleDeg: 32,
        critChanceBonus: 0.3,
        critMultBonus: 0.3,
      },
      a2: {
        slot: 'a2',
        name: 'Shadowstep',
        prepareCrit: 4,
        kind: 'blink',
        cooldown: 6,
        damage: 0,
        range: 240,
        iframes: 0.3,
      },
      a3: {
        slot: 'a3',
        name: 'Poison Vial',
        slowMult: 0.8,
        slowDuration: 1.2,
        kind: 'groundZone',
        cooldown: 10,
        damage: 0,
        range: 420,
        radius: 105,
        zoneDuration: 4,
        zoneTickDamage: 11,
        // item 9 — the venom fogs a boss's coordination: a lighter 25% wind-up
        // slow while it stands in the cloud (the Rogue debilitates, the Warlock's
        // Hex hits harder). Ground-based, so a flyer is unaffected (item 8).
        castSlow: 1.25,
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
    blurb: 'Holds holy ground and shares frontline protection with nearby allies.',
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
        zoneAllyDefMult: 0.9,
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
        paladinAura: { kind: 'renewal', radius: 220, duration: 5 },
        kind: 'heal',
        cooldown: 6,
        damage: 90,
        range: 360,
      },
      a3: {
        slot: 'a3',
        name: 'Divine Shield',
        paladinAura: { kind: 'bulwark', radius: 220, duration: 5 },
        kind: 'selfBuff',
        cooldown: 16,
        damage: 0,
        iframes: 1.25,
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
    blurb: 'Roots foes in living territory and plants recovery groves for wounded allies.',
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
        zoneTickHeal: 4,
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
        recoveryZone: { radius: 95, duration: 3, tickHeal: 4 },
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
    blurb: 'Weave healing and disruption into verses, then rally the band with Inspiration.',
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
        bardSong: 'chorus',
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
        bardSong: 'harmony',
        kind: 'heal',
        cooldown: 4,
        damage: 50,
        range: 420,
      },
      a3: {
        slot: 'a3',
        name: 'Dissonant Whispers',
        bardSong: 'discord',
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
    blurb:
      'Reposition to prepare Flow, then unleash a longer strike or a wider, instant palm attack.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Flurry of Blows',
        flowExtendOnHit: 0.25,
        kind: 'meleeCone',
        cooldown: 0.4,
        damage: 15,
        range: 66,
        halfAngleDeg: 40,
      },
      a1: {
        slot: 'a1',
        name: 'Stunning Strike',
        consumesFlow: true,
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
        prepareFlow: 4,
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
        consumesFlow: true,
        kind: 'pbaoe',
        cooldown: 9,
        // item 10 — the ki death-touch is a FOCUSED, deliberate technique: a brief
        // wind-up channels ki into a heavier strike. Thematically the Monk's one
        // committed beat (its blur lives in Flurry + Step of the Wind), and Focus
        // (— wind-up) resonates with the class's ki fantasy.
        damage: 36,
        radius: 130,
        castTime: 0.4,
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
    blurb: 'Prepare a surge with defensive magic, then unleash a faster, stronger spell.',
    abilities: {
      basic: {
        slot: 'basic',
        name: 'Chaos Bolt',
        kind: 'projectile',
        // item 56: two bolts at 15 each landed 60 sustained DPS — 50% over every
        // other ranged basic and comfortably past the Mage's own output. Trim to
        // 12 each (48 DPS): still the highest sustained ranged basic (the
        // Sorcerer's "raw output" identity) without dominating the Mage's niche.
        cooldown: 0.5,
        damage: 12,
        projSpeed: 640,
        projCount: 2,
        spreadDeg: 10,
      },
      a1: {
        slot: 'a1',
        name: 'Meteor',
        consumesSurge: true,
        surgeTwin: true,
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
        prepareSurge: 8,
        kind: 'selfBuff',
        cooldown: 14,
        damage: 0,
        mirrorImages: { count: 3, duration: 5 },
        buffMoveMult: 1.15,
        buffDuration: 5,
      },
      a3: {
        slot: 'a3',
        name: 'Arcane Phase',
        prepareSurge: 8,
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
        curseBonus: 0.15,
        kind: 'groundZone',
        cooldown: 11,
        damage: 0,
        range: 460,
        radius: 120,
        zoneDuration: 5,
        zoneTickDamage: 12,
        slowMult: 0.7,
        slowDuration: 1,
        // item 9 — the curse saps its victim's ability to act: a boss standing in
        // the Hex winds up its telegraphed attacks 40% slower, buying the band
        // reaction / interrupt time. The Warlock's signature debilitating zone.
        castSlow: 1.4,
        zoneKind: 'poison',
      },
      a2: {
        slot: 'a2',
        name: 'Hellish Rebuke',
        rebukeDuration: 3,
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
 * The hero's generic (non-ability) multipliers, folded into a described ability's
 * numbers so a skill line reads the REAL effective values. All optional / default 1×.
 */
export interface DescribeMods {
  /** Outgoing-damage multiplier (Mighty + any damage boon) — scales damage fields. */
  damageMult?: number;
  /** Cooldown multiplier (Haste) — scales the cooldown. */
  cooldownMult?: number;
  /** Cast-time multiplier (Focus) — scales the cast time. */
  castMult?: number;
  /**
   * Absolute cooldown floor (seconds) the sim clamps this slot to at use-time. The
   * world tick floors ONLY the basic slot at `BASIC_CD_FLOOR`, so a caller describing
   * a basic passes it here to keep the shown cooldown from printing below what the sim
   * actually delivers once Haste stacks past the floor. Absent ⇒ no floor (every other
   * slot, and every existing caller), so the line stays byte-for-byte unchanged.
   */
  cooldownFloor?: number;
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
 * Pass `mods` to also fold in the hero's generic damage/cooldown/cast multipliers
 * (which the sim applies at use-time), so the line shows the true effective values.
 * `slot` is ignored, so a subclass skill's ability (which carries no slot)
 * describes fine too. Rounds like the reward cards: magnitudes to whole units,
 * seconds to one decimal, ratios to whole percents.
 */
export function describeAbility(def: Omit<PlayerAbilityDef, 'slot'>, mods?: DescribeMods): string {
  // The hero's GENERIC multipliers (Mighty/Haste/Focus and any boon that tugs
  // player.damageMult / cooldownMult / castMult) are applied by the SIM at use-time,
  // on top of the class-upgraded def — so fold them into the displayed numbers here so
  // a pause-menu skill line reads the hero's REAL current damage / cooldown / cast.
  // Absent mods ⇒ all 1× ⇒ the card text is byte-for-byte the authored formatter, so
  // every existing caller (and canonical content) is unchanged. Damage scales the
  // fields the sim runs through damageMult (direct/impact/landing/zone-tick damage);
  // heals and buffs are never damage-scaled (the sim doesn't scale them either).
  const dmgMul = mods?.damageMult ?? 1;
  const cdMul = mods?.cooldownMult ?? 1;
  const castMul = mods?.castMult ?? 1;
  // The sim floors this slot's cooldown at use-time (only the basic slot today, at
  // `BASIC_CD_FLOOR`); fold that same clamp in so the shown cooldown never prints below
  // what the sim actually delivers once Haste stacks past the floor. 0 ⇒ no floor.
  const effCooldown = Math.max(mods?.cooldownFloor ?? 0, def.cooldown * cdMul);
  // Chaos Forge — a synthesized ability regenerates its card text from its
  // recombined component list (there is no author to write copy for a fused
  // skill). Canonical/variance content carries no components and keeps the
  // authored flat-field walk below, so its cards are byte-for-byte unchanged.
  if (def.components) return describeComposed(def.components, effCooldown);
  const n = (v: number): string => `${Math.round(v)}`;
  // Up to two decimals (trailing zeros drop naturally), so a 0.25s i-frame or a
  // 1.1s cooldown both read exactly, matching the reward cards' precision.
  const s = (v: number): string => `${Math.round(v * 100) / 100}s`;
  const parts: string[] = [];

  // --- Primary magnitude (what it does when it lands) ---
  if (def.kind === 'taunt')
    parts.push(
      'Force all bosses to target you for new attacks; raises threat; locked attacks and summons unaffected',
    );
  if (def.kind === 'heal' && def.damage > 0) {
    parts.push(`Heal ${n(def.damage)}`); // heals aren't damage-scaled
  } else if (def.damage > 0) {
    const count = def.projCount ?? 1;
    const dmg = def.damage * dmgMul;
    parts.push(count > 1 ? `${count}× ${n(dmg)} dmg` : `${n(dmg)} dmg`);
  }
  if (def.landingDamage) parts.push(`${n(def.landingDamage * dmgMul)} landing dmg`);
  if (def.zoneTickDamage) parts.push(`${n(def.zoneTickDamage * dmgMul)}/tick dmg`);
  if (def.paladinAura) parts.push(auraText(def.paladinAura));
  if (def.absorption) parts.push(absorptionDescription(def.absorption));
  if (def.overflowShield)
    parts.push('unused healing builds a 6s bubble, capped at 30% max HP across all zones');
  if (def.zoneTickHeal) parts.push(`${n(def.zoneTickHeal)}/tick heal`);
  if (def.healOnUse)
    parts.push(`heal ${n(def.healOnUse)}${def.kind === 'selfBuff' ? ' self' : ''}`);

  if (def.rescueHealBonus)
    parts.push(
      `+${n(def.rescueHealBonus * 100)}% heal at ≤35% HP; effective heals add a 6s bubble — 25% healed HP (cap 15% max HP), plus 75% on rescue (extra cap 30% max HP); shared cap 50% max HP`,
    );
  if (def.recoveryZone) {
    const g = def.recoveryZone;
    parts.push(
      `effective heal plants ${n(g.radius)}u recovery grove, ${n(g.tickHeal)}/tick for ${s(g.duration)}; one per caster`,
    );
  }
  if (def.allyWard) {
    const w = def.allyWard;
    parts.push(
      `other allies within ${n(w.range)}u take ${n((1 - w.mult) * 100)}% less damage for ${s(w.duration)}`,
    );
  }
  if (def.zoneAllyDefMult)
    parts.push(`allies inside take ${n((1 - def.zoneAllyDefMult) * 100)}% less damage`);
  if (def.bardSong) parts.push(bardSongText(def.bardSong));

  if (def.parryOnHit)
    parts.push(
      `connecting hit readies next melee counter +30% for 4s; parry takes 40% less damage for ${s(def.parryOnHit)}`,
    );
  if (def.bloodRage)
    parts.push(
      `blood rage ${s(def.bloodRage)} — pay 2% max HP/s (cannot kill you); heal 20% of effective direct damage`,
    );
  if (def.wolfHunt)
    parts.push(
      `wolf hunt ${s(def.wolfHunt)} — walk 120u per momentum stack instead of melee hits; up to 3 stacks, at most 1 per 0.4s`,
    );
  if (def.flowExtendOnHit)
    parts.push(
      `connecting hits extend existing Flow by ${s(def.flowExtendOnHit)}, up to 1s total per preparation`,
    );
  if (def.mirrorImages)
    parts.push(
      `${def.mirrorImages.count} mirror images for ${s(def.mirrorImages.duration)}; each reduces one direct hit by 60%, then breaks; ground damage bypasses`,
    );
  if (def.frontGuard)
    parts.push(
      `block ${def.frontGuard.charges} frontal damage hits in a 120° arc for ${s(def.frontGuard.duration)}; aim to face attacks; ground hazards and control bypass it`,
    );
  if (def.steadfastDuration)
    parts.push(
      `steadfast ${s(def.steadfastDuration)} — release roots and prevent new roots, stuns, pushes and pulls; slows still apply`,
    );
  if (def.cleanseOnHeal)
    parts.push('cleanse movement/control effects from the recipient, even at full health');
  if (def.zoneAllyMoveMult)
    parts.push(`allies in the field gain ${n((def.zoneAllyMoveMult - 1) * 100)}% speed`);
  if (def.guardWindow)
    parts.push(
      `guard ${s(def.guardWindow)}; first damaging nonlethal hit readies next melee hit +30% for 4s`,
    );
  if (def.momentumWindow)
    parts.push(
      `melee hits build up to 3 momentum during ${s(def.momentumWindow)}; marked finishers gain +10% dmg per stack (at most 1 stack per 0.4s)`,
    );
  if (def.spendsMomentum)
    parts.push('spend momentum for +10% dmg and +8u cone reach / +10u burst radius per stack');
  if (def.prepareFlow)
    parts.push(
      `${def.kind === 'selfBuff' ? 'centering yourself' : 'successful movement'} readies Flow for ${s(def.prepareFlow)}; next marked special is instant with more reach`,
    );
  if (def.consumesFlow) parts.push(flowPayoff(def.kind));
  if (def.pierce)
    parts.push(
      `pierce ${n(def.pierce)} additional ${def.pierce === 1 ? 'enemy' : 'enemies'} (direct shots only; blasts/zones use one impact)`,
    );

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
  // item 10 — "wind-up" (not "cast"): the term now spans a caster charging a
  // spell AND a warrior/archer reeling back a heavier blow or aimed shot.
  if (def.castTime) parts.push(`${s(def.castTime * castMul)} wind-up`);
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
  // item 9 — SLUGGISH: how much this ability stretches an enemy's wind-up / cast.
  if (def.castSlow != null && def.castSlow > 1) {
    parts.push(`+${n((def.castSlow - 1) * 100)}% enemy wind-up`);
  }
  // item 11 — forced movement on struck enemies.
  if (def.knockback) parts.push(`knock back ${n(def.knockback)}u`);
  if (def.pull) parts.push(`pull in ${n(def.pull)}u`);
  if (def.swap)
    parts.push(
      'arrival foes return to departure; departure foes scatter outward; moved foes slowed 35% for 2s; roots resist relocation',
    );
  // item 13 — a signature crit lean.
  if (def.critChanceBonus) parts.push(`+${n(def.critChanceBonus * 100)}% crit`);
  if (def.critMultBonus) parts.push(`+${Math.round(def.critMultBonus * 100) / 100}× crit dmg`);

  if (def.controlDamageBonus)
    parts.push(`+${n(def.controlDamageBonus * 100)}% dmg vs slowed/rooted/stunned foes`);
  if (def.prepareSurge) parts.push(`prepare spell surge for ${s(def.prepareSurge)}`);
  if (def.consumesSurge)
    parts.push(
      def.surgeTwin
        ? 'surge +1 projectile sharing +20% total dmg, half wind-up'
        : 'surge +20% dmg, half wind-up',
    );
  if (def.prepareCrit) parts.push(`prepare next precision crit for ${s(def.prepareCrit)}`);
  if (def.consumesPrecision) parts.push('consumes prepared crit');
  if (def.rebukeDuration)
    parts.push(
      `counterburst once for ${n(def.damage * dmgMul * 0.4)} dmg if hurt within ${s(def.rebukeDuration)}`,
    );
  if (def.warCry)
    parts.push(
      `challenge foes within ${n(def.warCry.radius)}u, attacks 20% weaker for ${s(def.warCry.duration)}; next connecting melee cast readies a +30% counter`,
    );
  if (def.venomCoating)
    parts.push(
      `coat next positive direct hit within ${s(def.venomCoating.window)}, poison ${n(def.venomCoating.damage * dmgMul)} dmg/s for ${s(def.venomCoating.duration)}; prepared precision +50% poison; while precision is held, basics preserve coating; no stacks from the same caster`,
    );
  if (def.momentumFissure)
    parts.push(
      `spending Momentum leaves a 3s slowing fissure, ${n(def.momentumFissure * dmgMul)} damage per stack every 0.5s; ground only`,
    );
  if (def.frontGuard?.counter)
    parts.push('each successful frontal block readies a +30% melee counter; counters do not stack');
  if (def.rebukeCurseBonus)
    parts.push(
      `counterburst applies a searing curse +${n(def.rebukeCurseBonus * 100)}% owner dmg for 4s`,
    );
  if (def.closeBurst) {
    const b = def.closeBurst;
    parts.push(
      `next positive direct hit within ${n(b.range)}u or bear claw within ${s(b.duration)} releases a bramble burst for ${n(b.damage * dmgMul)} dmg in ${n(b.radius)}u around you; slows to ${n(b.slowMult * 100)}% for ${s(b.slowDuration)}; misses/ticks preserve readiness`,
    );
  }
  if (def.cursePayoff)
    parts.push(
      `on a positive hit against your cursed foe, 15% weaker attacks and 40% slower wind-ups for ${s(def.cursePayoff)}; no hard interrupt`,
    );
  if (def.curseBonus) parts.push(curseDescription(def.curseBonus, def.curseStyle));

  // --- Buffs (damage/move up, damage-taken down) ---
  if (def.buffDamageMult) parts.push(`+${n((def.buffDamageMult - 1) * 100)}% dmg`);
  if (def.buffMoveMult)
    parts.push(
      `+${n((def.buffMoveMult - 1) * 100)}% move${def.kind === 'heal' ? ' for the effectively healed recipient' : ''}`,
    );
  if (def.buffDefMult) parts.push(`${n((1 - def.buffDefMult) * 100)}% less dmg taken`);

  // --- Duration (a buff's or a ground zone's) ---
  if (def.buffDuration) parts.push(`for ${s(def.buffDuration)}`);
  else if (def.zoneDuration) parts.push(`lasts ${s(def.zoneDuration)}`);

  // --- Sustain / evasion / who it can reach ---
  if (def.lifestealFrac) parts.push(`${n(def.lifestealFrac * 100)}% lifesteal`);
  if (def.iframes)
    parts.push(`${s(def.iframes)} ${def.kind === 'selfBuff' ? 'damage immunity' : 'i-frames'}`);
  // item 7 — flight granted (soar over ground hazards / zones for the window).
  if (def.grantsFlight) parts.push(`fly ${s(def.grantsFlight)}`);
  // item 8 — a zone that reaches flyers reads it out (else it's a ground effect).
  // Display-only default mirrors combat.isAirborneZoneKind (rainOfArrows).
  if (def.kind === 'groundZone' && (def.airborne ?? def.zoneKind === 'rainOfArrows')) {
    parts.push('hits flyers');
  }
  if ((def.kind === 'heal' || def.kind === 'buffAlly') && def.range && def.range > 1) {
    parts.push(`${n(def.range)}u range`);
  }

  // --- Cooldown always closes the line ---
  parts.push(`${s(effCooldown)} cooldown`);

  return parts.join(' · ');
}
