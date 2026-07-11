import { describe, it, expect } from 'vitest';
import {
  RewardScene,
  CLAIM_DWELL_S,
  DESCENT_DWELL_S,
  type RewardOffers,
} from '../src/ui/state/rewardScene';
import { ARENA_W, ARENA_H } from '../src/engine/core/constants';
import type { InputCommand, RenderState, Vec2 } from '../src/engine/core/types';

/** The hero spawns lower-centre; every interactable must render on the same
 * torus tile as the spawn (within half an arena), or nearest-copy flips it. */
const SPAWN: Vec2 = { x: ARENA_W / 2, y: ARENA_H - 220 };

/** Build an InputCommand, overriding only the fields a test cares about. */
function inp(over: Partial<InputCommand> = {}): InputCommand {
  return {
    seq: 0,
    move: { x: 0, y: 0 },
    aim: { x: 0, y: -1 },
    buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
    ...over,
  };
}

/** Two generic + two class offers with throwaway ids/labels. */
function offers(): RewardOffers {
  return {
    generic: [
      { id: 'g1', label: '⚡ Swift', desc: 'faster' },
      { id: 'g2', label: '🛡 Tanky', desc: 'tankier' },
    ],
    char: [
      { id: 'c1', label: '🔥 Fireball', desc: 'boom' },
      { id: 'c2', label: '❄ Frost', desc: 'chill' },
    ],
  };
}

function heroPos(state: RenderState): Vec2 {
  const id = state.localPlayerId;
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error('no local hero');
  return p.pos;
}

/**
 * Walk the hero onto `target` and hold there long enough to clear the claim
 * dwell. Drives the scene with real frames (50ms apart) exactly like the app's
 * render loop, computing a fresh move vector toward the target each frame.
 */
function walkOnto(
  scene: RewardScene,
  target: Vec2,
  startMs: number,
  holdS = CLAIM_DWELL_S + 0.15,
): number {
  let now = startMs;
  let state = scene.frame(now);
  let held = 0;
  for (let i = 0; i < 400; i++) {
    const hp = heroPos(state);
    const dx = target.x - hp.x;
    const dy = target.y - hp.y;
    const d = Math.hypot(dx, dy);
    if (d <= 20) {
      scene.setInput(inp({ move: { x: 0, y: 0 } }));
      held += 0.05;
    } else {
      scene.setInput(inp({ move: { x: dx / d, y: dy / d } }));
      held = 0;
    }
    now += 50;
    state = scene.frame(now);
    if (held >= holdS) break;
  }
  return now;
}

describe('RewardScene: construction', () => {
  it('builds a heroes-only reward world with no boss, hazards or totems', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const s = scene.frame(1000);
    expect(s.players).toHaveLength(1);
    expect(s.bosses).toHaveLength(0);
    expect(s.terrain).toHaveLength(0);
    expect(s.obstacles).toHaveLength(0);
    expect(s.totems).toBeUndefined();
  });

  it('lays relics on the floor (one per offer) and a sealed vortex', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const s = scene.frame(1000);
    expect(s.loot).toHaveLength(4); // 2 generic + 2 char
    const generic = (s.loot ?? []).filter((l) => l.kind === 'generic');
    const chars = (s.loot ?? []).filter((l) => l.kind === 'char');
    expect(generic).toHaveLength(2);
    expect(chars).toHaveLength(2);
    // Vortex present but not yet open (nothing claimed).
    expect(s.vortex).not.toBeNull();
    expect(s.vortex?.open).toBe(false);
    expect(s.vortex?.charge).toBeLessThan(1);
    expect(scene.vortexOpen()).toBe(false);
  });

  it('keeps every relic + the vortex on the spawn tile (no torus wrap flip)', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const s = scene.frame(1000);
    // Anything more than half an arena from the spawn would nearest-copy flip to
    // the far edge and render the room inside-out.
    for (const l of s.loot ?? []) {
      expect(Math.abs(SPAWN.x - l.pos.x)).toBeLessThan(ARENA_W / 2);
      expect(Math.abs(SPAWN.y - l.pos.y)).toBeLessThan(ARENA_H / 2);
    }
    expect(Math.abs(SPAWN.x - s.vortex!.pos.x)).toBeLessThan(ARENA_W / 2);
    expect(Math.abs(SPAWN.y - s.vortex!.pos.y)).toBeLessThan(ARENA_H / 2);
  });

  it('never finishes: the sim keeps stepping', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    scene.frame(1000);
    const a = scene.frame(1200); // +0.2s => 4 ticks
    const b = scene.frame(1400);
    expect(b.tick).toBeGreaterThan(a.tick);
  });
});

describe('RewardScene: claiming relics', () => {
  it('claims the relic the hero dwells on and reports it once', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const first = scene.frame(1000);
    const relic = (first.loot ?? []).find((l) => l.kind === 'generic');
    expect(relic).toBeDefined();

    walkOnto(scene, relic!.pos, 1000);
    const claims = scene.takeClaims();
    expect(claims).toHaveLength(1);
    expect(claims[0].kind).toBe('generic');
    // The relic view carries the offer's label; the claim carries the full offer.
    expect(claims[0].offer.label).toBe(relic!.label);
    expect(['g1', 'g2']).toContain(claims[0].offer.id);

    // Draining is exactly-once: no phantom re-claim on a later frame.
    scene.frame(9000);
    expect(scene.takeClaims()).toHaveLength(0);
  });

  it('locks the other relics of the same kind after a claim (one boon per kind)', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const first = scene.frame(1000);
    const relic = (first.loot ?? []).find((l) => l.kind === 'generic')!;
    const now = walkOnto(scene, relic.pos, 1000);

    const s = scene.frame(now + 50);
    const generics = (s.loot ?? []).filter((l) => l.kind === 'generic');
    const claimed = generics.filter((l) => l.claimed);
    const locked = generics.filter((l) => l.locked);
    expect(claimed).toHaveLength(1);
    expect(locked).toHaveLength(1); // the other generic is now locked
    expect(claimed[0].label).toBe(relic.label);
    // The class relics are untouched.
    expect((s.loot ?? []).filter((l) => l.kind === 'char' && (l.claimed || l.locked))).toHaveLength(
      0,
    );
    expect(scene.progress().claimedGeneric).toBe(1);
    expect(scene.progress().allClaimed).toBe(false);
  });

  it('does NOT claim from a brief pass-through (dwell not met)', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const first = scene.frame(1000);
    const relic = (first.loot ?? []).find((l) => l.kind === 'generic')!;
    // Move onto the relic then immediately off, never dwelling the full time.
    let now = 1000;
    scene.setInput(inp({ move: { x: 0, y: 0 } }));
    // Nudge toward the relic for a single short frame, well under the dwell.
    const hp = heroPos(first);
    const dir = { x: relic.pos.x - hp.x, y: relic.pos.y - hp.y };
    const mag = Math.hypot(dir.x, dir.y);
    scene.setInput(inp({ move: { x: dir.x / mag, y: dir.y / mag } }));
    now += 100; // 0.1s << CLAIM_DWELL_S
    scene.frame(now);
    expect(scene.takeClaims()).toHaveLength(0);
    expect(scene.progress().claimedGeneric).toBe(0);
  });
});

describe('RewardScene: vortex gating + descent', () => {
  it('opens the vortex only after both a generic AND a class boon are claimed', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    let s = scene.frame(1000);
    const gen = (s.loot ?? []).find((l) => l.kind === 'generic')!;
    const chr = (s.loot ?? []).find((l) => l.kind === 'char')!;

    let now = walkOnto(scene, gen.pos, 1000);
    expect(scene.vortexOpen()).toBe(false); // only generic so far

    now = walkOnto(scene, chr.pos, now + 50);
    expect(scene.vortexOpen()).toBe(true);
    s = scene.frame(now + 50);
    expect(s.vortex?.open).toBe(true);
    expect(s.vortex?.charge).toBeCloseTo(1, 5);
  });

  it('reports standing in the open vortex when the hero walks into it', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    let s = scene.frame(1000);
    const gen = (s.loot ?? []).find((l) => l.kind === 'generic')!;
    const chr = (s.loot ?? []).find((l) => l.kind === 'char')!;
    let now = walkOnto(scene, gen.pos, 1000);
    now = walkOnto(scene, chr.pos, now + 50);

    // Not in the vortex yet.
    expect(scene.standingInVortex()).toBe(false);
    // Walk to the vortex centre.
    const vpos = s.vortex!.pos;
    now = walkOnto(scene, vpos, now + 50);
    expect(scene.standingInVortex()).toBe(true);
    s = scene.frame(now + 50);
    expect(s.vortex?.standing).toBe(true);
  });

  it('keeps the vortex sealed while a boon is unclaimed (cannot descend early)', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const s = scene.frame(1000);
    const gen = (s.loot ?? []).find((l) => l.kind === 'generic')!;
    walkOnto(scene, gen.pos, 1000);
    // Walk into the vortex position with only one boon claimed.
    walkOnto(scene, s.vortex!.pos, 5000);
    expect(scene.vortexOpen()).toBe(false);
    expect(scene.standingInVortex()).toBe(false); // sealed vortex ignores standing
  });
});

describe('RewardScene: descent dwell + overlay freeze', () => {
  /** Claim one boon of each kind so the vortex is open, returning the wall clock. */
  function claimBoth(scene: RewardScene, start: number): { now: number; vpos: Vec2 } {
    const s = scene.frame(start);
    const gen = (s.loot ?? []).find((l) => l.kind === 'generic')!;
    const chr = (s.loot ?? []).find((l) => l.kind === 'char')!;
    let now = walkOnto(scene, gen.pos, start);
    now = walkOnto(scene, chr.pos, now + 50);
    return { now, vpos: s.vortex!.pos };
  }

  it('requires a descent dwell — the first frame inside the vortex is NOT ready', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const { now: claimedAt, vpos } = claimBoth(scene, 1000);

    let now = claimedAt + 50;
    let state = scene.frame(now);
    let firstInsideReady: boolean | null = null;
    for (let i = 0; i < 400; i++) {
      const hp = heroPos(state);
      const dx = vpos.x - hp.x;
      const dy = vpos.y - hp.y;
      const d = Math.hypot(dx, dy);
      scene.setInput(inp({ move: d <= 12 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d } }));
      now += 50;
      state = scene.frame(now);
      if (scene.standingInVortex() && firstInsideReady === null) {
        firstInsideReady = scene.readyToDescend();
      }
      if (scene.readyToDescend()) break;
    }
    // Clipping the ring does NOT instantly ready — the dwell must elapse first.
    expect(firstInsideReady).toBe(false);
    expect(scene.readyToDescend()).toBe(true);
    expect(scene.descentCharge()).toBeCloseTo(1, 5);
  });

  it('un-readies (charge resets) when the hero leaves the vortex', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const { now, vpos } = claimBoth(scene, 1000);
    walkOnto(scene, vpos, now + 50, DESCENT_DWELL_S + 0.3);
    expect(scene.readyToDescend()).toBe(true);

    // March back toward the hero's spawn (bottom of the arena), well clear.
    walkOnto(scene, { x: vpos.x, y: 820 }, 60000);
    expect(scene.standingInVortex()).toBe(false);
    expect(scene.readyToDescend()).toBe(false);
    expect(scene.descentCharge()).toBe(0);
  });

  it('holds the claim dwell frozen while an overlay is up, resuming when it closes', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const first = scene.frame(1000);
    const relic = (first.loot ?? []).find((l) => l.kind === 'generic')!;

    // Drive the hero onto the relic using FROZEN frames: it moves (input still
    // applies) but the dwell never accrues, so nothing is claimed.
    let now = 1000;
    let state = first;
    for (let i = 0; i < 200; i++) {
      const hp = heroPos(state);
      const dx = relic.pos.x - hp.x;
      const dy = relic.pos.y - hp.y;
      const d = Math.hypot(dx, dy);
      scene.setInput(inp({ move: d <= 12 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d } }));
      now += 50;
      state = scene.frame(now, true); // frozen (overlay up)
    }
    expect(scene.takeClaims()).toHaveLength(0);
    expect(scene.progress().claimedGeneric).toBe(0);

    // Close the overlay: standing still on the relic now claims after the dwell.
    scene.setInput(inp({ move: { x: 0, y: 0 } }));
    for (let i = 0; i < 20; i++) {
      now += 50;
      scene.frame(now, false);
    }
    expect(scene.progress().claimedGeneric).toBe(1);
  });
});

describe('RewardScene: relic inspector focus', () => {
  it('focus() is null clear of the relics, then surfaces the nearest readable one', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    const first = scene.frame(1000);
    expect(scene.focus()).toBeNull(); // spawn is well below the relic row

    const relic = (first.loot ?? []).find((l) => l.kind === 'generic')!;
    let now = 1000;
    let state = first;
    let sawUnclaimed = false;
    for (let i = 0; i < 200; i++) {
      const hp = heroPos(state);
      const dx = relic.pos.x - hp.x;
      const dy = relic.pos.y - hp.y;
      const d = Math.hypot(dx, dy);
      scene.setInput(inp({ move: { x: dx / d, y: dy / d } }));
      now += 50;
      state = scene.frame(now);
      const f = scene.focus();
      if (f && !f.claimed) {
        // The nearest readable relic on the approach is one of the generics.
        expect(f.kind).toBe('generic');
        expect(f.offer.label).toBeTruthy();
        expect(f.dwell).toBeGreaterThanOrEqual(0);
        sawUnclaimed = true;
        break;
      }
    }
    expect(sawUnclaimed).toBe(true);
  });
});

describe('RewardScene: list-view sync + empty sets', () => {
  it('markClaimed claims a relic without emitting a pending claim', () => {
    const scene = new RewardScene('Aria', 'knight', offers());
    scene.frame(1000);
    scene.markClaimed('generic', 'g2');
    // No pending claim (the caller already relayed the pick).
    expect(scene.takeClaims()).toHaveLength(0);
    const s = scene.frame(1050);
    const generics = (s.loot ?? []).filter((l) => l.kind === 'generic');
    expect(generics.filter((l) => l.claimed)).toHaveLength(1);
    expect(generics.filter((l) => l.locked)).toHaveLength(1);
    expect(scene.progress().claimedGeneric).toBe(1);
  });

  it('auto-satisfies a kind with no offers so the vortex can still open', () => {
    const scene = new RewardScene('Aria', 'knight', {
      generic: [{ id: 'g1', label: 'g', desc: '' }],
      char: [],
    });
    const s = scene.frame(1000);
    expect((s.loot ?? []).filter((l) => l.kind === 'char')).toHaveLength(0);
    // Claiming the single generic is enough (no class offers to claim).
    walkOnto(scene, (s.loot ?? []).find((l) => l.kind === 'generic')!.pos, 1000);
    expect(scene.vortexOpen()).toBe(true);
  });
});
