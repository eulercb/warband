/**
 * Warband — SUBCLASSES (item 13). Each of the 12 classes has TWO subclasses, and
 * each subclass carries FOUR skills. A hero unlocks a subclass as a special reward
 * at the end of a 5-boss gauntlet; they then pick ONE of its four skills (bound to
 * the sub1 button). After a SECOND cleared run they pick a second skill of the
 * SAME subclass (bound to sub2). Two subclass skills is the cap.
 *
 * A subclass skill is just a `PlayerAbilityDef` (minus its slot, which is assigned
 * to 'sub1'/'sub2' when bound), so it flows through the exact same cast/cooldown
 * machinery as the base kit. PURE data + lookups — no UI, no networking.
 */
import { SUBCLASS_PASSIVES, type SubclassPassiveDef } from './subclassPassives';
import type { ClassId, AbilitySlot } from '../core/types';
import type { PlayerAbilityDef } from './classes';
import { describeAbility } from './classes';
import { procVariant, subSkillAbilityVariant, hashStr } from './procgen';
import { synthesizeAbility, forgeName, forgeVariant, type Donor } from './forge';
import { Rng, mixSeed } from '../core/math';

/** One pickable subclass skill (an ability minus its slot assignment). */
export interface SubSkillDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** The ability this skill grants; `slot` is filled in (sub1/sub2) when bound. */
  ability: Omit<PlayerAbilityDef, 'slot'>;
}

export interface SubclassDef {
  id: string;
  classId: ClassId;
  name: string;
  blurb: string;
  /** Exactly four skills; a hero picks up to two of them. */
  skills: SubSkillDef[];
  passive?: SubclassPassiveDef;
}

/** Terse skill builder. */
function sk(
  id: string,
  name: string,
  icon: string,
  desc: string,
  ability: Omit<PlayerAbilityDef, 'slot'>,
): SubSkillDef {
  return { id, name, icon, desc, ability };
}

// Ability shorthands so 96 skills stay readable.
const proj = (
  name: string,
  cooldown: number,
  damage: number,
  x: Partial<PlayerAbilityDef> = {},
): Omit<PlayerAbilityDef, 'slot'> => ({
  name,
  kind: 'projectile',
  cooldown,
  damage,
  projSpeed: 640,
  projCount: 1,
  ...x,
});
const melee = (
  name: string,
  cooldown: number,
  damage: number,
  x: Partial<PlayerAbilityDef> = {},
): Omit<PlayerAbilityDef, 'slot'> => ({
  name,
  kind: 'meleeCone',
  cooldown,
  damage,
  range: 70,
  halfAngleDeg: 45,
  ...x,
});
const nova = (
  name: string,
  cooldown: number,
  damage: number,
  radius: number,
  x: Partial<PlayerAbilityDef> = {},
): Omit<PlayerAbilityDef, 'slot'> => ({ name, kind: 'pbaoe', cooldown, damage, radius, ...x });
// A ranged frontal CONE AoE (item 3). `meleeCone` is the engine's generic
// frontal-cone primitive — a `pointInCone` hit-test plus a cone-shaped skill-area
// flash — and is NOT gated to melee reach, so a "breath"/"cone" ability resolves and
// telegraphs as a true wedge instead of the circle a `nova` (pbaoe) draws. The
// explicit reach + arc keep the cone from collapsing to the melee defaults.
const cone = (
  name: string,
  cooldown: number,
  damage: number,
  range: number,
  halfAngleDeg: number,
  x: Partial<PlayerAbilityDef> = {},
): Omit<PlayerAbilityDef, 'slot'> => ({
  name,
  kind: 'meleeCone',
  cooldown,
  damage,
  range,
  halfAngleDeg,
  ...x,
});
const zone = (
  name: string,
  cooldown: number,
  x: Partial<PlayerAbilityDef>,
): Omit<PlayerAbilityDef, 'slot'> => ({
  name,
  kind: 'groundZone',
  cooldown,
  damage: 0,
  range: 460,
  radius: 120,
  zoneDuration: 4,
  ...x,
});
const heal = (
  name: string,
  cooldown: number,
  amount: number,
  x: Partial<PlayerAbilityDef> = {},
): Omit<PlayerAbilityDef, 'slot'> => ({
  name,
  kind: 'heal',
  cooldown,
  damage: amount,
  range: 400,
  ...x,
});
const buff = (
  name: string,
  cooldown: number,
  x: Partial<PlayerAbilityDef>,
): Omit<PlayerAbilityDef, 'slot'> => ({
  name,
  kind: 'selfBuff',
  cooldown,
  damage: 0,
  buffDuration: 5,
  ...x,
});
const dash = (
  name: string,
  cooldown: number,
  x: Partial<PlayerAbilityDef> = {},
): Omit<PlayerAbilityDef, 'slot'> => ({
  name,
  kind: 'dash',
  cooldown,
  damage: 0,
  range: 250,
  iframes: 0.3,
  ...x,
});
const blink = (
  name: string,
  cooldown: number,
  x: Partial<PlayerAbilityDef> = {},
): Omit<PlayerAbilityDef, 'slot'> => ({
  name,
  kind: 'blink',
  cooldown,
  damage: 0,
  range: 260,
  ...x,
});

// ---------------------------------------------------------------------------
// The subclasses (2 per class × 4 skills). Each subclass leans into a fantasy.
// ---------------------------------------------------------------------------

export const SUBCLASSES: Record<ClassId, SubclassDef[]> = {
  knight: [
    {
      id: 'kn_champion',
      classId: 'knight',
      name: 'Champion',
      blurb: 'Relentless martial prowess.',
      skills: [
        sk(
          'kn_champion_slam',
          'Earthshaker',
          '💥',
          'Slam a 150u ring for 40 damage',
          nova('Earthshaker', 8, 40, 150),
        ),
        sk(
          'kn_champion_charge',
          'Bull Rush',
          '🐂',
          // item 11 — a true bull rush: the landing SHOVES struck enemies away hard
          // enough to rip a rooted foe free (knockback ≥ FORCE_OVERCOME_ROOT).
          'Charge in, landing for 30 and hurling enemies back',
          dash('Bull Rush', 7, { landingDamage: 30, radius: 110, knockback: 170 }),
        ),
        sk(
          'kn_champion_rally',
          'Second Wind',
          '💚',
          'Heal yourself for 90',
          heal('Second Wind', 10, 90, { range: 1 }),
        ),
        sk(
          'kn_champion_riposte',
          'Riposte',
          '⚔️',
          'A cleave for 46; connecting readies a melee counter and a brief parry',
          melee('Riposte', 6, 46, { range: 80, halfAngleDeg: 40, parryOnHit: 0.75 }),
        ),
      ],
    },
    {
      id: 'kn_battlemaster',
      classId: 'knight',
      name: 'Battlemaster',
      blurb: 'Tactical maneuvers that control the field.',
      skills: [
        sk(
          'kn_battle_trip',
          'Trip Attack',
          '🔨',
          'Cleave that stuns for 1.1s',
          melee('Trip Attack', 8, 32, { stun: 1.1 }),
        ),
        sk(
          'kn_battle_menacing',
          'Menacing Roar',
          '📣',
          '+30% damage for 6s',
          buff('Menacing Roar', 12, { buffDamageMult: 1.3, buffDuration: 6 }),
        ),
        sk(
          'kn_battle_precision',
          'Precision Volley',
          '🎯',
          'Three throwing blades, 18 each',
          proj('Precision Volley', 6, 18, { projCount: 3, spreadDeg: 24 }),
        ),
        sk(
          'kn_battle_rally',
          'Rally',
          '🛡️',
          'Take 45% less damage for 5s; a guarded hit readies one melee counter',
          buff('Rally', 14, { buffDefMult: 0.55, guardWindow: 5 }),
        ),
      ],
    },
  ],
  ranger: [
    {
      id: 'rg_hunter',
      classId: 'ranger',
      name: 'Hunter',
      blurb: 'Precision killer of great beasts.',
      skills: [
        sk(
          'rg_hunter_hail',
          'Hail of Thorns',
          '🌿',
          'A 130u thorn burst for 34',
          nova('Hail of Thorns', 8, 34, 130),
        ),
        sk(
          'rg_hunter_mark',
          "Hunter's Mark",
          '🎯',
          'A shot for 48 that pierces two additional enemies',
          proj("Hunter's Mark", 6, 48, { projSpeed: 780, pierce: 2 }),
        ),
        sk(
          'rg_hunter_stand',
          'Stand as One',
          '🛡️',
          'Take 40% less damage for 5s',
          buff('Stand as One', 14, { buffDefMult: 0.6 }),
        ),
        sk(
          'rg_hunter_volley',
          'Volley',
          '🏹',
          'Five arrows, 16 each, piercing one additional enemy each',
          proj('Volley', 7, 16, { projCount: 5, spreadDeg: 40, pierce: 1 }),
        ),
      ],
    },
    {
      id: 'rg_beastmaster',
      classId: 'ranger',
      name: 'Beast Master',
      blurb: 'Fights alongside the wild.',
      skills: [
        sk(
          'rg_beast_pounce',
          'Pounce',
          '🐺',
          'Leap in, landing for 26',
          dash('Pounce', 6, { landingDamage: 26, radius: 100, leap: true }),
        ),
        sk(
          'rg_beast_snare',
          'Snare',
          '🪤',
          'Snares foes to 25% speed for 4s',
          zone('Snare', 10, {
            slowMult: 0.25,
            slowDuration: 1.5,
            zoneTickDamage: 6,
            zoneKind: 'entangle',
          }),
        ),
        sk(
          'rg_beast_bond',
          "Nature's Bond",
          '💚',
          'Heal an ally for 60',
          heal("Nature's Bond", 6, 60),
        ),
        sk(
          'rg_beast_bite',
          'Savage Bite',
          '🦷',
          'A vicious close strike for 44',
          melee('Savage Bite', 6, 44, { range: 64, lifestealFrac: 0.2 }),
        ),
      ],
    },
  ],
  mage: [
    {
      id: 'mg_evoker',
      classId: 'mage',
      name: 'Evoker',
      blurb: 'Master of raw destructive magic.',
      skills: [
        sk(
          'mg_evoker_lightning',
          'Lightning Bolt',
          '⚡',
          'A fast bolt for 40, +20% damage against controlled foes',
          proj('Lightning Bolt', 5, 40, { projSpeed: 820, controlDamageBonus: 0.2 }),
        ),
        sk(
          'mg_evoker_cone',
          'Cone of Cold',
          '❄️',
          'A freezing 210u cone for 30', // item 3: a cone, not a circle
          cone('Cone of Cold', 8, 30, 210, 45, { slowMult: 0.5, slowDuration: 2 }),
        ),
        sk(
          'mg_evoker_sculpt',
          'Sculpted Blast',
          '💥',
          'Charge a 170u detonation for 58, +25% against controlled foes',
          nova('Sculpted Blast', 11, 58, 170, { castTime: 0.6, controlDamageBonus: 0.25 }),
        ),
        sk(
          'mg_evoker_shield',
          'Arcane Shield',
          '🛡️', // item 4: was a 🔵 placeholder (a shield skill now reads as a shield)
          'Peel with a 180u cone for 28 and 90u knockback; shield yourself for 35 / 4s',
          cone('Arcane Shield', 12, 28, 180, 50, {
            knockback: 90,
            balanceDamageScale: 0,
            absorption: { amount: 35, balanceAmount: 0, duration: 4, target: 'self' },
          }),
        ),
      ],
    },
    {
      id: 'mg_abjurer',
      classId: 'mage',
      name: 'Abjurer',
      blurb: 'Warding magic that protects the band.',
      skills: [
        sk(
          'mg_abjurer_ward',
          'Arcane Ward',
          '🛡️',
          'Shield yourself for 50 / 6s; a 150u burst deals 24, +35% to controlled foes, and slows for 3s',
          nova('Arcane Ward', 12, 24, 150, {
            controlDamageBonus: 0.35,
            balanceDamageScale: 0,
            slowMult: 0.5,
            slowDuration: 3,
            absorption: { amount: 50, balanceAmount: 0, duration: 6, target: 'self' },
          }),
        ),
        sk(
          'mg_abjurer_bind',
          'Otiluke Bind',
          '🌀',
          'Roots foes in a zone — holds them fast',
          zone('Otiluke Bind', 10, {
            slowMult: 0.3,
            slowDuration: 1.5,
            zoneTickDamage: 8,
            zoneKind: 'entangle',
            roots: true, // item 3: a true bind — immobilises + locks out blink/charge/teleport
            // item 8 — a floating force cage, not ground plants: it holds a FLYER
            // fast too (airborne override on the ground 'entangle' kind).
            airborne: true,
          }),
        ),
        sk(
          'mg_abjurer_teleport',
          'Dimension Door',
          '🚪',
          // item 11 — the door shuffles space: on arrival, enemies within 220u are
          // reflected across the mage (front ↔ back) — a teleport-swap peel.
          'Blink 300u, then fling nearby enemies across you',
          blink('Dimension Door', 6, { range: 300, iframes: 0.25, swap: true, radius: 220 }),
        ),
        sk(
          'mg_abjurer_mend',
          'Life Transfer',
          '💚',
          'Heal an ally for 55',
          heal('Life Transfer', 5, 55),
        ),
      ],
    },
  ],
  cleric: [
    {
      id: 'cl_light',
      classId: 'cleric',
      name: 'Light',
      blurb: 'Radiant fury against the dark.',
      skills: [
        sk(
          'cl_light_flare',
          'Radiance',
          '🌟',
          'A searing 150u flare for 36',
          nova('Radiance', 8, 36, 150),
        ),
        sk(
          'cl_light_beam',
          'Guiding Bolt',
          '☀️',
          'Charge a searing bolt of light for 60',
          proj('Guiding Bolt', 8, 60, { projSpeed: 620, castTime: 0.55 }),
        ),
        sk(
          'cl_light_flash',
          'Flash of Light',
          '✨',
          'Heal an ally for 85; stronger rescue at low HP',
          heal('Flash of Light', 5, 85, { rescueHealBonus: 0.3, balanceDamageScale: 70 / 85 }),
        ),
        sk(
          'cl_light_warding',
          'Warding Flare',
          '🛡️',
          'Protect the lowest-health ally in 420u with 70 absorption for 7s',
          buff('Warding Flare', 12, {
            range: 420,
            buffDuration: 7,
            absorption: { amount: 70, balanceAmount: 40, duration: 7, target: 'weakest' },
          }),
        ),
      ],
    },
    {
      id: 'cl_life',
      classId: 'cleric',
      name: 'Life',
      blurb: 'The purest font of healing.',
      skills: [
        sk(
          'cl_life_bloom',
          'Blessed Bloom',
          '🌸',
          'A 150u heal-zone, 18/tick',
          zone('Blessed Bloom', 12, {
            radius: 150,
            zoneTickHeal: 18,
            balanceZoneHealScale: 14 / 18,
            overflowShield: true,
            zoneDuration: 5,
            zoneKind: 'sanctuary',
          }),
        ),
        sk(
          'cl_life_mend',
          'Mass Cure',
          '💚',
          'Heal an ally for 100; stronger rescue at low HP',
          heal('Mass Cure', 5, 100, { rescueHealBonus: 0.3, balanceDamageScale: 80 / 100 }),
        ),
        sk(
          'cl_life_preserve',
          'Preserve Life',
          '🕊️',
          'Protect allies within 260u with 55 absorption for 8s',
          buff('Preserve Life', 14, {
            range: 260,
            buffDuration: 8,
            absorption: { amount: 55, balanceAmount: 30, duration: 8, target: 'nearby' },
          }),
        ),
        sk(
          'cl_life_smite',
          'Reproach',
          '🔨',
          'A daze-strike for 30',
          melee('Reproach', 6, 30, { stun: 0.7 }),
        ),
      ],
    },
  ],
  barbarian: [
    {
      id: 'bb_berserker',
      classId: 'barbarian',
      name: 'Berserker',
      blurb: 'Fury unchained.',
      skills: [
        sk(
          'bb_berserker_frenzy',
          'Frenzy',
          '😤',
          '+40% damage, +20% speed for 6s; drain life, leech direct hits',
          buff('Frenzy', 12, {
            buffDamageMult: 1.4,
            buffMoveMult: 1.2,
            buffDuration: 6,
            momentumWindow: 6,
            bloodRage: 6,
          }),
        ),
        sk(
          'bb_berserker_reckless',
          'Reckless Cleave',
          '🪓',
          'A huge arc for 48; spends Rage momentum',
          melee('Reckless Cleave', 6, 48, { range: 90, halfAngleDeg: 60, spendsMomentum: true }),
        ),
        sk(
          'bb_berserker_slam',
          'Ground Slam',
          '💥',
          'A 150u shock for 40; spends Rage momentum',
          nova('Ground Slam', 8, 40, 150, { spendsMomentum: true }),
        ),
        sk(
          // item 11 — Rage Leap was a near-duplicate of the Barbarian's base Leap
          // (both leap:true dashes). Replaced with a distinctive CHAIN PULL: hurl a
          // chain and YANK a struck enemy to you — strong enough to rip a rooted foe
          // free. A gap-closer that brings the fight to the bruiser, not vice-versa.
          'bb_berserker_chain',
          'Chain Pull',
          '⛓️',
          'Hurl a chain 220u for 28 and pull foes; spend momentum for damage and reach',
          cone('Chain Pull', 7, 28, 220, 26, { pull: 200, spendsMomentum: true }),
        ),
      ],
    },
    {
      id: 'bb_totem',
      classId: 'barbarian',
      name: 'Totem Warrior',
      blurb: 'Spirit-blessed resilience.',
      skills: [
        sk(
          'bb_totem_bear',
          'Bear Spirit',
          '🐻',
          'Take 40% less damage for 6s',
          buff('Bear Spirit', 12, { buffDefMult: 0.6, buffDuration: 6 }),
        ),
        sk(
          'bb_totem_wolf',
          'Wolf Spirit',
          '🐺',
          '+30% speed and damage for 5s; running builds momentum instead of hits',
          buff('Wolf Spirit', 12, { buffMoveMult: 1.3, buffDamageMult: 1.3, wolfHunt: 5 }),
        ),
        sk(
          'bb_totem_quake',
          'Earth Totem',
          '🌍',
          'A 160u snare-burst for 26',
          nova('Earth Totem', 9, 26, 160, { slowMult: 0.5, slowDuration: 2, spendsMomentum: true }),
        ),
        sk(
          'bb_totem_mend',
          'Spirit Mend',
          '💚',
          'Heal yourself for 80',
          heal('Spirit Mend', 10, 80, { range: 1 }),
        ),
      ],
    },
  ],
  rogue: [
    {
      id: 'ro_assassin',
      classId: 'rogue',
      name: 'Assassin',
      blurb: 'Death from the shadows.',
      skills: [
        sk(
          'ro_assassin_strike',
          'Death Strike',
          '🗡️',
          // item 13 — the Assassin's signature finds the vital point: less flat damage,
          // a heavy crit lean, so it reads as a lethal gamble that spikes on a crit
          // (the modern crit-keyed identity) rather than a flat nuke.
          'A precise stab for 60; consumes preparation for a guaranteed crit',
          melee('Death Strike', 7, 60, {
            consumesPrecision: true,
            range: 58,
            halfAngleDeg: 30,
            critChanceBonus: 0.2,
            critMultBonus: 0.4,
          }),
        ),
        sk(
          // item 13 — REPLACES the old "Vanish" blink, which merely duplicated the
          // Rogue's base Shadowstep (and the Trickster's Misty Step) — three near
          // identical teleports across the class. The Assassin instead gets a
          // distinctive at-range finisher keyed on the modern crit mechanic: a hurled
          // blade that buries in a vital point.
          'ro_assassin_throw',
          'Deadly Throw',
          '🔪',
          'Hurl a blade for 38 that finds a vital point — crits ~40% for a huge blow',
          proj('Deadly Throw', 6, 38, {
            projSpeed: 720,
            critChanceBonus: 0.35,
            critMultBonus: 0.6,
          }),
        ),
        sk(
          'ro_assassin_poison',
          'Coated Blade',
          '☠️',
          'A poison cloud, 12/tick',
          zone('Coated Blade', 9, { radius: 105, zoneTickDamage: 12, zoneKind: 'poison' }),
        ),
        sk(
          'ro_assassin_smoke',
          'Smoke Bomb',
          '💨',
          'Take 45% less damage for 4s',
          buff('Smoke Bomb', 12, { buffDefMult: 0.55, buffDuration: 4 }),
        ),
      ],
    },
    {
      id: 'ro_trickster',
      classId: 'rogue',
      name: 'Arcane Trickster',
      blurb: 'Blade and spell entwined.',
      skills: [
        sk(
          'ro_trickster_bolt',
          'Mage Hand Bolt',
          '✨',
          'A quick arcane dart for 34',
          proj('Mage Hand Bolt', 5, 34),
        ),
        sk(
          'ro_trickster_snare',
          'Ensnaring Strike',
          '🕸️',
          'A web that roots foes in place',
          zone('Ensnaring Strike', 10, {
            slowMult: 0.3,
            slowDuration: 1.5,
            zoneTickDamage: 8,
            zoneKind: 'entangle',
            roots: true, // item 3: a web holds fast — immobilises + locks out blink/charge/teleport
          }),
        ),
        sk(
          'ro_trickster_step',
          'Misty Step',
          '🌫️',
          'Blink 270u, heal 20, and prepare your next precision crit for 4s',
          blink('Misty Step', 6, { iframes: 0.3, healOnUse: 20, prepareCrit: 4 }),
        ),
        sk(
          'ro_trickster_shield',
          'Shield Spell',
          '🛡️', // item 4: was a 🔵 placeholder
          'Take 50% less damage for 4s',
          buff('Shield Spell', 12, { buffDefMult: 0.5, buffDuration: 4 }),
        ),
      ],
    },
  ],
  paladin: [
    {
      id: 'pa_devotion',
      classId: 'paladin',
      name: 'Devotion',
      blurb: 'The unwavering holy knight.',
      skills: [
        sk(
          'pa_devotion_smite',
          'Divine Smite',
          '🌟',
          'A radiant strike for 52',
          melee('Divine Smite', 6, 52, { lifestealFrac: 0.15 }),
        ),
        sk(
          'pa_devotion_sanctuary',
          'Sacred Weapon',
          '⚔️',
          '+30% damage for 6s; lead allies with a Pursuit aura',
          buff('Sacred Weapon', 12, {
            buffDamageMult: 1.3,
            buffDuration: 6,
            paladinAura: { kind: 'pursuit', radius: 220, duration: 5 },
          }),
        ),
        sk(
          'pa_devotion_bless',
          'Bless',
          '🙏',
          'Heal an ally for 75; effective healing starts a Renewal aura',
          heal('Bless', 6, 75, { paladinAura: { kind: 'renewal', radius: 220, duration: 5 } }),
        ),
        sk(
          'pa_devotion_aura',
          'Aura of Protection',
          '🛡️',
          'Take 45% less damage; a following Bulwark aura protects nearby allies',
          buff('Aura of Protection', 14, {
            buffDefMult: 0.55,
            buffDuration: 6,
            paladinAura: { kind: 'bulwark', radius: 240, duration: 6 },
          }),
        ),
      ],
    },
    {
      id: 'pa_vengeance',
      classId: 'paladin',
      name: 'Vengeance',
      blurb: 'Relentless punisher of the wicked.',
      skills: [
        sk(
          'pa_vengeance_hunt',
          "Hunter's Vow",
          '🎯',
          '+35% damage, +15% speed for 6s; lead allies with a Pursuit aura',
          buff("Hunter's Vow", 12, {
            buffDamageMult: 1.35,
            buffMoveMult: 1.15,
            buffDuration: 6,
            paladinAura: { kind: 'pursuit', radius: 220, duration: 5 },
          }),
        ),
        sk(
          'pa_vengeance_shackle',
          'Vow of Enmity',
          '⛓️',
          'A snare-burst for 28',
          nova('Vow of Enmity', 8, 28, 150, { slowMult: 0.5, slowDuration: 2 }),
        ),
        sk(
          'pa_vengeance_charge',
          'Avenging Charge',
          '💨',
          'Charge in, landing for 32',
          dash('Avenging Charge', 7, { landingDamage: 32, radius: 110 }),
        ),
        sk(
          'pa_vengeance_smite',
          'Wrathful Smite',
          '🔥',
          'A daze-strike for 40',
          melee('Wrathful Smite', 7, 40, { stun: 0.8 }),
        ),
      ],
    },
  ],
  druid: [
    {
      id: 'dr_moon',
      classId: 'druid',
      name: 'Circle of the Moon',
      blurb: 'The savage shapeshifter.',
      skills: [
        sk(
          'dr_moon_maul',
          'Dire Maul',
          '🐻',
          'A ferocious swipe for 46',
          melee('Dire Maul', 6, 46, { range: 80, lifestealFrac: 0.15 }),
        ),
        sk(
          'dr_moon_pounce',
          'Feral Pounce',
          '🐆',
          'Leap, landing for 30',
          dash('Feral Pounce', 6, { landingDamage: 30, radius: 100, leap: true }),
        ),
        sk(
          'dr_moon_roar',
          'Primal Roar',
          '🦁',
          '+30% damage, +20% speed for 5s',
          buff('Primal Roar', 12, { buffDamageMult: 1.3, buffMoveMult: 1.2 }),
        ),
        sk(
          'dr_moon_regen',
          'Frenzied Regen',
          '💚',
          'Heal yourself for 80 and plant a recovery grove',
          heal('Frenzied Regen', 10, 80, {
            range: 1,
            recoveryZone: { radius: 95, duration: 3, tickHeal: 4 },
          }),
        ),
      ],
    },
    {
      id: 'dr_land',
      classId: 'druid',
      name: 'Circle of the Land',
      blurb: 'Ancient elemental magic.',
      skills: [
        sk(
          'dr_land_spike',
          'Erupting Earth',
          '🌋',
          'A 160u quake for 38',
          nova('Erupting Earth', 8, 38, 160),
        ),
        sk(
          'dr_land_wall',
          'Wall of Thorns',
          '🌵',
          'A thorn-zone, 13 damage and 4 healing/tick',
          zone('Wall of Thorns', 10, {
            radius: 130,
            zoneTickDamage: 13,
            zoneTickHeal: 4,
            slowMult: 0.5,
            slowDuration: 1.2,
            zoneKind: 'entangle',
          }),
        ),
        sk(
          'dr_land_wind',
          'Gust',
          '🌬️',
          // item 11 — the wind now SHOVES: a light knockback (below FORCE_OVERCOME_ROOT,
          // so it can't rip a rooted foe free — that's the Bull Rush's job) that
          // scatters foes off the Druid. Wind that pushes, differentiating the class.
          'A slowing 150u cyclone for 24 that blows foes back',
          nova('Gust', 8, 24, 150, { slowMult: 0.5, slowDuration: 2, knockback: 90 }),
        ),
        sk(
          'dr_land_spring',
          'Healing Spring',
          '💧',
          'A 150u heal-zone, 13/tick',
          zone('Healing Spring', 12, {
            radius: 150,
            zoneTickHeal: 13,
            zoneDuration: 5,
            zoneKind: 'sanctuary',
          }),
        ),
      ],
    },
  ],
  bard: [
    {
      id: 'ba_valor',
      classId: 'bard',
      name: 'College of Valor',
      blurb: 'The warrior-poet.',
      skills: [
        sk(
          'ba_valor_blade',
          'Blade Flourish',
          '🗡️',
          'A sweeping strike for 42',
          melee('Blade Flourish', 6, 42, { range: 78, bardSong: 'discord' }),
        ),
        sk(
          'ba_valor_inspire',
          'Battle Hymn',
          '🎺',
          '+30% damage for 6s; two verses turn it into a group chorus',
          buff('Battle Hymn', 12, {
            buffDamageMult: 1.3,
            buffDuration: 6,
            range: 420,
            bardSong: 'chorus',
          }),
        ),
        sk(
          'ba_valor_bolster',
          'Bolster',
          '🛡️',
          'Take 45% less damage for 5s',
          buff('Bolster', 12, { buffDefMult: 0.55 }),
        ),
        sk(
          'ba_valor_shatter',
          'Shatter',
          '💥',
          'A thunderous 150u burst for 36',
          nova('Shatter', 8, 36, 150, { bardSong: 'discord' }),
        ),
      ],
    },
    {
      id: 'ba_whispers',
      classId: 'bard',
      name: 'College of Whispers',
      blurb: 'Fear and secrets, weaponized.',
      skills: [
        sk(
          'ba_whispers_words',
          'Words of Terror',
          '😱',
          'A fear-zone to 25% speed',
          zone('Words of Terror', 10, {
            bardSong: 'discord',
            slowMult: 0.25,
            slowDuration: 1.5,
            zoneTickDamage: 10,
            zoneKind: 'poison',
          }),
        ),
        sk(
          'ba_whispers_wound',
          'Psychic Blade',
          '🔪',
          'A mind-stab for 50',
          proj('Psychic Blade', 6, 50, { projSpeed: 700, bardSong: 'discord' }),
        ),
        sk(
          'ba_whispers_mantle',
          'Mantle of Whispers',
          '🌫️',
          'Blink 260u with i-frames',
          blink('Mantle of Whispers', 6, { iframes: 0.3 }),
        ),
        sk(
          'ba_whispers_song',
          'Healing Refrain',
          '🎶',
          'Heal an ally for 65; effective healing prepares harmony',
          heal('Healing Refrain', 5, 65, { bardSong: 'harmony' }),
        ),
      ],
    },
  ],
  monk: [
    {
      id: 'mo_openhand',
      classId: 'monk',
      name: 'Way of the Open Hand',
      blurb: 'Perfected martial technique.',
      skills: [
        sk(
          'mo_openhand_flurry',
          'Flurry Barrage',
          '👊',
          'A rapid strike for 40',
          melee('Flurry Barrage', 4, 40, { range: 64, consumesFlow: true }),
        ),
        sk(
          'mo_openhand_wave',
          'Wave Palm',
          '🌊',
          'A 150u palm-wave for 34',
          nova('Wave Palm', 7, 34, 150, { stun: 0.5, consumesFlow: true }),
        ),
        sk(
          'mo_openhand_wind',
          'Wind Step',
          '🍃',
          'Dash 280u with i-frames + heal; prepare Flow for 4s',
          dash('Wind Step', 5, { range: 280, healOnUse: 22, prepareFlow: 4 }),
        ),
        sk(
          'mo_openhand_ki',
          'Wholeness of Body',
          '💚',
          'Heal yourself for 80',
          heal('Wholeness of Body', 10, 80, { range: 1 }),
        ),
      ],
    },
    {
      id: 'mo_shadow',
      classId: 'monk',
      name: 'Way of Shadow',
      blurb: 'The ninja who fights in darkness.',
      skills: [
        sk(
          'mo_shadow_dart',
          'Shadow Dart',
          '🌑',
          'A silent dart for 38; Flow adds a brief stun',
          proj('Shadow Dart', 5, 38, { consumesFlow: true }),
        ),
        sk(
          'mo_shadow_step',
          'Shadow Step',
          '🌫️',
          'Blink 300u with i-frames; prepare Flow for 4s',
          blink('Shadow Step', 5, { range: 300, iframes: 0.35, prepareFlow: 4 }),
        ),
        sk(
          'mo_shadow_cloud',
          'Cloud of Shadow',
          '💨',
          'A poison cloud, 11/tick; Flow widens it and slows enemies',
          zone('Cloud of Shadow', 9, {
            radius: 110,
            zoneTickDamage: 11,
            zoneKind: 'poison',
            consumesFlow: true,
          }),
        ),
        sk(
          'mo_shadow_strike',
          'Shadow Strike',
          '🥷',
          'A lethal ambush for 60',
          melee('Shadow Strike', 7, 60, { range: 60, lifestealFrac: 0.15, consumesFlow: true }),
        ),
      ],
    },
  ],
  sorcerer: [
    {
      id: 'so_draconic',
      classId: 'sorcerer',
      name: 'Draconic Bloodline',
      blurb: 'The blood of dragons.',
      skills: [
        sk(
          'so_draconic_breath',
          'Dragon Breath',
          '🐉',
          'A 240u breath cone for 42; consumes spell surge', // item 3: a cone, not a circle
          cone('Dragon Breath', 8, 42, 240, 42, { consumesSurge: true }),
        ),
        sk(
          'so_draconic_wing',
          'Dragon Wings',
          '🪽',
          // item 7 — the wings actually LIFT the sorcerer now: airborne for 7s,
          // soaring over ground hazards + ground zones. Mobility replaces mitigation.
          'Take flight with +40% speed for 7s and prepare spell surge for 8s',
          buff('Dragon Wings', 12, {
            buffMoveMult: 1.4,
            buffDuration: 7,
            grantsFlight: 7,
            prepareSurge: 8,
          }),
        ),
        sk(
          'so_draconic_bolt',
          'Chromatic Bolt',
          '🌈',
          'Charge a heavy chromatic bolt for 60; surge forks it, sharing +20% total damage',
          proj('Chromatic Bolt', 8, 60, {
            consumesSurge: true,
            surgeTwin: true,
            projSpeed: 700,
            castTime: 0.5,
          }),
        ),
        sk(
          'so_draconic_scales',
          'Draconic Scales',
          '🛡️',
          'Shield yourself for 55 / 6s and shed burning scales in a 145u burst for 22; consumes spell surge',
          nova('Draconic Scales', 14, 22, 145, {
            consumesSurge: true,
            balanceDamageScale: 0,
            absorption: { amount: 55, balanceAmount: 0, duration: 6, target: 'self' },
          }),
        ),
      ],
    },
    {
      id: 'so_wild',
      classId: 'sorcerer',
      name: 'Wild Magic',
      blurb: 'Chaos incarnate.',
      skills: [
        sk(
          'so_wild_surge',
          'Chaos Surge',
          '🎲',
          'Six chaotic bolts, 12 each; consumes spell surge',
          proj('Chaos Surge', 7, 12, { consumesSurge: true, projCount: 6, spreadDeg: 60 }),
        ),
        sk(
          'so_wild_tides',
          'Tides of Chaos',
          '🌀',
          'A 170u wild burst for 40; consumes spell surge',
          nova('Tides of Chaos', 8, 40, 170, { consumesSurge: true }),
        ),
        sk(
          'so_wild_bend',
          'Bend Luck',
          '🍀',
          'Blink 280u with i-frames and prepare spell surge for 8s',
          blink('Bend Luck', 6, { range: 280, iframes: 0.3, prepareSurge: 8 }),
        ),
        sk(
          'so_wild_font',
          'Wild Ward',
          '🛡️', // item 4: was a 🔵 placeholder
          'Create a 125u recovery field for 4s: 10 healing/tick, enemies slowed to 65%; prepare spell surge for 8s',
          zone('Wild Ward', 12, {
            radius: 125,
            zoneKind: 'sanctuary',
            zoneTickDamage: 0,
            zoneTickHeal: 10,
            balanceZoneHealScale: 0,
            zoneDuration: 4,
            slowMult: 0.65,
            slowDuration: 1.2,
            prepareSurge: 8,
          }),
        ),
      ],
    },
  ],
  warlock: [
    {
      id: 'wa_fiend',
      classId: 'warlock',
      name: 'The Fiend',
      blurb: 'Pacts of fire and brimstone.',
      skills: [
        sk(
          'wa_fiend_hurl',
          'Hurl Flame',
          '🔥',
          'Charge a hellfire bolt for 56 that drinks 15% as health',
          proj('Hurl Flame', 6.5, 56, { lifestealFrac: 0.15, castTime: 0.5 }),
        ),
        sk(
          'wa_fiend_pit',
          'Fire Pit',
          '🕳️',
          'A burning curse zone, 13/tick; your mark lingers 4s after leaving',
          zone('Fire Pit', 9, {
            radius: 120,
            zoneTickDamage: 13,
            zoneKind: 'poison',
            curseBonus: 0.15,
            curseStyle: 'searing',
          }),
        ),
        sk(
          'wa_fiend_rebuke',
          'Fiendish Rebuke',
          '💥',
          'A 150u hell-burst for 36; arm one 40%-damage counterburst for 3s',
          nova('Fiendish Rebuke', 8, 36, 150, { lifestealFrac: 0.2, rebukeDuration: 3 }),
        ),
        sk(
          'wa_fiend_resilience',
          'Dark Resilience',
          '🛡️',
          'A 6s barrier: 30 protection; siphon up to 2 nearby personally cursed enemies for 20 damage each and +20 protection per hit; shared 50%-max-HP cap',
          buff('Dark Resilience', 12, {
            absorption: {
              amount: 30,
              balanceAmount: 0,
              duration: 6,
              target: 'self',
              curseSiphon: { range: 300, amount: 20, maxTargets: 2 },
            },
          }),
        ),
      ],
    },
    {
      id: 'wa_great_old_one',
      classId: 'warlock',
      name: 'The Great Old One',
      blurb: 'Whispers from beyond the stars.',
      skills: [
        sk('wa_goo_blast', 'Mind Blast', '🧠', 'A psychic bolt for 42', proj('Mind Blast', 5, 42)),
        sk(
          'wa_goo_tentacle',
          'Tentacle of the Deep',
          '🐙',
          'A snaring 150u burst for 30',
          nova('Tentacle of the Deep', 8, 30, 150, { slowMult: 0.4, slowDuration: 2 }),
        ),
        sk(
          'wa_goo_whispers',
          'Dissonant Whispers',
          '🌀',
          'A dread curse, 11/tick; enemy attacks deal 20% less damage and your hits deal 15% more',
          zone('Dissonant Whispers', 9, {
            curseBonus: 0.15,
            curseStyle: 'dread',
            radius: 115,
            zoneTickDamage: 11,
            zoneKind: 'poison',
          }),
        ),
        sk(
          'wa_goo_flee',
          'Entropic Ward',
          '🔮',
          'Blink 260u with i-frames',
          blink('Entropic Ward', 6, { iframes: 0.3, healOnUse: 18 }),
        ),
      ],
    },
  ],
};

/** Every subclass, flat. */
export const ALL_SUBCLASSES: SubclassDef[] = Object.values(SUBCLASSES).flat();

for (const sub of ALL_SUBCLASSES) sub.passive = SUBCLASS_PASSIVES[sub.id];

/** Flat lookup: subclass id → def. */
const SUBCLASS_BY_ID: Record<string, SubclassDef> = Object.fromEntries(
  ALL_SUBCLASSES.map((s) => [s.id, s]),
);

/** Flat lookup: skill id → { skill, subclass }. */
const SKILL_INDEX: Record<string, { skill: SubSkillDef; subclass: SubclassDef }> = {};
for (const sub of ALL_SUBCLASSES) {
  for (const skill of sub.skills) SKILL_INDEX[skill.id] = { skill, subclass: sub };
}

// ---------------------------------------------------------------------------
// Chaos Forge — subclass + sub-skill SYNTHESIS (docs/CHAOS_FORGE.md §9).
//
// When a Forge run is active, a subclass skill is recombined from components the SAME
// way base-class skills are (forge.synthesizeAbility), but drawing its donor components
// from the pool of every canonical SUBCLASS skill; its new name is blended from the
// donor sub-skills' names. A synthesized subclass is renamed after the subclasses whose
// skills donated the most components (mirroring the class rename). All seed-derived, so
// host and clients derive identical content; canonical content is byte-identical when
// Forge is off (forgeVariant returns null and the procgen/canonical path below runs).
// ---------------------------------------------------------------------------

/** Sub-skills are priced against the special-tier band (they occupy the a1/a2/a3 budget). */
const SUB_SYNTH_SLOT: AbilitySlot = 'a2';
/** Salt for the subclass-rename stream (decorrelated from the ability stream). */
const SUB_RENAME_SALT = 0xf4d2;

/** Every canonical sub-skill as a synthesis donor (built once; a sub-skill added in a
 *  future update joins the pool automatically — no per-item wiring, req. 10). */
let SUB_FORGE_DONORS: Donor[] | null = null;
function subForgeDonors(): Donor[] {
  if (SUB_FORGE_DONORS) return SUB_FORGE_DONORS;
  const out: Donor[] = [];
  for (const sub of ALL_SUBCLASSES) {
    for (const sk of sub.skills) {
      out.push({
        name: sk.name,
        classId: sub.classId,
        className: sub.name,
        slot: SUB_SYNTH_SLOT,
        def: sk.ability,
      });
    }
  }
  SUB_FORGE_DONORS = out;
  return out;
}

/** Donor sub-skill NAME → its subclass, for the subclass rename tally (first match wins). */
let SKILL_NAME_TO_SUB: Map<string, SubclassDef> | null = null;
function skillNameToSub(): Map<string, SubclassDef> {
  if (SKILL_NAME_TO_SUB) return SKILL_NAME_TO_SUB;
  const m = new Map<string, SubclassDef>();
  for (const sub of ALL_SUBCLASSES)
    for (const sk of sub.skills) if (!m.has(sk.name)) m.set(sk.name, sub);
  SKILL_NAME_TO_SUB = m;
  return m;
}

/** Fuse one sub-skill's ability from cross-subclass components; returns the new skill
 *  (blended name + fused ability + regenerated card) and the donor sub-skill names. */
function forgeOneSubSkill(
  seed: number,
  base: SubSkillDef,
): { def: SubSkillDef; donorNames: string[] } {
  const syn = synthesizeAbility(seed, `subskill.${base.id}`, SUB_SYNTH_SLOT, subForgeDonors());
  const { slot: _slot, ...ability } = syn.def; // sub-abilities carry no slot until bound
  return {
    def: { ...base, name: syn.def.name, ability, desc: describeAbility(ability) },
    donorNames: syn.donorNames,
  };
}

function synthesizeSubSkillForge(seed: number, base: SubSkillDef): SubSkillDef {
  return forgeOneSubSkill(seed, base).def;
}

function synthesizeSubclassForge(seed: number, base: SubclassDef): SubclassDef {
  const tally = new Map<string, number>();
  const nameToSub = skillNameToSub();
  const skills = base.skills.map((sk) => {
    const { def, donorNames } = forgeOneSubSkill(seed, sk);
    for (const dn of donorNames) {
      const sub = nameToSub.get(dn);
      if (sub) tally.set(sub.name, (tally.get(sub.name) ?? 0) + 1);
    }
    return def;
  });
  // Rename after the subclasses that donated the most components (ties broken by name).
  const top = [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map((e) => e[0]);
  const rng = new Rng(mixSeed(seed, SUB_RENAME_SALT, hashStr(base.id)));
  const name =
    top.length > 0
      ? forgeName(top, (k) => rng.int(0, k - 1), { connectiveChance: 0.35 })
      : base.name;
  return { ...base, name, skills };
}

/**
 * A subclass skill, resolved for the active run: while a procedural run is
 * active its ability numbers re-roll within the same identity envelope as the
 * base kits (content/procgen.ts) and the card description is regenerated from
 * the ROLLED numbers so it never lies; the skill's NAME is the identity of the
 * pick and never re-rolls. Canonical def otherwise.
 */
function skillVariant(base: SubSkillDef): SubSkillDef {
  return (
    procVariant('subskill', base.id, (seed) => {
      const ability = subSkillAbilityVariant(seed, base.id, base.ability);
      return { ...base, ability, desc: describeAbility(ability) };
    }) ?? base
  );
}

/** A subclass with its skills resolved for the active run (see skillVariant). */
function subclassVariant(base: SubclassDef): SubclassDef {
  return (
    procVariant('subclass', base.id, () => ({ ...base, skills: base.skills.map(skillVariant) })) ??
    base
  );
}

export function getSubclass(id: string): SubclassDef | undefined {
  const base = SUBCLASS_BY_ID[id];
  if (!base) return undefined;
  // Chaos Forge takes precedence when its run is active (a component-recombined subclass
  // + skills, renamed after its top donor subclasses); else numeric variance then the
  // canonical def. Forge layers on top — it never mutates the static SUBCLASSES data.
  return (
    forgeVariant('subclass', id, (seed) => synthesizeSubclassForge(seed, base)) ??
    subclassVariant(base)
  );
}
export function getSubSkill(id: string): SubSkillDef | undefined {
  const base = SKILL_INDEX[id]?.skill;
  if (!base) return undefined;
  return (
    forgeVariant('subSkill', id, (seed) => synthesizeSubSkillForge(seed, base)) ??
    skillVariant(base)
  );
}
export function subclassOfSkill(id: string): SubclassDef | undefined {
  return SKILL_INDEX[id]?.subclass;
}
export function isSubSkillId(x: unknown): x is string {
  return typeof x === 'string' && x in SKILL_INDEX;
}
export function subclassesFor(classId: ClassId): SubclassDef[] {
  // Route through getSubclass so the reward picker shows synthesized subclasses in a
  // Forge run (and canonical / variance otherwise), consistent with what spawns.
  return (SUBCLASSES[classId] ?? []).map((sub) => getSubclass(sub.id) ?? sub);
}

/** The subclass skills a hero owns for a specific class (from their flat pick list). */
export function subSkillsForClass(classId: ClassId, subSkills: readonly string[]): string[] {
  return subSkills.filter((id) => subclassOfSkill(id)?.classId === classId);
}

/**
 * The run-clear SPECIAL reward step a hero is due (item 15). Owned classes are
 * walked in acquisition order (primary first); the FIRST class that lacks a full
 * two-skill subclass drives the step:
 *   - 0 subclass skills → choose a SUBCLASS for it, then its first skill;
 *   - 1 subclass skill  → choose a SECOND skill of that same subclass.
 * Once EVERY owned class has a full subclass, the reward is a new multiclass OR a
 * grand improvement — and because picking a class adds it to the owned set, the
 * NEXT clear re-enters the subclass flow for that new class, while picking a grand
 * leaves the set unchanged so the class-or-grand choice simply recurs. Pure.
 */
export type SpecialRewardStep =
  | { kind: 'subclass'; classId: ClassId }
  | { kind: 'skill2'; classId: ClassId; subclassId: string }
  | { kind: 'classOrGrand' };

export function specialRewardStep(
  primaryClass: ClassId,
  extraClasses: readonly ClassId[],
  subSkills: readonly string[],
): SpecialRewardStep {
  const owned = [primaryClass, ...extraClasses.filter((c) => c !== primaryClass)];
  for (const cls of owned) {
    const skills = subSkillsForClass(cls, subSkills);
    if (skills.length === 0) return { kind: 'subclass', classId: cls };
    if (skills.length === 1) {
      const subclassId = subclassOfSkill(skills[0])?.id;
      if (subclassId) return { kind: 'skill2', classId: cls, subclassId };
    }
  }
  return { kind: 'classOrGrand' };
}

/** The first committed subclass of the active class owns the passive, regardless of chosen skill. */
export function activeSubclassPassive(
  classId: ClassId | null,
  skills: readonly string[],
): SubclassPassiveDef | undefined {
  return skills.map(subclassOfSkill).find((sub) => sub?.classId === classId)?.passive;
}
