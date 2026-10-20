/** Authored subclass identity. Passives are not skill slots or Forge donors. */
import type { ClassId } from '../core/types';

export interface SubclassPassiveDef {
  id: string;
  classId: ClassId;
  name: string;
  icon: string;
  desc: string;
}

export const SUBCLASS_PASSIVES: Record<string, SubclassPassiveDef> = {
  bb_berserker: {
    id: 'berserker_rampage',
    classId: 'barbarian',
    name: 'Rampage',
    icon: '🪓',
    desc: 'Spending Momentum readies your next basic cast for 4s: +10% damage per stack spent (up to 30%) and +8u melee reach per stack. The basic cast spends readiness, even on a miss. Rage and Whirlwind provide the base-kit route.',
  },
  bb_totem: {
    id: 'totem_shelter',
    classId: 'barbarian',
    name: 'Spirit Shelter',
    icon: '🐻',
    desc: 'Spending Momentum grants you and living allies within 180u the greater of 8 + 4 per stack or 4% + 2% recipient max HP per stack (up to 20 or 10% max HP) as absorption, lasting 4s. Once per 6s; shared cap and strongest-cast rules apply. Rage and Whirlwind work with every subclass choice.',
  },
  mo_openhand: {
    id: 'openhand_flowguard',
    classId: 'monk',
    name: 'Flowguard',
    icon: '✋',
    desc: 'Spending Flow grants one frontal damage block for 3s. Aim toward the attack; ground and rear damage bypass it. Stronger existing guards are preserved; charges do not stack. Step of the Wind and Quivering Palm provide the base-kit route.',
  },
  mo_shadow: {
    id: 'shadow_rhythm',
    classId: 'monk',
    name: 'Shadow Rhythm',
    icon: '🌑',
    desc: 'Spending Flow removes 2s from running dash and blink special cooldowns in your active kit. Once per 4s; ready movement skills do not spend the trigger. Step of the Wind and Quivering Palm work with every subclass choice.',
  },
  rg_beastmaster: {
    id: 'beast_pack_bond',
    classId: 'ranger',
    name: 'Pack Bond',
    icon: '🐺',
    desc: 'A spirit wolf follows you. Your connecting direct hits command a 16-damage bite within 600u, once per 2.5s; +25% bite damage against slowed, rooted or stunned foes. Effective dedicated healing prepares your next successful bite to grant the healed ally 8% recipient max-HP absorption (minimum 12) for 4s, if within 420u; preparation lasts 6s. The spirit crosses cover, reaches flyers, cannot tank or block movement, and rests while you are downed or outside combat. Basics work with every subclass choice.',
  },
  rg_hunter: {
    id: 'hunter_quarry',
    classId: 'ranger',
    name: 'Exposed Quarry',
    icon: '🎯',
    desc: 'Connecting direct hits expose foes for 3s: they take 10% more damage from the party. Marks refresh and never stack between Hunters. Piercing shots can expose several foes; damage-zone ticks do not apply marks. Basics work with every subclass choice.',
  },
  dr_moon: {
    id: 'moon_aspect',
    classId: 'druid',
    name: 'Moon Aspect',
    icon: '🐻',
    desc: 'Casting a special enters bear form for 6s, once per 12s, even at full health. Gain 20% movement speed; basic casts also swipe a 95u aimed claw for 14 damage. Thornlash and all spells remain usable. Claws or nearby positive direct hits heal you for 3% max HP (minimum 4), once per 1s; zones cannot mend. Claws share one cast across multishot, cannot crit or trigger direct-hit riders. All four Moon choices and base specials can activate it; downing, class changes and noncombat rooms end it.',
  },
  dr_land: {
    id: 'land_paths',
    classId: 'druid',
    name: 'Living Paths',
    icon: '🌿',
    desc: 'Your friendly ground zones grant allies 20% movement speed and make enemy wind-ups 25% slower while inside, briefly lingering after departure. Stronger zone effects are preserved. Entangle works with every subclass choice; ground zones still cannot reach flyers.',
  },
  kn_champion: {
    id: 'champion_reprise',
    classId: 'knight',
    name: 'Victorious Reprise',
    icon: '⚔️',
    desc: 'Landing a readied melee counter heals you for 8% max HP, up to 20. Once per 6s; misses, immunity and unused counters do not spend it. Taunt, Shield Wall and Riposte can ready counters.',
  },
  kn_battlemaster: {
    id: 'battle_opening',
    classId: 'knight',
    name: 'Tactical Opening',
    icon: '🎯',
    desc: 'A direct hit on a slowed, rooted or stunned foe readies your next melee counter for 4s and makes that foe wind up 30% slower for 3s. Once per 6s; an existing counter is preserved. Shield Bash supplies control with any subclass choice.',
  },
  cl_light: {
    id: 'light_refulgence',
    classId: 'cleric',
    name: 'Refulgence',
    icon: '☀️',
    desc: 'Effective dedicated healing or a successful direct barrier grant readies your next direct hit for +25% damage and 30% slower enemy wind-ups for 3s. Readiness lasts 6s; once per 6s. Basics can spend it; damage zones cannot.',
  },
  cl_life: {
    id: 'life_abundance',
    classId: 'cleric',
    name: 'Abundance',
    icon: '🌱',
    desc: 'Dedicated heals convert 50% of unused healing into added absorption, up to the greater of 25 or 12% recipient max HP per trigger for 6s. Works at full health. Once per 6s; shared 50%-max-HP barrier cap applies; no healing score or rescue from overheal.',
  },
  pa_devotion: {
    id: 'devotion_anchor',
    classId: 'paladin',
    name: 'Oath Anchor',
    icon: '⚓',
    desc: 'Starting any aura cleanses nearby living allies (including you) of movement/control effects and grants 2s Steadfast against roots, stuns and forced movement. Once per 8s on activation, not every aura tick. Direct damage still hits.',
  },
  pa_vengeance: {
    id: 'vengeance_procession',
    classId: 'paladin',
    name: 'Relentless Procession',
    icon: '🔥',
    desc: 'Your first connecting melee hit during each aura slows its victim by 25% for 2s and extends that aura by 2s. Once per aura; it does not reset Pursuit strikes or change the aura radius. Your basic melee works with every subclass choice.',
  },
  mg_evoker: {
    id: 'evoker_arcane_cadence',
    classId: 'mage',
    name: 'Arcane Cadence',
    icon: '⚡',
    desc: 'A positive direct hit on a slowed/rooted/stunned foe, or one that applies slow/stun, removes 4s from running nonbasic cooldowns: Fireball, Frost Nova, Blink and subclass skills. It also prepares your next nonbasic damaging spell for +25% damage and half wind-up within 6s. Once per 6s; basics can trigger but never spend preparation or receive refunds. Zone ticks cannot trigger it.',
  },
  mg_abjurer: {
    id: 'abjurer_binding_ward',
    classId: 'mage',
    name: 'Binding Ward',
    icon: '🔷',
    desc: 'A direct hit against a slowed, rooted or stunned foe grants you 10% max-HP absorption (minimum 20) for 5s. Once per 6s; shared barrier cap and strongest-cast rules apply.',
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
    desc: 'Three basic casts within 8s prepare Spell Surge for 8s, empowering your next heavy spell. Once per 8s; basics cannot build progress while Surge is held or the trigger is cooling down. No special delivery combination is required; native preparation does not spend the trigger.',
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
    desc: 'Completing a chorus readies an echo for 8s. Your next effective dedicated heal echoes 50% of its healing (up to the greater of 35 or 12% recipient max HP) to the most injured other ally within 420u, or the original recipient if no other ally is injured. Once per 8s; echoes do not prepare verses or trigger rescue.',
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
    desc: 'Damaging an enemy bearing your curse heals 5% max health and grants 12% max-HP absorption (minimum 15) for 6s. Works at full health; once per 6s. Shared barrier cap and strongest-pool rules apply; a full-health failed shield preserves the trigger.',
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
