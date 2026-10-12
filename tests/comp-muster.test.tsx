// @vitest-environment jsdom
/**
 * Warband — component test for the walkable MusterHall (diegetic lobby). The Pixi
 * renderer + input manager are mocked so it runs headless; assertions confirm the
 * classic lobby panel (room code, roster, ready control) still renders over the
 * hall and the diegetic hint is present. The rune/war-horn logic is covered by
 * tests/musterScene.test.ts; the panel itself by tests/comp-result-lobby.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

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
    error: null,
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

  it('explains adding AND removing bots in the host signage', () => {
    const { container } = render(<MusterHall />); // isHost: true (beforeEach)
    const hint = container.querySelector('.wb-muster-hint')?.textContent ?? '';
    expect(hint).toContain('Fill your band with bots');
    expect(hint.toLowerCase()).toContain('add');
    expect(hint.toLowerCase()).toContain('bot marker'); // the walkable removal path
  });

  it('drops the host-only bot signage for a non-host', () => {
    useStore.setState({ isHost: false });
    const { container } = render(<MusterHall />);
    const hint = container.querySelector('.wb-muster-hint')?.textContent ?? '';
    expect(hint).toContain('muster rune');
    expect(hint).not.toContain('Fill your band with bots');
  });
});

it('keeps the mobile hall clear with a usable lobby fallback and restored movement controls', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  useHudStore.getState().set({ classId: 'knight' });
  render(<MusterHall />);
  expect(screen.queryByRole('button', { name: /Ready up/ })).toBeNull();
  expect(screen.getByText(/Room ABCDEF/)).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Touch controls' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Lobby menu' }));
  expect(screen.getByRole('button', { name: /Ready up/ })).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Touch controls' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
  expect(screen.getByRole('group', { name: 'Touch controls' })).toBeTruthy();
});

it('gives a mobile lobby error priority over a guide while retaining the fallback menu', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  useStore.setState({ error: 'Connection interrupted' });
  render(<MusterHall />);
  expect(screen.getByRole('alert').textContent).toContain('Connection interrupted');
  expect(screen.queryByRole('region', { name: 'Lobby guide' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Lobby menu' })).toBeTruthy();
});
