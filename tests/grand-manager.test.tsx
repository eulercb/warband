// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { GrandManager } from '../src/ui/game/GrandManager';
import {
  changeGrand,
  normalizeGrandLoadout,
  grandEarnable,
  type GrandLoadout,
  type GrandContext,
} from '../src/engine/content/grandSelections';
import { CHAR_UPGRADES } from '../src/engine/content/charUpgrades';
vi.mock('../src/ui/state/session', () => ({ chooseGrand: vi.fn() }));
afterEach(cleanup);
const context: GrandContext = {
  classes: ['knight', 'mage'],
  history: [],
  subSkills: ['kn_champion_slam'],
};
function Harness({
  start,
  ctx = context,
  credit = true,
}: {
  start?: GrandLoadout;
  ctx?: GrandContext;
  credit?: boolean;
}) {
  const [state, setState] = useState(start);
  return (
    <GrandManager
      context={ctx}
      value={state}
      credit={credit}
      onChange={(request) => {
        const next = changeGrand(normalizeGrandLoadout(state, ctx), ctx, request, true);
        if (next) setState(next);
      }}
    />
  );
}
function unlock(id: string) {
  fireEvent.change(screen.getByLabelText('New grand'), { target: { value: id } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock grand' }));
}
describe('earned bank and explicit replacements', () => {
  it('banks a third base option and requires the outgoing selection, then restores it for free', () => {
    render(<Harness />);
    unlock('kn_gk_basic_a');
    unlock('kn_gk_a1_a');
    unlock('kn_gk_a2_a');
    expect(screen.getByRole('status').textContent).toContain('2/4 equipped · 3 earned');
    const name = CHAR_UPGRADES.kn_gk_a2_a.name;
    expect(screen.getByRole<HTMLButtonElement>('button', { name: `Equip ${name}` }).disabled).toBe(
      true,
    );
    const outgoing = screen.getByRole('button', { name: `Next outgoing grand for ${name}` });
    fireEvent.click(outgoing);
    expect(screen.getByLabelText<HTMLSelectElement>(`Replace grand for ${name}`).value).toBe(
      'kn_gk_basic_a',
    );
    fireEvent.click(outgoing);
    expect(screen.getByText(new RegExp(`Remove ${CHAR_UPGRADES.kn_gk_a1_a.name}`))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `Equip ${name}` }));
    fireEvent.click(screen.getByRole('button', { name: `Unequip ${name}` }));
    fireEvent.click(screen.getByRole('button', { name: `Equip ${CHAR_UPGRADES.kn_gk_a1_a.name}` }));
    expect(screen.getByRole('status').textContent).toContain('2/4 equipped · 3 earned');
  });
  it('keeps the other class separate and disables stale/consumed unlock requests', () => {
    render(<Harness />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Unlock grand' }).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unlock grand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next grand option' }));
    const first = screen.getByLabelText<HTMLSelectElement>('New grand').value;
    fireEvent.click(screen.getByRole('button', { name: 'Next grand option' }));
    expect(screen.getByLabelText<HTMLSelectElement>('New grand').value).not.toBe(first);
    unlock('kn_gk_basic_a');
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'mage' } });
    expect(screen.getByRole('status').textContent).toContain('0/4 equipped · 0 earned');
    unlock('mg_gk_basic_a');
    fireEvent.click(screen.getByRole('button', { name: 'Next class' }));
    expect(screen.getByRole('status').textContent).toContain('1/4 equipped · 1 earned');
    expect(
      screen.queryByRole('option', { name: new RegExp(CHAR_UPGRADES.kn_gk_basic_a.name) }),
    ).toBeNull();
  });
  it('keeps earned graft choices visible when their source is not equipped', () => {
    const value: GrandLoadout = {
      version: 1,
      classes: { knight: { bank: ['hy_pyromancer_g_a'], equipped: [] } },
    };
    render(<Harness start={value} credit={false} />);
    expect(screen.getByText(/Requires its matching equipped skill/)).toBeTruthy();
    expect(screen.queryByLabelText('New grand')).toBeNull();
  });
  it('has a non-blocking fallback after every eligible option is earned', () => {
    const bank = Object.keys(CHAR_UPGRADES).filter((id) => grandEarnable(id, 'knight', context));
    render(<Harness start={{ version: 1, classes: { knight: { bank, equipped: [] } } }} />);
    expect(screen.getByText(/No eligible new grand yet/)).toBeTruthy();
  });
});

it('labels an authored individual-skill option separately from identity grands', () => {
  CHAR_UPGRADES.testGrand = {
    ...CHAR_UPGRADES.kn_champion_g_a,
    id: 'testGrand',
    subSkillId: 'kn_champion_slam',
  };
  try {
    render(<Harness />);
    expect(screen.getByRole('option', { name: /Subclass skill/ })).toBeTruthy();
    unlock('testGrand');
    expect(screen.getByRole('status').textContent).toContain('1/4 equipped');
  } finally {
    delete CHAR_UPGRADES.testGrand;
  }
});
