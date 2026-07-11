import { describe, it, expect } from 'vitest';
import { Playground, STATION_DWELL_S } from '../src/ui/state/playground';
import { SIM_DT } from '../src/engine/core/constants';
import { CLASS_IDS } from '../src/engine/content/classes';
import type { InputCommand, RenderState, Vec2 } from '../src/engine/core/types';

/** Build an InputCommand, overriding only the fields a test cares about. */
function inp(over: Partial<InputCommand> = {}): InputCommand {
  return {
    seq: 0,
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
    ...over,
  };
}

function heroPos(state: RenderState): Vec2 {
  const id = state.localPlayerId;
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error('no local hero');
  return p.pos;
}

/** Walk the hero onto `target` and hold there past the station dwell. */
function walkOnto(pg: Playground, target: Vec2, startMs: number, frozen = false): number {
  let now = startMs;
  let state = pg.frame(now, frozen);
  let held = 0;
  for (let i = 0; i < 400; i++) {
    const hp = heroPos(state);
    const dx = target.x - hp.x;
    const dy = target.y - hp.y;
    const d = Math.hypot(dx, dy);
    if (d <= 16) {
      pg.setInput(inp({ move: { x: 0, y: 0 } }));
      held += 0.05;
    } else {
      pg.setInput(inp({ move: { x: dx / d, y: dy / d } }));
      held = 0;
    }
    now += 50;
    state = pg.frame(now, frozen);
    if (held >= STATION_DWELL_S + 0.2) break;
  }
  return now;
}

describe('Playground: construction', () => {
  it('sets up a practice world with a single local hero', () => {
    const pg = new Playground('Aria', 'knight');

    // The local hero is the first entity spawned, so it owns id 1.
    expect(pg.localPlayerId).toBe(1);

    const s = pg.frame(1000);
    expect(s.localPlayerId).toBe(pg.localPlayerId);
    expect(s.players).toHaveLength(1);
    expect(s.players[0].id).toBe(pg.localPlayerId);
    expect(s.players[0].name).toBe('Aria');
    expect(s.players[0].classId).toBe('knight');
  });

  it('runs in practice mode: respawning dummy boss, totems, no hazards', () => {
    const pg = new Playground('Aria', 'knight');
    const s = pg.frame(1000);

    // The practice target is the training dummy (600 base HP, unscaled solo).
    expect(s.bosses).toHaveLength(1);
    expect(s.bosses[0].monsterId).toBe('dummy');
    expect(s.bosses[0].maxHp).toBe(600);

    // Practice worlds carry the four interaction totems and no terrain/obstacles.
    const totems = s.totems;
    expect(totems).toBeDefined();
    expect(totems).toHaveLength(4);
    const kinds = (totems ?? []).map((t) => t.kind).sort();
    expect(kinds).toEqual(['class', 'controls', 'host', 'join']);
    expect(s.terrain).toHaveLength(0);
    expect(s.obstacles).toHaveLength(0);
  });

  it('falls back to the name "Hero" when constructed with an empty name', () => {
    const pg = new Playground('', 'ranger');
    const s = pg.frame(1000);
    expect(s.players[0].name).toBe('Hero');
    expect(s.players[0].classId).toBe('ranger');
  });

  it('spawns the hero at rest in the lower-middle of the arena', () => {
    const pg = new Playground('Aria', 'knight');
    const s = pg.frame(1000);
    // arena.w / 2 = 800, arena.h - 220 = 780.
    expect(s.players[0].pos.x).toBeCloseTo(800, 3);
    expect(s.players[0].pos.y).toBeCloseTo(780, 3);
  });
});

describe('Playground: frame / fixed-timestep accumulator', () => {
  it('establishes a baseline and runs zero steps on the very first frame', () => {
    const pg = new Playground('Aria', 'knight');
    const s = pg.frame(1000);
    expect(s.tick).toBe(0);
  });

  it('runs no additional steps when called again with the same timestamp', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    const s = pg.frame(1000);
    expect(s.tick).toBe(0);
  });

  it('advances the sim deterministically as time passes (0.2s => 4 ticks)', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    const s = pg.frame(1200); // +200ms => 0.2s => 0.2 / SIM_DT = 4 steps
    expect(s.tick).toBe(4);
    // With no input the hero holds its spawn position across the steps.
    expect(s.players[0].pos.x).toBeCloseTo(800, 3);
    expect(s.players[0].pos.y).toBeCloseTo(780, 3);
  });

  it('clamps a huge time jump to 0.25s (max 5 steps) — no spiral of death', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    const s = pg.frame(1_000_000); // absurd delta, clamped to 0.25s
    expect(s.tick).toBe(5);
  });

  it('drains accumulated events exactly once per frame', () => {
    const pg = new Playground('Ranger', 'ranger');
    pg.frame(1000);
    // Autofire the basic while aiming up so steps generate cast/projectile events.
    pg.setInput(
      inp({ aim: { x: 0, y: -1 }, buttons: { ...inp().buttons, basic: true }, autofire: true }),
    );
    const firing = pg.frame(1100); // 2 steps, ability fires
    expect(firing.events.length).toBeGreaterThan(0);
    // A follow-up frame that runs 0 steps must NOT replay the drained events.
    const idle = pg.frame(1100);
    expect(idle.tick).toBe(firing.tick);
    expect(idle.events).toHaveLength(0);
  });
});

describe('Playground: input', () => {
  it('moves the hero deterministically in the input direction', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    pg.setInput(inp({ move: { x: 1, y: 0 } }));
    const s = pg.frame(1200); // 4 steps

    const speed = s.players[0].moveSpeed; // knight base move speed
    expect(s.tick).toBe(4);
    expect(s.players[0].pos.x).toBeGreaterThan(800);
    expect(s.players[0].pos.x).toBeCloseTo(800 + speed * SIM_DT * s.tick, 3);
    expect(s.players[0].pos.y).toBeCloseTo(780, 3);
  });

  it('applies the aim vector from the latest sampled input', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    pg.setInput(inp({ aim: { x: 0, y: -1 } }));
    const s = pg.frame(1100); // >=1 step applies the input
    expect(s.players[0].aim.x).toBeCloseTo(0, 5);
    expect(s.players[0].aim.y).toBeCloseTo(-1, 5);
  });
});

describe('Playground: totems', () => {
  it('reports no active totem while the hero stands clear of them', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    expect(pg.activeTotem()).toBeNull();
  });

  it('activates the totem the hero walks onto', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    pg.setInput(inp({ move: { x: 1, y: 0 } }));
    // Walk right into the "controls" totem (at x = w*0.76 = 1216, same y row).
    let now = 1000;
    let last = pg.frame(now);
    for (let i = 0; i < 40; i++) {
      now += 250;
      last = pg.frame(now);
    }
    const active = pg.activeTotem();
    expect(active).not.toBeNull();
    expect(active?.kind).toBe('controls');
    const controlsView = last.totems?.find((t) => t.kind === 'controls');
    expect(controlsView?.active).toBe(true);
  });
});

describe('Playground: setClass', () => {
  it('rebuilds the world for a new class, keeping the hero position', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    // Nudge the hero away from spawn so "keeps position" is a real assertion.
    pg.setInput(inp({ move: { x: 1, y: 0 } }));
    pg.frame(1250);
    const moved = pg.frame(1500);
    const keptX = moved.players[0].pos.x;
    const keptY = moved.players[0].pos.y;
    const tickBefore = moved.tick;
    expect(keptX).toBeGreaterThan(800);

    pg.setInput(inp()); // stop moving
    pg.setClass('mage');
    const s = pg.frame(1750);

    expect(s.players[0].classId).toBe('mage');
    expect(s.players[0].pos.x).toBeCloseTo(keptX, 3);
    expect(s.players[0].pos.y).toBeCloseTo(keptY, 3);
    // A rebuilt world restarts its tick counter, so it is below the old count.
    expect(s.tick).toBeLessThan(tickBefore);
    expect(s.tick).toBeGreaterThan(0);
  });

  it('is a no-op when the class is unchanged (keeps the same world/tick)', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    pg.frame(2000); // +5 => tick 5
    const before = pg.frame(3000); // +5 => tick 10
    expect(before.tick).toBe(10);

    pg.setClass('knight'); // same class → early return, world not rebuilt
    const s = pg.frame(4000); // +5 => tick 15, i.e. the world kept counting
    expect(s.tick).toBe(15);
    expect(s.players[0].classId).toBe('knight');
  });
});

describe('Playground: setName', () => {
  it('renames the hero in place without rebuilding the world', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    pg.frame(2000); // tick 5
    pg.setName('Zed');
    const s = pg.frame(3000); // tick 10 — same world, just renamed
    expect(s.players[0].name).toBe('Zed');
    expect(s.tick).toBe(10);
  });
});

describe('Playground: respawning dummy', () => {
  it('resets the practice dummy when it is defeated and never ends the sim', () => {
    const pg = new Playground('Ranger', 'ranger');
    let last = pg.frame(1000); // baseline
    // Stand still and pour ranged damage straight up into the dummy.
    pg.setInput(
      inp({
        aim: { x: 0, y: -1 },
        buttons: { basic: true, a1: true, a2: true, a3: false, revive: false },
        autofire: true,
      }),
    );

    let now = 1000;
    let resetSeen = false;
    let bossDeathSeen = false;
    let minHp = Infinity;
    for (let i = 0; i < 400; i++) {
      now += 250;
      last = pg.frame(now);
      const hp = last.bosses[0]?.hp ?? Infinity;
      if (hp < minHp) minHp = hp;
      if (last.events.some((e) => e.t === 'death' && e.kind === 'boss')) bossDeathSeen = true;
      if (last.events.some((e) => e.t === 'dummyReset')) {
        resetSeen = true;
        break;
      }
    }

    expect(minHp).toBeLessThan(600); // damage actually landed
    expect(bossDeathSeen).toBe(true); // the dummy fell
    expect(resetSeen).toBe(true); // ...and popped back up (practice reset)
    // Respawned: still exactly one boss, alive again.
    expect(last.bosses).toHaveLength(1);
    expect(last.bosses[0].hp).toBeGreaterThan(0);

    // Practice never "finishes": the sim keeps stepping afterwards.
    const after = pg.frame(now + 250);
    expect(after.tick).toBeGreaterThan(last.tick);
  });
});

describe('Playground: class effigies (stations)', () => {
  it('projects one class effigy per class, with the current class selected', () => {
    const pg = new Playground('Aria', 'knight');
    const s = pg.frame(1000);
    expect(s.stations).toBeDefined();
    expect(s.stations).toHaveLength(CLASS_IDS.length);
    expect(new Set((s.stations ?? []).map((st) => st.kind))).toEqual(new Set(['class']));
    const refs = (s.stations ?? []).map((st) => st.refId).sort();
    expect(refs).toEqual([...CLASS_IDS].sort());
    const selected = (s.stations ?? []).filter((st) => st.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].refId).toBe('knight');
  });

  it('does not auto-select at spawn (hero stands clear of the effigy row)', () => {
    const pg = new Playground('Aria', 'knight');
    pg.frame(1000);
    pg.frame(1200);
    expect(pg.takeStationTriggers()).toHaveLength(0);
  });

  it('keeps every effigy clear of every totem trigger (no double-channel)', () => {
    const pg = new Playground('Aria', 'knight');
    const s = pg.frame(1000);
    const effigies = s.stations ?? [];
    const totems = s.totems ?? [];
    expect(effigies.length).toBeGreaterThan(0);
    expect(totems.length).toBe(4);
    for (const e of effigies) {
      for (const t of totems) {
        const d = Math.hypot(e.pos.x - t.pos.x, e.pos.y - t.pos.y);
        // The two trigger circles must not touch, or standing on a corner
        // effigy would also channel the totem beneath it.
        expect(d).toBeGreaterThan(e.triggerRadius + t.triggerRadius);
      }
    }
  });

  it('queues a class trigger when the hero dwells on another class effigy', () => {
    const pg = new Playground('Aria', 'knight');
    const first = pg.frame(1000);
    const mage = (first.stations ?? []).find((st) => st.refId === 'mage')!;
    expect(mage).toBeDefined();
    walkOnto(pg, mage.pos, 1000);
    const trigs = pg.takeStationTriggers();
    expect(trigs.some((t) => t.kind === 'class' && t.refId === 'mage')).toBe(true);
    // Draining is exactly-once.
    expect(pg.takeStationTriggers()).toHaveLength(0);
  });

  it('holds the effigy dwell frozen while an overlay is up', () => {
    const pg = new Playground('Aria', 'knight');
    const first = pg.frame(1000);
    const mage = (first.stations ?? []).find((st) => st.refId === 'mage')!;
    walkOnto(pg, mage.pos, 1000, true); // frozen throughout
    expect(pg.takeStationTriggers()).toHaveLength(0);
  });

  it('reflects a class swap in the selected effigy (setClass follows the trigger)', () => {
    const pg = new Playground('Aria', 'knight');
    const first = pg.frame(1000);
    const mage = (first.stations ?? []).find((st) => st.refId === 'mage')!;
    const now = walkOnto(pg, mage.pos, 1000);
    // The UI relays the trigger by calling setClass; do that here.
    for (const t of pg.takeStationTriggers()) if (t.refId) pg.setClass(t.refId as 'mage');
    const s = pg.frame(now + 50);
    expect(s.players[0].classId).toBe('mage');
    const selected = (s.stations ?? []).filter((st) => st.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].refId).toBe('mage');
  });
});
