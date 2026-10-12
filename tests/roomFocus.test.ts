import { describe, expect, it } from 'vitest';
import { nearbyRoomChoice } from '../src/ui/game/roomFocus';
import { menuMarker } from '../src/render/pipeline/labelLayout';
import { World } from '../src/engine/world/world';
import type { RenderState, StationKind, StationView } from '../src/engine/core/types';

function state(): RenderState {
  const world = new World({
    monsterId: 'dummy',
    seed: 1,
    scene: 'war',
    players: [{ peerId: 'p', name: 'Hero', classId: 'knight' }],
  });
  return world.toRenderState(world.playerIdByPeer('p'));
}
function station(kind: StationKind, x: number, extra: Partial<StationView> = {}): StationView {
  return { id: 1, kind, pos: { x, y: 780 }, radius: 24, triggerRadius: 52, ...extra };
}

describe('nearby menu information', () => {
  it('shows only the nearest choice, with the same marker numbering as the floor', () => {
    const s = state();
    s.stations = [
      station('class', 500, { label: 'Knight' }),
      station('class', 810, { label: 'Ranger', channel: 0.5, selected: true }),
      station('class', 830, { label: 'Mage' }),
    ];
    const result = nearbyRoomChoice(s)!;
    expect(result.marker).toBe('H2');
    expect(result.title).toBe('Ranger');
    expect(result.channel).toBe(0.5);
    expect(result.selected).toBe(true);
    expect(s.stations[1].channel).toBe(0.5); // presentation never changes the interaction
  });
  it('includes disabled and removal choices and reads wrapped locations', () => {
    const s = state();
    s.players[0].pos = { x: 5, y: 780 };
    s.stations = [station('removebot', 1595, { label: 'Send Mage home', disabled: true })];
    expect(nearbyRoomChoice(s)).toMatchObject({
      marker: '−1',
      disabled: true,
      title: 'Send Mage home',
    });
  });
  it('does not invent details when the hero or any nearby choice is absent', () => {
    const s = state();
    expect(nearbyRoomChoice(s)).toBeNull();
    s.stations = [station('class', 400)];
    expect(nearbyRoomChoice(s)).toBeNull();
    s.localPlayerId = null;
    expect(nearbyRoomChoice(s)).toBeNull();
  });
  it('offers readable instructions for every station type and preserves tier labels', () => {
    const kinds: StationKind[] = [
      'class',
      'boss',
      'tier',
      'single',
      'gauntlet',
      'hardcore',
      'chaosforge',
      'daily',
      'chaosdraft',
      'host',
      'join',
      'controls',
      'muster',
      'start',
      'addbot',
      'removebot',
    ];
    for (const kind of kinds) {
      const s = state();
      s.stations = [station(kind, 800)];
      expect(nearbyRoomChoice(s)?.detail.length).toBeGreaterThan(10);
    }
    expect(menuMarker(station('tier', 800, { refId: 'easy' }), 1)).toBe('EASY');
    expect(menuMarker(station('tier', 800), 1)).toBe('Tier');
  });
  it('uses nearby totem descriptions, while keeping a closer effigy as the focus', () => {
    for (const kind of ['host', 'join', 'class', 'controls'] as const) {
      const s = state();
      s.totems = [
        { id: 99, kind, pos: { x: 810, y: 780 }, radius: 30, triggerRadius: 120, active: false },
      ];
      expect(nearbyRoomChoice(s)?.detail.length).toBeGreaterThan(10);
      s.stations = [station('class', 805, { label: 'Knight' })];
      expect(nearbyRoomChoice(s)?.title).toBe('Knight');
      s.totems[0].active = true;
      expect(nearbyRoomChoice(s)?.marker).not.toBe('H1');
    }
  });
});

it('preserves boss lore and class roles, including a full bot band', () => {
  const s = state();
  s.stations = [station('boss', 800, { refId: 'dragon', label: 'Ancient Dragon' })];
  expect(nearbyRoomChoice(s)?.detail).toContain('hulking');
  s.stations = [station('addbot', 800, { refId: 'mage', label: 'BAND FULL', disabled: true })];
  expect(nearbyRoomChoice(s)?.title).toBe('Mage · BAND FULL');
  expect(nearbyRoomChoice(s)?.detail).toContain('Burst DPS');
  s.stations = [station('class', 800, { refId: 'knight', label: 'Knight' })];
  expect(nearbyRoomChoice(s)?.title).toBe('Knight');
  expect(nearbyRoomChoice(s)?.detail).toContain('Tank');
  s.stations = [station('boss', 800, { refId: 'unknown' })];
  expect(nearbyRoomChoice(s)?.detail).toContain('single fight');
  s.stations = [station('addbot', 800, { refId: 'unknown' })];
  expect(nearbyRoomChoice(s)?.detail).toContain('host');
});
