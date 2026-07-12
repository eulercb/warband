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
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

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
    expect(charCards[0].textContent ?? '').toContain('Immovable Object'); // the grand pick
    fireEvent.click(charCards[0]);
    expect(vi.mocked(chooseCharUpgrade)).toHaveBeenCalledWith('kn_grand_immovable');
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
