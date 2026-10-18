import { getSubclass } from '../src/engine/content/subclasses';
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
vi.mock('../src/ui/state/session', () => ({
  playUiSound: vi.fn(),
  chooseSubSkill: vi.fn(),
  chooseExtraClass: vi.fn(),
  chooseCharUpgrade: vi.fn(),
  requestPause: vi.fn(),
  endRun: vi.fn(),
  leaveToMenu: vi.fn(),
  openControls: vi.fn(),
}));
vi.mock('../src/input/useGamepadMenu', () => ({ useGamepadMenu: vi.fn() }));
import HUD from '../src/ui/game/HUD';
import { OwnedSkills } from '../src/ui/game/PauseMenu';
import SpecialReward from '../src/ui/screens/SpecialReward';
import { LoadoutEditor } from '../src/ui/screens/LoadoutEditor';
import { useStore, EMPTY_SF_LOADOUT } from '../src/ui/state/store';
import { useHudStore } from '../src/ui/state/hudStore';
import { chooseSubSkill } from '../src/ui/state/session';

const initial = useStore.getState();
beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({
    ...initial,
    localClass: 'rogue',
    isHost: true,
    gauntlet: false,
    sfLoadout: EMPTY_SF_LOADOUT,
    sfLoadoutOpen: true,
  });
  useHudStore.getState().resetHud();
  useHudStore.setState({
    classId: 'rogue',
    classes: ['rogue'],
    subSkills: ['ro_trickster_shield'],
  });
});
afterEach(cleanup);
it('explains the passive before committing a subclass, without changing the skill selection', () => {
  render(<SpecialReward />);
  expect(screen.getByText(/Passive · Spellblade/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Arcane Trickster/ }));
  fireEvent.click(screen.getByRole('button', { name: /Shield Spell/ }));
  expect(chooseSubSkill).toHaveBeenCalledWith('ro_trickster', 'ro_trickster_shield');
});
it('explains the automatic grant in the loadout editor without a new selectable slot', () => {
  render(<LoadoutEditor />);
  expect(screen.getByText(/Spellblade · passive with any Arcane Trickster skill/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Shield Spell/ }));
  expect(useStore.getState().sfLoadout.subSkills).toEqual(['ro_trickster_shield']);
});
it('keeps combat compact and provides the full passive explanation in pause', () => {
  const view = render(<HUD />);
  expect(screen.getByLabelText('Subclass passive: Spellblade').textContent).toBe('✨');
  view.unmount();
  render(<OwnedSkills />);
  expect(screen.getByLabelText('Subclass passive: Spellblade').textContent).toContain(
    'next connecting melee hit',
  );
});

it.each([
  'bb_berserker',
  'bb_totem',
  'mo_openhand',
  'mo_shadow',
  'rg_hunter',
  'rg_beastmaster',
  'dr_land',
  'kn_champion',
  'kn_battlemaster',
  'cl_light',
  'cl_life',
  'pa_devotion',
  'pa_vengeance',
  'mg_evoker',
  'mg_abjurer',
  'so_draconic',
  'so_wild',
  'ba_valor',
  'ba_whispers',
])('surfaces the full %s passive in pause while keeping combat compact', (id) => {
  const sub = getSubclass(id)!;
  useStore.setState({ localClass: sub.classId });
  useHudStore.setState({
    classId: sub.classId,
    classes: [sub.classId],
    subSkills: [sub.skills[0].id],
  });
  const view = render(<HUD />);
  expect(screen.getByLabelText(`Subclass passive: ${sub.passive!.name}`).textContent).toBe(
    sub.passive!.icon,
  );
  view.unmount();
  render(<OwnedSkills />);
  expect(screen.getByLabelText(`Subclass passive: ${sub.passive!.name}`).textContent).toContain(
    sub.passive!.desc,
  );
});
