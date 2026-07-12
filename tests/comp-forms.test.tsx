// @vitest-environment jsdom
/**
 * Component tests for the two multiplayer entry screens:
 *   - src/ui/screens/HostSetup.tsx  (pick boss + name → create a room via session.hostGame)
 *   - src/ui/screens/JoinScreen.tsx (enter a room code → connect via session.joinGame)
 *
 * The `session` module is mocked so hostGame/joinGame never touch real
 * networking/audio; the real Zustand store drives everything else. `../net/room`
 * is imported for real (as `room.test.ts` already does) — with no VITE_RELAY_URL
 * configured, `configuredRelayUrl()` returns null so the global-server toggles are
 * hidden by default; one test stubs the env to exercise that branch.
 *
 * No jest-dom here: assert with `.textContent`, `.value`, `.disabled`,
 * `getByRole`, `toBeTruthy()`, `toBeNull()`. Element-specific props are reached
 * via getByRole's/findByRole's generic type parameter (an `as` assertion trips
 * no-unnecessary-type-assertion under the lint program).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// Stub every session export these two components import. hostGame/joinGame are
// awaited by the click handlers, so they must resolve.
vi.mock('../src/ui/state/session', () => ({
  hostGame: vi.fn().mockResolvedValue(undefined),
  joinGame: vi.fn().mockResolvedValue(undefined),
  playUiSound: vi.fn(),
  setGauntlet: vi.fn(),
}));

import HostSetup from '../src/ui/screens/HostSetup';
import JoinScreen from '../src/ui/screens/JoinScreen';
import { hostGame, joinGame, playUiSound, setGauntlet } from '../src/ui/state/session';
import { useStore } from '../src/ui/state/store';

beforeEach(() => {
  vi.clearAllMocks(); // clears call history but keeps mockResolvedValue impls
  localStorage.clear();
  useStore.setState({
    localName: '',
    monsterId: 'dragon',
    gauntlet: false,
    netMode: 'p2p',
    error: null,
    roomCode: null,
    phase: 'hostSetup',
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('<HostSetup>', () => {
  it('seeds the name field from the store', () => {
    useStore.setState({ localName: 'Aragorn' });
    render(<HostSetup />);
    expect(screen.getByText('Host a Fight')).toBeTruthy();
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Your display name' });
    expect(name.value).toBe('Aragorn');
  });

  it('typing in the name field updates the field and the store', () => {
    render(<HostSetup />);
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Your display name' });
    fireEvent.change(name, { target: { value: 'Gimli' } });
    expect(name.value).toBe('Gimli');
    expect(useStore.getState().localName).toBe('Gimli');
  });

  it('clicking Create Room calls hostGame and enters the creating state', async () => {
    render(<HostSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));

    await waitFor(() => expect(hostGame).toHaveBeenCalledTimes(1));
    expect(playUiSound).toHaveBeenCalledWith('uiConfirm');

    // While creating, the primary button is disabled and relabelled, and Back is
    // disabled too.
    const creating = await screen.findByRole<HTMLButtonElement>('button', { name: 'Creating…' });
    expect(creating.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Back' }).disabled).toBe(true);
  });

  it('does not fire hostGame twice on a second click while already creating', async () => {
    render(<HostSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));
    await waitFor(() => expect(hostGame).toHaveBeenCalledTimes(1));
    // Button is now disabled/relabelled; a further click must not start a second host.
    fireEvent.click(screen.getByRole('button', { name: 'Creating…' }));
    expect(hostGame).toHaveBeenCalledTimes(1);
  });

  it('shows an error and leaves the creating state when hostGame rejects', async () => {
    vi.mocked(hostGame).mockRejectedValueOnce(new Error('relay down'));
    render(<HostSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('relay down'));
    expect(useStore.getState().error).toBe('relay down');
    // creating was reset → the primary button returns to its idle label, enabled.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create Room' }).disabled).toBe(
      false,
    );
  });

  it('toggles the gauntlet run mode through the mocked setGauntlet', () => {
    render(<HostSetup />);
    fireEvent.click(screen.getByRole('button', { name: /Run mode/ }));
    expect(setGauntlet).toHaveBeenCalledWith(true);
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });

  it('selecting a different boss updates the store monsterId', () => {
    render(<HostSetup />);
    const troll = screen.getByRole('button', { name: /Forest Troll/ });
    expect(troll.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(troll);
    expect(useStore.getState().monsterId).toBe('troll');
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });

  it('renders an error alert when the store holds an error', () => {
    useStore.setState({ error: 'Failed to create room.' });
    render(<HostSetup />);
    expect(screen.getByRole('alert').textContent).toBe('Failed to create room.');
  });

  it('Back clears the error and returns to the menu', () => {
    useStore.setState({ error: 'boom' });
    render(<HostSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(useStore.getState().phase).toBe('menu');
    expect(useStore.getState().error).toBeNull();
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });

  it('hides the global-server toggle when no relay is configured', () => {
    render(<HostSetup />);
    expect(screen.queryByText('Host on the global server')).toBeNull();
  });

  it('shows the global-server toggle and switches netMode when a relay is configured', () => {
    vi.stubEnv('VITE_RELAY_URL', 'relay.example.com');
    render(<HostSetup />);
    const toggle = screen.getByRole('button', { name: /Host on the global server/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(useStore.getState().netMode).toBe('relay');
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });
});

describe('<JoinScreen>', () => {
  it('seeds the code input from the store roomCode and enables Join', () => {
    useStore.setState({ roomCode: 'ABCDEF' });
    render(<JoinScreen />);
    const codeInput = screen.getByRole<HTMLInputElement>('textbox', { name: 'Room code' });
    expect(codeInput.value).toBe('ABCDEF');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Join' }).disabled).toBe(false);
  });

  it('normalizes a typed code to uppercase', () => {
    render(<JoinScreen />);
    const codeInput = screen.getByRole<HTMLInputElement>('textbox', { name: 'Room code' });
    fireEvent.change(codeInput, { target: { value: 'wxyz' } });
    expect(codeInput.value).toBe('WXYZ');
  });

  it('disables Join and never calls joinGame for a too-short code', () => {
    render(<JoinScreen />);
    const codeInput = screen.getByRole('textbox', { name: 'Room code' });
    fireEvent.change(codeInput, { target: { value: '12' } });
    const join = screen.getByRole<HTMLButtonElement>('button', { name: 'Join' });
    expect(join.disabled).toBe(true);
    fireEvent.click(join);
    expect(joinGame).not.toHaveBeenCalled();
  });

  it('submits the normalized code via joinGame and enters the joining state', async () => {
    render(<JoinScreen />);
    const codeInput = screen.getByRole('textbox', { name: 'Room code' });
    fireEvent.change(codeInput, { target: { value: 'abcd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() => expect(joinGame).toHaveBeenCalledTimes(1));
    expect(joinGame).toHaveBeenCalledWith('ABCD');
    expect(playUiSound).toHaveBeenCalledWith('uiConfirm');

    const joining = await screen.findByRole<HTMLButtonElement>('button', { name: 'Joining…' });
    expect(joining.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Back' }).disabled).toBe(true);
  });

  it('shows an error and leaves the joining state when joinGame rejects', async () => {
    vi.mocked(joinGame).mockRejectedValueOnce(new Error('no host'));
    render(<JoinScreen />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Room code' }), {
      target: { value: 'abcd' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('no host'));
    expect(useStore.getState().error).toBe('no host');
    // joining was reset → Join is enabled again (code is still valid).
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Join' }).disabled).toBe(false);
  });

  it('trims surrounding whitespace from the code before joining', async () => {
    render(<JoinScreen />);
    const codeInput = screen.getByRole('textbox', { name: 'Room code' });
    fireEvent.change(codeInput, { target: { value: 'abcd ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(joinGame).toHaveBeenCalledWith('ABCD'));
  });

  it('joins when Enter is pressed in the code field', async () => {
    render(<JoinScreen />);
    const codeInput = screen.getByRole('textbox', { name: 'Room code' });
    fireEvent.change(codeInput, { target: { value: 'abcd' } });
    fireEvent.keyDown(codeInput, { key: 'Enter' });
    await waitFor(() => expect(joinGame).toHaveBeenCalledWith('ABCD'));
  });

  it('does not join on Enter when the code is too short', () => {
    render(<JoinScreen />);
    const codeInput = screen.getByRole('textbox', { name: 'Room code' });
    fireEvent.change(codeInput, { target: { value: 'ab' } });
    fireEvent.keyDown(codeInput, { key: 'Enter' });
    expect(joinGame).not.toHaveBeenCalled();
  });

  it('typing in the name field updates the store', () => {
    render(<JoinScreen />);
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Your display name' });
    fireEvent.change(name, { target: { value: 'Legolas' } });
    expect(name.value).toBe('Legolas');
    expect(useStore.getState().localName).toBe('Legolas');
  });

  it('renders an error alert when the store holds an error', () => {
    useStore.setState({ error: 'Failed to join room.' });
    render(<JoinScreen />);
    expect(screen.getByRole('alert').textContent).toBe('Failed to join room.');
  });

  it('Back clears the error and returns to the menu', () => {
    useStore.setState({ error: 'boom' });
    render(<JoinScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(useStore.getState().phase).toBe('menu');
    expect(useStore.getState().error).toBeNull();
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });

  it('hides the global-server toggle when no relay is configured', () => {
    render(<JoinScreen />);
    expect(screen.queryByText('Connect via the global server')).toBeNull();
  });

  it('shows the global-server toggle and switches netMode when a relay is configured', () => {
    vi.stubEnv('VITE_RELAY_URL', 'relay.example.com');
    render(<JoinScreen />);
    const toggle = screen.getByRole('button', { name: /Connect via the global server/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(useStore.getState().netMode).toBe('relay');
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });

  it('switches the global-server toggle back off (relay → p2p)', () => {
    vi.stubEnv('VITE_RELAY_URL', 'relay.example.com');
    useStore.setState({ netMode: 'relay' });
    render(<JoinScreen />);
    const toggle = screen.getByRole('button', { name: /Connect via the global server/ });
    // Starts ON (relay); clicking flips it back to peer-to-peer.
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(useStore.getState().netMode).toBe('p2p');
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });

  it('falls back to the generic error message when joinGame rejects with a non-Error', async () => {
    // A rejection that is not an Error instance hits the `: 'Failed to join room.'`
    // side of the message ternary.
    vi.mocked(joinGame).mockRejectedValueOnce('socket exploded');
    render(<JoinScreen />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Room code' }), {
      target: { value: 'abcd' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Failed to join room.'));
    expect(useStore.getState().error).toBe('Failed to join room.');
    // joining was reset → Join is enabled again (the code is still valid).
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Join' }).disabled).toBe(false);
  });
});
