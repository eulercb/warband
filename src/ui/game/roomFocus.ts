import type { RenderState, StationKind } from '../../engine/core/types';
import { CLASSES } from '../../engine/content/classes';
import { MONSTERS } from '../../engine/content/monsters';
import type { ClassId, MonsterId } from '../../engine/core/types';
import { dist } from '../../engine/core/torus';
import { menuMarker } from '../../render/pipeline/labelLayout';

export interface RoomFocus {
  marker: string;
  title: string;
  detail: string;
  channel: number;
  disabled: boolean;
  selected: boolean;
}
const DETAILS: Record<StationKind, string> = {
  class: 'Stand on this effigy to become this hero. The Hero picker in Menu is also available.',
  boss: 'Stand here to choose this boss for a single fight. Gauntlet bosses are drawn from the seed.',
  tier: 'Stand here to browse bosses in this difficulty tier.',
  single: 'Choose one boss fight.',
  gauntlet: 'Choose a seeded five-boss run with upgrades between fights.',
  hardcore: 'Toggle harder fights, limited revives, and no free retry. Applies to a gauntlet.',
  chaosforge: 'Toggle procedurally rolled content. Applies to any run.',
  chaosdraft: 'Toggle randomized hero kits. Applies to any run.',
  daily: 'Toggle the shared Run of the Day seed. Applies to a gauntlet.',
  host: 'Stand in this portal to create the room. List view also has Create Room.',
  join: 'Open the room-code form to join a friend.',
  controls: 'Open input instructions and rebinding.',
  muster: 'Stand here to ready up. Step off and back on to stand down.',
  start: 'The host starts the fight here once the whole band is ready.',
  addbot: 'The host can stand here to add a bot of this class, while the band has space.',
  removebot: 'The host can stand here to send this bot home.',
};

/** Read-only inspection; does not change any trigger or claim radius. */
export function nearbyRoomChoice(state: RenderState): RoomFocus | null {
  const hero = state.players.find((p) => p.id === state.localPlayerId);
  if (!hero) return null;
  let best: RoomFocus | null = null;
  let distance = 150;
  const ordinals: Partial<Record<StationKind, number>> = {};
  for (const station of state.stations ?? []) {
    const ordinal = (ordinals[station.kind] ?? 0) + 1;
    ordinals[station.kind] = ordinal;
    const d = dist(hero.pos, station.pos);
    if (d >= distance) continue;
    distance = d;
    let detail = DETAILS[station.kind];
    let title = station.label ?? station.kind;
    if (station.refId && station.kind === 'boss' && Object.hasOwn(MONSTERS, station.refId))
      detail = `${MONSTERS[station.refId as MonsterId].theme} ${detail}`;
    if (
      station.refId &&
      (station.kind === 'class' || station.kind === 'addbot') &&
      Object.hasOwn(CLASSES, station.refId)
    ) {
      const heroClass = CLASSES[station.refId as ClassId];
      detail = `${heroClass.role}. ${detail}`;
      if (station.disabled) title = `${heroClass.name} · ${title}`;
    }
    best = {
      marker: menuMarker(station, ordinal),
      title,
      detail,
      channel: station.channel ?? 0,
      disabled: station.disabled ?? false,
      selected: station.selected ?? false,
    };
  }
  for (const totem of state.totems ?? []) {
    const d = dist(hero.pos, totem.pos);
    if (!totem.active && d >= distance) continue;
    distance = d;
    const titles = {
      host: 'Host a game',
      join: 'Join a game',
      class: 'Choose your hero',
      controls: 'Controls',
    };
    best = {
      marker: titles[totem.kind],
      title: titles[totem.kind],
      detail:
        totem.kind === 'class'
          ? 'Stand in this totem to open the Hero picker.'
          : DETAILS[totem.kind],
      channel: 0,
      disabled: false,
      selected: false,
    };
  }
  return best;
}
