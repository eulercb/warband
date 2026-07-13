// @vitest-environment jsdom
/**
 * The touch pause button on the HUD (item: the mobile overlay had no way to
 * pause). It only renders on a touch-capable device, so we force that here and
 * assert the button both appears and drives the pause request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Force a touch-capable device so the pause button renders.
vi.mock('../src/input/touch', () => ({ isTouchCapable: () => true }));
// Session is audio + networking; expose exactly what HUD (and VolumeControl) use.
vi.mock('../src/ui/state/session', () => ({
  playUiSound: vi.fn(),
  requestPause: vi.fn(),
}));
vi.mock('../src/input/useGamepadMenu', () => ({ useGamepadMenu: vi.fn() }));

import HUD from '../src/ui/game/HUD';
import { useHudStore } from '../src/ui/state/hudStore';
import { useStore } from '../src/ui/state/store';
import { requestPause, playUiSound } from '../src/ui/state/session';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useHudStore.getState().resetHud();
  useHudStore.setState({ classId: 'knight' });
  useStore.setState({ run: null, cycle: 0, myCharUpgrades: [], volume: 1, muted: false });
});

afterEach(() => cleanup());

describe('HUD touch pause button', () => {
  it('renders on a touch device and requests a pause when tapped', () => {
    const { container } = render(<HUD />);
    const btn = container.querySelector('.hud-pause-btn') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(screen.getByLabelText('Pause')).toBeTruthy();

    fireEvent.click(btn);
    expect(vi.mocked(requestPause)).toHaveBeenCalledWith(true);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('routes to a custom onPause handler when provided (reward room)', () => {
    const onPause = vi.fn();
    const { container } = render(<HUD onPause={onPause} />);
    fireEvent.click(container.querySelector('.hud-pause-btn') as HTMLButtonElement);
    expect(onPause).toHaveBeenCalledTimes(1);
    // The networked pause is NOT used when a local handler is supplied.
    expect(vi.mocked(requestPause)).not.toHaveBeenCalled();
  });
});
