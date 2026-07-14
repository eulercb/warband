// @vitest-environment jsdom
/**
 * Component tests for the three presentational pause-flow overlays:
 *   - ui/PauseMenu       (shared pause dialog + actions + score board)
 *   - ui/ResumeCountdown (full-screen "resuming in N…" splash)
 *   - ui/TerrainLegend   (map-hazard legend, driven by the HUD store)
 *
 * The session module is mocked so no audio engine or networking is pulled in;
 * PauseMenu is the only component that imports from it (playUiSound, endRun,
 * openControls, leaveToMenu). Assertions use plain DOM/RTL queries because
 * @testing-library/jest-dom is not installed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Stub the whole session module: expose exactly the functions PauseMenu imports.
vi.mock('../src/ui/state/session', () => ({
  playUiSound: vi.fn(),
  endRun: vi.fn(),
  openControls: vi.fn(),
  leaveToMenu: vi.fn(),
}));

import PauseMenu from '../src/ui/game/PauseMenu';
import { ownedSkillRows } from '../src/ui/game/pauseSkills';
import ResumeCountdown from '../src/ui/game/ResumeCountdown';
import TerrainLegend from '../src/ui/game/TerrainLegend';
import { useStore } from '../src/ui/state/store';
import { useHudStore } from '../src/ui/state/hudStore';
import type { HudTeammate } from '../src/ui/state/hudStore';
import type { TerrainKind } from '../src/engine/core/types';
import { playUiSound, endRun, openControls, leaveToMenu } from '../src/ui/state/session';

/** Build a fully-typed HUD teammate, overriding only the interesting fields. */
function makeTeammate(over: Partial<HudTeammate> & { id: number }): HudTeammate {
  return {
    id: over.id,
    name: over.name ?? '',
    classId: over.classId ?? 'knight',
    hp: over.hp ?? 100,
    maxHp: over.maxHp ?? 100,
    state: over.state ?? 'alive',
    isLocal: over.isLocal ?? false,
    buffs: over.buffs ?? [],
    score: over.score ?? 0,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // PauseMenu wires up gamepad nav, which kicks off a requestAnimationFrame poll
  // loop. Stub rAF so the loop is inert + deterministic under jsdom (gamepad
  // polling itself is covered by tests/gamepadNav.test.ts).
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // App store: only the fields the pause menu reads.
  useStore.setState({ isHost: false, pausedBy: null, cycle: 0 });
  // HUD store: reset to documented defaults, then specs set what they need.
  useHudStore.getState().resetHud();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<ResumeCountdown>', () => {
  it('renders the label, count and "get ready" sub text', () => {
    render(<ResumeCountdown count={3} />);
    expect(screen.getByText('Resuming in')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Get ready…')).toBeTruthy();
  });

  it('is an assertive live status region for screen readers', () => {
    render(<ResumeCountdown count={5} />);
    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(status.getAttribute('aria-live')).toBe('assertive');
  });

  it('clamps a zero count up to 1', () => {
    render(<ResumeCountdown count={0} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('clamps a negative count up to 1', () => {
    render(<ResumeCountdown count={-4} />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('renders a larger count verbatim', () => {
    render(<ResumeCountdown count={12} />);
    expect(screen.getByText('12')).toBeTruthy();
  });
});

describe('<TerrainLegend>', () => {
  it('renders nothing when there is no terrain and no cover', () => {
    useHudStore.setState({ terrainKinds: [], hasObstacles: false });
    const { container } = render(<TerrainLegend />);
    expect(container.firstChild).toBeNull();
  });

  it('lists each present terrain kind with its label and effect', () => {
    useHudStore.setState({ terrainKinds: ['magma', 'ice'], hasObstacles: false });
    render(<TerrainLegend />);
    expect(screen.getByText('Map legend')).toBeTruthy();
    expect(screen.getByText('Magma')).toBeTruthy();
    expect(screen.getByText('Burns you and briefly slows — get out fast.')).toBeTruthy();
    expect(screen.getByText('Ice')).toBeTruthy();
    expect(screen.getByText('Slippery — strong slow, no damage.')).toBeTruthy();
    // Kinds not present this fight are not listed.
    expect(screen.queryByText('Swamp')).toBeNull();
  });

  it('appends the Cover entry when the arena has obstacles', () => {
    useHudStore.setState({ terrainKinds: ['swamp'], hasObstacles: true });
    render(<TerrainLegend />);
    expect(screen.getByText('Swamp')).toBeTruthy();
    expect(screen.getByText('Cover')).toBeTruthy();
    expect(
      screen.getByText('Solid rubble that blocks ranged attacks — hide behind it.'),
    ).toBeTruthy();
  });

  it('shows only the Cover entry when there is cover but no terrain', () => {
    useHudStore.setState({ terrainKinds: [], hasObstacles: true });
    const { container } = render(<TerrainLegend />);
    expect(screen.getByText('Map legend')).toBeTruthy();
    expect(screen.getByText('Cover')).toBeTruthy();
    expect(container.querySelectorAll('.wb-legend-row')).toHaveLength(1);
  });

  it('filters out a terrain kind that has no legend entry', () => {
    // An unrecognized kind is only reachable via a cast; it must be dropped
    // rather than rendered as a blank row.
    useHudStore.setState({
      terrainKinds: ['magma', 'mystery' as unknown as TerrainKind],
      hasObstacles: false,
    });
    const { container } = render(<TerrainLegend />);
    expect(screen.getByText('Magma')).toBeTruthy();
    expect(container.querySelectorAll('.wb-legend-row')).toHaveLength(1);
  });
});

describe('<PauseMenu>', () => {
  function renderMenu(onResume: () => void = vi.fn()) {
    return render(<PauseMenu onResume={onResume} />);
  }

  it('renders the paused dialog, default subtitle, score and core buttons', () => {
    useStore.setState({ isHost: false, pausedBy: null, cycle: 0 });
    useHudStore.setState({ score: 7 });
    renderMenu();

    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getByText(/The fight is frozen for everyone/)).toBeTruthy();
    expect(screen.getByText('Your run score')).toBeTruthy();
    expect(screen.getByText('★ 7')).toBeTruthy();

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Controls' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave to Menu' })).toBeTruthy();
    // Non-host: no End Run, and no cycle tag at cycle 0.
    expect(screen.queryByRole('button', { name: 'End Run' })).toBeNull();
    expect(screen.queryByText(/Cycle/)).toBeNull();
  });

  it('names who paused the fight when pausedBy is set', () => {
    useStore.setState({ pausedBy: 'Alice' });
    renderMenu();
    expect(screen.getByText(/Alice paused the fight/)).toBeTruthy();
    expect(screen.queryByText(/The fight is frozen for everyone/)).toBeNull();
  });

  it('shows the cycle tag only past the first cycle', () => {
    useStore.setState({ cycle: 2 });
    renderMenu();
    // cycle is 0-based; display is +1.
    expect(screen.getByText('Cycle 3')).toBeTruthy();
  });

  it('shows the End Run control only for the host', () => {
    useStore.setState({ isHost: true });
    renderMenu();
    expect(screen.getByRole('button', { name: 'End Run' })).toBeTruthy();
  });

  it('lists teammates highest score first and marks the local player', () => {
    useHudStore.setState({
      score: 0,
      teammates: [
        makeTeammate({ id: 1, name: 'Alice', score: 10, isLocal: false }),
        makeTeammate({ id: 2, name: 'Bob', score: 30, isLocal: true }),
      ],
    });
    const { container } = renderMenu();

    const names = Array.from(container.querySelectorAll('.wb-pause-score-name')).map(
      (el) => el.textContent,
    );
    expect(names).toEqual(['Bob (you)', 'Alice']);
    expect(screen.getByText('★ 30')).toBeTruthy();
    expect(screen.getByText('★ 10')).toBeTruthy();
  });

  it("falls back to 'Hero' for an unnamed teammate", () => {
    useHudStore.setState({
      score: 0,
      teammates: [
        makeTeammate({ id: 1, name: '', score: 5, isLocal: true }),
        makeTeammate({ id: 2, name: 'Zoe', score: 3, isLocal: false }),
      ],
    });
    renderMenu();
    expect(screen.getByText('Hero (you)')).toBeTruthy();
    expect(screen.getByText('Zoe')).toBeTruthy();
  });

  it('does not render a score list for a lone teammate', () => {
    useHudStore.setState({
      score: 0,
      teammates: [makeTeammate({ id: 1, name: 'Solo', score: 9, isLocal: true })],
    });
    const { container } = renderMenu();
    // The list (and therefore the teammate's name) only appears with 2+ players.
    expect(screen.queryByText('Solo')).toBeNull();
    expect(container.querySelectorAll('.wb-pause-score-list')).toHaveLength(0);
  });

  it('Resume: plays a UI click and calls the onResume prop', () => {
    const onResume = vi.fn();
    renderMenu(onResume);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('Controls: plays a UI click and opens the controls overlay', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(vi.mocked(openControls)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('End Run (host): plays a confirm sound and ends the run', () => {
    useStore.setState({ isHost: true });
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'End Run' }));
    expect(vi.mocked(endRun)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiConfirm');
  });

  it('Leave to Menu: plays a UI click and leaves to the menu', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Leave to Menu' }));
    expect(vi.mocked(leaveToMenu)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playUiSound)).toHaveBeenCalledWith('uiClick');
  });

  it('embeds the terrain legend, driven by the HUD store', () => {
    useHudStore.setState({ terrainKinds: ['ice'], hasObstacles: false });
    renderMenu();
    expect(screen.getByText('Map legend')).toBeTruthy();
    expect(screen.getByText('Ice')).toBeTruthy();
  });

  it('shows a character sheet with the active class, HP and resolved stat deltas', () => {
    useHudStore.setState({ classId: 'knight', hp: 120, maxHp: 240 });
    // Mighty = +15% damage; Bulwark = -15% damage taken.
    useStore.setState({ myUpgrades: ['mighty', 'bulwark'], myCharUpgrades: [] });
    renderMenu();
    expect(screen.getByText('Knight — 120/240 HP')).toBeTruthy();
    expect(screen.getByText('Damage')).toBeTruthy();
    expect(screen.getByText('+15%')).toBeTruthy(); // damage
    expect(screen.getByText('-15%')).toBeTruthy(); // damage taken
  });

  it('appends the regen + terrain-resist rows and marks a penalised stat "bad"', () => {
    useHudStore.setState({ classId: 'knight', hp: 100, maxHp: 200 });
    // Surefooted -> terrainResist > 0 (L48 row); Second Wind -> regenPerSec > 0 (L47
    // row); Glass Cannon -> +18% damage taken, a stat whose `good` is false so its
    // value carries the " bad" class (L58 alternate).
    useStore.setState({
      myUpgrades: ['surefooted'],
      myCharUpgrades: ['kn_secondwind', 'hy_glasscannon'],
    });
    const { container } = renderMenu();

    expect(screen.getByText('Regen')).toBeTruthy(); // L47 push
    expect(screen.getByText('Terrain resist')).toBeTruthy(); // L48 push
    expect(screen.getByText('+50%')).toBeTruthy(); // terrain resist value

    const bad = container.querySelector('.wb-pause-stat-val.bad');
    expect(bad).toBeTruthy();
    expect(bad?.textContent).toBe('+18%'); // Damage taken +18% -> good === false
  });

  it('omits the character sheet when no class is active', () => {
    useHudStore.setState({ classId: null });
    const { container } = renderMenu();
    expect(container.querySelector('.wb-pause-stats')).toBeNull();
  });

  it('a multiclass hero shows IDENTITY-class stats after a swap, matching the sim (#70)', () => {
    // Hero spawned as Knight, gained Mage via multiclass, then SWAPPED to the Mage
    // kit: `classId` (active) is now 'mage', but the sim keeps the hero's persistent
    // stats + maxHp bound to the Knight identity (`classes[0]`) — `setActiveClass`
    // never recomputes them. The sheet must follow that identity, not the wielded kit,
    // or it disagrees with the sim the instant you swap.
    useHudStore.setState({
      classId: 'mage', // active kit after the swap
      classes: ['knight', 'mage'], // spawn identity first, per buildMulticlass
      hp: 120,
      maxHp: 240, // Knight's identity-bound pool (a Mage's base is lower)
    });
    useStore.setState({ myUpgrades: ['mighty', 'bulwark'], myCharUpgrades: [] });
    renderMenu();
    // Reads the spawn identity (Knight) + the sim's HP — before the fix it recomputed
    // from the active class and rendered "Mage — …", drifting from the sim.
    expect(screen.getByText('Knight — 120/240 HP')).toBeTruthy();
    expect(screen.queryByText('Mage — 120/240 HP')).toBeNull();
    // Generic (class-agnostic) boons still resolve on the identity path.
    expect(screen.getByText('+15%')).toBeTruthy(); // Mighty: +15% damage
    expect(screen.getByText('-15%')).toBeTruthy(); // Bulwark: -15% damage taken
  });

  it('lists owned base + subclass skills with always-visible numeric lines (item 6)', () => {
    useHudStore.setState({
      classId: 'knight',
      hp: 200,
      maxHp: 240,
      // One knight sub-skill (shown) + one mage sub-skill (hidden for a knight).
      subSkills: ['kn_champion_slam', 'mg_evoker_lightning'],
      inputSource: 'keyboard',
    });
    useStore.setState({ myUpgrades: [], myCharUpgrades: [] });
    const { container } = renderMenu();

    expect(screen.getByText('Your skills')).toBeTruthy();
    expect(screen.getByText('Cleave')).toBeTruthy(); // a base slot
    expect(screen.getByText('💥 Earthshaker')).toBeTruthy(); // the knight sub-skill, icon + name

    // 4 base slots + only the active-class sub-skill (the mage one is filtered out).
    const rows = container.querySelectorAll('.wb-pause-skill');
    expect(rows).toHaveLength(5);
    // Each row carries a key badge and a concrete numeric line (not hover-only).
    expect(container.querySelectorAll('.wb-pause-skill-key')).toHaveLength(5);
    const slamLine = screen
      .getByText('💥 Earthshaker')
      .closest('.wb-pause-skill')
      ?.querySelector('.wb-pause-skill-line')?.textContent;
    expect(slamLine).toMatch(/cooldown/);
  });

  it('labels owned-skill rows with pad glyphs on a controller (item 6)', () => {
    useHudStore.setState({ classId: 'knight', subSkills: [], inputSource: 'gamepad' });
    useStore.setState({ myCharUpgrades: [] });
    const { container } = renderMenu();
    const keys = container.querySelectorAll('.wb-pause-skill-key');
    expect(keys).toHaveLength(4); // the 4 base slots
    expect(keys[0].textContent).toBeTruthy(); // a pad glyph, not the keyboard label
  });

  it('omits the owned-skills panel when no class is active (item 6)', () => {
    useHudStore.setState({ classId: null });
    const { container } = renderMenu();
    expect(container.querySelector('.wb-pause-skills')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// item 6 — the pure skill-row resolver behind the pause panel.
// ---------------------------------------------------------------------------
describe('ownedSkillRows (item 6)', () => {
  it('resolves base + both active-class sub slots with numeric lines, filtering other classes', () => {
    // Two knight sub-skills (fill sub1 AND sub2) plus a mage sub-skill (filtered out).
    const rows = ownedSkillRows(
      'knight',
      [],
      ['kn_champion_slam', 'kn_champion_charge', 'mg_evoker_lightning'],
    );
    expect(rows).toHaveLength(6); // 4 base + 2 knight subs; the mage sub is dropped
    expect(rows.slice(0, 4).map((r) => r.slot)).toEqual(['basic', 'a1', 'a2', 'a3']);
    expect(rows[0].name).toBe('Cleave');
    expect(rows[4]).toMatchObject({ slot: 'sub1', name: '💥 Earthshaker' });
    expect(rows[5].slot).toBe('sub2'); // the second equipped sub takes the sub2 slot
    for (const r of rows) {
      expect(r.line).toMatch(/cooldown/); // describeAbility always closes with a cooldown
      expect(r.line).not.toMatch(/NaN|undefined/);
    }
  });

  it('reflects the hero current upgrades in the numeric line', () => {
    const [before] = ownedSkillRows('knight', [], []);
    const [after] = ownedSkillRows('knight', ['kn_widecleave'], []);
    // Wide Cleave tunes the basic slot: bigger damage / reach / arc show through.
    expect(before.line).not.toBe(after.line);
    expect(after.line).toContain('27 dmg');
  });

  it('drops an unknown/dead sub-skill id without crashing', () => {
    const rows = ownedSkillRows('knight', [], ['not_a_real_skill']);
    expect(rows).toHaveLength(4); // only the base slots survive
  });
});
