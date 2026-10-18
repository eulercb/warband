/** Authored subclass identity. Passives are not skill slots or Forge donors. */
import type { ClassId } from '../core/types';

export interface SubclassPassiveDef {
  id: string;
  classId: ClassId;
  name: string;
  icon: string;
  desc: string;
}

/** Shared encoding for the timed Wild Magic combo and its public badge. */
export const WEAVE_DELIVERIES = [
  'meleeCone',
  'projectile',
  'pbaoe',
  'dash',
  'blink',
  'selfBuff',
  'buffAlly',
  'heal',
  'taunt',
  'groundZone',
] as const;
export const WEAVE_LABELS = [
  'melee cone',
  'projectile',
  'nearby burst',
  'dash',
  'teleport',
  'self buff',
  'ally buff',
  'direct heal',
  'taunt',
  'ground zone',
];

export const SUBCLASS_PASSIVES: Record<string, SubclassPassiveDef> = {
  mg_evoker: {
    id: 'evoker_arcane_cadence',
    classId: 'mage',
    name: 'Arcane Cadence',
    icon: '⚡',
    desc: 'A direct hit against a slowed, rooted or stunned foe removes 1s from each running special cooldown. Once per 6s; damage-zone ticks do not trigger it.',
  },
  mg_abjurer: {
    id: 'abjurer_binding_ward',
    classId: 'mage',
    name: 'Binding Ward',
    icon: '🔷',
    desc: 'A direct hit against a slowed, rooted or stunned foe grants you 20 absorption for 5s. Once per 6s; shared barrier cap and strongest-cast rules apply.',
  },
  so_draconic: {
    id: 'draconic_surge_ascent',
    classId: 'sorcerer',
    name: 'Surge Ascent',
    icon: '🪽',
    desc: 'Spending Spell Surge lifts you into flight for 2s, avoiding ground hazards while direct attacks still hit. While already flying, extend your longest flight by 1s instead (up to 9s remaining, never shortening longer flight). Once per 6s.',
  },
  so_wild: {
    id: 'wild_spell_weave',
    classId: 'sorcerer',
    name: 'Spell Weave',
    icon: '🌀',
    desc: 'Use two different special delivery types within 8s to prepare Spell Surge for 8s. Once per 8s; basics do not count. Existing Surge or a spell that already prepares Surge does not spend the trigger. The current special can spend only a previously prepared Surge.',
  },
  ba_valor: {
    id: 'valor_rallying_chorus',
    classId: 'bard',
    name: 'Rallying Chorus',
    icon: '🛡️',
    desc: 'Completing a Harmony + Discord chorus gives nearby living allies, including you, one frontal damage block for 3s. Once per 8s; stronger existing guards are preserved; ground and rear hits bypass it.',
  },
  ba_whispers: {
    id: 'whispers_echoed_refrain',
    classId: 'bard',
    name: 'Echoed Refrain',
    icon: '🎶',
    desc: 'Completing a chorus readies an echo for 8s. Your next effective dedicated heal echoes 50% of its healing (up to 35) to the most injured other ally within 420u, or the original recipient if no other ally is injured. Once per 8s; echoes do not prepare verses or trigger rescue.',
  },
  ro_assassin: {
    id: 'assassin_opening',
    classId: 'rogue',
    name: "Death's Opening",
    icon: '🗡️',
    desc: 'Prepared precision strikes gain +0.2× critical damage and deal 15% more damage to enemies at or below 35% health. No extra guaranteed crits.',
  },
  ro_trickster: {
    id: 'trickster_spellblade',
    classId: 'rogue',
    name: 'Spellblade',
    icon: '✨',
    desc: 'Using a non-melee special prepares your next connecting melee hit for +20% damage within 5s. Once per 6s; basics do not prepare it.',
  },
  wa_fiend: {
    id: 'fiend_soul_ember',
    classId: 'warlock',
    name: 'Soul Ember',
    icon: '🔥',
    desc: 'While injured, damaging an enemy bearing your curse heals 5% max health and grants 10% damage reduction for 3s. Once per 6s; full health does not spend the trigger.',
  },
  wa_great_old_one: {
    id: 'old_one_dread_insight',
    classId: 'warlock',
    name: 'Dread Insight',
    icon: '👁️',
    desc: 'Deal 8% more damage to enemies bearing your curse while they are slowed, rooted, stunned, have slower wind-ups, or deal weakened damage.',
  },
};

export function getSubclassPassive(id: string | undefined): SubclassPassiveDef | undefined {
  return Object.values(SUBCLASS_PASSIVES).find((p) => p.id === id);
}
