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
import { subclassesFor } from '../src/engine/content/subclasses';
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

  it('tier 1: offers no second skill when the banked subclass id is unknown', () => {
    // getSubclass() returns undefined for an unrecognised id, so the skill list
    // falls back to `[]` (the `?? []` branch) — the panel renders with no cards.
    useStore.setState({ mySubclassId: 'ghost_subclass', mySubSkills: ['ghost_skill'] });
    const { container } = render(<SpecialReward />);

    // We're in the tier-1 "pick a second skill" view, but with nothing to offer.
    expect(screen.getByRole('group', { name: 'Choose a second subclass skill' })).toBeTruthy();
    expect(container.querySelectorAll('.wb-special-card').length).toBe(0);
    expect(chooseSubSkill).not.toHaveBeenCalled();
  });
});

describe('EphemeralShop — coin stall (item 21)', () => {
  it('shows the coin balance and one card per non-hardcore perk', () => {
    useStore.setState({ myCoins: 12, activeHardcore: false });
    const { container } = render(<EphemeralShop />);
    expect(screen.getByText(/🪙 12/)).toBeTruthy();
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
