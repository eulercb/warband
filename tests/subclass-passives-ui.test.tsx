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
import { OwnedSkills, CharacterSheet } from '../src/ui/game/PauseMenu';
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
  'dr_moon',
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

it('HUD and pause previews match the host after activating another class’s grand stat overlay', async () => {
  const { World } = await import('../src/engine/world/world');
  const { normalizeGrandLoadout } = await import('../src/engine/content/grandSelections');
  const { describeAbility } = await import('../src/engine/content/classes');
  const history = ['kn_grand_immovable', 'pa_grand_aegis'];
  const state = normalizeGrandLoadout(undefined, {
    classes: ['knight', 'paladin'],
    history,
    subSkills: [],
  });
  const w = new World({
    seed: 31,
    monsterId: 'lich',
    players: [
      {
        peerId: 'a',
        name: 'A',
        classId: 'knight',
        extraClasses: ['paladin'],
        charUpgrades: history,
        grandLoadout: state,
        upgrades: ['haste'],
      },
    ],
  });
  const p = w.players[0];
  w.setActiveClass(p, 'paladin');
  useStore.setState({
    localClass: 'knight',
    myCharUpgrades: history,
    myGrandLoadout: state,
    myUpgrades: ['haste'],
    mySubSkills: [],
  });
  useHudStore.setState({
    classId: 'paladin',
    classes: ['knight', 'paladin'],
    subSkills: [],
    hp: p.hp,
    maxHp: p.maxHp,
  });
  const { container } = render(
    <>
      <HUD />
      <CharacterSheet />
      <OwnedSkills />
    </>,
  );
  const expected = describeAbility(p.abilities!.a1, {
    damageMult: p.damageMult,
    cooldownMult: p.cooldownMult,
    castMult: p.castMult,
  });
  const tile = [...container.querySelectorAll('.hud-ability')].find(
    (element) => element.querySelector('.hud-ability-name')?.textContent === p.abilities!.a1.name,
  )!;
  expect(tile.getAttribute('title')).toContain(expected);
  expect(
    screen.getByRole('listitem', { name: `${p.abilities!.a1.name}: ${expected}` }),
  ).toBeTruthy();
  expect(container.querySelector('.wb-pause-stat-grid')?.textContent).toContain('-20%');
});
