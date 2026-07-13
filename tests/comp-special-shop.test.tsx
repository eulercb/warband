// @vitest-environment jsdom
/**
 * Warband — component tests for the two run-clear reward widgets:
 *   • src/ui/screens/SpecialReward.tsx — the tiered subclass / multiclass / grand pick.
 *   • src/ui/screens/EphemeralShop.tsx — the between-boss coin stall (item 21).
 *
 * The session control layer is mocked so rendering pulls in no audio/WebRTC; the
 * real Zustand store drives the tier logic and the coin economy. jest-dom is not
 * installed, so assertions use textContent / queries / toBeTruthy().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../src/ui/state/session', () => ({
  chooseSubSkill: vi.fn(),
  chooseExtraClass: vi.fn(),
  chooseCharUpgrade: vi.fn(),
  playUiSound: vi.fn(),
}));

// Spy on specialRewardStep but keep the real behaviour by default (so every other
// test drives the genuine store→step logic). One test overrides it to inject a
// skill2 step with an unresolvable subclass id and exercise SpecialReward's
// defensive `?? []` fallback (a corruption the real step function never yields).
vi.mock('../src/engine/content/subclasses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/engine/content/subclasses')>();
  return { ...actual, specialRewardStep: vi.fn(actual.specialRewardStep) };
});

import SpecialReward from '../src/ui/screens/SpecialReward';
import EphemeralShop from '../src/ui/screens/EphemeralShop';
import { useStore } from '../src/ui/state/store';
import type { AppState } from '../src/ui/state/store';
import {
  chooseSubSkill,
  chooseExtraClass,
  chooseCharUpgrade,
  playUiSound,
} from '../src/ui/state/session';
import { subclassesFor, specialRewardStep } from '../src/engine/content/subclasses';
import { offerableGrands } from '../src/engine/content/charUpgrades';
import { EPHEMERAL } from '../src/engine/content/ephemeral';

const initial: AppState = { ...useStore.getState() };

beforeEach(() => {
  useStore.setState({ ...initial, localClass: 'knight' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SpecialReward — tiered run-clear pick', () => {
  it('tier 0: choose a subclass, then a skill relays to the host', () => {
    render(<SpecialReward />);
    // First view: subclass cards.
    const subs = subclassesFor('knight');
    expect(screen.getByText(subs[0].name)).toBeTruthy();
    fireEvent.click(screen.getByText(subs[0].name));
    // Now the chosen subclass's skills are offered; pick the first.
    const skill = subs[0].skills[0];
    fireEvent.click(screen.getByText(`${skill.icon} ${skill.name}`));
    expect(chooseSubSkill).toHaveBeenCalledWith(subs[0].id, skill.id);
    // The widget collapses to a "claimed" confirmation.
    expect(screen.getByRole('status').textContent).toContain(skill.name);
  });

  it('tier 1: offers a second skill of the committed subclass', () => {
    const sub = subclassesFor('knight')[0];
    useStore.setState({ mySubclassId: sub.id, mySubSkills: [sub.skills[0].id] });
    render(<SpecialReward />);
    const second = sub.skills[1];
    fireEvent.click(screen.getByText(`${second.icon} ${second.name}`));
    expect(chooseSubSkill).toHaveBeenCalledWith(sub.id, second.id);
  });

  it('tier 2: offers an extra class (multiclass) that relays on pick', () => {
    const sub = subclassesFor('knight')[0];
    useStore.setState({ mySubclassId: sub.id, mySubSkills: [sub.skills[0].id, sub.skills[1].id] });
    render(<SpecialReward />);
    // A "+ <Class>" option appears; click the first one.
    const addBtn = screen.getAllByText(/^\+ /)[0];
    fireEvent.click(addBtn);
    expect(chooseExtraClass).toHaveBeenCalled();
  });

  it('tier 2: a grand improvement relays a character upgrade', () => {
    const sub = subclassesFor('knight')[0];
    useStore.setState({ mySubclassId: sub.id, mySubSkills: [sub.skills[0].id, sub.skills[1].id] });
    render(<SpecialReward />);
    const grand = screen.queryAllByText(/^★ /)[0];
    if (grand) {
      fireEvent.click(grand);
      expect(chooseCharUpgrade).toHaveBeenCalled();
    } else {
      expect(chooseCharUpgrade).not.toHaveBeenCalled();
    }
  });

  it('tier 2: surfaces skill + subclass grands once a subclass is committed (items 17/19)', () => {
    const sub = subclassesFor('knight')[0]; // Champion
    // A committed subclass + an already-owned grand: the owned grand rotates the
    // display window (exercising the rotation path) and gates itself out at cap.
    useStore.setState({
      mySubclassId: sub.id,
      mySubSkills: [sub.skills[0].id, sub.skills[1].id],
      myCharUpgrades: ['kn_grand_immovable'],
    });
    render(<SpecialReward />);
    // Base-skill grands + the Champion subclass grands are now offerable, so at least
    // one grand card renders; clicking it relays a character upgrade.
    const grands = screen.getAllByText(/^★ /);
    expect(grands.length).toBeGreaterThan(0);
    fireEvent.click(grands[0]);
    expect(chooseCharUpgrade).toHaveBeenCalled();
  });

  it('ignores an unrecognised sub skill and falls back to offering a subclass', () => {
    // A bogus skill id counts toward no class (subclassOfSkill → undefined), so the
    // hero is treated as sub-less and the panel offers a subclass choice (item 15).
    useStore.setState({ mySubclassId: 'ghost_subclass', mySubSkills: ['ghost_skill'] });
    render(<SpecialReward />);

    expect(screen.getByRole('group', { name: 'Choose a subclass' })).toBeTruthy();
    const subs = subclassesFor('knight');
    expect(screen.getByText(subs[0].name)).toBeTruthy();
    expect(chooseSubSkill).not.toHaveBeenCalled();
  });

  it('subclass step for an EXTRA class tags the title with that class name (L67 false side)', () => {
    // Primary class complete (2 knight skills), an owned extra class (mage) with no
    // subclass yet → the step is a SUBCLASS pick FOR mage, so forClass !== localClass.
    const champ = subclassesFor('knight')[0];
    useStore.setState({
      mySubSkills: [champ.skills[0].id, champ.skills[1].id],
      myExtraClasses: ['mage'],
    });
    render(<SpecialReward />);

    expect(screen.getByRole('group', { name: 'Choose a subclass' })).toBeTruthy();
    // The `(Mage)` suffix only renders on the false side of forClass === localClass.
    expect(screen.getByText(/Choose a subclass \(Mage\)/)).toBeTruthy();
    expect(screen.getByText(subclassesFor('mage')[0].name)).toBeTruthy();
  });

  it('second-skill step for an EXTRA class tags the title with that class name (L118 false side)', () => {
    // Knight complete; mage owns exactly one of its subclass skills → a skill2 step
    // FOR mage, so step.classId !== localClass and the `(Mage)` suffix shows.
    const champ = subclassesFor('knight')[0];
    const evoker = subclassesFor('mage')[0];
    useStore.setState({
      mySubSkills: [champ.skills[0].id, champ.skills[1].id, evoker.skills[0].id],
      myExtraClasses: ['mage'],
    });
    render(<SpecialReward />);

    expect(screen.getByRole('group', { name: 'Choose a second subclass skill' })).toBeTruthy();
    expect(screen.getByText(/pick a second skill \(Mage\)/)).toBeTruthy();
  });

  it('classOrGrand shows the whole grand pool directly when it fits (L167 false, L163 non-grand else)', () => {
    // Knight complete → classOrGrand. Owning all ten knight base+class grands leaves
    // only the two Champion subclass grands offerable — a pool of 2 (≤ GRAND_SHOWN),
    // so the rotating window is NOT used (L167 false side). The lone non-grand boon
    // (kn_bulwark) drives the owned-grand reducer's `… ? n + 1 : n` else side (L163).
    const mySubSkills = ['kn_champion_slam', 'kn_champion_charge'];
    const myCharUpgrades = [
      'kn_grand_immovable',
      'kn_grand_wrath',
      'kn_gk_basic_a',
      'kn_gk_basic_b',
      'kn_gk_a1_a',
      'kn_gk_a1_b',
      'kn_gk_a2_a',
      'kn_gk_a2_b',
      'kn_gk_a3_a',
      'kn_gk_a3_b',
      'kn_bulwark',
    ];
    useStore.setState({ mySubSkills, myCharUpgrades });
    render(<SpecialReward />);

    const expected = offerableGrands('knight', myCharUpgrades, mySubSkills);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThanOrEqual(4); // precondition: no rotation window
    // Every offerable grand renders (a ★ card) — the count matches the pool exactly.
    expect(screen.getAllByText(/^★ /).length).toBe(expected.length);
  });

  it('survives a skill2 step whose subclass id resolves to nothing (defensive `?? []`, L117)', () => {
    // The real specialRewardStep never yields an unresolvable subclassId, so inject
    // one: getSubclass() then returns undefined and `sub?.skills… ?? []` must hold,
    // rendering the panel with no skill cards rather than throwing.
    const spy = vi.mocked(specialRewardStep);
    const original = spy.getMockImplementation();
    spy.mockReturnValue({ kind: 'skill2', classId: 'knight', subclassId: 'ghost_subclass' });
    try {
      render(<SpecialReward />);
      expect(screen.getByRole('group', { name: 'Choose a second subclass skill' })).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
    } finally {
      spy.mockImplementation(original!);
    }
  });
});

describe('EphemeralShop — coin stall (item 21)', () => {
  it('shows the coin balance and one card per non-hardcore perk', () => {
    useStore.setState({ myCoins: 12, activeHardcore: false });
    const { container } = render(<EphemeralShop />);
    expect(screen.getByText(/💰 12/)).toBeTruthy();
    // The hardcore-only Second Chance is hidden outside a hardcore run.
    expect(screen.queryByText(EPHEMERAL.retry.name)).toBeNull();
    expect(screen.getByText(EPHEMERAL.potion.name)).toBeTruthy();
    expect(container.querySelectorAll('.wb-shop-card').length).toBe(5);
  });

  it('buying an affordable perk deducts coins and stocks it', () => {
    useStore.setState({ myCoins: 10, myEphemeral: {} });
    render(<EphemeralShop />);
    fireEvent.click(screen.getByText(EPHEMERAL.potion.name));
    expect(useStore.getState().myCoins).toBe(10 - EPHEMERAL.potion.cost);
    expect(useStore.getState().myEphemeral.potions).toBe(1);
  });

  it('an unaffordable perk is disabled and cannot be bought', () => {
    useStore.setState({ myCoins: 1, myEphemeral: {} });
    render(<EphemeralShop />);
    const card = screen.getByText(EPHEMERAL.revive.name).closest('button')!;
    expect(card.disabled).toBe(true);
    fireEvent.click(card);
    expect(useStore.getState().myCoins).toBe(1);
  });

  it('surfaces the hardcore Second Chance inside a hardcore run', () => {
    useStore.setState({ myCoins: 20, activeHardcore: true });
    render(<EphemeralShop />);
    expect(screen.getByText(EPHEMERAL.retry.name)).toBeTruthy();
  });

  it('marks already-owned single-shot passives as Ready (×1) and disables re-buying', () => {
    // owned() returns 1 for each banked passive → the card is `owned`/maxed:
    // disabled, its cost reads "Ready", and an "×1" count shows next to the name.
    useStore.setState({
      myCoins: 20,
      activeHardcore: false,
      myEphemeral: { speed: true, damage: true, defense: true },
    });
    const { container } = render(<EphemeralShop />);

    const ownedCards = container.querySelectorAll('.wb-shop-card.owned');
    expect(ownedCards.length).toBe(3); // speed, damage, defence
    ownedCards.forEach((card) => {
      expect((card as HTMLButtonElement).disabled).toBe(true);
      expect(card.querySelector('.wb-shop-cost')?.textContent).toBe('Ready');
      expect(card.querySelector('.wb-shop-have')?.textContent).toContain('×1');
    });
  });

  it('plays the soft click cue (not the confirm) when the store declines a purchase', () => {
    // A well-funded hero (card enabled) but a store that rejects the buy — e.g.
    // the host validated it away — takes the else-branch of onBuy: uiClick, not
    // uiConfirm, and no coins move.
    useStore.setState({
      myCoins: 99,
      activeHardcore: false,
      myEphemeral: {},
      buyEphemeral: () => false,
    });
    render(<EphemeralShop />);

    const card = screen.getByText(EPHEMERAL.potion.name).closest('button');
    if (!card) throw new Error('potion card not found');
    expect(card.disabled).toBe(false); // affordable + not maxed → clickable
    fireEvent.click(card);

    expect(playUiSound).toHaveBeenCalledWith('uiClick');
    expect(playUiSound).not.toHaveBeenCalledWith('uiConfirm');
    expect(useStore.getState().myCoins).toBe(99); // the stubbed buy moved nothing
  });
});
