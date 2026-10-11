// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import RewardGuide from '../src/ui/game/RewardGuide';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('reward guide', () => {
  it('shows only one explanation, advances on a timer, and closes after the last', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<RewardGuide onClose={onClose} />);
    expect(screen.getByText('Gold G · Generic boons')).toBeTruthy();
    expect(screen.queryByText('Teal S · Optional shop')).toBeNull();
    for (let i = 0; i < 3; i++)
      act(() => {
        vi.advanceTimersByTime(6500);
      });
    expect(screen.getByText('Blue ↓ · Next boss')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(6500);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('can be advanced and skipped without waiting; cleans up the timer', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = render(<RewardGuide onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next tip' }));
    expect(screen.getByText('Purple C · Class boons')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip guide' }));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Next tip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next tip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
