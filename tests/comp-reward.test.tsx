// @vitest-environment jsdom
/**
 * Warband — component tests for the walkable RewardRoom (between-boss upgrade
 * scene). The Pixi renderer + input manager are mocked so the test runs in jsdom
 * with no WebGL; assertions target the accessible parts — the banner and the
 * "List view" fallback (the classic cards + descend/ready button) — which relay
 * through the same session actions the flat screen used. The walk-over-relic and
 * vortex-descent logic itself is covered by tests/rewardScene.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';

// Session actions the room relays through — every one RewardRoom imports.
vi.mock('../src/ui/state/session', () => ({
  chooseUpgrade: vi.fn(),
  chooseCharUpgrade: vi.fn(),
  setNextReady: vi.fn(),
  playUiSound: vi.fn(),
  openControls: vi.fn(),
  leaveToMenu: vi.fn(),
  sfx: { play: vi.fn(), handleEvents: vi.fn() },
}));

// The renderer needs WebGL; stub it so the scene never actually mounts a canvas
// (the accessible list view is what we assert on). Create resolves a no-op app.
vi.mock('../src/render/pipeline/renderer', () => ({
  Renderer: {
    create: vi.fn().mockResolvedValue({
      dispose: vi.fn(),
      render: vi.fn(),
      worldToScreen: () => ({ x: 0, y: 0 }),
      app: { canvas: { addEventListener: vi.fn(), removeEventListener: vi.fn() } },
    }),
  },
}));

vi.mock('../src/input/input', () => ({
  InputManager: class {
    activeSource = 'keyboard';
    sample() {
      return {
        move: { x: 0, y: 0 },
        aim: { x: 0, y: -1 },
        buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
      };
    }
    dispose() {}
  },
}));

import RewardRoom from '../src/ui/game/RewardRoom';
import { Renderer } from '../src/render/pipeline/renderer';
import { useStore } from '../src/ui/state/store';
import { useHudStore } from '../src/ui/state/hudStore';
import type { FightResult, ResultPlayerStat } from '../src/engine/core/types';
import { chooseUpgrade, chooseCharUpgrade, setNextReady } from '../src/ui/state/session';

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
    nextMonsterId: 'troll',
    runIndex: 0,
    runTotal: 5,
    ...over,
  };
}

const realRandom = Math.random;

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    localClass: 'knight',
    localName: 'Alice',
    rewardPickedGeneric: null,
    rewardPickedChar: null,
    myUpgrades: [],
    myCharUpgrades: [],
    nextReadyReady: 0,
    nextReadyTotal: 0,
    showControls: false,
    autofire: false,
    muted: true,
  });
  useHudStore.getState().resetHud();
  // rAF drives the render loop + the gamepad-menu poll; stub to a no-op so
  // neither actually runs under jsdom (the DOM surface is what we test).
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // Pin the offer roll so the first card in each row is deterministic. At 0.1 the
  // rare grand-improvement swap fires (0.1 < 0.14), so the first KNIGHT class card
  // is the capstone kn_grand_immovable; the first generic card is still Swift.
  Math.random = () => 0.1;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  Math.random = realRandom;
  vi.unstubAllGlobals();
});

describe('<RewardRoom>', () => {
  it('names the next boss in the banner and hides the list by default', () => {
    const { container } = render(<RewardRoom result={makeResult()} />);
    expect(container.querySelector('.wb-reward-banner-title')?.textContent ?? '').toContain(
      'Boss 1 of 5 felled',
    );
    expect(container.querySelector('.wb-reward-banner-next')?.textContent ?? '').toContain(
      'Forest Troll',
    );
    // The canvas layer is decorative / hidden from the a11y tree.
    expect(container.querySelector('.wb-playground-canvas')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    // Cards live behind the List view toggle — not shown yet.
    expect(screen.queryByText('Choose a generic boon')).toBeNull();
  });

  it('names a twin next fight with the endless modifier', () => {
    const { container } = render(
      <RewardRoom
        result={makeResult({
          nextMonsterId: 'troll',
          nextMonsterIds: ['troll', 'lich'],
          modName: 'Frost',
        })}
      />,
    );
    const next = container.querySelector('.wb-reward-banner-next')?.textContent ?? '';
    expect(next).toContain('Forest Troll & Lich');
    expect(next).toContain('TWIN fight');
  });

  it('reveals the classic cards (3 generic + 4 class) via the List view fallback', () => {
    render(<RewardRoom result={makeResult()} />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Choose a generic boon')).toBeTruthy();
    expect(within(dialog).getByText('Choose a Knight boon')).toBeTruthy();
    expect(dialog.querySelectorAll('.wb-upgrade-card:not(.wb-upgrade-char)').length).toBe(3);
    expect(dialog.querySelectorAll('.wb-upgrade-char').length).toBe(4);
  });

  it('relays a generic pick via chooseUpgrade and a class pick via chooseCharUpgrade', () => {
    render(<RewardRoom result={makeResult()} />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    const dialog = screen.getByRole('dialog');

    const genCards = dialog.querySelectorAll('.wb-upgrade-card:not(.wb-upgrade-char)');
    expect(genCards[0].textContent ?? '').toContain('Swift');
    fireEvent.click(genCards[0]);
    expect(vi.mocked(chooseUpgrade)).toHaveBeenCalledWith('swift');
    expect(within(dialog).getByText('Generic boon chosen')).toBeTruthy();

    const charCards = dialog.querySelectorAll('.wb-upgrade-char');
    // Grands are no longer in the pool (item 20) — the first class card is an
    // ordinary boon (kn_bulwark, "Impenetrable"), now with a current-stats preview.
    expect(charCards[0].textContent ?? '').toContain('Impenetrable');
    fireEvent.click(charCards[0]);
    expect(vi.mocked(chooseCharUpgrade)).toHaveBeenCalledWith('kn_bulwark');
    expect(within(dialog).getByText('Class boon chosen')).toBeTruthy();
  });

  it('descends via the List view button, relaying setNextReady(true)', () => {
    render(<RewardRoom result={makeResult()} />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    fireEvent.click(screen.getByRole('button', { name: 'Descend to next boss' }));
    expect(vi.mocked(setNextReady)).toHaveBeenCalledWith(true);
    // The button flips to the waiting state.
    expect(screen.getByRole('button', { name: /Ready ✓ — waiting/ })).toBeTruthy();
  });

  it('shows the band ready tally from the store', () => {
    useStore.setState({ nextReadyReady: 2, nextReadyTotal: 3 });
    const { container } = render(<RewardRoom result={makeResult({ runIndex: 1 })} />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(container.querySelector('.wb-ready-tally')?.textContent ?? '').toContain('2/3');
  });

  it('lists the boons this hero already owns', () => {
    useStore.setState({ myUpgrades: ['swift'], myCharUpgrades: ['kn_bulwark'] });
    const { container } = render(<RewardRoom result={makeResult()} />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    const owned = container.querySelector('.wb-upgrade-owned')?.textContent ?? '';
    expect(owned).toContain('Swift');
    expect(owned).toContain('Impenetrable');
  });

  it('opens a local pause menu on Escape and resumes on Resume (item: pause in reward room)', () => {
    useHudStore.setState({ classId: 'knight', hp: 200, maxHp: 240 });
    render(<RewardRoom result={makeResult()} />);
    // No pause dialog until Esc.
    expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeTruthy();
    // The character sheet rides along so you can read your stats.
    expect(screen.getByText('Knight — 200/240 HP')).toBeTruthy();
    // Resume closes it again.
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
  });
});

it('offers a first-visit mobile guide that can be dismissed, replayed, and remembered', () => {
  sessionStorage.clear();
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const { container } = render(<RewardRoom result={makeResult()} />);
  expect(screen.getByRole('region', { name: 'Reward room guide' })).toBeTruthy();
  fireEvent.pointerDown(container.firstChild as Element);
  expect(screen.getByRole('region', { name: 'Reward room guide' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Skip guide' }));
  expect(screen.queryByRole('region', { name: 'Reward room guide' })).toBeNull();
  expect(sessionStorage.getItem('warband:reward-guide-seen')).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'Room guide' }));
  expect(screen.getByRole('region', { name: 'Reward room guide' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
  cleanup();
  render(<RewardRoom result={makeResult()} />);
  expect(screen.queryByRole('region', { name: 'Reward room guide' })).toBeNull();
});

it.each(['generic', 'char'])(
  'preserves the %s claim and scene when rerolling the other offers',
  (kind) => {
    const create = vi.spyOn(Renderer, 'create');
    useStore.setState({ rerollCount: 0, myCoins: 10 });
    const { container } = render(<RewardRoom result={makeResult({ rewardSeed: 12345 })} />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    const selected =
      kind === 'generic' ? '.wb-upgrade-card:not(.wb-upgrade-char)' : '.wb-upgrade-char';
    const other =
      kind === 'generic' ? '.wb-upgrade-char' : '.wb-upgrade-card:not(.wb-upgrade-char)';
    const before = Array.from(container.querySelectorAll(selected), (card) => card.textContent);
    const otherBefore = Array.from(container.querySelectorAll(other), (card) => card.textContent);
    fireEvent.click(container.querySelector(selected)!);
    fireEvent.click(screen.getByRole('button', { name: 'Descend to next boss' }));
    act(() => {
      useStore.getState().rerollOffers();
    });
    const after = Array.from(container.querySelectorAll(selected));
    expect(after.map((card) => card.textContent?.replace('✓', ''))).toEqual(before);
    expect(after.every((card) => (card as HTMLButtonElement).disabled)).toBe(true);
    expect(after[0].getAttribute('aria-pressed')).toBe('true');
    expect(Array.from(container.querySelectorAll(other), (card) => card.textContent)).not.toEqual(
      otherBefore,
    );
    expect(create).toHaveBeenCalledTimes(1);
    // Scene closures keep the ready toggle synchronized across the reroll.
    fireEvent.click(screen.getByRole('button', { name: /Ready ✓ — waiting/ }));
    expect(vi.mocked(setNextReady).mock.lastCall).toEqual([false]);
    fireEvent.click(after[1]);
    expect(kind === 'generic' ? chooseUpgrade : chooseCharUpgrade).toHaveBeenCalledTimes(1);
  },
);

it('restores committed choices on a same-stop remount and cannot create phantom ownership', () => {
  useStore.setState({
    rerollCount: 1,
    rewardPickedGeneric: 'swift',
    rewardPickedChar: 'hy_vampiric',
    myUpgrades: ['swift'],
    myCharUpgrades: ['hy_vampiric'],
  });
  const { container } = render(<RewardRoom result={makeResult({ rewardSeed: 12345 })} />);
  fireEvent.click(screen.getByRole('button', { name: 'List view' }));
  const cards = Array.from(container.querySelectorAll('.wb-upgrade-card'));
  expect(cards).toHaveLength(2);
  expect(cards.every((card) => (card as HTMLButtonElement).disabled)).toBe(true);
  expect(cards.every((card) => card.getAttribute('aria-pressed') === 'true')).toBe(true);
  for (const card of cards) fireEvent.click(card);
  expect(chooseUpgrade).not.toHaveBeenCalled();
  expect(chooseCharUpgrade).not.toHaveBeenCalled();
  expect(useStore.getState().myCharUpgrades).toEqual(['hy_vampiric']);
});
