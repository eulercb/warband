// @vitest-environment jsdom
/**
 * Branch-coverage component tests for src/ui/screens/HostSetup.tsx — the
 * host-a-game setup form (boss grid + run-mode / seed / hardcore / relay options
 * + name field → create a room via session.hostGame).
 *
 * These complement tests/comp-forms.test.tsx by driving the option branches that
 * only render when `gauntlet` / `hardcore` / a relay are on: the run-mode
 * subtitle swap, the gauntlet-seed field (random / daily / custom + custom
 * input), the hardcore toggle glyph + blurb, and both directions of the
 * global-server (relay) toggle. The `session` module is mocked exactly like the
 * reference test (hostGame/playUiSound/setGauntlet), so nothing touches real
 * networking or audio; the real Zustand store drives the rest. `../net/transport/room`
 * loads for real — with no VITE_RELAY_URL the relay toggle is hidden by default,
 * and the two relay tests stub the env to reveal it.
 *
 * No jest-dom: assert via `.textContent`, `.value`, `.disabled`, `.classList`,
 * `getByRole`/`queryByText`/`getByLabelText`, `toBeTruthy()`/`toBeNull()`.
 *
 * NOTE (deliberately not covered): the `if (creating) return` early-return in
 * onCreate (HostSetup.tsx:41). Its TRUE side is unreachable from the rendered
 * UI: the only render whose click handler closes over `creating === true` is the
 * render where the Create button is `disabled`, and React refuses to dispatch
 * onClick to a fiber it committed as disabled (verified — re-enabling the node
 * via the DOM does not make React fire it). Reaching it would require editing
 * source, so the false side is covered here and the true side is left.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// Stub every session export HostSetup imports. hostGame is awaited by the create
// handler, so it must resolve. setGauntlet is a session action (NOT the store
// method), so clicking Run mode calls this mock and does NOT mutate the store —
// gauntlet-dependent branches are exercised by seeding the store directly.
vi.mock('../src/ui/state/session', () => ({
  hostGame: vi.fn().mockResolvedValue(undefined),
  playUiSound: vi.fn(),
  setGauntlet: vi.fn(),
}));

import HostSetup from '../src/ui/screens/HostSetup';
import { hostGame, playUiSound, setGauntlet } from '../src/ui/state/session';
import { useStore } from '../src/ui/state/store';

beforeEach(() => {
  vi.clearAllMocks(); // clears call history, keeps mockResolvedValue impls
  localStorage.clear();
  useStore.setState({
    localName: '',
    monsterId: 'dragon',
    gauntlet: false,
    seedMode: 'random',
    seedInput: '',
    hardcore: false,
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

// --------------------------------------------------------------------------
// Default (single-fight) rendering — the "off" side of every optional branch.
// --------------------------------------------------------------------------
describe('<HostSetup> default single-fight view', () => {
  it('shows the single-fight subtitle and hides all gauntlet/relay extras', () => {
    render(<HostSetup />);

    // L65-66 (false side): the plain "choose a boss" subtitle.
    expect(screen.getByText('Choose the boss to fight.')).toBeTruthy();
    expect(screen.queryByText(/Run mode assembles a fully RANDOM boss set/)).toBeNull();

    // L104 / L112 / L119-120 (false side): Run-mode toggle is off, unchecked,
    // and shows the "off" blurb.
    const runBtn = screen.getByRole('button', { name: /Run mode/ });
    expect(runBtn.classList.contains('on')).toBe(false);
    expect(runBtn.getAttribute('aria-pressed')).toBe('false');
    expect(runBtn.querySelector('.wb-gauntlet-check')?.textContent).toBe('');
    expect(runBtn.textContent).toContain('a single fight');

    // L126-127 / L166-167 (false side): no seed field, no hardcore toggle.
    expect(screen.queryByRole('group', { name: 'Gauntlet seed' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Hardcore/ })).toBeNull();

    // L190 (false side): no relay configured => global-server toggle hidden.
    expect(screen.queryByText('Host on the global server')).toBeNull();

    // L246 (false side): no error alert.
    expect(screen.queryByRole('alert')).toBeNull();

    // L242 (false side): the primary button reads its idle label and is enabled.
    const create = screen.getByRole<HTMLButtonElement>('button', { name: 'Create Room' });
    expect(create.disabled).toBe(false);
  });

  it('shows the Chaos Draft toggle even for a single fight (ungated) and flips randomKits (item 10)', () => {
    render(<HostSetup />);
    // Unlike Hardcore, Chaos Draft is NOT gated on the gauntlet — it's here for a
    // single fight too, so it composes with any run type.
    const btn = screen.getByRole('button', { name: /Chaos Draft/ });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(useStore.getState().randomKits).toBe(false);
    fireEvent.click(btn);
    expect(useStore.getState().randomKits).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('pre-selects the default boss and toggles selection on another card', () => {
    render(<HostSetup />);

    // L74 / L79 / L85: the current boss (Dragon) is selected (styled), others not.
    const dragon = screen.getByRole('button', { name: /Ancient Dragon/ });
    expect(dragon.getAttribute('aria-pressed')).toBe('true');
    expect(dragon.classList.contains('selected')).toBe(true);
    expect(dragon.getAttribute('style')).toContain('border-color');

    const troll = screen.getByRole('button', { name: /Forest Troll/ });
    expect(troll.getAttribute('aria-pressed')).toBe('false');
    expect(troll.classList.contains('selected')).toBe(false);
    expect(troll.getAttribute('style')).toBeNull();

    fireEvent.click(troll);
    expect(useStore.getState().monsterId).toBe('troll');
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });

  it('single-fight customization: granted subclass skills + boons flow into hostGame (item 8)', async () => {
    useStore.setState({ localClass: 'knight' });
    render(<HostSetup />);

    // The customization panel is present only in single-fight mode.
    expect(screen.getByRole('group', { name: 'Customize your hero' })).toBeTruthy();

    // Grant a Knight subclass skill and a Knight boon and a generic boon.
    fireEvent.click(screen.getByRole('button', { name: /Earthshaker/ }));
    fireEvent.click(screen.getByRole('button', { name: /Impenetrable/ }));
    fireEvent.click(screen.getByRole('button', { name: /Vigor/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));
    await Promise.resolve();

    expect(hostGame).toHaveBeenCalledTimes(1);
    const loadout = (hostGame as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      subSkills: string[];
      charUpgrades: string[];
      upgrades: string[];
    };
    expect(loadout.subSkills).toContain('kn_champion_slam'); // Earthshaker
    expect(loadout.charUpgrades).toContain('kn_bulwark'); // Iron Bulwark boon
    expect(loadout.upgrades).toContain('vigor');
  });

  it('caps up-front subclass-skill grants at two (item 8)', () => {
    useStore.setState({ localClass: 'knight' });
    render(<HostSetup />);
    // Pick three skills; the third must be refused (disabled once two are chosen).
    fireEvent.click(screen.getByRole('button', { name: /Earthshaker/ }));
    fireEvent.click(screen.getByRole('button', { name: /Riposte/ }));
    const third = screen.getByRole<HTMLButtonElement>('button', { name: /Bull Rush/ });
    expect(third.disabled).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Run mode ON — subtitle swap, seed field, hardcore toggle appear.
// --------------------------------------------------------------------------
describe('<HostSetup> with run mode enabled', () => {
  it('reveals the gauntlet subtitle, seed field and hardcore toggle', () => {
    useStore.setState({ gauntlet: true });
    render(<HostSetup />);

    // L65-66 / L119-120 (true side): gauntlet subtitle + "on" blurb.
    expect(screen.getByText(/Run mode assembles a fully RANDOM boss set/)).toBeTruthy();
    const runBtn = screen.getByRole('button', { name: /Run mode/ });
    expect(runBtn.classList.contains('on')).toBe(true); // L104 true
    expect(runBtn.getAttribute('aria-pressed')).toBe('true');
    expect(runBtn.querySelector('.wb-gauntlet-check')?.textContent).toBe('✓'); // L112 true
    expect(runBtn.textContent).toContain('climbing difficulty');

    // L126-127 (true side): the seed field renders with its three chips (L141).
    const seedGroup = screen.getByRole('group', { name: 'Gauntlet seed' });
    expect(seedGroup).toBeTruthy();
    // L134: the current mode ('random') chip is selected; the others are not.
    const randomChip = screen.getByRole('button', { name: 'Random' });
    const dailyChip = screen.getByRole('button', { name: 'Run of the Day' });
    const customChip = screen.getByRole('button', { name: 'Custom seed' });
    expect(randomChip.classList.contains('selected')).toBe(true);
    expect(randomChip.getAttribute('aria-pressed')).toBe('true');
    expect(dailyChip.classList.contains('selected')).toBe(false);
    expect(customChip.classList.contains('selected')).toBe(false);
    // L145-146 (false side): no custom input while mode is 'random'.
    expect(screen.queryByLabelText('Custom gauntlet seed')).toBeNull();
    // L157-161 (random side): the random blurb.
    expect(seedGroup.textContent).toContain('A fresh random boss set');

    // L166-167 (true side): hardcore toggle renders, off by default.
    const hardcoreBtn = screen.getByRole('button', { name: /Hardcore/ });
    expect(hardcoreBtn.classList.contains('on')).toBe(false); // L169 false
    expect(hardcoreBtn.querySelector('.wb-gauntlet-check')?.textContent).toBe(''); // L177 false
    expect(hardcoreBtn.textContent).toContain('Off: the standard run'); // L182-184 off
  });

  it('the Run mode toggle calls the session setGauntlet action and plays a click', () => {
    render(<HostSetup />);
    fireEvent.click(screen.getByRole('button', { name: /Run mode/ }));
    expect(setGauntlet).toHaveBeenCalledWith(true);
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });

  it('switches the seed mode random -> daily -> custom, revealing the custom input', () => {
    useStore.setState({ gauntlet: true });
    render(<HostSetup />);

    // random -> daily (L159 daily blurb; still no custom input).
    fireEvent.click(screen.getByRole('button', { name: 'Run of the Day' }));
    expect(useStore.getState().seedMode).toBe('daily');
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
    let seedGroup = screen.getByRole('group', { name: 'Gauntlet seed' });
    expect(seedGroup.textContent).toContain('Everyone playing today shares');
    expect(
      screen.getByRole('button', { name: 'Run of the Day' }).classList.contains('selected'),
    ).toBe(true);
    expect(screen.queryByLabelText('Custom gauntlet seed')).toBeNull(); // L145-146 false

    // daily -> custom (L145-146 true: input appears; L160-161 custom blurb).
    fireEvent.click(screen.getByRole('button', { name: 'Custom seed' }));
    expect(useStore.getState().seedMode).toBe('custom');
    seedGroup = screen.getByRole('group', { name: 'Gauntlet seed' });
    expect(seedGroup.textContent).toContain('Reproduce an exact run');
    const seedInput = screen.getByLabelText<HTMLInputElement>('Custom gauntlet seed');
    expect(seedInput).toBeTruthy();
    expect(seedInput.value).toBe('');

    // Typing the custom seed drives the store setter (L152).
    fireEvent.change(seedInput, { target: { value: 'moon-42' } });
    expect(seedInput.value).toBe('moon-42');
    expect(useStore.getState().seedInput).toBe('moon-42');
  });

  it('seeds the custom seed input from an existing store value', () => {
    useStore.setState({ gauntlet: true, seedMode: 'custom', seedInput: 'preset-seed' });
    render(<HostSetup />);
    const seedInput = screen.getByLabelText<HTMLInputElement>('Custom gauntlet seed');
    expect(seedInput.value).toBe('preset-seed');
  });

  it('toggling Hardcore updates the store, the skull glyph and the blurb', () => {
    useStore.setState({ gauntlet: true });
    render(<HostSetup />);

    const hardcoreBtn = screen.getByRole('button', { name: /Hardcore/ });
    expect(hardcoreBtn.classList.contains('on')).toBe(false);
    expect(hardcoreBtn.textContent).toContain('Off: the standard run');

    fireEvent.click(hardcoreBtn);
    expect(useStore.getState().hardcore).toBe(true);
    expect(playUiSound).toHaveBeenCalledWith('uiClick');

    // Re-query after the re-render: on-state class, skull glyph, hardcore blurb.
    const hardcoreOn = screen.getByRole('button', { name: /Hardcore/ });
    expect(hardcoreOn.classList.contains('on')).toBe(true); // L169 true
    expect(hardcoreOn.querySelector('.wb-gauntlet-check')?.textContent).toBe('💀'); // L177 true
    expect(hardcoreOn.textContent).toContain('Kill fast or die'); // L182-183 on
  });
});

// --------------------------------------------------------------------------
// Global-server (relay) toggle — both directions (needs a configured relay).
// --------------------------------------------------------------------------
describe('<HostSetup> global-server relay toggle', () => {
  it('turns the relay ON: p2p -> relay, with the off-state glyph/blurb first', () => {
    vi.stubEnv('VITE_RELAY_URL', 'relay.example.com');
    useStore.setState({ netMode: 'p2p' });
    render(<HostSetup />);

    // L190 true: the toggle is shown. L193 / L201 / L206 false side (p2p).
    const toggle = screen.getByRole('button', { name: /Host on the global server/ });
    expect(toggle.classList.contains('on')).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.querySelector('.wb-gauntlet-check')?.textContent).toBe('');
    expect(toggle.textContent).toContain('direct peer-to-peer over WebRTC');

    // L196 false side: netMode !== 'relay' => switch to 'relay'.
    fireEvent.click(toggle);
    expect(useStore.getState().netMode).toBe('relay');
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });

  it('turns the relay OFF: relay -> p2p, with the on-state glyph/blurb first', () => {
    vi.stubEnv('VITE_RELAY_URL', 'relay.example.com');
    useStore.setState({ netMode: 'relay' });
    render(<HostSetup />);

    // L193 / L201 / L206 true side (relay).
    const toggle = screen.getByRole('button', { name: /Host on the global server/ });
    expect(toggle.classList.contains('on')).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.querySelector('.wb-gauntlet-check')?.textContent).toBe('✓');
    expect(toggle.textContent).toContain('All traffic is relayed through the global server');

    // L196 true side: netMode === 'relay' => switch back to 'p2p'.
    fireEvent.click(toggle);
    expect(useStore.getState().netMode).toBe('p2p');
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });
});

// --------------------------------------------------------------------------
// Create / error / back flows.
// --------------------------------------------------------------------------
describe('<HostSetup> create, error and back', () => {
  it('Create Room plays the confirm cue, calls hostGame and enters the creating state', async () => {
    render(<HostSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));

    // L41 false side (proceed) + L42 confirm cue + hostGame call.
    await waitFor(() => expect(hostGame).toHaveBeenCalledTimes(1));
    expect(playUiSound).toHaveBeenCalledWith('uiConfirm');

    // L242 true side: relabelled + disabled while creating; Back disabled too.
    const creating = await screen.findByRole<HTMLButtonElement>('button', { name: 'Creating…' });
    expect(creating.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Back' }).disabled).toBe(true);
  });

  it('does not start a second host while already creating', async () => {
    render(<HostSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));
    await waitFor(() => expect(hostGame).toHaveBeenCalledTimes(1));
    // The primary button is now disabled/relabelled; a further click is a no-op.
    fireEvent.click(screen.getByRole('button', { name: 'Creating…' }));
    expect(hostGame).toHaveBeenCalledTimes(1);
  });

  it('shows the thrown message and clears the creating state when hostGame rejects with an Error', async () => {
    vi.mocked(hostGame).mockRejectedValueOnce(new Error('relay down'));
    render(<HostSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));

    // L47 true side: err instanceof Error => err.message.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('relay down'));
    expect(useStore.getState().error).toBe('relay down');
    // creating was reset => primary button is idle + enabled again.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create Room' }).disabled).toBe(
      false,
    );
  });

  it('falls back to the generic message when hostGame rejects with a non-Error', async () => {
    // Reject with a plain string so `err instanceof Error` is false (L47 false side).
    vi.mocked(hostGame).mockRejectedValueOnce('kaboom');
    render(<HostSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Room' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Failed to create room.'),
    );
    expect(useStore.getState().error).toBe('Failed to create room.');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create Room' }).disabled).toBe(
      false,
    );
  });

  it('renders the error alert from the store (L246 true side)', () => {
    useStore.setState({ error: 'Failed to create room.' });
    render(<HostSetup />);
    expect(screen.getByRole('alert').textContent).toBe('Failed to create room.');
  });

  it('Back plays a click, clears the error and returns to the menu', () => {
    useStore.setState({ error: 'boom' });
    render(<HostSetup />);
    expect(screen.getByRole('alert').textContent).toBe('boom');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(useStore.getState().phase).toBe('menu');
    expect(useStore.getState().error).toBeNull();
    expect(playUiSound).toHaveBeenCalledWith('uiClick');
  });

  it('seeds and updates the name field through the store', () => {
    useStore.setState({ localName: 'Gimli' });
    render(<HostSetup />);
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Your display name' });
    expect(name.value).toBe('Gimli');
    fireEvent.change(name, { target: { value: 'Legolas' } });
    expect(name.value).toBe('Legolas');
    expect(useStore.getState().localName).toBe('Legolas');
  });
});
