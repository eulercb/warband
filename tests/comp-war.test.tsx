// @vitest-environment jsdom
/**
 * Warband — component test for the walkable WarRoom (diegetic host setup). The
 * Pixi renderer + input manager are mocked so it runs headless; assertions
 * target the accessible surface — the selection banner and the "List view"
 * fallback (which mounts the classic HostSetup form). Boss/run-mode/host
 * selection logic itself is covered by tests/warScene.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

vi.mock('../src/ui/state/session', () => ({
  hostGame: vi.fn().mockResolvedValue(undefined),
  setMonster: vi.fn(),
  setGauntlet: vi.fn(),
  playUiSound: vi.fn(),
}));

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

import WarRoom from '../src/ui/game/WarRoom';
import { useStore } from '../src/ui/state/store';
import { useHudStore } from '../src/ui/state/hudStore';

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    monsterId: 'goblin',
    gauntlet: false,
    localName: 'Alice',
    localClass: 'knight',
    showControls: false,
    error: null,
  });
  useHudStore.getState().resetHud();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<WarRoom>', () => {
  it('shows the current opener + run mode in the banner and a name field', () => {
    const { container } = render(<WarRoom />);
    const banner = container.querySelector('.wb-reward-banner-next')?.textContent ?? '';
    expect(banner).toContain('Goblin');
    expect(banner.toLowerCase()).toContain('single fight');
    // Name field is present (diegetic host flow still needs a name).
    expect(screen.getByLabelText('Your display name')).toBeTruthy();
    // The canvas layer is hidden from the a11y tree.
    expect(container.querySelector('.wb-playground-canvas')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('reflects gauntlet mode in the banner', () => {
    useStore.setState({ gauntlet: true });
    const { container } = render(<WarRoom />);
    expect(container.querySelector('.wb-reward-banner-next')?.textContent ?? '').toContain(
      'gauntlet',
    );
  });

  it('opens the classic HostSetup form via the List view fallback', () => {
    render(<WarRoom />);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Host a Fight')).toBeTruthy();
    // The classic boss grid is present.
    expect(dialog.querySelectorAll('.wb-monster-card').length).toBeGreaterThan(0);
  });

  it('returns to the camp via Back', () => {
    render(<WarRoom />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to camp' }));
    expect(useStore.getState().phase).toBe('menu');
  });
});
