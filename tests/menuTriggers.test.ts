/**
 * Warband — unit tests for the walkable-menu trigger relays (WarRoom + MusterHall).
 * These drive the exact station-trigger → store/session mapping that the component
 * tests can't reach (they stub the Pixi RAF loop away), so a cross-wire — e.g.
 * `chaosdraft` flipping `hardcore`, or `removebot` calling the wrong helper — is
 * caught here. `session` is mocked; the Zustand store is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/ui/state/session', () => ({
  setMonster: vi.fn(),
  setGauntlet: vi.fn(),
  setReady: vi.fn(),
  startFight: vi.fn(),
  addBot: vi.fn(),
  removeBot: vi.fn(),
  playUiSound: vi.fn(),
}));

import { relayWarTrigger, relayMusterTrigger, computeCanStart } from '../src/ui/game/menuTriggers';
import * as session from '../src/ui/state/session';
import { useStore } from '../src/ui/state/store';
import { MAX_PLAYERS } from '../src/engine/core/constants';
import type { LobbyPlayer } from '../src/net/protocol';

function player(over: Partial<LobbyPlayer> = {}): LobbyPlayer {
  return {
    peerId: 'p',
    name: 'Hero',
    classId: 'mage',
    ready: false,
    isHost: false,
    isBot: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    monsterId: 'goblin',
    gauntlet: false,
    hardcore: false,
    chaosForge: false,
    randomKits: false,
    seedMode: 'random',
    seedInput: '',
    localReady: false,
    players: [],
  });
});

describe('relayWarTrigger: run-mode modifiers → store', () => {
  it('flips Chaos Forge on and back off', () => {
    relayWarTrigger({ kind: 'chaosforge' }, () => {});
    expect(useStore.getState().chaosForge).toBe(true);
    relayWarTrigger({ kind: 'chaosforge' }, () => {});
    expect(useStore.getState().chaosForge).toBe(false);
  });

  it('flips Chaos Draft (randomKits) without touching Hardcore — no cross-wire', () => {
    relayWarTrigger({ kind: 'chaosdraft' }, () => {});
    expect(useStore.getState().randomKits).toBe(true);
    expect(useStore.getState().hardcore).toBe(false);
  });

  it('flips Hardcore without touching Chaos Draft — no cross-wire', () => {
    relayWarTrigger({ kind: 'hardcore' }, () => {});
    expect(useStore.getState().hardcore).toBe(true);
    expect(useStore.getState().randomKits).toBe(false);
  });

  it('maps Run of the Day from ANY prior seed mode: custom → daily → random → daily', () => {
    useStore.setState({ seedMode: 'custom' });
    relayWarTrigger({ kind: 'daily' }, () => {});
    expect(useStore.getState().seedMode).toBe('daily'); // custom lands on daily, not random
    relayWarTrigger({ kind: 'daily' }, () => {});
    expect(useStore.getState().seedMode).toBe('random');
    relayWarTrigger({ kind: 'daily' }, () => {});
    expect(useStore.getState().seedMode).toBe('daily');
  });

  it('never clears a custom seed input (text entry stays List-view only)', () => {
    useStore.setState({ seedMode: 'custom', seedInput: 'warband' });
    relayWarTrigger({ kind: 'daily' }, () => {});
    expect(useStore.getState().seedInput).toBe('warband');
  });
});

describe('relayWarTrigger: selections → session', () => {
  it('relays a boss pick with a refId to setMonster', () => {
    relayWarTrigger({ kind: 'boss', refId: 'troll' }, () => {});
    expect(session.setMonster).toHaveBeenCalledWith('troll');
  });

  it('ignores a boss trigger with no refId', () => {
    relayWarTrigger({ kind: 'boss' }, () => {});
    expect(session.setMonster).not.toHaveBeenCalled();
  });

  it('relays single/gauntlet portals to setGauntlet', () => {
    relayWarTrigger({ kind: 'single' }, () => {});
    expect(session.setGauntlet).toHaveBeenLastCalledWith(false);
    relayWarTrigger({ kind: 'gauntlet' }, () => {});
    expect(session.setGauntlet).toHaveBeenLastCalledWith(true);
  });

  it('runs the raise-banner commit on the host trigger', () => {
    const doHost = vi.fn();
    relayWarTrigger({ kind: 'host' }, doHost);
    expect(doHost).toHaveBeenCalledTimes(1);
  });
});

describe('relayMusterTrigger', () => {
  it('toggles readiness on the muster rune', () => {
    useStore.setState({ localReady: false });
    relayMusterTrigger({ kind: 'muster' });
    expect(session.setReady).toHaveBeenLastCalledWith(true);
    useStore.setState({ localReady: true });
    relayMusterTrigger({ kind: 'muster' });
    expect(session.setReady).toHaveBeenLastCalledWith(false);
  });

  it('starts the fight only once the band can start', () => {
    useStore.setState({ players: [player({ peerId: 'g', ready: false })] });
    relayMusterTrigger({ kind: 'start' }); // an un-ready human blocks the start
    expect(session.startFight).not.toHaveBeenCalled();
    useStore.setState({ players: [player({ peerId: 'g', ready: true })] });
    relayMusterTrigger({ kind: 'start' });
    expect(session.startFight).toHaveBeenCalledTimes(1);
  });

  it('adds a bot of the walked class when the band has room', () => {
    useStore.setState({ players: [player({ peerId: 'h', isHost: true })] });
    relayMusterTrigger({ kind: 'addbot', refId: 'ranger' });
    expect(session.addBot).toHaveBeenCalledWith('ranger');
  });

  it('refuses to add a bot when the band is already full', () => {
    useStore.setState({
      players: Array.from({ length: MAX_PLAYERS }, (_, i) =>
        player({ peerId: `p${i}`, isHost: i === 0, isBot: i > 0 }),
      ),
    });
    relayMusterTrigger({ kind: 'addbot', refId: 'ranger' });
    expect(session.addBot).not.toHaveBeenCalled();
  });

  it('ignores an addbot trigger with no refId', () => {
    relayMusterTrigger({ kind: 'addbot' });
    expect(session.addBot).not.toHaveBeenCalled();
  });

  it('removes the SPECIFIC bot named by a removebot trigger', () => {
    relayMusterTrigger({ kind: 'removebot', refId: 'bot-42' });
    expect(session.removeBot).toHaveBeenCalledWith('bot-42');
  });

  it('ignores a removebot trigger with no refId', () => {
    relayMusterTrigger({ kind: 'removebot' });
    expect(session.removeBot).not.toHaveBeenCalled();
  });
});

describe('computeCanStart', () => {
  it('is true with no other humans (bots never block the start)', () => {
    expect(
      computeCanStart({
        isHost: true,
        players: [player({ peerId: 'h', isHost: true }), player({ peerId: 'b', isBot: true })],
      }),
    ).toBe(true);
  });

  it('is false while a non-host human is not ready, true once every human is', () => {
    const roster = (ready: boolean) => ({
      isHost: true,
      players: [player({ peerId: 'h', isHost: true, ready: true }), player({ peerId: 'g', ready })],
    });
    expect(computeCanStart(roster(false))).toBe(false);
    expect(computeCanStart(roster(true))).toBe(true);
  });
});
