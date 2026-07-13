/**
 * Warband — PROCEDURAL CONTENT GENERATION (per-run rolled kits & monsters). PURE TS.
 *
 * Every hosted session now re-rolls the game's content from the session's master
 * seed while PRESERVING EVERY IDENTITY: a Mage still opens with a bolt, carries a
 * heavy area nuke, a control nova and an escape — but this run's nuke may be a
 * slow, huge "Pyroclasm" where last run's was a snappy little "Emberburst". The
 * same applies to monsters (an Ancient Dragon is always a fire-breathing wyrm,
 * but this run's is bulkier and slower, with a meaner tail) and to the generic
 * between-boss boons (this run's Haste shaves a different slice off cooldowns).
 *
 * WHAT NEVER CHANGES (the identity envelope):
 *   • ids, ability kinds/shapes, slot layout, zone flavours, boss AI (`decide`),
 *     body shapes, colours, radii, roles, threat multipliers, tiers and blurbs;
 *   • which FIELDS an ability has — variance never grafts a stun onto an ability
 *     that had none, never turns one Fireball into three, never removes a slow;
 *   • readability floors — boss telegraph wind-ups never dip below 85% of their
 *     authored value (nor under 0.3s), stuns/silences stay within a small cap of
 *     the authored duration, mitigation buffs can never reach immunity.
 *
 * WHAT ROLLS (the details):
 *   • ability numbers — damage/heal magnitude, cooldown, reach/radius/arc,
 *     projectile speed (and fan size ±1 ONLY where the base is already a fan),
 *     cast/stun/slow/buff/zone timings, lifesteal;
 *   • BUDGET-LINKED: an ability's rolled output is tied to its rolled cooldown
 *     (a harder-hitting roll cycles slower), and a boss that rolls extra HP hits
 *     proportionally softer — so a lucky seed shifts a kit's FEEL, not its power;
 *   • base-skill NAMES, drawn from small hand-authored, mechanic-true banks
 *     ("Fireball" may come up "Cinder Orb" — never "Healing Word");
 *   • class HP / move speed (small, role-preserving jitter);
 *   • monster stats + a rolled epithet ("Broodmother, the Ravenous");
 *   • generic boon magnitudes, names and descriptions (regenerated to match).
 *
 * DETERMINISM: everything derives from (seed, stable id) through mulberry32
 * streams — no Math.random, no Date — so the host and every client generate
 * IDENTICAL content from the shared master seed (StartMsg/LobbyMsg.runSeed), and
 * a typed-in seed or the Run of the Day reproduces the exact same kits, monsters
 * and boon magnitudes for everyone. Each entity draws a FIXED-SIZE roll vector,
 * so field gating can never desynchronise two peers' RNG streams.
 *
 * The module is import-cycle-free: generators take the BASE def as an argument
 * (only type imports from the content modules), and the content getters
 * (`getClass` / `getMonster` / `getUpgrade` / `getSubSkill`) consult the small
 * active-run registry at the bottom. With no run active (menus, playground,
 * tests) every getter returns the canonical authored content unchanged.
 */
import type { AbilitySlot } from '../core/types';
import type { PlayerAbilityDef, ClassDef } from './classes';
import type { MonsterDef, BossAbilityDef } from './monsters';
import type { UpgradeDef } from './upgrades';
import { Rng, mixSeed, clamp } from '../core/math';

// ---------------------------------------------------------------------------
// Seed plumbing
// ---------------------------------------------------------------------------

/** Domain salts so each content family draws from an independent stream. */
const SALT = {
  classStats: 0xc1a5,
  classAbility: 0xab11,
  monster: 0x30b5,
  bossAbility: 0xb0ab,
  upgrade: 0x0b00,
  subSkill: 0x5ab5,
} as const;

/** Deterministically fold a stable string id into the seed stream. */
export function hashStr(s: string): number {
  const codes: number[] = [];
  for (let i = 0; i < s.length; i++) codes.push(s.charCodeAt(i));
  return mixSeed(...codes, s.length);
}

/** A fixed-size vector of uniforms in [0,1) — field gating can't desync peers. */
function rollVector(seed: number, salt: number, key: string, n: number): number[] {
  const rng = new Rng(mixSeed(seed, salt, hashStr(key)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.next());
  return out;
}

/** Map a uniform t∈[0,1) into [lo,hi). */
const u = (t: number, lo: number, hi: number): number => lo + t * (hi - lo);

// Quantizers — rolled numbers stay as clean as the authored ones so the ability
// tooltips (describeAbility) and reward cards read like hand-tuned values.
const qInt = (x: number): number => Math.max(1, Math.round(x));
const q05 = (x: number): number => Math.round(x * 20) / 20; // 0.05 steps (seconds)
const q10 = (x: number): number => Math.round(x * 10) / 10; // 0.1 steps (durations)
const q01 = (x: number): number => Math.round(x * 100) / 100; // percents / fractions
const q5 = (x: number): number => Math.round(x / 5) * 5; // coarse world units

// ---------------------------------------------------------------------------
// Name banks — hand-authored, mechanic-true variants. Index 0 is ALWAYS the
// canonical name, so every bank stays anchored to the skill it re-flavours.
// ---------------------------------------------------------------------------

/** Base-kit skill names, keyed `<classId>.<slot>`. 4 variants per skill. */
export const SKILL_NAME_BANKS: Record<string, string[]> = {
  'knight.basic': ['Cleave', 'Sundering Arc', 'Iron Sweep', 'Wide Hew'],
  'knight.a1': ['Taunt', 'Challenge', 'War Shout', 'Defiant Cry'],
  'knight.a2': ['Shield Wall', 'Iron Bastion', 'Steel Aegis', 'Wallbrace'],
  'knight.a3': ['Shield Bash', 'Rampart Blow', 'Crushing Check', 'Bulwark Slam'],
  'ranger.basic': ['Arrow', 'Swiftshot', 'Longshot', 'Piercer'],
  'ranger.a1': ['Multishot', 'Fan of Arrows', 'Splitshot', 'Twin Quiver'],
  'ranger.a2': ['Rain of Arrows', 'Arrowstorm', 'Skyfall Volley', 'Hail of Shafts'],
  'ranger.a3': ['Roll', 'Tumble', 'Evasive Dash', 'Sidestep'],
  'mage.basic': ['Arcane Bolt', 'Mana Dart', 'Rune Spark', 'Aether Lance'],
  'mage.a1': ['Fireball', 'Cinder Orb', 'Pyroclasm', 'Emberburst'],
  'mage.a2': ['Frost Nova', 'Glacial Ring', 'Rimeburst', "Winter's Grasp"],
  'mage.a3': ['Blink', 'Phase Step', 'Translocate', 'Aether Skip'],
  'cleric.basic': ['Smite', 'Holy Bolt', 'Judgement', 'Radiant Lash'],
  'cleric.a1': ['Heal', 'Mend', 'Restoring Light', 'Grace'],
  'cleric.a2': ['Sanctuary', 'Hallowed Ground', 'Blessed Circle', 'Refuge'],
  'cleric.a3': ['Blessing', 'Benediction', 'Divine Favor', 'Anointment'],
  'barbarian.basic': ['Reckless Swing', 'Wild Hew', 'Savage Arc', 'Bonebreaker'],
  'barbarian.a1': ['Rage', 'Blood Fury', 'Berserk', 'War Trance'],
  'barbarian.a2': ['Leap', 'Skybreaker Jump', 'Crashing Bound', 'Warvault'],
  'barbarian.a3': ['Whirlwind', 'Steel Cyclone', 'Blade Storm', 'Reaping Spin'],
  'rogue.basic': ['Slash', 'Quick Cut', 'Razor Flick', 'Twin Nick'],
  'rogue.a1': ['Backstab', 'Vital Thrust', 'Shadow Lunge', 'Kidney Strike'],
  'rogue.a2': ['Shadowstep', 'Night Slip', 'Smoke Vanish', 'Gloom Stride'],
  'rogue.a3': ['Poison Vial', 'Venom Flask', 'Toxin Burst', 'Blight Bottle'],
  'paladin.basic': ['Holy Strike', 'Radiant Blow', 'Censure', 'Lightbrand'],
  'paladin.a1': ['Consecration', 'Sacred Ground', 'Sanctified Soil', 'Holy Field'],
  'paladin.a2': ['Lay on Hands', 'Divine Touch', 'Healing Hands', 'Mercy'],
  'paladin.a3': ['Divine Shield', 'Aegis of Light', 'Holy Bulwark', "Guardian's Oath"],
  'druid.basic': ['Thornlash', 'Briar Whip', 'Thorn Volley', 'Sting of Oak'],
  'druid.a1': ['Entangle', 'Vine Snare', 'Bramble Trap', 'Root Grasp'],
  'druid.a2': ['Regrowth', 'Wildmend', "Nature's Balm", 'Verdant Surge'],
  'druid.a3': ['Cyclone', 'Gale Ring', 'Leafstorm', 'Tempest Coil'],
  'bard.basic': ['Vicious Mockery', 'Cutting Verse', 'Scathing Quip', 'Barbed Rhyme'],
  'bard.a1': ['Inspiration', 'Battle Anthem', 'Heartening Song', 'Rallying Chord'],
  'bard.a2': ['Healing Word', 'Soothing Refrain', 'Mending Note', 'Lullaby of Life'],
  'bard.a3': ['Dissonant Whispers', 'Discordant Wail', 'Maddening Chord', 'Shattersong'],
  'monk.basic': ['Flurry of Blows', 'Hundred Fists', 'Palm Cascade', 'Storm of Cuffs'],
  'monk.a1': ['Stunning Strike', 'Numbing Palm', 'Pressure Point', 'Dazing Fist'],
  'monk.a2': ['Step of the Wind', 'Zephyr Stride', 'Gale Step', 'Cloudfoot Dash'],
  'monk.a3': ['Quivering Palm', 'Tremor Palm', 'Chi Burst', 'Forbidden Touch'],
  'sorcerer.basic': ['Chaos Bolt', 'Wild Surge', 'Twin Havoc', 'Entropy Dart'],
  'sorcerer.a1': ['Meteor', 'Starfall', 'Cometfall', 'Skyfire'],
  'sorcerer.a2': ['Mirror Image', 'Twinned Guise', 'Phantom Selves', 'Blur of Forms'],
  'sorcerer.a3': ['Arcane Leap', 'Sorcerous Vault', 'Riftjump', 'Mana Spring'],
  'warlock.basic': ['Eldritch Blast', 'Void Lash', 'Pact Bolt', 'Umbral Ray'],
  'warlock.a1': ['Hex', 'Withering Curse', 'Doom Mark', 'Blightbind'],
  'warlock.a2': ['Hellish Rebuke', 'Infernal Riposte', 'Brimstone Burst', "Fiend's Answer"],
  'warlock.a3': ["Dark One's Blessing", "Patron's Boon", 'Fell Bargain', 'Umbral Pact'],
};

/** Epithets appended to a rolled monster's name ("Broodmother, the Ravenous"). */
export const MONSTER_EPITHETS: string[] = [
  'the Ancient',
  'the Ravenous',
  'the Unblinking',
  'the Pale',
  'the Grim',
  'the Thunderous',
  'the Cinder-Scarred',
  'the Vile',
  'the Hollow',
  'the Mirthless',
  'the Storm-Called',
  'the Iron-Willed',
  'the Blood-Crowned',
  'the Nightborn',
  'the Devourer',
  'the Endless',
  'the Cruel',
  'the Withered',
  'the Colossal',
  'the Baleful',
  'the Rotting',
  'the Frost-Touched',
  'the Shrieking',
  'the Silent',
  'the Elder',
  'the Feral',
  'the Grasping',
  'the Dread',
];

/** Generic boon name variants, keyed by upgrade id. Index 0 = canonical. */
export const UPGRADE_NAME_BANKS: Record<string, string[]> = {
  swift: ['Swift', 'Fleet', 'Windborne', 'Quickstep'],
  vigor: ['Vigor', 'Stalwart', 'Thickblood', 'Ironheart'],
  haste: ['Haste', 'Alacrity', 'Quickened', 'Tempo'],
  focus: ['Focus', 'Clarity', 'Keen Mind', 'Spellrush'],
  mighty: ['Mighty', 'Savage', 'Brutal', 'Empowered'],
  bulwark: ['Bulwark', 'Stoneskin', 'Warded', 'Unyielding'],
  renewal: ['Renewal', 'Mending', 'Everbloom', 'Second Breath'],
};

// ---------------------------------------------------------------------------
// Player ability variance
// ---------------------------------------------------------------------------

/**
 * Weighted "output per use" of an ability — the budget the cooldown link
 * conserves. Mirrors the balance engine's shape (zones are commitment-
 * discounted) without the cooldown division, so it is a pure per-use magnitude.
 */
function abilityOutput(ab: Omit<PlayerAbilityDef, 'slot'>): number {
  const zoneTicks = ((ab.zoneDuration ?? 0) / 0.5) * 0.6;
  return (
    ab.damage * Math.max(1, ab.projCount ?? 1) +
    (ab.landingDamage ?? 0) +
    (ab.healOnUse ?? 0) +
    ((ab.zoneTickDamage ?? 0) + (ab.zoneTickHeal ?? 0)) * zoneTicks
  );
}

/** Fixed roll-vector length for one player ability (see indices in the body). */
const AB_ROLLS = 28;

/**
 * Roll one player ability's numeric details within its identity envelope. The
 * `kind`, the SET of fields, and every mechanic gate are preserved; magnitudes
 * jitter and the cooldown follows the rolled output so power stays on budget
 * (±~10% "tilt" — a run's kit can lean hot or cold, never break).
 *
 * Pure: (seed, key, base) → variant. `key` is the stable identity of the skill
 * (e.g. `mage.a1` or a subclass skill id) and also picks the name bank entry.
 */
export function abilityVariant<T extends Omit<PlayerAbilityDef, 'slot'>>(
  seed: number,
  key: string,
  base: T,
  nameBank?: string[],
): T {
  const r = rollVector(seed, SALT.classAbility, key, AB_ROLLS);
  const out: T = { ...base };
  const basic = key.endsWith('.basic');

  // A fan stays a fan, a single shot stays single: ±1 only where the base is
  // already a fan — and never on a BASIC attack, whose count is class fantasy
  // (the Sorcerer's twin Chaos Bolt stays twin). A rolled count REDISTRIBUTES
  // the volley (per-bolt damage anchors to the base volley total), so more
  // bolts never means more budget.
  const baseCount = Math.max(1, base.projCount ?? 1);
  if (baseCount > 1 && !basic) {
    out.projCount = Math.max(2, baseCount + (Math.floor(r[13] * 3) - 1));
  }
  const countComp = baseCount / Math.max(1, out.projCount ?? 1);

  // --- Magnitudes (rolled first; they drive the budget-linked cooldown) ---
  if (base.damage > 0) {
    out.damage = qInt(
      base.damage * countComp * (basic ? u(r[0], 0.85, 1.18) : u(r[0], 0.78, 1.28)),
    );
  }
  if (base.zoneTickDamage) out.zoneTickDamage = qInt(base.zoneTickDamage * u(r[1], 0.8, 1.25));
  if (base.zoneTickHeal) out.zoneTickHeal = qInt(base.zoneTickHeal * u(r[2], 0.8, 1.25));
  if (base.landingDamage) out.landingDamage = qInt(base.landingDamage * u(r[3], 0.8, 1.25));
  if (base.healOnUse) out.healOnUse = qInt(base.healOnUse * u(r[4], 0.8, 1.25));
  // A zone's duration multiplies its real output, so it rolls BEFORE the budget
  // link prices the cooldown (the fixed roll vector keeps streams in sync).
  if (base.zoneDuration) out.zoneDuration = q10(base.zoneDuration * u(r[25], 0.85, 1.2));

  // --- Budget-linked cooldown: rolled output ÷ (1 + tilt) ---
  const tilt = u(r[5], -0.1, 0.1);
  const baseOut = abilityOutput(base);
  let cdF: number;
  if (baseOut > 0) {
    const outF = abilityOutput(out) / baseOut;
    cdF = basic ? clamp(outF / (1 + tilt * 0.5), 0.85, 1.15) : clamp(outF / (1 + tilt), 0.75, 1.3);
  } else {
    // Pure utility (dash / blink / taunt / pure buff): a free, narrow jitter.
    cdF = u(r[6], 0.85, 1.18);
  }
  out.cooldown = Math.max(0.2, q05(base.cooldown * cdF));

  // --- Shape / reach ---
  if (base.range != null) out.range = q5(base.range * u(r[7], 0.88, 1.15));
  if (base.radius != null) out.radius = q5(base.radius * u(r[8], 0.85, 1.18));
  if (base.impactRadius != null) out.impactRadius = q5(base.impactRadius * u(r[9], 0.85, 1.2));
  if (base.halfAngleDeg != null) {
    out.halfAngleDeg = Math.round(clamp(base.halfAngleDeg * u(r[10], 0.88, 1.15), 20, 80));
  }
  if (base.maxRange != null) out.maxRange = q5(base.maxRange * u(r[11], 0.9, 1.12));
  if (base.projSpeed != null) out.projSpeed = q5(base.projSpeed * u(r[12], 0.88, 1.15));
  if (base.spreadDeg != null) out.spreadDeg = Math.round(base.spreadDeg * u(r[14], 0.85, 1.2));

  // --- Timing / control (small caps keep control identity-true) ---
  if (base.castTime) out.castTime = Math.max(0.3, q05(base.castTime * u(r[15], 0.8, 1.15)));
  if (base.stun) out.stun = q05(Math.min(base.stun + 0.4, base.stun * u(r[16], 0.85, 1.15)));
  if (base.freeze)
    out.freeze = q05(Math.min(base.freeze + 0.4, base.freeze * u(r[17], 0.85, 1.15)));
  if (base.iframes) out.iframes = q05(clamp(base.iframes * u(r[18], 0.85, 1.15), 0.15, 0.5));
  if (base.slowMult != null && base.slowMult < 1) {
    const strength = (1 - base.slowMult) * u(r[19], 0.8, 1.2);
    out.slowMult = q05(clamp(1 - strength, 0.2, 0.95));
  }
  if (base.slowDuration) out.slowDuration = q10(base.slowDuration * u(r[20], 0.85, 1.2));

  // --- Buffs (bonus/mitigation jitter; never immunity, never a nerf to zero) ---
  if (base.buffDamageMult) {
    out.buffDamageMult = q01(clamp(1 + (base.buffDamageMult - 1) * u(r[21], 0.75, 1.3), 1.05, 1.6));
  }
  if (base.buffDefMult) {
    const mitigation = (1 - base.buffDefMult) * u(r[22], 0.8, 1.2);
    out.buffDefMult = q01(clamp(1 - mitigation, 0.2, 0.95));
  }
  if (base.buffMoveMult) {
    out.buffMoveMult = q01(clamp(1 + (base.buffMoveMult - 1) * u(r[23], 0.75, 1.3), 1.05, 1.5));
  }
  if (base.buffDuration) out.buffDuration = q10(base.buffDuration * u(r[24], 0.85, 1.2));
  if (base.lifestealFrac) {
    out.lifestealFrac = q01(Math.min(0.35, base.lifestealFrac * u(r[26], 0.8, 1.25)));
  }

  // --- Name (bank pick; index 0 is the canonical name) ---
  if (nameBank && nameBank.length > 0) {
    out.name = nameBank[Math.floor(r[27] * nameBank.length) % nameBank.length];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Class variance
// ---------------------------------------------------------------------------

const SLOTS: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];

/**
 * Roll a whole class kit for a run: per-ability variants (numbers + names) and
 * a small, role-preserving stat jitter (a heavier-HP roll trends a touch
 * slower). Identity — id, name, colour, role, threat, radius, blurb — is kept.
 */
export function classVariant(seed: number, base: ClassDef): ClassDef {
  const r = rollVector(seed, SALT.classStats, base.id, 4);
  const hpF = u(r[0], 0.9, 1.1);
  const moveF = clamp(u(r[1], 0.94, 1.06) * (1 - (hpF - 1) * 0.35), 0.92, 1.08);
  const abilities = {} as Record<AbilitySlot, PlayerAbilityDef>;
  for (const slot of SLOTS) {
    const key = `${base.id}.${slot}`;
    abilities[slot] = abilityVariant(seed, key, base.abilities[slot], SKILL_NAME_BANKS[key]);
  }
  return {
    ...base,
    maxHp: q5(base.maxHp * hpF),
    moveSpeed: Math.round(base.moveSpeed * moveF),
    abilities,
  };
}

// ---------------------------------------------------------------------------
// Monster variance
// ---------------------------------------------------------------------------

/** Fixed roll-vector length for one boss ability. */
const BOSS_AB_ROLLS = 28;

/**
 * Roll one boss ability within its identity envelope. Shapes, gates
 * (`minHpFrac`, `targetRandom`, `countScaling`, `zoneKind`, `healSelf`) and the
 * id/name are preserved; `dmgComp` is the boss-wide budget compensation (a boss
 * that rolled extra HP hits softer). Wind-ups keep a readability floor.
 */
export function bossAbilityVariant(
  seed: number,
  monsterKey: string,
  base: BossAbilityDef,
  dmgComp: number,
): BossAbilityDef {
  const r = rollVector(seed, SALT.bossAbility, `${monsterKey}.${base.id}`, BOSS_AB_ROLLS);
  const out: BossAbilityDef = { ...base };

  if (base.damage > 0) out.damage = qInt(base.damage * u(r[0], 0.85, 1.15) * dmgComp);
  // Telegraph readability floor: never below 85% of authored, never under 0.3s.
  if (base.windup > 0) {
    out.windup = Math.max(0.3, q05(base.windup * clamp(u(r[1], 0.9, 1.2), 0.85, 1.25)));
  }
  out.cooldown = Math.max(1, q10(base.cooldown * u(r[2], 0.88, 1.18)));

  if (base.range != null) out.range = q5(base.range * u(r[3], 0.9, 1.12));
  if (base.radius != null) out.radius = q5(base.radius * u(r[4], 0.9, 1.15));
  if (base.halfAngleDeg != null) {
    out.halfAngleDeg = Math.round(clamp(base.halfAngleDeg * u(r[5], 0.9, 1.15), 18, 80));
  }
  if (base.width != null) out.width = Math.round(base.width * u(r[6], 0.9, 1.15));
  if (base.knockback) out.knockback = q5(base.knockback * u(r[7], 0.85, 1.15));
  if (base.pull) out.pull = q5(base.pull * u(r[7], 0.85, 1.15));
  if (base.stun) out.stun = q05(Math.min(base.stun + 0.3, base.stun * u(r[8], 0.85, 1.15)));
  if (base.silence) {
    out.silence = q05(Math.min(base.silence + 0.5, base.silence * u(r[9], 0.85, 1.15)));
  }
  if (base.slowMult != null && base.slowMult < 1) {
    const strength = (1 - base.slowMult) * u(r[10], 0.8, 1.2);
    out.slowMult = q05(clamp(1 - strength, 0.25, 0.95));
  }
  if (base.slowDuration) out.slowDuration = q10(base.slowDuration * u(r[11], 0.85, 1.2));
  if (base.projSpeed != null) out.projSpeed = q5(base.projSpeed * u(r[12], 0.9, 1.12));
  // A volley stays a volley: ±1 only for true fans (3+); a duo stays a duo.
  const volley = base.projCount ?? 1;
  if (volley >= 3) out.projCount = Math.max(2, volley + (Math.floor(r[13] * 3) - 1));
  if (base.spreadDeg != null) out.spreadDeg = Math.round(base.spreadDeg * u(r[14], 0.9, 1.15));
  if (base.chargeSpeed != null) out.chargeSpeed = q5(base.chargeSpeed * u(r[15], 0.9, 1.12));
  if (base.addHpMult != null) out.addHpMult = q01(base.addHpMult * u(r[16], 0.9, 1.15));
  if (base.addSpeedMult != null) out.addSpeedMult = q01(base.addSpeedMult * u(r[17], 0.95, 1.12));
  if (base.zoneDuration) out.zoneDuration = q10(base.zoneDuration * u(r[18], 0.85, 1.2));
  if (base.zoneTickDamage) {
    out.zoneTickDamage = qInt(base.zoneTickDamage * u(r[19], 0.85, 1.15) * dmgComp);
  }
  if (base.zoneSilence) out.zoneSilence = q05(base.zoneSilence * u(r[20], 0.85, 1.15));
  if (base.channelDuration) out.channelDuration = q10(base.channelDuration * u(r[21], 0.9, 1.15));
  if (base.buffMoveMult) {
    out.buffMoveMult = q01(clamp(1 + (base.buffMoveMult - 1) * u(r[22], 0.75, 1.25), 1.05, 1.5));
  }
  if (base.buffDamageMult) {
    out.buffDamageMult = q01(
      clamp(1 + (base.buffDamageMult - 1) * u(r[23], 0.75, 1.25), 1.05, 1.5),
    );
  }
  if (base.buffDefMult) {
    const mitigation = (1 - base.buffDefMult) * u(r[24], 0.8, 1.2);
    out.buffDefMult = q01(clamp(1 - mitigation, 0.3, 0.9));
  }
  if (base.buffDuration) out.buffDuration = q10(base.buffDuration * u(r[25], 0.85, 1.2));
  if (base.selfHealFrac) {
    out.selfHealFrac = q01(Math.min(0.15, base.selfHealFrac * u(r[26], 0.8, 1.2)));
  }
  return out;
}

/**
 * Roll a monster for the run: stat jitter with an HP↔damage budget link, a
 * rolled epithet, and per-ability variants. AI (`decide`), tier, body shape,
 * colour, radius, melee range and every ability id/shape are preserved. The
 * hidden practice dummy is returned untouched — it is a training baseline.
 */
export function monsterVariant(seed: number, base: MonsterDef): MonsterDef {
  if (base.hidden) return base;
  const r = rollVector(seed, SALT.monster, base.id, 8);
  const hpTilt = u(r[0], -0.12, 0.12);
  // Budget link: extra HP is paid for with softer hits (and vice versa).
  const dmgComp = 1 - hpTilt * 0.5;
  const epithet = MONSTER_EPITHETS[Math.floor(r[5] * MONSTER_EPITHETS.length)];
  return {
    ...base,
    name: `${base.name}, ${epithet}`,
    baseHp: Math.round((base.baseHp * (1 + hpTilt)) / 10) * 10,
    moveSpeed: Math.round(base.moveSpeed * u(r[1], 0.92, 1.08)),
    regen: base.regen > 0 ? Math.round(base.regen * u(r[2], 0.8, 1.25) * 2) / 2 : base.regen,
    enrageThreshold:
      base.enrageThreshold > 0
        ? q01(clamp(base.enrageThreshold + u(r[3], -0.05, 0.05), 0.12, 0.5))
        : base.enrageThreshold,
    enrageCooldownMult: q01(clamp(base.enrageCooldownMult * u(r[4], 0.92, 1.1), 0.45, 0.85)),
    blink: base.blink
      ? {
          range: q5(base.blink.range * u(r[6], 0.9, 1.12)),
          threatenRange: base.blink.threatenRange,
          internalCd: Math.max(2.5, q10(base.blink.internalCd * u(r[7], 0.85, 1.2))),
        }
      : undefined,
    abilities: base.abilities.map((ab) => bossAbilityVariant(seed, base.id, ab, dmgComp)),
  };
}

// ---------------------------------------------------------------------------
// Generic boon (upgrade) variance
// ---------------------------------------------------------------------------

/** One rolled generic-boon magnitude + regenerated name/desc/apply. */
interface UpgradeRoll {
  name: string;
  desc: string;
  apply: UpgradeDef['apply'];
}

/**
 * Roll a generic between-boss boon for the run: magnitude within a role-true
 * band, a name from its bank, and a description regenerated from the ACTUAL
 * rolled number so cards never lie. Ids, icons, roles and stacking caps are
 * identity and never change. Surefooted is structural (2 stacks = immunity)
 * and rolls only its name.
 */
export function upgradeVariant(seed: number, base: UpgradeDef): UpgradeDef {
  const r = rollVector(seed, SALT.upgrade, base.id, 2);
  const bank = UPGRADE_NAME_BANKS[base.id];
  const name = bank ? bank[Math.floor(r[1] * bank.length) % bank.length] : base.name;
  const pct = (x: number): number => Math.round(x * 100);

  let roll: UpgradeRoll;
  switch (base.id) {
    case 'swift': {
      const b = q01(clamp(0.15 * u(r[0], 0.7, 1.4), 0.1, 0.21));
      roll = {
        name,
        desc: `+${pct(b)}% movement speed`,
        apply: (p) => {
          p.moveSpeed *= 1 + b;
        },
      };
      break;
    }
    case 'vigor': {
      const b = q01(clamp(0.2 * u(r[0], 0.7, 1.4), 0.14, 0.28));
      roll = {
        name,
        desc: `+${pct(b)}% maximum health`,
        apply: (p) => {
          p.maxHp = Math.round(p.maxHp * (1 + b));
          p.hp = p.maxHp;
        },
      };
      break;
    }
    case 'haste': {
      const b = q01(clamp(0.1 * u(r[0], 0.7, 1.4), 0.07, 0.14));
      roll = {
        name,
        desc: `-${pct(b)}% ability cooldowns`,
        apply: (p) => {
          p.cooldownMult *= 1 - b;
        },
      };
      break;
    }
    case 'focus': {
      const b = q01(clamp(0.3 * u(r[0], 0.75, 1.25), 0.22, 0.38));
      roll = {
        name,
        desc: `-${pct(b)}% cast time`,
        apply: (p) => {
          p.castMult *= 1 - b;
        },
      };
      break;
    }
    case 'mighty': {
      const b = q01(clamp(0.15 * u(r[0], 0.7, 1.4), 0.1, 0.21));
      roll = {
        name,
        desc: `+${pct(b)}% damage dealt`,
        apply: (p) => {
          p.damageMult *= 1 + b;
        },
      };
      break;
    }
    case 'bulwark': {
      const b = q01(clamp(0.15 * u(r[0], 0.7, 1.4), 0.1, 0.21));
      roll = {
        name,
        desc: `-${pct(b)}% damage taken`,
        apply: (p) => {
          p.damageTakenMult *= 1 - b;
        },
      };
      break;
    }
    case 'renewal': {
      const b = Math.round(clamp(0.02 * u(r[0], 0.7, 1.35), 0.014, 0.027) * 1000) / 1000;
      roll = {
        name,
        desc: `Regenerate ${Math.round(b * 1000) / 10}% max HP per second`,
        apply: (p) => {
          p.regenPerSec += p.maxHp * b;
        },
      };
      break;
    }
    default:
      // Structural boons (Surefooted's 2-stack immunity) keep their magnitude.
      return base;
  }
  return { ...base, name: roll.name, desc: roll.desc, apply: roll.apply };
}

// ---------------------------------------------------------------------------
// Subclass skill variance
// ---------------------------------------------------------------------------

/**
 * Roll a subclass skill's ability within the same identity envelope as the base
 * kit (numbers only — a subclass skill's NAME is the identity of the pick, so it
 * never re-rolls). The caller (subclasses.ts) regenerates the card description
 * from the rolled numbers.
 */
export function subSkillAbilityVariant(
  seed: number,
  skillId: string,
  base: Omit<PlayerAbilityDef, 'slot'>,
): Omit<PlayerAbilityDef, 'slot'> {
  return abilityVariant(seed, `sub.${skillId}`, base);
}

// ---------------------------------------------------------------------------
// The active-run registry — the ONLY mutable state in the module
// ---------------------------------------------------------------------------

let activeSeed: number | null = null;
/** Variants generated for the active seed, keyed `<kind>:<id>` (lazy). */
const cache = new Map<string, unknown>();

/**
 * Activate (or clear, with `null`) the run whose content every getter should
 * resolve. Set from the shared master seed on the host AND every client
 * (LobbyMsg/StartMsg.runSeed → store.setActiveRunSeed), so all peers derive
 * identical kits, monsters and boons. Cheap and idempotent; re-setting the
 * same seed keeps the cache.
 */
export function setProceduralSeed(seed: number | null): void {
  if (seed === activeSeed) return;
  activeSeed = seed;
  cache.clear();
}

/** The active run seed, or null when canonical content is being served. */
export function proceduralSeed(): number | null {
  return activeSeed;
}

/**
 * Resolve the active run's variant of one content entry, generating and caching
 * it on first use — or `null` when no run is active (menus, playground, tests),
 * which tells the content getter to serve the canonical authored def.
 */
export function procVariant<T>(kind: string, id: string, make: (seed: number) => T): T | null {
  if (activeSeed === null) return null;
  const key = `${kind}:${id}`;
  let hit = cache.get(key) as T | undefined;
  if (hit === undefined) {
    hit = make(activeSeed);
    cache.set(key, hit);
  }
  return hit;
}
