/**
 * Warband — tiny separate store for HUD data, updated ~15Hz from the render
 * loop. Kept apart from the main app store so the hot game loop never triggers
 * React re-renders of menus/lobby.
 */
import { create } from 'zustand';
import type {
  ClassId,
  PlayerState,
  Cooldowns,
  TerrainKind,
  BuffView,
  AffixId,
} from '../../engine/core/types';
import type { InputSource } from '../../input/input';

export interface HudTeammate {
  id: number;
  name: string;
  classId: ClassId;
  hp: number;
  maxHp: number;
  state: PlayerState;
  isLocal: boolean;
  buffs: BuffView[];
  score: number;
}

/** One boss health bar (twin encounters stack several). */
export interface HudBoss {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  phase: 'normal' | 'enraged';
  buffs: BuffView[];
  /** Endless "type" prefix ("Frost"), or '' if none. */
  modName: string;
  /** Affixes on this boss (Vampiric, Frenzied…), for the name chips. */
  affixes: AffixId[];
}

/**
 * A transient center-screen corruption announcement. `seq` increments per beat so
 * the banner component re-triggers its show/fade even for a repeated beat name.
 */
export interface HudBanner {
  text: string;
  good: boolean;
  seq: number;
}

export interface HudState {
  active: boolean;
  classId: ClassId | null;
  hp: number;
  maxHp: number;
  state: PlayerState;
  /** Remaining cooldown seconds per slot (0 = ready; sub1/sub2 present when bound). */
  cooldowns: Cooldowns;
  /** Bound subclass-skill ids (drives the sub1/sub2 HUD buttons). */
  subSkills: string[];
  /** Owned classes for a multiclass hero (drives the swap indicator). */
  classes: ClassId[];
  /** Healing vials carried this fight (item 21) — drives the item-button pip. */
  potions: number;
  /** Whether the local player is currently casting (rooted). */
  casting: boolean;
  /** Which device the local player last used (drives HUD button labels). */
  inputSource: InputSource;

  /** Active buffs/debuffs on the local hero, and the local hero's live score. */
  buffs: BuffView[];
  score: number;

  /** Every boss in the arena (twin encounters show one bar each). */
  bosses: HudBoss[];

  /**
   * Hardcore kill-deadline countdown (item 11): seconds left before the fight is
   * lost on the clock, or `null` outside a hardcore fight (no timer shown).
   */
  deadlineRemaining: number | null;

  /** Latest mid-fight corruption beat to announce, or null. Set per-frame by the
   * render loop (not the throttled bridge) so a one-frame beat is never dropped. */
  banner: HudBanner | null;

  teammates: HudTeammate[];

  /** Distinct terrain hazard kinds present this fight (for the pause legend). */
  terrainKinds: TerrainKind[];
  /** Whether the arena has cover obstacles this fight (for the pause legend). */
  hasObstacles: boolean;

  /** 0..1 while being revived (downed local player). */
  reviveProgress: number;
  downedTimer: number;

  set: (patch: Partial<HudState>) => void;
  resetHud: () => void;
}

const INITIAL: Omit<HudState, 'set' | 'resetHud'> = {
  active: false,
  classId: null,
  hp: 0,
  maxHp: 1,
  state: 'alive',
  cooldowns: { basic: 0, a1: 0, a2: 0, a3: 0 },
  subSkills: [],
  classes: [],
  potions: 0,
  casting: false,
  inputSource: 'keyboard',
  buffs: [],
  score: 0,
  bosses: [],
  deadlineRemaining: null,
  banner: null,
  teammates: [],
  terrainKinds: [],
  hasObstacles: false,
  reviveProgress: 0,
  downedTimer: 0,
};

export const useHudStore = create<HudState>((set) => ({
  ...INITIAL,
  set: (patch) => set(patch),
  resetHud: () => set({ ...INITIAL }),
}));

/** Non-reactive setter for the render loop (avoids hook subscription cost). */
export const hudSet = (patch: Partial<HudState>): void => useHudStore.getState().set(patch);
