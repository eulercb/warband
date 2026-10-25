// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { GrandManager } from '../src/ui/game/GrandManager';
import {
  changeGrand,
  normalizeGrandLoadout,
  grandEarnable,
  grandCategory,
  type GrandLoadout,
  type GrandContext,
} from '../src/engine/content/grandSelections';
import type { ClassId } from '../src/engine/core/types';
import { CHAR_UPGRADES, canonicalGrandId } from '../src/engine/content/charUpgrades';
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

function openDisclosure(text: string | RegExp) {
  const details = screen.getByText(text).closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
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
    fireEvent.change(screen.getByLabelText('New grand'), { target: { value: 'kn_gk_a2_a' } });
    openDisclosure('Selected grand details & preview');
    expect(screen.getByText(/Unlocking this keeps your current build unchanged/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock grand' }));
    expect(screen.getByRole('status').textContent).toContain('2/4 equipped · 3 earned');
    const name = CHAR_UPGRADES.kn_gk_a2_a.name;
    openDisclosure(/^Earned bank/);
    openDisclosure(new RegExp(`${name} · Banked`));
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
    expect(screen.getByLabelText(`Replacement preview for ${name}`).textContent).toContain('Now →');
    fireEvent.click(screen.getByRole('button', { name: `Equip ${name}` }));
    openDisclosure(new RegExp(`${name} · Equipped`));
    fireEvent.click(screen.getByRole('button', { name: `Unequip ${name}` }));
    openDisclosure(new RegExp(`${CHAR_UPGRADES.kn_gk_a1_a.name} · Banked`));
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
    openDisclosure(/^Earned bank/);
    openDisclosure(/Living Cataclysm · Banked/);
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

it('keeps overview and bank compact until explicitly inspected, across rerenders and remounts', () => {
  const start: GrandLoadout = {
    version: 1,
    classes: {
      knight: {
        bank: ['kn_gk_basic_a', 'kn_gk_a1_a', 'kn_gk_a2_a'],
        equipped: ['kn_gk_basic_a', 'kn_gk_a1_a'],
      },
    },
  };
  const { rerender, unmount } = render(<Harness start={start} credit={false} />);
  expect(screen.getByLabelText('Equipped grand slots').textContent).toContain(
    'Starting skills · 2/2',
  );
  expect(screen.queryByText(CHAR_UPGRADES.kn_gk_basic_a.desc)).toBeNull();
  expect(screen.queryByText(new RegExp(`${CHAR_UPGRADES.kn_gk_a2_a.name} · Banked`))).toBeNull();
  openDisclosure(/^Earned bank/);
  openDisclosure(new RegExp(`${CHAR_UPGRADES.kn_gk_a2_a.name} · Banked`));
  rerender(<Harness start={start} credit={false} />);
  expect(screen.getByLabelText(`Replace grand for ${CHAR_UPGRADES.kn_gk_a2_a.name}`)).toBeTruthy();
  unmount();
  render(<Harness start={start} credit={false} />);
  expect(screen.queryByLabelText(`Replace grand for ${CHAR_UPGRADES.kn_gk_a2_a.name}`)).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('2/4 equipped · 3 earned');
});

it.each(
  Object.values(CHAR_UPGRADES).filter(
    (d) =>
      grandCategory(d.id) === 'legacy' && canonicalGrandId(d.id) === d.id && d.classId !== 'any',
  ),
)('keeps transitional kit $id inspectable and freely bankable in the identity slot', (d) => {
  const ctx: GrandContext = { classes: [d.classId as ClassId], history: [], subSkills: [] };
  const start: GrandLoadout = {
    version: 1,
    classes: { [d.classId]: { bank: [d.id], equipped: [d.id] } },
  };
  render(<Harness start={start} ctx={ctx} credit={false} />);
  expect(screen.getByLabelText('Equipped grand slots').textContent).toContain('Identity · 1/1');
  const summary = screen.getByText(
    new RegExp(`${d.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · Equipped`),
  );
  expect(summary.tabIndex).toBe(0);
  openDisclosure(summary.textContent);
  fireEvent.click(screen.getByRole('button', { name: `Unequip ${d.name}` }));
  expect(screen.getByRole('status').textContent).toContain('0/4 equipped · 1 earned');
  openDisclosure(/^Earned bank/);
  expect(screen.getByText(new RegExp(' · Banked$'))).toBeTruthy();
});

it('explains an empty bank without hiding equipped selections or changing the saved build', () => {
  const onChange = vi.fn();
  render(
    <GrandManager
      context={context}
      value={{
        version: 1,
        classes: { knight: { bank: ['kn_gk_basic_a'], equipped: ['kn_gk_basic_a'] } },
      }}
      credit={false}
      onChange={onChange}
    />,
  );
  openDisclosure(/^Earned bank/);
  expect(screen.getByText(/No unequipped grands/)).toBeTruthy();
  expect(screen.getByLabelText('Equipped grand slots').textContent).toContain(
    CHAR_UPGRADES.kn_gk_basic_a.name,
  );
  expect(onChange).not.toHaveBeenCalled();
  const details = screen.getByText(/^Earned bank/).closest('details')!;
  details.open = false;
  fireEvent(details, new Event('toggle'));
  expect(screen.queryByText(/No unequipped grands/)).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('1/4 equipped · 1 earned');
});

it('returns to an owned class when the browsed class is removed and prevents a stale unlock', () => {
  const onChange = vi.fn();
  const { rerender } = render(<GrandManager context={context} credit={true} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'mage' } });
  fireEvent.change(screen.getByLabelText('New grand'), { target: { value: 'mg_gk_basic_a' } });
  openDisclosure('Selected grand details & preview');
  expect(screen.getByText(/Now →/)).toBeTruthy();
  rerender(
    <GrandManager
      context={{ ...context, classes: ['knight'] }}
      credit={true}
      onChange={onChange}
    />,
  );
  expect(screen.getByLabelText<HTMLSelectElement>('Class').value).toBe('knight');
  expect(screen.getByLabelText<HTMLSelectElement>('New grand').value).toBe('');
  expect(screen.queryByText('Selected grand details & preview')).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Next class' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Unlock grand' }));
  expect(onChange).not.toHaveBeenCalled();
});
