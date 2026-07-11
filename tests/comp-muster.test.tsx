// @vitest-environment jsdom
/**
 * Warband — component test for the walkable MusterHall (diegetic lobby). The Pixi
 * renderer + input manager are mocked so it runs headless; assertions confirm the
 * classic lobby panel (room code, roster, ready control) still renders over the
 * hall and the diegetic hint is present. The rune/war-horn logic is covered by
 * tests/musterScene.test.ts; the panel itself by tests/comp-result-lobby.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../src/ui/state/session', () => ({
  setReady: vi.fn(),
  startFight: vi.fn(),
  playUiSound: vi.fn(),
  selectClass: vi.fn(),
  leaveToMenu: vi.fn(),
  shareLink: vi.fn(() => 'https://x/#room=ABC'),
  copyShareLink: vi.fn().mockResolvedValue(undefined),
  setMonster: vi.fn(),
  setGauntlet: vi.fn(),
  addBot: vi.fn(),
  removeBot: vi.fn(),
  setBotClass: vi.fn(),
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

import MusterHall from '../src/ui/game/MusterHall';
import { useStore } from '../src/ui/state/store';
import { useHudStore } from '../src/ui/state/hudStore';

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    phase: 'lobby',
    roomCode: 'ABCDEF',
    isHost: true,
    localClass: 'knight',
    localName: 'Alice',
    localReady: false,
    players: [
      { peerId: 'h', name: 'Alice', classId: 'knight', ready: true, isHost: true, isBot: false },
    ],
    monsterId: 'goblin',
    gauntlet: false,
    peerCount: 0,
    netHint: null,
    showControls: false,
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

describe('<MusterHall>', () => {
  it('renders the classic lobby panel (room code + ready) over the hall', () => {
    const { container } = render(<MusterHall />);
    expect(screen.getByText('ABCDEF')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ready up/ })).toBeTruthy();
    // The canvas layer is hidden from the a11y tree; the diegetic hint is present.
    expect(container.querySelector('.wb-playground-canvas')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(container.querySelector('.wb-muster-hint')?.textContent ?? '').toContain('muster rune');
  });
});
