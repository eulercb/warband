import { CLASS_IDS } from '../src/engine/content/classes';
import { subclassesFor } from '../src/engine/content/subclasses';
import { draftedClassFor } from '../src/engine/content/kitshuffle';
import { CHAR_UPGRADES } from '../src/engine/content/charUpgrades';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrandLoadout } from '../src/engine/content/grandSelections';
import type { SpecialMsg } from '../src/net/protocol';
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
let host: Host;
beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  transport.actions.clear();
});
afterEach(() => {
  host?.leave();
  vi.unstubAllGlobals();
});
function makeHost() {
  const states = vi.fn<(s: GrandLoadout, credit: boolean) => void>();
  host = new Host({
    code: 'TESTAA',
    name: 'A',
    classId: 'knight',
    monsterId: 'lich',
    gauntlet: true,
    seed: 31,
    onLobby: vi.fn(),
    onResult: vi.fn(),
    onGrandState: states,
  });
  host.startFight();
  return states;
}
function clearFive() {
  for (let i = 0; i < 5; i++) {
    host.endRun('victory');
    if (i < 4) host.setNextReady(true);
  }
}
describe('host-authoritative grand opportunity and phase', () => {
  it('offers the first grand at clear five, separately from progression and normal boons', () => {
    const states = makeHost();
    host.chooseGrand({ classId: 'knight', id: 'kn_gk_basic_a', action: 'earn' });
    clearFive();
    expect(states.mock.lastCall![1]).toBe(true);
    host.chooseCharUpgrade('kn_gk_basic_a'); // Legacy generic packet cannot bypass the grand ledger.
    host.chooseGrand({ classId: 'mage', id: 'mg_gk_basic_a', action: 'earn' });
    expect(states.mock.lastCall![1]).toBe(true);
    host.chooseGrand({ classId: 'knight', id: 'kn_gk_basic_a', action: 'earn' });
    expect(states.mock.lastCall![0].classes.knight!.equipped).toEqual(['kn_gk_basic_a']);
    expect(states.mock.lastCall![1]).toBe(false);
    host.chooseGrand({ classId: 'knight', id: 'kn_gk_a1_a', action: 'earn' });
    expect(states.mock.lastCall![0].classes.knight!.bank).toEqual(['kn_gk_basic_a']);
    host.chooseSubSkill('kn_champion', 'kn_champion_slam');
    expect(states.mock.lastCall![0].classes.knight!.bank).toEqual(['kn_gk_basic_a']);
    host.continueEndless();
    const last = states.mock.lastCall![0];
    host.chooseGrand({ classId: 'knight', id: 'kn_gk_basic_a', action: 'unequip' });
    expect(states.mock.lastCall![0]).toEqual(last); // Includes paused combat: never a respec window.
    clearFive();
    host.chooseGrand({ classId: 'knight', id: 'kn_gk_a1_a', action: 'earn' });
    expect(states.mock.lastCall![0].classes.knight!.equipped).toHaveLength(2);
  });
  it('lets a skipped opportunity expire and accepts only the host-owned bank, not client state', () => {
    const states = makeHost();
    clearFive();
    host.continueEndless();
    host.endRun('victory');
    expect(states.mock.lastCall![1]).toBe(false);
    const spoof: SpecialMsg = {
      grandState: {
        version: 1,
        classes: { knight: { bank: ['kn_gk_basic_a'], equipped: ['kn_gk_basic_a'] } },
      },
      grandCredit: true,
    };
    transport.actions.get(ACTIONS.special)!.onMessage!(spoof, { peerId: 'host' });
    host.chooseGrand({ classId: 'knight', id: 'kn_gk_basic_a', action: 'equip' });
    expect(states.mock.lastCall![0].classes.knight!.bank).toEqual([]);
  });
});

it('allows an earned alternative after a defeat and carries the replacement into a retry', () => {
  const states = vi.fn<(state: GrandLoadout, credit: boolean) => void>();
  host = new Host({
    code: 'TESTAA',
    name: 'A',
    classId: 'mage',
    monsterId: 'lich',
    onLobby: vi.fn(),
    onResult: vi.fn(),
    onGrandState: states,
    loadout: () => ({
      grandLoadout: {
        version: 1,
        classes: {
          mage: { bank: ['mg_gk_basic_a', 'mg_gk_basic_b'], equipped: ['mg_gk_basic_a'] },
        },
      },
    }),
  });
  host.startFight();
  host.endRun('defeat');
  host.chooseGrand({
    classId: 'mage',
    id: 'mg_gk_basic_b',
    action: 'equip',
    replace: 'mg_gk_basic_a',
  });
  expect(states.mock.lastCall![0].classes.mage!.equipped).toEqual(['mg_gk_basic_b']);
  host.retryFight();
  expect(states.mock.lastCall![0].classes.mage!.equipped).toEqual(['mg_gk_basic_b']);
  expect(states.mock.lastCall![1]).toBe(false);
});

it('uses the actual Chaos-Draft class for both subclass and grand validation', () => {
  const drafted = draftedClassFor(31, 'host');
  const picked = CLASS_IDS.find((c) => c !== drafted)!;
  const states = vi.fn<(state: GrandLoadout, credit: boolean) => void>();
  host = new Host({
    code: 'TESTAA',
    name: 'A',
    classId: picked,
    monsterId: 'lich',
    gauntlet: true,
    randomKits: true,
    seed: 31,
    onLobby: vi.fn(),
    onResult: vi.fn(),
    onGrandState: states,
  });
  host.startFight();
  clearFive();
  const sub = subclassesFor(drafted)[0];
  host.chooseSubSkill(sub.id, sub.skills[0].id);
  const grand = Object.values(CHAR_UPGRADES).find((d) => d.grand && d.subclassId === sub.id)!;
  host.chooseGrand({ classId: drafted, id: grand.id, action: 'earn' });
  expect(states.mock.lastCall![0].classes[drafted]!.equipped).toEqual([grand.id]);
  expect(states.mock.lastCall![0].classes[picked]).toBeUndefined();
});
