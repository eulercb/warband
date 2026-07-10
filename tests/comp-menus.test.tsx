// @vitest-environment jsdom
/**
 * Component tests for the three presentational pause-flow overlays:
 *   - ui/PauseMenu       (shared pause dialog + actions + score board)
 *   - ui/ResumeCountdown (full-screen "resuming in N…" splash)
 *   - ui/TerrainLegend   (map-hazard legend, driven by the HUD store)
 *
 * The session module is mocked so no audio engine or networking is pulled in;
 * PauseMenu is the only component that imports from it (playUiSound, endRun,
 * openControls, leaveToMenu). Assertions use plain DOM/RTL queries because
 * @testing-library/jest-dom is not installed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Stub the whole session module: expose exactly the functions PauseMenu imports.
vi.mock('../src/ui/state/session', () => ({
  playUiSound: vi.fn(),
  endRun: vi.fn(),
  openControls: vi.fn(),
  leaveToMenu: vi.fn(),
}));

import PauseMenu from '../src/ui/game/PauseMenu';
import ResumeCountdown from '../src/ui/game/ResumeCountdown';
import TerrainLegend from '../src/ui/game/TerrainLegend';
import { useStore } from '../src/ui/state/store';
import { useHudStore } from '../src/ui/state/hudStore';
import type { HudTeammate } from '../src/ui/state/hudStore';
import type { TerrainKind } from '../src/engine/core/types';
import { playUiSound, endRun, openControls, leaveToMenu } from '../src/ui/state/session';

/** Build a fully-typed HUD teammate, overriding only the interesting fields. */
function makeTeammate(over: Partial<HudTeammate> & { id: number }): HudTeammate {
  return {
    id: over.id,
    name: over.name ?? '',
    classId: over.classId ?? 'knight',
    hp: over.hp ?? 100,
    maxHp: over.maxHp ?? 100,
    state: over.state ?? 'alive',
    isLocal: over.isLocal ?? false,
    buffs: over.buffs ?? [],
    score: over.score ?? 0,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // PauseMenu wires up gamepad nav, which kicks off a requestAnimationFrame poll
  // loop. Stub rAF so the loop is inert + deterministic under jsdom (gamepad
  // polling itself is covered by tests/gamepadNav.test.ts).
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // App store: only the fields the pause menu reads.
  useStore.setState({ isHost: false, pausedBy: null, cycle: 0 });
  // HUD store: reset to documented defaults, then specs set what they need.
  useHudStore.getState().resetHud();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<ResumeCountdown>', () => {
  it('renders the label, count and "get ready" sub text', () => {
    render(<ResumeCountdown count={3} />);
    expect(screen.getByText('Resuming in')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Get ready…')).toBeTruthy();
  });

  it('is an assertive live status region for screen readers', () => {
    render(<ResumeCountdown count={5} />);
    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(status.getAttribute('aria-live')).toBe('assertive');
  });

  it('clamps a zero count up to 1', () => {
    render(<ResumeCountdown count={0} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('clamps a negative count up to 1', () => {
    render(<ResumeCountdown count={-4} />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('renders a larger count verbatim', () => {
    render(<ResumeCountdown count={12} />);
    expect(screen.getByText('12')).toBeTruthy();
  });
});

describe('<TerrainLegend>', () => {
  it('renders nothing when there is no terrain and no cover', () => {
    useHudStore.setState({ terrainKinds: [], hasObstacles: false });
    const { container } = render(<TerrainLegend />);
    expect(container.firstChild).toBeNull();
  });

  it('lists each present terrain kind with its label and effect', () => {
    useHudStore.setState({ terrainKinds: ['magma', 'ice'], hasObstacles: false });
    render(<TerrainLegend />);
    expect(screen.getByText('Map legend')).toBeTruthy();
    expect(screen.getByText('Magma')).toBeTruthy();
    expect(screen.getByText('Burns you and briefly slows — get out fast.')).toBeTruthy();
    expect(screen.getByText('Ice')).toBeTruthy();
    expect(screen.getByText('Slippery — strong slow, no damage.')).toBeTruthy();
    // Kinds not present this fight are not listed.
    expect(screen.queryByText('Swamp')).toBeNull();
  });

  it('appends the Cover entry when the arena has obstacles', () => {
    useHudStore.setState({ terrainKinds: ['swamp'], hasObstacles: true });
    render(<TerrainLegend />);
    expect(screen.getByText('Swamp')).toBeTruthy();
    expect(screen.getByText('Cover')).toBeTruthy();
    expect(
      screen.getByText('Solid rubble that blocks ranged attacks — hide behind it.'),
    ).toBeTruthy();
  });

  it('shows only the Cover entry when there is cover but no terrain', () => {
    useHudStore.setState({ terrainKinds: [], hasObstacles: true });
    const { container } = render(<TerrainLegend />);
    expect(screen.getByText('Map legend')).toBeTruthy();
    expect(screen.getByText('Cover')).toBeTruthy();
    expect(container.querySelectorAll('.wb-legend-row')).toHaveLength(1);
  });

  it('filters out a terrain kind that has no legend entry', () => {
    // An unrecognized kind is only reachable via a cast; it must be dropped
    // rather than rendered as a blank row.
    useHudStore.setState({
      terrainKinds: ['magma', 'mystery' as unknown as TerrainKind],
      hasObstacles: false,
    });
    const { container } = render(<TerrainLegend />);
    expect(screen.getByText('Magma')).toBeTruthy();
    expect(container.querySelectorAll('.wb-legend-row')).toHaveLength(1);
  });
});

describe('<PauseMenu>', () => {
  function renderMenu(onResume: () => void = vi.fn()) {
    return render(<PauseMenu onResume={onResume} />);
  }

  it('renders the paused dialog, default subtitle, score and core buttons', () => {
    useStore.setState({ isHost: false, pausedBy: null, cycle: 0 });
    useHudStore.setState({ score: 7 });
    renderMenu();

    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getByText(/The fight is frozen for everyone/)).toBeTruthy();
    expect(screen.getByText('Your run score')).toBeTruthy();
    expect(screen.getByText('★ 7')).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Controls' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave to Menu' })).toBeTruthy();
    // Non-host: no End Run, and no cycle tag at cycle 0.
    expect(screen.queryByRole('button', { name: 'End Run' })).toBeNull();
    expect(screen.queryByText(/Cycle/)).toBeNull();
  });

  it('names who paused the fight when pausedBy is set', () => {
    useStore.setState({ pausedBy: 'Alice' });
    renderMenu();
    expect(screen.getByText(/Alice paused the fight/)).toBeTruthy();
    expect(screen.queryByText(/The fight is frozen for everyone/)).toBeNull();
  });

  it('shows the cycle tag only past the first cycle', () => {
    useStore.setState({ cycle: 2 });
    renderMenu();
    // cycle is 0-based; display is +1.
    expect(screen.getByText('Cycle 3')).toBeTruthy();
  });

  it('shows the End Run control only for the host', () => {
    useStore.setState({ isHost: true });
    renderMenu();
    expect(screen.getByRole('button', { name: 'End Run' })).toBeTruthy();
  });

  it('lists teammates highest score first and marks the local player', () => {
    useHudStore.setState({
      score: 0,
      teammates: [
        makeTeammate({ id: 1, name: 'Alice', score: 10, isLocal: false }),
        makeTeammate({ id: 2, name: 'Bob', score: 30, isLocal: true }),
      ],
    });
    const { container } = renderMenu();

    const names = Array.from(container.querySelectorAll('.wb-pause-score-name')).map(
      (el) => el.textContent,
    );
    expect(names).toEqual(['Bob (you)', 'Alice']);
    expect(screen.getByText('★ 30')).toBeTruthy();
    expect(screen.getByText('★ 10')).toBeTruthy();
  });

  it("falls back to 'Hero' for an unnamed teammate", () => {
    useHudStore.setState({
      score: 0,
      teammates: [
        makeTeammate({ id: 1, name: '', score: 5, isLocal: true }),
        makeTeammate({ id: 2, name: 'Zoe', score: 3, isLocal: false }),
      ],
    });
    renderMenu();
    expect(screen.getByText('Hero (you)')).toBeTruthy();
    expect(screen.getByText('Zoe')).toBeTruthy();
  });

  it('does not render a score list for a lone teammate', () => {
    useHudStore.setState({
      score: 0,
      teammates: [makeTeammate({ id: 1, name: 'Solo', score: 9, isLocal: true })],
    });
    const { container } = renderMenu();
    // The list (and therefore the teammate's name) only appears with 2+ players.
    expect(screen.queryByText('Solo')).toBeNull();
    expect(container.querySelectorAll('.wb-pause-score-list')).toHaveLength(0);
  });

  it('Resume: plays a UI click and calls the onResume prop', () => {
    const onResume = vi.fn();
    renderMenu(onResume);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('Controls: plays a UI click and opens the controls overlay', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(vi.mocked(openControls)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('End Run (host): plays a confirm sound and ends the run', () => {
    useStore.setState({ isHost: true });
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'End Run' }));
    expect(vi.mocked(endRun)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiConfirm');
  });

  it('Leave to Menu: plays a UI click and leaves to the menu', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Leave to Menu' }));
    expect(vi.mocked(leaveToMenu)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('embeds the terrain legend, driven by the HUD store', () => {
    useHudStore.setState({ terrainKinds: ['ice'], hasObstacles: false });
    renderMenu();
    expect(screen.getByText('Map legend')).toBeTruthy();
    expect(screen.getByText('Ice')).toBeTruthy();
  });
});
