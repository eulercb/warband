// @vitest-environment jsdom
/**
 * Tests for ui/session.ts — the imperative session-control layer that wires
 * Host/Client callbacks into the Zustand store. Host, Client, Sfx, room and log
 * are mocked so we exercise session's own logic (store wiring, phase
 * transitions, delegation, timers) without any real networking or audio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture constructor options of the mocked Host/Client so tests can invoke the
// callbacks session.ts passes in.
interface Captured {
  opts: Record<string, (...args: unknown[]) => unknown>;
  spies: Record<string, ReturnType<typeof vi.fn>>;
}
const hosts: Captured[] = [];
const clients: Captured[] = [];

function makeSpies(): Record<string, ReturnType<typeof vi.fn>> {
  const names = [
    'setSelection',
    'setReady',
    'startFight',
    'retryFight',
    'advanceGauntlet',
    'returnToLobby',
    'setMonster',
    'setGauntlet',
    'addBot',
    'removeBot',
    'setBotClass',
    'requestPause',
    'chooseUpgrade',
    'chooseCharUpgrade',
    'swapClass',
    'setNextReady',
    'continueEndless',
    'endRun',
    'leave',
  ];
  const out: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const n of names) out[n] = vi.fn();
  return out;
}

vi.mock('../src/net/session/host', () => {
  class Host {
    constructor(opts: Record<string, (...a: unknown[]) => unknown>) {
      const spies = makeSpies();
      Object.assign(this, spies);
      hosts.push({ opts, spies });
    }
  }
  return { Host };
});

vi.mock('../src/net/session/client', () => {
  class Client {
    constructor(opts: Record<string, (...a: unknown[]) => unknown>) {
      const spies = makeSpies();
      Object.assign(this, spies);
      clients.push({ opts, spies });
    }
  }
  return { Client };
});

// Hoisted so the mock factory (itself hoisted above imports) can reference it
// when session.ts builds its `Sfx` at module-load time.
const sfxSpies = vi.hoisted(() => ({
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  resume: vi.fn(),
  play: vi.fn(),
}));
vi.mock('../src/audio/sfx', () => {
  class Sfx {
    setVolume = sfxSpies.setVolume;
    setMuted = sfxSpies.setMuted;
    resume = sfxSpies.resume;
    play = sfxSpies.play;
  }
  return { Sfx };
});

vi.mock('../src/net/transport/room', () => ({
  generateRoomCode: vi.fn(() => 'ABC234'),
  writeRoomToHash: vi.fn(),
  shareLinkFor: vi.fn((code: string, net: string) => `https://warband/#room=${code}&net=${net}`),
  selfId: 'selfpeerid',
}));

vi.mock('../src/net/log', () => ({ netLog: vi.fn(), netWarn: vi.fn() }));

// Import the SUT and store AFTER the mocks are registered.
import * as session from '../src/ui/state/session';
import { useStore } from '../src/ui/state/store';
import { Host } from '../src/net/session/host';

function resetStore(): void {
  useStore.setState({
    phase: 'menu',
    error: null,
    hostLeft: false,
    roomCode: null,
    isHost: false,
    session: null,
    netMode: 'p2p',
    peerCount: 0,
    netHint: null,
    players: [],
    lobbyPhase: 'lobby',
    gauntlet: false,
    localName: 'Tester',
    localReady: false,
    paused: false,
    pausedBy: null,
    resumeCountdown: null,
    run: null,
    cycle: 0,
    myUpgrades: [],
    myCharUpgrades: [],
    nextReadyReady: 0,
    nextReadyTotal: 0,
    result: null,
    showControls: false,
  });
}

beforeEach(() => {
  hosts.length = 0;
  clients.length = 0;
  for (const s of Object.values(sfxSpies)) s.mockClear();
  localStorage.clear();
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
});

const st = () => useStore.getState();

describe('session.hostGame', () => {
  it('constructs a Host and moves the store into the lobby', async () => {
    useStore.setState({ localClass: 'knight', monsterId: st().monsterId, gauntlet: true });
    await session.hostGame();

    expect(hosts).toHaveLength(1);
    const { opts, spies } = hosts[0];
    expect(opts.code).toBe('ABC234');
    expect(opts.name).toBe('Tester');
    expect(opts.classId).toBe('knight');
    expect(opts.gauntlet).toBe(true);

    expect(st().roomCode).toBe('ABC234');
    expect(st().isHost).toBe(true);
    expect(st().session).not.toBeNull();
    expect(st().phase).toBe('lobby');
    expect(st().error).toBeNull();
    expect(spies.setSelection).toHaveBeenCalledWith('knight');
  });

  it('falls back to a generated hero name when none is set', async () => {
    useStore.setState({ localName: '   ' });
    await session.hostGame();
    expect(hosts[0].opts.name).toBe('Hero-self'); // selfId.slice(0,4) = 'self'
  });

  it('onLobby callback mirrors lobby data into the store', async () => {
    await session.hostGame();
    const players = [
      { peerId: 'p1', name: 'A', classId: 'knight', ready: true, isHost: true, isBot: false },
    ];
    hosts[0].opts.onLobby({
      players,
      monsterId: st().monsterId,
      phase: 'lobby',
      gauntlet: false,
    });
    expect(st().players).toEqual(players);
  });

  it('onStart callback transitions to the game and clears upgrades on a fresh run', async () => {
    await session.hostGame();
    useStore.setState({ myUpgrades: ['x' as never], myCharUpgrades: ['y'] });
    hosts[0].opts.onStart({
      runIndex: 0,
      runTotal: 3,
      cycle: 0,
    });
    expect(st().phase).toBe('game');
    expect(st().run).toEqual({ index: 0, total: 3 });
    expect(st().myUpgrades).toEqual([]);
    expect(st().myCharUpgrades).toEqual([]);
  });

  it('onResult callback shows the result and plays the outcome sting', async () => {
    await session.hostGame();
    hosts[0].opts.onResult({ outcome: 'victory' });
    expect(st().phase).toBe('result');
    expect(st().result).toEqual({ outcome: 'victory' });
    expect(sfxSpies.play).toHaveBeenCalledWith('victory');

    hosts[0].opts.onResult({ outcome: 'defeat' });
    expect(sfxSpies.play).toHaveBeenCalledWith('defeat');
  });

  it('onPeers / onError callbacks update the store', async () => {
    await session.hostGame();
    (hosts[0].opts.onPeers as (n: number) => void)(3);
    expect(st().peerCount).toBe(3);
    (hosts[0].opts.onError as (e: string) => void)('boom');
    expect(st().error).toBe('boom');
  });
});

describe('session.joinGame', () => {
  it('constructs a Client (uppercased code) and enters the lobby', async () => {
    await session.joinGame('  abc234 ');
    expect(clients).toHaveLength(1);
    expect(clients[0].opts.code).toBe('ABC234');
    expect(st().roomCode).toBe('ABC234');
    expect(st().isHost).toBe(false);
    expect(st().phase).toBe('lobby');
    expect(clients[0].spies.setSelection).toHaveBeenCalled();
  });

  it('onLobby moves a late joiner to the waiting state when a fight is in progress', async () => {
    await session.joinGame('abc234');
    clients[0].opts.onLobby({
      players: [],
      monsterId: st().monsterId,
      phase: 'inFight',
      gauntlet: false,
    });
    expect(st().phase).toBe('waiting');
  });

  it('onHostLeft scrubs the session and returns to the menu', async () => {
    await session.joinGame('abc234');
    useStore.setState({ run: { index: 1, total: 3 }, cycle: 2 });
    clients[0].opts.onHostLeft();
    expect(st().hostLeft).toBe(true);
    expect(st().session).toBeNull();
    expect(st().roomCode).toBeNull();
    expect(st().phase).toBe('menu');
    expect(st().run).toBeNull();
    expect(st().cycle).toBe(0);
    expect(st().error).toMatch(/Host disconnected/);
  });

  it('onPeers>0 clears the pending connectivity hint and its timer', async () => {
    vi.useFakeTimers();
    await session.joinGame('abc234');
    useStore.setState({ netHint: 'searching' });
    (clients[0].opts.onPeers as (n: number) => void)(1);
    expect(st().peerCount).toBe(1);
    expect(st().netHint).toBeNull();
    // Timer was cleared: advancing past the timeout must not overwrite the hint.
    vi.advanceTimersByTime(20000);
    expect(st().netHint).toBeNull();
  });

  it('shows a connectivity hint if no host is reached before the timeout', async () => {
    vi.useFakeTimers();
    await session.joinGame('abc234');
    expect(st().netHint).toBeNull();
    vi.advanceTimersByTime(15000);
    expect(st().netHint).toMatch(/Still reaching the host/);
  });
});

describe('session join-error handling', () => {
  it('surfaces a TURN/NAT hint for a post-SDP failure while unconnected', async () => {
    await session.joinGame('abc234');
    (clients[0].opts.onJoinError as (m: string) => void)('connection failed after exchanging SDP');
    expect(st().netHint).toMatch(/TURN relay/);
  });

  it('ignores a join error once at least one peer is connected', async () => {
    await session.joinGame('abc234');
    useStore.setState({ peerCount: 1 });
    (clients[0].opts.onJoinError as (m: string) => void)('exchanging SDP failed');
    expect(st().netHint).toBeNull();
  });
});

describe('session lobby + host actions delegate to the session', () => {
  beforeEach(async () => {
    await session.hostGame();
  });

  it('selectClass updates local class and tells the session', () => {
    session.selectClass('mage');
    expect(st().localClass).toBe('mage');
    expect(hosts[0].spies.setSelection).toHaveBeenCalledWith('mage');
  });

  it('setReady updates readiness and tells the session', () => {
    session.setReady(true);
    expect(st().localReady).toBe(true);
    expect(hosts[0].spies.setReady).toHaveBeenCalledWith(true);
  });

  it('host-only actions call through to the Host', () => {
    useStore.setState({ isHost: true });
    session.startFight();
    session.retryFight();
    session.advanceGauntlet();
    session.setMonster('troll');
    session.setGauntlet(true);
    session.addBot('knight');
    session.removeBot('bot1');
    session.setBotClass('bot1', 'mage');
    session.continueEndless();
    session.endRun();
    const s = hosts[0].spies;
    expect(s.startFight).toHaveBeenCalled();
    expect(s.retryFight).toHaveBeenCalled();
    expect(s.advanceGauntlet).toHaveBeenCalled();
    expect(s.setMonster).toHaveBeenCalledWith('troll');
    expect(s.setGauntlet).toHaveBeenCalledWith(true);
    expect(s.addBot).toHaveBeenCalledWith('knight');
    expect(s.removeBot).toHaveBeenCalledWith('bot1');
    expect(s.setBotClass).toHaveBeenCalledWith('bot1', 'mage');
    expect(s.continueEndless).toHaveBeenCalled();
    expect(s.endRun).toHaveBeenCalledWith('defeat');
  });

  it('returnToLobby resets run state and calls the host', () => {
    useStore.setState({ run: { index: 1, total: 2 }, result: { outcome: 'defeat' } as never });
    session.returnToLobby();
    expect(hosts[0].spies.returnToLobby).toHaveBeenCalled();
    expect(st().run).toBeNull();
    expect(st().result).toBeNull();
    expect(st().phase).toBe('lobby');
  });

  it('the current session is a Host instance', () => {
    expect(st().session).toBeInstanceOf(Host);
  });
});

describe('session upgrade + pause relays', () => {
  beforeEach(async () => {
    await session.hostGame();
  });

  it('chooseUpgrade relays to the session and records it locally', () => {
    session.chooseUpgrade('swift');
    expect(hosts[0].spies.chooseUpgrade).toHaveBeenCalledWith('swift');
    expect(st().myUpgrades).toEqual(['swift']);
  });

  it('chooseCharUpgrade relays and records locally', () => {
    session.chooseCharUpgrade('knight:rage');
    expect(hosts[0].spies.chooseCharUpgrade).toHaveBeenCalledWith('knight:rage');
    expect(st().myCharUpgrades).toEqual(['knight:rage']);
  });

  it('requestPause and setNextReady relay to the session', () => {
    session.requestPause(true);
    expect(hosts[0].spies.requestPause).toHaveBeenCalledWith(true);
    session.setNextReady(true);
    expect(hosts[0].spies.setNextReady).toHaveBeenCalledWith(true);
  });

  it('swapClass relays a targeted (radial) and a targetless (cycle) swap', () => {
    session.swapClass('mage'); // radial release onto a specific class
    expect(hosts[0].spies.swapClass).toHaveBeenCalledWith('mage');
    session.swapClass(); // quick tap → cycle
    expect(hosts[0].spies.swapClass).toHaveBeenLastCalledWith(undefined);
  });
});

describe('session misc helpers', () => {
  it('openControls / closeControls toggle the store flag', () => {
    session.openControls();
    expect(st().showControls).toBe(true);
    session.closeControls();
    expect(st().showControls).toBe(false);
  });

  it('playUiSound resumes and plays the named ui sound', () => {
    session.playUiSound('uiConfirm');
    expect(sfxSpies.resume).toHaveBeenCalled();
    expect(sfxSpies.play).toHaveBeenCalledWith('uiConfirm');
  });

  it('shareLink returns a link only when a room is set', () => {
    expect(session.shareLink()).toBe('');
    useStore.setState({ roomCode: 'ABC234', netMode: 'p2p' });
    expect(session.shareLink()).toBe('https://warband/#room=ABC234&net=p2p');
  });

  it('copyShareLink writes to the clipboard when a link exists', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    useStore.setState({ roomCode: 'ABC234' });
    await session.copyShareLink();
    expect(writeText).toHaveBeenCalledWith('https://warband/#room=ABC234&net=p2p');
  });

  it('copyShareLink is a no-op with no room', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await session.copyShareLink();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('leaveToMenu resets the store back to the menu', async () => {
    await session.hostGame();
    session.leaveToMenu();
    expect(st().phase).toBe('menu');
    expect(st().session).toBeNull();
    expect(st().roomCode).toBeNull();
  });
});
