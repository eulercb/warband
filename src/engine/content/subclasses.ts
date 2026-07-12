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
import type { ClassId } from '../core/types';
import type { PlayerAbilityDef } from './classes';

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
          'Charge in, landing for 30',
          dash('Bull Rush', 7, { landingDamage: 30, radius: 110 }),
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
          'A brutal frontal cleave for 46',
          melee('Riposte', 6, 46, { range: 80, halfAngleDeg: 40 }),
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
          'Take 45% less damage for 5s',
          buff('Rally', 14, { buffDefMult: 0.55 }),
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
          'A piercing shot for 48',
          proj("Hunter's Mark", 6, 48, { projSpeed: 780 }),
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
          'Five arrows in a wide fan, 16 each',
          proj('Volley', 7, 16, { projCount: 5, spreadDeg: 40 }),
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
          dash('Pounce', 6, { landingDamage: 26, radius: 100 }),
        ),
        sk(
          'rg_beast_snare',
          'Snare',
          '🪤',
          'Roots foes to 25% speed for 4s',
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
          'A fast bolt for 40',
          proj('Lightning Bolt', 5, 40, { projSpeed: 820 }),
        ),
        sk(
          'mg_evoker_cone',
          'Cone of Cold',
          '❄️',
          'A freezing 150u burst for 30',
          nova('Cone of Cold', 8, 30, 150, { slowMult: 0.5, slowDuration: 2 }),
        ),
        sk(
          'mg_evoker_sculpt',
          'Sculpted Blast',
          '💥',
          'A 170u detonation for 44',
          nova('Sculpted Blast', 9, 44, 170),
        ),
        sk(
          'mg_evoker_shield',
          'Arcane Shield',
          '🔵',
          'Take 50% less damage for 4s',
          buff('Arcane Shield', 12, { buffDefMult: 0.5, buffDuration: 4 }),
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
          'Take 45% less damage for 6s',
          buff('Arcane Ward', 12, { buffDefMult: 0.55, buffDuration: 6 }),
        ),
        sk(
          'mg_abjurer_bind',
          'Otiluke Bind',
          '🌀',
          'Snares a zone to 30% speed',
          zone('Otiluke Bind', 10, {
            slowMult: 0.3,
            slowDuration: 1.5,
            zoneTickDamage: 8,
            zoneKind: 'entangle',
          }),
        ),
        sk(
          'mg_abjurer_teleport',
          'Dimension Door',
          '🚪',
          'Blink 300u away',
          blink('Dimension Door', 6, { range: 300, iframes: 0.25 }),
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
          'A bolt of light for 46',
          proj('Guiding Bolt', 6, 46, { projSpeed: 620 }),
        ),
        sk(
          'cl_light_flash',
          'Flash of Light',
          '✨',
          'Heal an ally for 70',
          heal('Flash of Light', 5, 70),
        ),
        sk(
          'cl_light_warding',
          'Warding Flare',
          '🛡️',
          'Take 40% less damage for 5s',
          buff('Warding Flare', 12, { buffDefMult: 0.6 }),
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
          'A 150u heal-zone, 14/tick',
          zone('Blessed Bloom', 12, {
            radius: 150,
            zoneTickHeal: 14,
            zoneDuration: 5,
            zoneKind: 'sanctuary',
          }),
        ),
        sk('cl_life_mend', 'Mass Cure', '💚', 'Heal an ally for 80', heal('Mass Cure', 5, 80)),
        sk(
          'cl_life_preserve',
          'Preserve Life',
          '🕊️',
          'Take 50% less damage for 5s',
          buff('Preserve Life', 14, { buffDefMult: 0.5 }),
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
          '+40% damage, +20% speed for 6s',
          buff('Frenzy', 12, { buffDamageMult: 1.4, buffMoveMult: 1.2, buffDuration: 6 }),
        ),
        sk(
          'bb_berserker_reckless',
          'Reckless Cleave',
          '🪓',
          'A huge arc for 48',
          melee('Reckless Cleave', 6, 48, { range: 90, halfAngleDeg: 60 }),
        ),
        sk(
          'bb_berserker_slam',
          'Ground Slam',
          '💥',
          'A 150u shock for 40',
          nova('Ground Slam', 8, 40, 150),
        ),
        sk(
          'bb_berserker_leap',
          'Rage Leap',
          '🦵',
          'Leap, landing for 34',
          dash('Rage Leap', 7, { landingDamage: 34, radius: 120 }),
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
          '+30% move speed and damage for 5s',
          buff('Wolf Spirit', 12, { buffMoveMult: 1.3, buffDamageMult: 1.3 }),
        ),
        sk(
          'bb_totem_quake',
          'Earth Totem',
          '🌍',
          'A 160u snare-burst for 26',
          nova('Earth Totem', 9, 26, 160, { slowMult: 0.5, slowDuration: 2 }),
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
          'A devastating stab for 72',
          melee('Death Strike', 7, 72, { range: 58, halfAngleDeg: 30 }),
        ),
        sk(
          'ro_assassin_vanish',
          'Vanish',
          '💨',
          'Blink 280u with i-frames',
          blink('Vanish', 6, { range: 280, iframes: 0.35 }),
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
          'A snare-zone to 30% speed',
          zone('Ensnaring Strike', 10, {
            slowMult: 0.3,
            slowDuration: 1.5,
            zoneTickDamage: 8,
            zoneKind: 'entangle',
          }),
        ),
        sk(
          'ro_trickster_step',
          'Misty Step',
          '🌫️',
          'Blink 270u with i-frames',
          blink('Misty Step', 6, { iframes: 0.3, healOnUse: 20 }),
        ),
        sk(
          'ro_trickster_shield',
          'Shield Spell',
          '🔵',
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
          '+30% damage for 6s',
          buff('Sacred Weapon', 12, { buffDamageMult: 1.3, buffDuration: 6 }),
        ),
        sk('pa_devotion_bless', 'Bless', '🙏', 'Heal an ally for 75', heal('Bless', 6, 75)),
        sk(
          'pa_devotion_aura',
          'Aura of Protection',
          '🛡️',
          'Take 45% less damage for 6s',
          buff('Aura of Protection', 14, { buffDefMult: 0.55, buffDuration: 6 }),
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
          '+35% damage, +15% speed for 6s',
          buff("Hunter's Vow", 12, { buffDamageMult: 1.35, buffMoveMult: 1.15, buffDuration: 6 }),
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
          dash('Feral Pounce', 6, { landingDamage: 30, radius: 100 }),
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
          'Heal yourself for 80',
          heal('Frenzied Regen', 10, 80, { range: 1 }),
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
          '🪨',
          'A 160u quake for 38',
          nova('Erupting Earth', 8, 38, 160),
        ),
        sk(
          'dr_land_wall',
          'Wall of Thorns',
          '🌵',
          'A thorn-zone, 13/tick',
          zone('Wall of Thorns', 10, {
            radius: 130,
            zoneTickDamage: 13,
            slowMult: 0.5,
            slowDuration: 1.2,
            zoneKind: 'entangle',
          }),
        ),
        sk(
          'dr_land_wind',
          'Gust',
          '🌬️',
          'A slowing 150u cyclone for 24',
          nova('Gust', 8, 24, 150, { slowMult: 0.5, slowDuration: 2 }),
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
          melee('Blade Flourish', 6, 42, { range: 78 }),
        ),
        sk(
          'ba_valor_inspire',
          'Battle Hymn',
          '🎺',
          '+30% damage for 6s',
          buff('Battle Hymn', 12, { buffDamageMult: 1.3, buffDuration: 6 }),
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
          nova('Shatter', 8, 36, 150),
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
          proj('Psychic Blade', 6, 50, { projSpeed: 700 }),
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
          'Heal an ally for 65',
          heal('Healing Refrain', 5, 65),
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
          melee('Flurry Barrage', 4, 40, { range: 64 }),
        ),
        sk(
          'mo_openhand_wave',
          'Wave Palm',
          '🌊',
          'A 150u palm-wave for 34',
          nova('Wave Palm', 7, 34, 150, { stun: 0.5 }),
        ),
        sk(
          'mo_openhand_wind',
          'Wind Step',
          '🍃',
          'Dash 280u with i-frames + heal',
          dash('Wind Step', 5, { range: 280, healOnUse: 22 }),
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
          'A silent dart for 38',
          proj('Shadow Dart', 5, 38),
        ),
        sk(
          'mo_shadow_step',
          'Shadow Step',
          '🌫️',
          'Blink 300u with i-frames',
          blink('Shadow Step', 5, { range: 300, iframes: 0.35 }),
        ),
        sk(
          'mo_shadow_cloud',
          'Cloud of Shadow',
          '💨',
          'A blinding poison cloud, 11/tick',
          zone('Cloud of Shadow', 9, { radius: 110, zoneTickDamage: 11, zoneKind: 'poison' }),
        ),
        sk(
          'mo_shadow_strike',
          'Shadow Strike',
          '🥷',
          'A lethal ambush for 60',
          melee('Shadow Strike', 7, 60, { range: 60, lifestealFrac: 0.15 }),
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
          'A 160u cone-burst for 42',
          nova('Dragon Breath', 8, 42, 160),
        ),
        sk(
          'so_draconic_wing',
          'Dragon Wings',
          '🪽',
          '+25% speed, take 45% less for 5s',
          buff('Dragon Wings', 12, { buffMoveMult: 1.25, buffDefMult: 0.55 }),
        ),
        sk(
          'so_draconic_bolt',
          'Chromatic Bolt',
          '🌈',
          'A heavy bolt for 46',
          proj('Chromatic Bolt', 6, 46, { projSpeed: 700 }),
        ),
        sk(
          'so_draconic_scales',
          'Draconic Scales',
          '🛡️',
          'Take 50% less damage for 5s',
          buff('Draconic Scales', 14, { buffDefMult: 0.5 }),
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
          'Six chaotic bolts, 12 each',
          proj('Chaos Surge', 7, 12, { projCount: 6, spreadDeg: 60 }),
        ),
        sk(
          'so_wild_tides',
          'Tides of Chaos',
          '🌀',
          'A 170u wild burst for 40',
          nova('Tides of Chaos', 8, 40, 170),
        ),
        sk(
          'so_wild_bend',
          'Bend Luck',
          '🍀',
          'Blink 280u with i-frames',
          blink('Bend Luck', 6, { range: 280, iframes: 0.3 }),
        ),
        sk(
          'so_wild_font',
          'Wild Ward',
          '🔵',
          'Take 45% less damage for 5s',
          buff('Wild Ward', 12, { buffDefMult: 0.55 }),
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
          'A hellfire bolt for 44',
          proj('Hurl Flame', 5, 44, { lifestealFrac: 0.15 }),
        ),
        sk(
          'wa_fiend_pit',
          'Fire Pit',
          '🕳️',
          'A burning zone, 13/tick',
          zone('Fire Pit', 9, { radius: 120, zoneTickDamage: 13, zoneKind: 'poison' }),
        ),
        sk(
          'wa_fiend_rebuke',
          'Fiendish Rebuke',
          '💥',
          'A 150u hell-burst for 36',
          nova('Fiendish Rebuke', 8, 36, 150, { lifestealFrac: 0.2 }),
        ),
        sk(
          'wa_fiend_resilience',
          'Dark Resilience',
          '🛡️',
          'Take 45% less damage for 5s',
          buff('Dark Resilience', 12, { buffDefMult: 0.55 }),
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
          'A maddening zone, 11/tick',
          zone('Dissonant Whispers', 9, {
            radius: 115,
            zoneTickDamage: 11,
            slowMult: 0.5,
            slowDuration: 1,
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

/** Flat lookup: subclass id → def. */
const SUBCLASS_BY_ID: Record<string, SubclassDef> = Object.fromEntries(
  ALL_SUBCLASSES.map((s) => [s.id, s]),
);

/** Flat lookup: skill id → { skill, subclass }. */
const SKILL_INDEX: Record<string, { skill: SubSkillDef; subclass: SubclassDef }> = {};
for (const sub of ALL_SUBCLASSES) {
  for (const skill of sub.skills) SKILL_INDEX[skill.id] = { skill, subclass: sub };
}

export function getSubclass(id: string): SubclassDef | undefined {
  return SUBCLASS_BY_ID[id];
}
export function getSubSkill(id: string): SubSkillDef | undefined {
  return SKILL_INDEX[id]?.skill;
}
export function subclassOfSkill(id: string): SubclassDef | undefined {
  return SKILL_INDEX[id]?.subclass;
}
export function isSubSkillId(x: unknown): x is string {
  return typeof x === 'string' && x in SKILL_INDEX;
}
export function subclassesFor(classId: ClassId): SubclassDef[] {
  return SUBCLASSES[classId] ?? [];
}
