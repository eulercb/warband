// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import MobileMenu from '../src/ui/game/MobileMenu';
import { useMobileMenu } from '../src/ui/game/useMobileMenu';

function Menu() {
  const menu = useMobileMenu();
  return (
    <MobileMenu {...menu} label="Menu">
      <button>Host</button>
    </MobileMenu>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('touch menu fallback', () => {
  it('leaves the desktop menu visible and follows pointer changes', () => {
    let notify = () => {};
    const media = {
      matches: false,
      addEventListener: vi.fn((_name: string, callback: () => void) => {
        notify = callback;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', () => media);
    const { unmount } = render(<Menu />);
    expect(screen.getByRole('button', { name: 'Host' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    act(() => {
      media.matches = true;
      notify();
    });
    expect(screen.queryByRole('button', { name: 'Host' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Host' }));
    fireEvent.keyDown(document, { key: 'a' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menu' }));
    act(() => {
      media.matches = false;
      notify();
    });
    expect(screen.getByRole('button', { name: 'Host' })).toBeTruthy();
    unmount();
    expect(media.removeEventListener).toHaveBeenCalled();
  });

  it('supports environments without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<Menu />);
    expect(screen.getByRole('button', { name: 'Host' })).toBeTruthy();
  });
});
