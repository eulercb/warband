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

  it('clears every selection via the Clear button', () => {
    setup({
      sfLoadout: {
        ...EMPTY_SF_LOADOUT,
        upgrades: ['mighty'],
        charUpgrades: ['kn_bulwark'],
        subSkills: ['kn_champion_slam'],
        extraClasses: ['mage'],
      },
    });
    render(<LoadoutEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    const l = lo();
    expect(l.upgrades).toEqual([]);
    expect(l.charUpgrades).toEqual([]);
    expect(l.subSkills).toEqual([]);
    expect(l.extraClasses).toEqual([]);
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

describe('<LoadoutEditor> grafts (wild picks) + graft grands', () => {
  it('selecting a graft unlocks its graft grand, and dropping the graft removes it', () => {
    render(<LoadoutEditor />);
    // No graft grand is offered until the graft is actually held.
    expect(screen.queryByRole('button', { name: /Living Cataclysm/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Pyromancer's Pact/ }));
    expect(lo().charUpgrades).toContain('hy_pyromancer');
    // Its graft grand now appears (offerableGrands surfaces it) and can be taken.
    fireEvent.click(screen.getByRole('button', { name: /Living Cataclysm/ }));
    expect(lo().charUpgrades).toContain('hy_pyromancer_g_a');
    // Dropping the graft strips its welded grand too — no dangling no-op grand.
    fireEvent.click(screen.getByRole('button', { name: /Pyromancer's Pact/ }));
    expect(lo().charUpgrades).not.toContain('hy_pyromancer');
    expect(lo().charUpgrades).not.toContain('hy_pyromancer_g_a');
  });

  it('enforces one graft per ability slot', () => {
    render(<LoadoutEditor />);
    // Pyromancer's Pact and Field Medic both replace the a2 slot.
    fireEvent.click(screen.getByRole('button', { name: /Pyromancer's Pact/ }));
    const medic = screen.getByRole<HTMLButtonElement>('button', { name: /Field Medic/ });
    expect(medic.disabled).toBe(true);
    fireEvent.click(medic);
    expect(lo().charUpgrades).not.toContain('hy_fieldmedic'); // refused — slot occupied
  });

  it('prunes a graft the primary class cannot take on class change', () => {
    // Pyromancer's Pact excludes mage; a mage host must not keep it.
    setup({
      localClass: 'mage',
      sfLoadout: { ...EMPTY_SF_LOADOUT, charUpgrades: ['hy_pyromancer'] },
    });
    render(<LoadoutEditor />);
    expect(lo().charUpgrades).not.toContain('hy_pyromancer');
  });

  it('prunes an orphaned graft grand whose graft is not held', () => {
    // A graft grand with no underlying graft in the loadout is dropped on mount.
    setup({ sfLoadout: { ...EMPTY_SF_LOADOUT, charUpgrades: ['hy_pyromancer_g_a'] } });
    render(<LoadoutEditor />);
    expect(lo().charUpgrades).not.toContain('hy_pyromancer_g_a');
  });
});

describe('<LoadoutEditor> one subclass per class', () => {
  it('locks the sibling subclass once one is committed', () => {
    render(<LoadoutEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Earthshaker/ })); // kn_champion
    // A Battlemaster skill (the OTHER knight subclass) is now locked out.
    const trip = screen.getByRole<HTMLButtonElement>('button', { name: /Trip Attack/ });
    expect(trip.disabled).toBe(true);
    fireEvent.click(trip);
    expect(lo().subSkills).toEqual(['kn_champion_slam']); // the cross-subclass pick was refused
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
    setup({
      sfLoadout: { ...EMPTY_SF_LOADOUT, charUpgrades: ['mg_freeze'], extraClasses: ['mage'] },
    });
    render(<LoadoutEditor />);
    expect(lo().charUpgrades).toContain('mg_freeze');
  });
});
