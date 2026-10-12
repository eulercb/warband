// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RoomHelp from '../src/ui/game/RoomHelp';
import { useRoomGuide } from '../src/ui/game/useRoomGuide';
import { ROOM_GUIDES } from '../src/ui/game/roomGuides';
import type { RoomFocus } from '../src/ui/game/roomFocus';

function Harness({
  blocked = false,
  mobile = true,
  focus = null,
}: {
  blocked?: boolean;
  mobile?: boolean;
  focus?: RoomFocus | null;
}) {
  const guide = useRoomGuide('test');
  return (
    <div onPointerDownCapture={guide.pointer}>
      <RoomHelp
        guide={guide}
        steps={ROOM_GUIDES.camp}
        label="Camp guide"
        focus={focus}
        mobile={mobile}
        blocked={blocked}
      />
      <div className="wb-touch-controls">
        <button>Move</button>
      </div>
      <button onClick={guide.activity}>Keyboard movement</button>
    </div>
  );
}
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('shows first-visit guidance on desktop too, yields to movement, remembers, and replays', () => {
  const { unmount } = render(<Harness mobile={false} />);
  expect(screen.getByRole('region', { name: 'Camp guide' })).toBeTruthy();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Next tip' }));
  expect(screen.getByRole('region', { name: 'Camp guide' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Keyboard movement' }));
  expect(screen.queryByRole('region')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Guide' }));
  expect(screen.getByRole('region', { name: 'Camp guide' })).toBeTruthy();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Move' }));
  expect(screen.queryByRole('region')).toBeNull();
  unmount();
  render(<Harness />);
  expect(screen.queryByRole('region')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Keyboard movement' }));
  expect(screen.queryByRole('region')).toBeNull();
});
it('keeps guides and nearby descriptions mutually exclusive, including selected/disabled/progress states', () => {
  const focus = {
    marker: 'Bot1',
    title: 'Knight',
    detail: 'Add a knight bot.',
    channel: 0.5,
    disabled: true,
    selected: false,
  };
  const { rerender } = render(<Harness focus={focus} />);
  expect(screen.queryByRole('region', { name: 'Nearby option' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
  expect(screen.getByText('Currently unavailable')).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0.5');
  rerender(<Harness focus={{ ...focus, channel: 0, disabled: false, selected: true }} />);
  expect(screen.getByText('Selected ✓')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  rerender(<Harness focus={{ ...focus, channel: 0, disabled: false }} />);
  expect(screen.queryByText('Selected ✓')).toBeNull();
  rerender(<Harness focus={focus} blocked />);
  expect(screen.queryByRole('region')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Guide' })).toBeNull();
});
it('still allows skipping when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Skip guide' }));
  expect(screen.queryByRole('region')).toBeNull();
});
