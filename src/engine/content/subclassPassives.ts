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
