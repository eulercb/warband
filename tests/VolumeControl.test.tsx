// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// The component only needs `playUiSound` from session; mock it so we don't pull
// in the audio engine or the networking stack.
vi.mock('../src/ui/state/session', () => ({ playUiSound: vi.fn() }));

import VolumeControl from '../src/ui/game/VolumeControl';
import { useStore } from '../src/ui/state/store';

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ volume: 1, muted: false });
});

afterEach(() => {
  cleanup();
});

describe('<VolumeControl>', () => {
  it('renders the current volume percentage and a loud icon', () => {
    render(<VolumeControl />);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByRole('button').textContent).toBe('🔊');
  });

  it('shows a quieter icon at low volume', () => {
    useStore.setState({ volume: 0.3 });
    render(<VolumeControl />);
    expect(screen.getByRole('button').textContent).toBe('🔉');
    expect(screen.getByText('30%')).toBeTruthy();
  });

  it('toggles mute when the button is clicked', () => {
    render(<VolumeControl />);
    fireEvent.click(screen.getByRole('button'));
    expect(useStore.getState().muted).toBe(true);
    // Muted shows the silent icon and 0%.
    expect(screen.getByRole('button').textContent).toBe('🔇');
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('drives the store when the slider moves', () => {
    render(<VolumeControl />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '50' } });
    expect(useStore.getState().volume).toBeCloseTo(0.5);
  });

  it('hides the numeric readout in compact mode', () => {
    render(<VolumeControl compact />);
    expect(screen.queryByText('100%')).toBeNull();
  });
});
