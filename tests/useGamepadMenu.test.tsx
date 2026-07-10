// @vitest-environment jsdom
/**
 * Tests for the useGamepadMenu hook — it registers a gamepad nav handler and
 * moves DOM focus between the focusable controls inside a container. We capture
 * the handler passed to pushNavHandler (mocked) and drive it directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useRef } from 'react';
import type { NavDir } from '../src/input/gamepadNav';

interface NavHandler {
  onNav: (dir: NavDir) => void;
  onConfirm: () => void;
  onBack: () => void;
}

const captured: { handler: NavHandler | null; unsub: ReturnType<typeof vi.fn> } = {
  handler: null,
  unsub: vi.fn(),
};

vi.mock('../src/input/gamepadNav', () => ({
  pushNavHandler: (h: NavHandler) => {
    captured.handler = h;
    return captured.unsub;
  },
}));

import { useGamepadMenu } from '../src/input/useGamepadMenu';

function Menu(props: { enabled?: boolean; suspended?: boolean; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useGamepadMenu(ref, props);
  return (
    <div ref={ref}>
      <button type="button" data-testid="a">
        A
      </button>
      <button type="button" data-testid="b">
        B
      </button>
      <button type="button" data-testid="c">
        C
      </button>
    </div>
  );
}

// jsdom does no layout, so `offsetParent` is always null and the hook's
// visibility filter would reject every control. Make attached elements report a
// truthy offsetParent so focusables() sees them.
beforeEach(() => {
  captured.handler = null;
  captured.unsub = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentNode as Element | null;
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('useGamepadMenu', () => {
  it('registers a nav handler when enabled', () => {
    render(<Menu />);
    expect(captured.handler).not.toBeNull();
  });

  it('does not register while disabled', () => {
    render(<Menu enabled={false} />);
    expect(captured.handler).toBeNull();
  });

  it('focuses the first control on the initial nav press', () => {
    const { getByTestId } = render(<Menu />);
    captured.handler?.onNav('down');
    expect(document.activeElement).toBe(getByTestId('a'));
    expect(getByTestId('a').classList.contains('wb-gp-focus')).toBe(true);
  });

  it('moves focus geometrically to the next control', () => {
    const { getByTestId } = render(<Menu />);
    captured.handler?.onNav('down'); // seed → A
    captured.handler?.onNav('right'); // A → B (next to the right in the row)
    expect(document.activeElement).toBe(getByTestId('b'));
  });

  it('activates the focused control on confirm', () => {
    const { getByTestId } = render(<Menu />);
    const onClick = vi.fn();
    getByTestId('a').addEventListener('click', onClick);
    captured.handler?.onNav('down'); // focus A
    captured.handler?.onConfirm();
    expect(onClick).toHaveBeenCalled();
  });

  it('invokes onBack on the back button', () => {
    const onBack = vi.fn();
    render(<Menu onBack={onBack} />);
    captured.handler?.onBack();
    expect(onBack).toHaveBeenCalled();
  });

  it('swallows navigation while suspended', () => {
    const { getByTestId } = render(<Menu suspended />);
    captured.handler?.onNav('down');
    // Nothing focused: the suspended guard swallowed the press.
    expect(getByTestId('a').classList.contains('wb-gp-focus')).toBe(false);
  });

  it('unsubscribes and clears focus on unmount', () => {
    const { unmount } = render(<Menu />);
    captured.handler?.onNav('down');
    const unsub = captured.unsub;
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
