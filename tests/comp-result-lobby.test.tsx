// @vitest-environment jsdom
/**
 * Warband — component tests for the two big menu screens:
 *   • src/ui/screens/ResultScreen.tsx — victory/defeat banner, stats table, and the
 *     between-boss upgrade phase (generic + character picks, ready-gate, endless).
 *   • src/ui/screens/Lobby.tsx        — room code / share link, boss pick, roster, class
 *     picker, ready toggle, and the host-only start / bot / gauntlet controls.
 *
 * The session control layer is fully mocked so rendering pulls in NO audio,
 * WebRTC, or Trystero code — every action is a spy we assert on. `@testing-
 * library/jest-dom` is not installed, so assertions use `.textContent`,
 * getBy/queryBy/getAllBy queries and toBeTruthy()/toBeNull().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Every name BOTH components import from ./session must be stubbed here — a
// missing one would resolve to `undefined` and crash the render. shareLink must
// return a string (Lobby renders it in a <code>); copyShareLink a resolved
// promise (Lobby awaits it in an async click handler).
vi.mock('../src/ui/state/session', () => ({
  // ResultScreen
  returnToLobby: vi.fn(),
  retryFight: vi.fn(),
  continueEndless: vi.fn(),
  leaveToMenu: vi.fn(),
  chooseUpgrade: vi.fn(),
  chooseCharUpgrade: vi.fn(),
  setNextReady: vi.fn(),
  playUiSound: vi.fn(),
  // RewardRoom (transitively imported by ResultScreen's advancing branch)
  sfx: { play: vi.fn(), handleEvents: vi.fn() },
  // Lobby
  selectClass: vi.fn(),
  setReady: vi.fn(),
  startFight: vi.fn(),
  shareLink: vi.fn(() => 'https://x/#room=ABC'),
  copyShareLink: vi.fn().mockResolvedValue(undefined),
  setMonster: vi.fn(),
  setGauntlet: vi.fn(),
  addBot: vi.fn(),
  removeBot: vi.fn(),
  setBotClass: vi.fn(),
}));

import ResultScreen from '../src/ui/screens/ResultScreen';
import Lobby from '../src/ui/screens/Lobby';
import { useStore } from '../src/ui/state/store';
import type { AppState } from '../src/ui/state/store';
import type { FightResult, ResultPlayerStat } from '../src/engine/core/types';
import type { LobbyPlayer } from '../src/net/protocol';
import {
  leaveToMenu,
  retryFight,
  returnToLobby,
  continueEndless,
  playUiSound,
  selectClass,
  setReady,
  startFight,
  setMonster,
  setGauntlet,
  addBot,
  removeBot,
  setBotClass,
  copyShareLink,
} from '../src/ui/state/session';

// --- fixtures --------------------------------------------------------------

function makeStat(over: Partial<ResultPlayerStat> = {}): ResultPlayerStat {
  return {
    peerId: 'p1',
    name: 'Alice',
    classId: 'knight',
    damageDealt: 100,
    healingDone: 0,
    revives: 0,
    deaths: 0,
    score: 500,
    ...over,
  };
}

function makeResult(over: Partial<FightResult> = {}): FightResult {
  return {
    outcome: 'victory',
    timeMs: 12345,
    stats: [makeStat()],
    monsterId: 'dragon',
    ...over,
  };
}

function makePlayer(over: Partial<LobbyPlayer> = {}): LobbyPlayer {
  return {
    peerId: 'p1',
    name: 'Alice',
    classId: 'knight',
    ready: false,
    isHost: false,
    isBot: false,
    ...over,
  };
}

const HOST_ROSTER: LobbyPlayer[] = [
  makePlayer({ peerId: 'h', name: 'Alice', classId: 'knight', isHost: true, ready: true }),
  makePlayer({ peerId: 'p2', name: 'Bob', classId: 'mage', ready: false }),
  makePlayer({ peerId: 'bot1', name: 'Bot 1', classId: 'ranger', isBot: true, ready: true }),
];

// A clean baseline for every field both screens read; individual tests override.
const BASE: Partial<AppState> = {
  result: null,
  isHost: false,
  localClass: 'knight',
  myUpgrades: [],
  myCharUpgrades: [],
  nextReadyReady: 0,
  nextReadyTotal: 0,
  roomCode: null,
  monsterId: 'dragon',
  gauntlet: false,
  players: [],
  localReady: false,
  peerCount: 0,
  netHint: null,
};

// The upgrade offers roll through Math.random in an effect; pin it so the
// offered ids (and thus the first card in each row) are deterministic. With
// 0.1, the generic row is [swift, vigor, haste] and the knight character row
// leads with kn_bulwark (see engine/upgrades + charUpgrades roll math).
const realRandom = Math.random;

beforeEach(() => {
  useStore.setState(BASE);
  // gamepadNav's poll loop is driven by requestAnimationFrame; stub it (and its
  // canceller) to no-ops so the menu hook never actually polls a gamepad.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  Math.random = () => 0.1;
});

afterEach(() => {
  cleanup();
  Math.random = realRandom;
  vi.unstubAllGlobals();
  vi.clearAllMocks(); // clears call history; keeps the shareLink/copyShareLink impls
});

// ===========================================================================
// ResultScreen
// ===========================================================================
describe('<ResultScreen>', () => {
  it('shows the empty-state fallback and returns to the menu when there is no result', () => {
    useStore.setState({ result: null });
    render(<ResultScreen />);

    expect(screen.getByText('No fight results to show.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Main Menu' }));
    expect(vi.mocked(leaveToMenu)).toHaveBeenCalledTimes(1);
  });

  it('renders a VICTORY banner, the stats table with MVP badges, and host actions', () => {
    useStore.setState({
      isHost: true,
      result: makeResult({
        outcome: 'victory',
        timeMs: 12345,
        stats: [
          makeStat({
            peerId: 'a',
            name: 'Alice',
            classId: 'knight',
            damageDealt: 300,
            healingDone: 0,
            revives: 1,
            deaths: 0,
            score: 810,
          }),
          makeStat({
            peerId: 'b',
            name: 'Bob',
            classId: 'cleric',
            damageDealt: 55,
            healingDone: 210,
            revives: 0,
            deaths: 1,
            score: 320,
          }),
        ],
      }),
    });
    render(<ResultScreen />);

    expect(screen.getByText('VICTORY')).toBeTruthy();
    // Roster names + classes.
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Knight')).toBeTruthy();
    expect(screen.getByText('Cleric')).toBeTruthy();
    // Rounded damage / healing numbers.
    expect(screen.getByText('300')).toBeTruthy();
    expect(screen.getByText('210')).toBeTruthy();
    // Time-to-kill formats sub-minute as `s.d`s.
    expect(screen.getByText('12.3s')).toBeTruthy();
    // At least one MVP callout is rendered.
    expect(screen.getAllByText('MVP').length).toBeGreaterThan(0);
    // A plain single-boss victory has no upgrade phase.
    expect(screen.queryByText('Choose a generic upgrade')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(vi.mocked(retryFight)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('hides the host-only Play Again for a client and offers Back to Lobby', () => {
    useStore.setState({ isHost: false, result: makeResult({ outcome: 'victory' }) });
    render(<ResultScreen />);

    expect(screen.queryByRole('button', { name: 'Play Again' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('renders a DEFEAT banner with the host Retry + Return controls', () => {
    useStore.setState({ isHost: true, result: makeResult({ outcome: 'defeat' }) });
    render(<ResultScreen />);

    expect(screen.getByText('DEFEAT')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(vi.mocked(retryFight)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('hides Retry from a defeated client', () => {
    useStore.setState({ isHost: false, result: makeResult({ outcome: 'defeat' }) });
    render(<ResultScreen />);

    expect(screen.getByText('DEFEAT')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to Lobby' })).toBeTruthy();
  });

  // NOTE: the between-boss "advancing" upgrade phase is now the walkable
  // RewardRoom (walk over relics + into the vortex); ResultScreen delegates that
  // case to <RewardRoom>. Its behaviour is covered in tests/comp-reward.test.tsx.
  // What remains here are the TERMINAL result screens (single fight + RUN CLEARED).

  it('shows RUN CLEARED with host Continue/Return when the run is fully cleared', () => {
    useStore.setState({ isHost: true, result: makeResult({ endlessAvailable: true }) });
    const { container } = render(<ResultScreen />);

    expect(screen.getByText('RUN CLEARED')).toBeTruthy();
    expect(screen.getByText('You felled the whole gauntlet!')).toBeTruthy();
    // Banking upgrades is offered even at the end of a run.
    expect(container.querySelectorAll('.wb-upgrade-card:not(.wb-upgrade-char)').length).toBe(3);

    fireEvent.click(screen.getByRole('button', { name: /Continue \(Endless\)/ }));
    expect(vi.mocked(continueEndless)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Lobby' }));
    expect(vi.mocked(returnToLobby)).toHaveBeenCalledTimes(1);
  });

  it('makes a client wait for the host on the run-cleared screen', () => {
    useStore.setState({ isHost: false, result: makeResult({ endlessAvailable: true }) });
    render(<ResultScreen />);

    expect(screen.getByText(/Waiting for the host to choose/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue \(Endless\)/ })).toBeNull();
  });

  it('handles an empty stats table', () => {
    useStore.setState({ result: makeResult({ stats: [] }) });
    render(<ResultScreen />);

    expect(screen.getByText('No combatants recorded.')).toBeTruthy();
  });

  it('formats a time-to-kill of a minute or more as m:ss.mmm', () => {
    useStore.setState({ result: makeResult({ timeMs: 65432 }) });
    render(<ResultScreen />);

    expect(screen.getByText('1:05.432')).toBeTruthy();
  });
});

// ===========================================================================
// Lobby
// ===========================================================================
describe('<Lobby>', () => {
  it('renders the room code, boss, share link, roster, and host controls for the host', () => {
    useStore.setState({
      isHost: true,
      roomCode: 'ABCDEF',
      monsterId: 'dragon',
      gauntlet: false,
      peerCount: 2,
      players: HOST_ROSTER,
    });
    const { container } = render(<Lobby />);

    expect(screen.getByText('ABCDEF')).toBeTruthy();
    expect(container.querySelector('.wb-monster-name')?.textContent ?? '').toContain(
      'Ancient Dragon',
    );
    expect(screen.getByText('https://x/#room=ABC')).toBeTruthy();

    // Roster: names + host/bot badges + a members count.
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Bot 1')).toBeTruthy();
    expect(screen.getByText('Host')).toBeTruthy();
    expect(screen.getByText('Bot')).toBeTruthy();
    expect(screen.getByText('Warband (3)')).toBeTruthy();
    expect(screen.getByText('2 players connected')).toBeTruthy();

    // Host-only controls.
    expect(container.querySelector('[aria-label="Change boss"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Add a bot"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gauntlet run' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start Fight' })).toBeTruthy();
  });

  it('routes a class-card click through selectClass', () => {
    useStore.setState({ isHost: true, players: HOST_ROSTER });
    const { container } = render(<Lobby />);

    const mageCard = container.querySelector('.wb-class-grid [data-cls="mage"]');
    if (!mageCard) throw new Error('mage class card not found');
    fireEvent.click(mageCard);
    expect(vi.mocked(selectClass)).toHaveBeenCalledWith('mage');
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('toggles readiness through setReady in both directions', () => {
    useStore.setState({ isHost: false, players: [], localReady: false });
    const { unmount } = render(<Lobby />);
    fireEvent.click(screen.getByRole('button', { name: /Ready/ }));
    expect(vi.mocked(setReady)).toHaveBeenCalledWith(true);
    unmount();

    useStore.setState({ localReady: true });
    render(<Lobby />);
    fireEvent.click(screen.getByRole('button', { name: /Ready/ }));
    expect(vi.mocked(setReady)).toHaveBeenCalledWith(false);
  });

  it('lets the host swap the boss via setMonster', () => {
    useStore.setState({ isHost: true, monsterId: 'dragon', players: HOST_ROSTER });
    render(<Lobby />);

    fireEvent.click(screen.getByRole('button', { name: 'Forest Troll' }));
    expect(vi.mocked(setMonster)).toHaveBeenCalledWith('troll');
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('lets the host toggle a gauntlet run via setGauntlet', () => {
    useStore.setState({ isHost: true, gauntlet: false, players: HOST_ROSTER });
    render(<Lobby />);

    fireEvent.click(screen.getByRole('button', { name: 'Gauntlet run' }));
    expect(vi.mocked(setGauntlet)).toHaveBeenCalledWith(true);
  });

  it('adds a bot of the picked class via addBot', () => {
    useStore.setState({ isHost: true, players: HOST_ROSTER });
    const { container } = render(<Lobby />);

    const group = container.querySelector('[aria-label="Add a bot"]');
    if (!group) throw new Error('add-bot group not found');
    const botButtons = group.querySelectorAll('.wb-addbot-btn');
    fireEvent.click(botButtons[0]); // CLASS_IDS[0] === 'knight'
    expect(vi.mocked(addBot)).toHaveBeenCalledWith('knight');
  });

  it('cycles and removes a bot via setBotClass / removeBot', () => {
    useStore.setState({ isHost: true, players: HOST_ROSTER });
    const { container } = render(<Lobby />);

    const cycle = container.querySelector('.wb-bot-btn:not(.wb-bot-remove)');
    const remove = container.querySelector('.wb-bot-remove');
    if (!cycle || !remove) throw new Error('bot controls not found');

    fireEvent.click(cycle); // ranger -> next in CLASS_IDS === 'mage'
    expect(vi.mocked(setBotClass)).toHaveBeenCalledWith('bot1', 'mage');
    fireEvent.click(remove);
    expect(vi.mocked(removeBot)).toHaveBeenCalledWith('bot1');
  });

  it('starts the fight when the party is ready', () => {
    useStore.setState({
      isHost: true,
      roomCode: 'ABCDEF',
      peerCount: 0,
      players: [makePlayer({ peerId: 'h', name: 'Alice', isHost: true, ready: true })],
    });
    render(<Lobby />);

    const start = screen.getByRole('button', { name: 'Start Fight' });
    expect(start.hasAttribute('disabled')).toBe(false);
    fireEvent.click(start);
    expect(vi.mocked(startFight)).toHaveBeenCalledTimes(1);
    // Host with nobody connected sees the share-the-code prompt.
    expect(
      screen.getByText('Share the room code — players appear here as they connect.'),
    ).toBeTruthy();
  });

  it('disables Start until every human readies up', () => {
    useStore.setState({
      isHost: true,
      peerCount: 1,
      players: [
        makePlayer({ peerId: 'h', name: 'Alice', isHost: true, ready: true }),
        makePlayer({ peerId: 'p2', name: 'Bob', classId: 'mage', ready: false }),
      ],
    });
    const { container } = render(<Lobby />);

    expect(screen.getByRole('button', { name: 'Start Fight' }).hasAttribute('disabled')).toBe(true);
    expect(container.querySelector('.wb-start-hint')?.textContent ?? '').toContain('0/1 ready');
  });

  it('copies the share link and flashes a confirmation', async () => {
    useStore.setState({ isHost: false, roomCode: 'ABCDEF', peerCount: 1, players: [] });
    render(<Lobby />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    expect(vi.mocked(copyShareLink)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
    expect(await screen.findByText('Copied!')).toBeTruthy();
  });

  it('swallows a clipboard failure without flashing a confirmation', async () => {
    vi.mocked(copyShareLink).mockRejectedValueOnce(new Error('clipboard blocked'));
    useStore.setState({ isHost: false, roomCode: 'ABCDEF', peerCount: 1, players: [] });
    render(<Lobby />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    expect(vi.mocked(copyShareLink)).toHaveBeenCalledTimes(1);
    // Let the rejected copy settle; the catch keeps the button un-flashed.
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('Copied!')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy share link' })).toBeTruthy();
  });

  it('leaves to the menu when Leave is clicked', () => {
    useStore.setState({ isHost: false, players: [] });
    render(<Lobby />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(vi.mocked(leaveToMenu)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('hides host controls for a client and shows the gauntlet badge', () => {
    useStore.setState({
      isHost: false,
      gauntlet: true,
      roomCode: 'ABCDEF',
      peerCount: 1,
      players: [
        makePlayer({ peerId: 'h', name: 'Alice', isHost: true, ready: true }),
        makePlayer({ peerId: 'me', name: 'Me', classId: 'cleric' }),
      ],
    });
    const { container } = render(<Lobby />);

    expect(screen.queryByRole('button', { name: 'Start Fight' })).toBeNull();
    expect(container.querySelector('[aria-label="Change boss"]')).toBeNull();
    expect(container.querySelector('[aria-label="Add a bot"]')).toBeNull();
    expect(screen.getByText('Gauntlet run')).toBeTruthy(); // read-only badge
    expect(screen.getByText('Connected to the host')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ready/ })).toBeTruthy();
  });

  it('shows the waiting placeholders and a connectivity hint before anyone connects', () => {
    useStore.setState({
      isHost: false,
      peerCount: 0,
      netHint: 'Try a TURN relay',
      players: [],
    });
    render(<Lobby />);

    expect(screen.getByText('Warband (0)')).toBeTruthy();
    expect(screen.getByText(/Waiting for heroes/)).toBeTruthy();
    expect(screen.getByText(/Connecting to the host/)).toBeTruthy();
    expect(screen.getByText('Try a TURN relay')).toBeTruthy();
  });

  it('disables the add-bot buttons when the party is full', () => {
    useStore.setState({
      isHost: true,
      players: [
        makePlayer({ peerId: 'h', name: 'Alice', isHost: true, ready: true }),
        makePlayer({ peerId: 'p2', name: 'Bob', classId: 'mage' }),
        makePlayer({ peerId: 'p3', name: 'Cara', classId: 'ranger' }),
        makePlayer({ peerId: 'p4', name: 'Dan', classId: 'cleric' }),
      ],
    });
    const { container } = render(<Lobby />);

    const group = container.querySelector('[aria-label="Add a bot"]');
    if (!group) throw new Error('add-bot group not found');
    const botButtons = group.querySelectorAll('.wb-addbot-btn');
    expect(botButtons[0].hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Party full')).toBeTruthy();
  });
});
