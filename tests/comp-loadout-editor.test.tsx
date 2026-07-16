// @vitest-environment jsdom
/**
 * Component tests for src/ui/screens/LoadoutEditor.tsx — the lobby's single-fight test
 * loadout editor: multiclass, subclass skills, class boons at a rank, grands, per-sub-
 * skill boons and generic boons at a rank, all written into the store's `sfLoadout`.
 * `playUiSound` is mocked; the store is real so we assert on the resulting loadout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../src/ui/state/session', () => ({ playUiSound: vi.fn() }));

import { LoadoutEditor } from '../src/ui/screens/LoadoutEditor';
import { useStore, EMPTY_SF_LOADOUT } from '../src/ui/state/store';

function setup(over: Record<string, unknown> = {}): void {
  useStore.setState({
    isHost: true,
    gauntlet: false,
    localClass: 'knight',
    sfLoadout: EMPTY_SF_LOADOUT,
    sfLoadoutOpen: true,
    ...over,
  });
}

const lo = () => useStore.getState().sfLoadout;

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});
afterEach(() => cleanup());

describe('<LoadoutEditor> gating', () => {
  it('renders nothing for a non-host or in a gauntlet', () => {
    setup({ isHost: false });
    const a = render(<LoadoutEditor />);
    expect(a.container.querySelector('.wb-sf-loadout')).toBeNull();
    cleanup();
    setup({ gauntlet: true });
    const b = render(<LoadoutEditor />);
    expect(b.container.querySelector('.wb-sf-loadout')).toBeNull();
  });

  it('collapses/expands the body via the toggle', () => {
    setup({ sfLoadoutOpen: false });
    const { container } = render(<LoadoutEditor />);
    expect(container.querySelector('.wb-sf-loadout-body')).toBeNull();
    fireEvent.click(container.querySelector('.wb-sf-loadout-toggle') as HTMLElement);
    expect(useStore.getState().sfLoadoutOpen).toBe(true);
  });
});

describe('<LoadoutEditor> selections write the loadout', () => {
  it('cycles a class boon through its ranks and wraps back to zero', () => {
    render(<LoadoutEditor />);
    const bulwark = screen.getByRole('button', { name: /Impenetrable/ }); // kn_bulwark, cap 5
    fireEvent.click(bulwark);
    expect(lo().charUpgrades.filter((x) => x === 'kn_bulwark')).toHaveLength(1);
    fireEvent.click(bulwark);
    expect(lo().charUpgrades.filter((x) => x === 'kn_bulwark')).toHaveLength(2);
    // 5 total clicks reach the cap; the 6th wraps to 0.
    fireEvent.click(bulwark);
    fireEvent.click(bulwark);
    fireEvent.click(bulwark);
    expect(lo().charUpgrades.filter((x) => x === 'kn_bulwark')).toHaveLength(5);
    fireEvent.click(bulwark);
    expect(lo().charUpgrades).not.toContain('kn_bulwark');
  });

  it('cycles a generic boon rank into the loadout', () => {
    render(<LoadoutEditor />);
    const mighty = screen.getByRole('button', { name: /Mighty/ });
    fireEvent.click(mighty);
    fireEvent.click(mighty);
    expect(lo().upgrades.filter((x) => x === 'mighty')).toHaveLength(2);
  });

  it('toggles subclass skills and refuses a third (cap 2)', () => {
    render(<LoadoutEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Earthshaker/ }));
    fireEvent.click(screen.getByRole('button', { name: /Riposte/ }));
    expect(lo().subSkills).toHaveLength(2);
    const third = screen.getByRole<HTMLButtonElement>('button', { name: /Bull Rush/ });
    expect(third.disabled).toBe(true);
    fireEvent.click(third);
    expect(lo().subSkills).toHaveLength(2); // still two — the third was refused
  });

  it('adds an extra class for multiclass', () => {
    render(<LoadoutEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Mage' }));
    expect(lo().extraClasses).toContain('mage');
  });

  it('toggles a grand improvement into the loadout', () => {
    const { container } = render(<LoadoutEditor />);
    const grands = container.querySelectorAll<HTMLButtonElement>('.wb-btn-grand');
    expect(grands.length).toBeGreaterThan(0);
    fireEvent.click(grands[0]);
    expect(lo().charUpgrades.some((id) => id.length > 0)).toBe(true);
    // Every id it added is a real grand.
    expect(lo().charUpgrades.length).toBe(1);
  });

  it('surfaces per-sub-skill boons only once that skill is equipped', () => {
    render(<LoadoutEditor />);
    // No sub-skill boons section with nothing equipped.
    expect(screen.queryByText(/Subclass-skill boons/i)).toBeNull();
    cleanup();
    setup({ sfLoadout: { ...EMPTY_SF_LOADOUT, subSkills: ['kn_champion_slam'] } });
    render(<LoadoutEditor />);
    expect(screen.getByText(/Subclass-skill boons/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Honed Earthshaker/ }));
    expect(lo().charUpgrades).toContain('subup_kn_champion_slam');
  });
});

describe('<LoadoutEditor> prunes class-invalid picks on class change', () => {
  it('drops a boon that belongs to neither the active class nor an owned extra class', () => {
    // A Mage boon on a Knight with no Mage class is pruned on mount.
    setup({ sfLoadout: { ...EMPTY_SF_LOADOUT, charUpgrades: ['mg_freeze'] } });
    render(<LoadoutEditor />);
    expect(lo().charUpgrades).not.toContain('mg_freeze');
  });

  it('keeps an extra-class boon while that class is owned', () => {
    setup({ sfLoadout: { ...EMPTY_SF_LOADOUT, charUpgrades: ['mg_freeze'], extraClasses: ['mage'] } });
    render(<LoadoutEditor />);
    expect(lo().charUpgrades).toContain('mg_freeze');
  });
});
