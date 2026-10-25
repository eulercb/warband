// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { GrandLoadout } from '../src/engine/content/grandSelections';
const transport = vi.hoisted(() => {
  const actions = new Map<
    string,
    {
      send: ReturnType<typeof vi.fn>;
      onMessage: ((data: unknown, ctx: { peerId: string }) => void) | null;
    }
  >();
  return {
    actions,
    makeAction: (id: string) => {
      const action = { send: vi.fn(), onMessage: null };
      actions.set(id, action);
      return action;
    },
  };
});
vi.mock('../src/net/transport/room', () => ({
  selfId: 'guest',
  getTrackerSockets: () => [],
  openRoom: () => ({ makeAction: transport.makeAction, getPeers: () => [], leave: vi.fn() }),
}));
vi.mock('../src/net/log', () => ({
  netLog: vi.fn(),
  netLogOnce: vi.fn(),
  startNetDiagnostics: () => vi.fn(),
}));
import { Client } from '../src/net/session/client';
import { ACTIONS } from '../src/net/protocol';
let client: Client;
afterEach(() => client?.leave());
it('acknowledges only the connected host bank and restores a late/restarted client from StartMsg', () => {
  const states = vi.fn();
  client = new Client({
    code: 'TESTAA',
    name: 'B',
    onLobby: vi.fn(),
    onStart: vi.fn(),
    onResult: vi.fn(),
    onReturnLobby: vi.fn(),
    onHostLeft: vi.fn(),
    onGrandState: states,
  });
  const emit = (action: string, payload: unknown, peerId = 'host') =>
    transport.actions.get(action)!.onMessage!(payload, { peerId });
  emit(ACTIONS.lobby, { players: [], phase: 'lobby' });
  const state: GrandLoadout = {
    version: 1,
    classes: { knight: { bank: ['kn_gk_basic_a'], equipped: ['kn_gk_basic_a'] } },
  };
  emit(ACTIONS.special, { grandState: state, grandCredit: true }, 'impostor');
  expect(states).not.toHaveBeenCalled();
  emit(ACTIONS.special, { grandState: { version: 99 }, grandCredit: true });
  expect(states).not.toHaveBeenCalled();
  emit(ACTIONS.special, { grandState: state, grandCredit: true });
  expect(states).toHaveBeenLastCalledWith(state, true);
  client.chooseGrand({ classId: 'knight', id: 'kn_gk_basic_a', action: 'unequip' });
  expect(transport.actions.get(ACTIONS.special)!.send).toHaveBeenLastCalledWith({
    grand: { classId: 'knight', id: 'kn_gk_basic_a', action: 'unequip' },
  });
  emit(ACTIONS.start, { playerCount: 1, monsterId: 'lich', grandLoadouts: { guest: state } });
  expect(states).toHaveBeenLastCalledWith(state, false);
  emit(ACTIONS.start, { playerCount: 1, monsterId: 'lich' });
  expect(states).toHaveBeenCalledTimes(2);
});
