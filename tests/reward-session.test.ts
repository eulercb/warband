// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ClassId } from '../src/engine/core/types';
import type { SpecialMsg, UpgradeMsg } from '../src/net/protocol';

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
  selfId: 'host',
  getTrackerSockets: () => [],
  openRoom: () => ({ makeAction: transport.makeAction, getPeers: () => [], leave: vi.fn() }),
}));
vi.mock('../src/net/log', () => ({
  netLog: vi.fn(),
  netLogOnce: vi.fn(),
  startNetDiagnostics: () => vi.fn(),
}));
import { Host } from '../src/net/session/host';
import { ACTIONS } from '../src/net/protocol';
import { World } from '../src/engine/world/world';

let host: Host;
beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  transport.actions.clear();
  host = new Host({
    code: 'TESTAA',
    name: 'A',
    classId: 'knight',
    monsterId: 'lich',
    gauntlet: true,
    seed: 31,
    onLobby: vi.fn(),
    onResult: vi.fn(),
  });
  host.startFight();
  host.endRun('victory');
});
afterEach(() => {
  host.leave();
  vi.unstubAllGlobals();
});

// Observe the authoritative ledgers, including a remote peer without running WebRTC.
function ledgers() {
  return host as unknown as {
    world: World;
    coinsByPeer: Map<string, number>;
    rerollsByPeer: Map<string, number>;
    upgrades: Map<string, string[]>;
    charUpgrades: Map<string, string[]>;
    lobby: Map<string, { classId: ClassId }>;
  };
}

it.each(['host', 'remote'])('keeps %s claims and coins authoritative across rerolls', (peerId) => {
  const state = ledgers();
  state.coinsByPeer.set(peerId, 10);
  if (peerId === 'remote') state.lobby.set(peerId, { classId: 'knight' });
  const upgrade = (msg: UpgradeMsg) => {
    if (peerId === 'host') {
      if (msg.generic) host.chooseUpgrade(msg.generic);
      if (msg.char) host.chooseCharUpgrade(msg.char);
    } else transport.actions.get(ACTIONS.upgrade)!.onMessage!(msg, { peerId });
  };
  const reroll = () => {
    if (peerId === 'host') host.rerollOffers();
    else
      transport.actions.get(ACTIONS.special)!.onMessage!(
        { rerollOffers: true } satisfies SpecialMsg,
        { peerId },
      );
  };
  upgrade({ char: 'hy_vampiric' });
  reroll();
  expect(state.coinsByPeer.get(peerId)).toBe(8);
  upgrade({ char: 'kn_bulwark' }); // even a forged post-reroll claim is ignored
  expect(state.charUpgrades.get(peerId)).toEqual(['hy_vampiric']);
  upgrade({ generic: 'swift' });
  reroll(); // no unresolved categories, so the purchase is rejected
  expect(state.coinsByPeer.get(peerId)).toBe(8);
  expect(state.rerollsByPeer.get(peerId)).toBe(1);
  expect(state.upgrades.get(peerId)).toEqual(['swift']);
  if (peerId === 'host') {
    host.advanceGauntlet();
    const player = state.world.players.find((p) => p.peerId === 'host')!;
    const baseline = new World({
      monsterId: 'lich',
      seed: 31,
      players: [{ peerId: 'plain', name: 'Plain', classId: 'knight' }],
    }).players[0];
    expect(player.maxHp).toBeLessThan(baseline.maxHp);
    expect(player.abilities!.basic.lifestealFrac).toBeGreaterThan(0);
  }
});
