/**
 * Warband — SnapshotInterpolator (client-side snapshot interpolation).
 *
 * The interpolator buffers authoritative snapshots (stamped with `performance.now()`
 * on arrival) and, on `sample(nowMs)`, renders `INTERP_DELAY_MS` in the past by
 * LERPing entity POSITIONS between the two snapshots that bracket that render time.
 * Everything else (hp, state, telegraph, facing, zones, terrain, obstacles) is
 * carried VERBATIM from the newer bracketing snapshot — never interpolated.
 *
 * These tests drive the real public API: `push` (which reads `performance.now()`,
 * mocked here so arrival times are deterministic), `sample`, `latestOwnView` and
 * `reset`. Positions use `toBeCloseTo` because the torus wrap math produces `-0`
 * and floating-point error that `toEqual` would reject spuriously.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SnapshotInterpolator, type SampleOpts } from '../src/render/interpolate';
import { INTERP_DELAY_MS, ARENA_W, ARENA_H } from '../src/engine/constants';
import type {
  Snapshot,
  PlayerView,
  BossView,
  AddView,
  ProjectileView,
  ZoneView,
  TerrainView,
  ObstacleView,
  GameEvent,
  Telegraph,
  RenderState,
} from '../src/engine/types';

// --- Fixtures --------------------------------------------------------------

function mkPlayer(over: Partial<PlayerView> & Pick<PlayerView, 'id'>): PlayerView {
  return {
    id: over.id,
    peerId: over.peerId ?? `peer-${over.id}`,
    name: over.name ?? 'P',
    classId: over.classId ?? 'knight',
    pos: over.pos ?? { x: 0, y: 0 },
    aim: over.aim ?? { x: 1, y: 0 },
    hp: over.hp ?? 100,
    maxHp: over.maxHp ?? 100,
    moveSpeed: over.moveSpeed ?? 200,
    state: over.state ?? 'alive',
    cooldowns: over.cooldowns ?? { basic: 0, a1: 0, a2: 0, a3: 0 },
    buffs: over.buffs ?? [],
    downedTimer: over.downedTimer ?? 0,
    reviveProgress: over.reviveProgress ?? 0,
    castSlot: over.castSlot ?? null,
    castTimer: over.castTimer ?? 0,
    score: over.score ?? 0,
  };
}

function mkTelegraph(over: Partial<Telegraph> = {}): Telegraph {
  return {
    kind: over.kind ?? 'circle',
    origin: over.origin ?? { x: 0, y: 0 },
    angle: over.angle ?? 0,
    range: over.range ?? 100,
    radius: over.radius ?? 40,
    halfAngle: over.halfAngle ?? 0.5,
    width: over.width ?? 20,
    target: over.target ?? { x: 50, y: 50 },
    remainingWindup: over.remainingWindup ?? 0.5,
    totalWindup: over.totalWindup ?? 1,
  };
}

function mkBoss(over: Partial<BossView> & Pick<BossView, 'id'>): BossView {
  return {
    id: over.id,
    monsterId: over.monsterId ?? 'dragon',
    pos: over.pos ?? { x: 0, y: 0 },
    facing: over.facing ?? 0,
    hp: over.hp ?? 1000,
    maxHp: over.maxHp ?? 1000,
    phase: over.phase ?? 'normal',
    telegraph: over.telegraph ?? null,
    buffs: over.buffs ?? [],
    action: over.action ?? 'idle',
    abilityId: over.abilityId ?? null,
  };
}

function mkAdd(over: Partial<AddView> & Pick<AddView, 'id'>): AddView {
  return {
    id: over.id,
    pos: over.pos ?? { x: 0, y: 0 },
    hp: over.hp ?? 60,
    maxHp: over.maxHp ?? 60,
    buffs: over.buffs ?? [],
  };
}

function mkProjectile(over: Partial<ProjectileView> & Pick<ProjectileView, 'id'>): ProjectileView {
  return {
    id: over.id,
    kind: over.kind ?? 'arrow',
    side: over.side ?? 'player',
    pos: over.pos ?? { x: 0, y: 0 },
    vel: over.vel ?? { x: 0, y: 0 },
  };
}

function mkZone(over: Partial<ZoneView> & Pick<ZoneView, 'id'>): ZoneView {
  return {
    id: over.id,
    kind: over.kind ?? 'voidZone',
    pos: over.pos ?? { x: 0, y: 0 },
    radius: over.radius ?? 90,
    duration: over.duration ?? 5,
    remaining: over.remaining ?? 5,
  };
}

function mkTerrain(over: Partial<TerrainView> & Pick<TerrainView, 'id'>): TerrainView {
  return {
    id: over.id,
    kind: over.kind ?? 'magma',
    pos: over.pos ?? { x: 0, y: 0 },
    radius: over.radius ?? 100,
  };
}

function mkObstacle(over: Partial<ObstacleView> & Pick<ObstacleView, 'id'>): ObstacleView {
  return {
    id: over.id,
    pos: over.pos ?? { x: 0, y: 0 },
    radius: over.radius ?? 50,
  };
}

function mkSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    tick: over.tick ?? 0,
    players: over.players ?? [],
    bosses: over.bosses ?? [],
    adds: over.adds ?? [],
    projectiles: over.projectiles ?? [],
    groundZones: over.groundZones ?? [],
    terrain: over.terrain ?? [],
    obstacles: over.obstacles ?? [],
    events: over.events ?? [],
    seed: over.seed ?? 1,
  };
}

// --- Deterministic arrival clock -------------------------------------------
//
// `push` stamps each snapshot with `performance.now()`. We mock it so tests
// place snapshots at exact arrival times and control the bracketing precisely.

let clock = 0;

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Push `snap` as if it arrived at wall-clock `recvMs`. */
function pushAt(interp: SnapshotInterpolator, snap: Snapshot, recvMs: number): void {
  clock = recvMs;
  interp.push(snap);
}

function opts(over: Partial<SampleOpts> = {}): SampleOpts {
  return {
    localPlayerId: over.localPlayerId ?? null,
    arena: over.arena ?? { w: ARENA_W, h: ARENA_H },
    predictedLocalPos: over.predictedLocalPos ?? null,
  };
}

/**
 * Render the buffer AS OF `renderTime` (i.e. call `sample` at the wall clock
 * `renderTime + INTERP_DELAY_MS`, since the interpolator renders that far in the
 * past). Asserts a non-null result and returns it.
 */
function render(
  interp: SnapshotInterpolator,
  renderTime: number,
  o: SampleOpts = opts(),
): RenderState {
  const rs = interp.sample(renderTime + INTERP_DELAY_MS, o);
  if (rs === null) throw new Error(`expected a RenderState at renderTime=${renderTime}`);
  return rs;
}

// ===========================================================================

describe('SnapshotInterpolator — insufficient buffer', () => {
  it('sample returns null when nothing has been pushed', () => {
    const interp = new SnapshotInterpolator();
    expect(interp.sample(1000, opts())).toBeNull();
  });

  it('with a single snapshot, returns it verbatim (no interpolation) at any time', () => {
    const interp = new SnapshotInterpolator();
    pushAt(
      interp,
      mkSnapshot({ tick: 5, seed: 42, players: [mkPlayer({ id: 1, pos: { x: 300, y: 400 } })] }),
      1000,
    );

    // Before it, during, and long after — all clamp to the single snapshot.
    for (const renderTime of [0, 1000, 9000]) {
      const rs = render(interp, renderTime);
      expect(rs.tick).toBe(5);
      expect(rs.seed).toBe(42);
      expect(rs.players).toHaveLength(1);
      expect(rs.players[0].pos.x).toBeCloseTo(300);
      expect(rs.players[0].pos.y).toBeCloseTo(400);
    }
  });
});

describe('SnapshotInterpolator — positional LERP', () => {
  function twoPlayerSnaps(interp: SnapshotInterpolator): void {
    pushAt(
      interp,
      mkSnapshot({
        tick: 1,
        players: [mkPlayer({ id: 1, pos: { x: 100, y: 200 }, hp: 100, state: 'alive' })],
      }),
      1000,
    );
    pushAt(
      interp,
      mkSnapshot({
        tick: 2,
        players: [mkPlayer({ id: 1, pos: { x: 200, y: 400 }, hp: 60, state: 'downed' })],
      }),
      1050,
    );
  }

  it('interpolates position to the midpoint between two bracketing snapshots', () => {
    const interp = new SnapshotInterpolator();
    twoPlayerSnaps(interp);

    const rs = render(interp, 1025); // t = (1025-1000)/(1050-1000) = 0.5
    expect(rs.players[0].pos.x).toBeCloseTo(150);
    expect(rs.players[0].pos.y).toBeCloseTo(300);
  });

  it('interpolates at arbitrary fractions along the bracket', () => {
    const interp = new SnapshotInterpolator();
    twoPlayerSnaps(interp);

    const q = render(interp, 1012.5); // t = 0.25
    expect(q.players[0].pos.x).toBeCloseTo(125);
    expect(q.players[0].pos.y).toBeCloseTo(250);

    const tq = render(interp, 1037.5); // t = 0.75
    expect(tq.players[0].pos.x).toBeCloseTo(175);
    expect(tq.players[0].pos.y).toBeCloseTo(350);
  });

  it('carries non-positional fields VERBATIM from the newer snapshot (never lerped)', () => {
    const interp = new SnapshotInterpolator();
    twoPlayerSnaps(interp);

    const rs = render(interp, 1025);
    // hp would be 80 if interpolated; it must be the newer snapshot's 60.
    expect(rs.players[0].hp).toBe(60);
    expect(rs.players[0].state).toBe('downed');
    // tick + seed come from the carry (newer) snapshot.
    expect(rs.tick).toBe(2);
  });
});

describe('SnapshotInterpolator — renders INTERP_DELAY_MS in the past', () => {
  it('shows the older state even though the newest snapshot has already arrived', () => {
    const interp = new SnapshotInterpolator();
    pushAt(
      interp,
      mkSnapshot({ tick: 1, players: [mkPlayer({ id: 1, pos: { x: 0, y: 0 } })] }),
      1000,
    );
    pushAt(
      interp,
      mkSnapshot({ tick: 2, players: [mkPlayer({ id: 1, pos: { x: 100, y: 0 } })] }),
      1100,
    );

    // Wall clock is 1100 (the newest just landed) but render time is 1100 - 100 =
    // 1000, so we still draw the older position (x = 0), hiding the fresh packet.
    const rs = interp.sample(1100, opts());
    expect(rs).not.toBeNull();
    expect(rs?.players[0].pos.x).toBeCloseTo(0);
  });

  it('subtracts exactly INTERP_DELAY_MS from nowMs when choosing the bracket', () => {
    const interp = new SnapshotInterpolator();
    pushAt(
      interp,
      mkSnapshot({ tick: 1, players: [mkPlayer({ id: 1, pos: { x: 0, y: 0 } })] }),
      1000,
    );
    pushAt(
      interp,
      mkSnapshot({ tick: 2, players: [mkPlayer({ id: 1, pos: { x: 100, y: 0 } })] }),
      1100,
    );

    // nowMs 1150 -> renderTime 1050 -> t = 0.5 -> x = 50.
    const rs = interp.sample(1000 + 100 + 50, opts());
    expect(rs?.players[0].pos.x).toBeCloseTo(50);
  });
});

describe('SnapshotInterpolator — clamping past the ends (no extrapolation)', () => {
  function bracket(interp: SnapshotInterpolator): void {
    pushAt(
      interp,
      mkSnapshot({ tick: 1, players: [mkPlayer({ id: 1, pos: { x: 100, y: 0 } })] }),
      1000,
    );
    pushAt(
      interp,
      mkSnapshot({ tick: 2, players: [mkPlayer({ id: 1, pos: { x: 200, y: 0 } })] }),
      1050,
    );
  }

  it('clamps to the newest snapshot when render time is past it (does not extrapolate)', () => {
    const interp = new SnapshotInterpolator();
    bracket(interp);

    const rs = render(interp, 5000); // far past the newest
    expect(rs.players[0].pos.x).toBeCloseTo(200); // clamped, not > 200
    expect(rs.tick).toBe(2);
  });

  it('clamps to the oldest snapshot when render time is before it', () => {
    const interp = new SnapshotInterpolator();
    bracket(interp);

    const rs = render(interp, 500); // before the oldest arrival
    expect(rs.players[0].pos.x).toBeCloseTo(100);
    expect(rs.tick).toBe(1);
  });
});

describe('SnapshotInterpolator — non-positional fields from the newer snapshot', () => {
  it('carries boss facing, hp, phase, telegraph, action & abilityId verbatim while lerping pos', () => {
    const interp = new SnapshotInterpolator();
    const tele = mkTelegraph({ kind: 'cone', angle: 1.2, range: 300 });
    pushAt(
      interp,
      mkSnapshot({
        tick: 1,
        bosses: [
          mkBoss({
            id: 10,
            pos: { x: 100, y: 100 },
            facing: 0,
            hp: 1000,
            phase: 'normal',
            telegraph: null,
            action: 'idle',
            abilityId: null,
          }),
        ],
      }),
      1000,
    );
    pushAt(
      interp,
      mkSnapshot({
        tick: 2,
        bosses: [
          mkBoss({
            id: 10,
            pos: { x: 300, y: 300 },
            facing: 3,
            hp: 500,
            phase: 'enraged',
            telegraph: tele,
            action: 'windup',
            abilityId: 'fireBreath',
          }),
        ],
      }),
      1050,
    );

    const rs = render(interp, 1025); // midpoint
    const boss = rs.bosses[0];
    // Position is interpolated...
    expect(boss.pos.x).toBeCloseTo(200);
    expect(boss.pos.y).toBeCloseTo(200);
    // ...everything else is the newer snapshot, untouched.
    expect(boss.facing).toBe(3); // NOT ~1.5
    expect(boss.hp).toBe(500);
    expect(boss.phase).toBe('enraged');
    expect(boss.action).toBe('windup');
    expect(boss.abilityId).toBe('fireBreath');
    expect(boss.telegraph).toEqual(tele);
  });

  it('carries zones, terrain and obstacles from the newer snapshot (statics, never interpolated)', () => {
    const interp = new SnapshotInterpolator();
    pushAt(
      interp,
      mkSnapshot({
        tick: 1,
        groundZones: [mkZone({ id: 1, kind: 'poison' })],
        terrain: [mkTerrain({ id: 2, kind: 'swamp' })],
        obstacles: [mkObstacle({ id: 3, pos: { x: 10, y: 10 } })],
      }),
      1000,
    );
    pushAt(
      interp,
      mkSnapshot({
        tick: 2,
        groundZones: [mkZone({ id: 9, kind: 'sanctuary', pos: { x: 5, y: 5 } })],
        terrain: [mkTerrain({ id: 8, kind: 'ice', pos: { x: 6, y: 6 } })],
        obstacles: [mkObstacle({ id: 7, pos: { x: 7, y: 7 } })],
      }),
      1050,
    );

    const rs = render(interp, 1025);
    expect(rs.groundZones).toHaveLength(1);
    expect(rs.groundZones[0].id).toBe(9);
    expect(rs.groundZones[0].kind).toBe('sanctuary');
    expect(rs.terrain[0].id).toBe(8);
    expect(rs.terrain[0].kind).toBe('ice');
    expect(rs.obstacles[0].id).toBe(7);
    expect(rs.obstacles[0].pos.x).toBeCloseTo(7);
  });
});

describe('SnapshotInterpolator — adds & projectiles', () => {
  it('interpolates add and projectile positions and carries their other fields verbatim', () => {
    const interp = new SnapshotInterpolator();
    pushAt(
      interp,
      mkSnapshot({
        tick: 1,
        adds: [mkAdd({ id: 1, pos: { x: 0, y: 0 }, hp: 60 })],
        projectiles: [mkProjectile({ id: 2, kind: 'arrow', pos: { x: 0, y: 0 } })],
      }),
      1000,
    );
    pushAt(
      interp,
      mkSnapshot({
        tick: 2,
        adds: [mkAdd({ id: 1, pos: { x: 40, y: 80 }, hp: 20 })],
        projectiles: [
          mkProjectile({ id: 2, kind: 'arrow', pos: { x: 100, y: 0 }, vel: { x: 9, y: 0 } }),
        ],
      }),
      1050,
    );

    const rs = render(interp, 1025); // t = 0.5
    expect(rs.adds[0].pos.x).toBeCloseTo(20);
    expect(rs.adds[0].pos.y).toBeCloseTo(40);
    expect(rs.adds[0].hp).toBe(20); // newer, not 40
    expect(rs.projectiles[0].pos.x).toBeCloseTo(50);
    expect(rs.projectiles[0].vel.x).toBeCloseTo(9); // carried from newer
  });
});

describe('SnapshotInterpolator — torus wrap-around (interpolates the SHORT way)', () => {
  it('slides across the +x seam instead of the long way back', () => {
    const interp = new SnapshotInterpolator();
    // 1550 -> 50 the short way is +100 through the x = ARENA_W seam (not -1500).
    pushAt(interp, mkSnapshot({ players: [mkPlayer({ id: 1, pos: { x: 1550, y: 500 } })] }), 1000);
    pushAt(interp, mkSnapshot({ players: [mkPlayer({ id: 1, pos: { x: 50, y: 500 } })] }), 1050);

    const a = render(interp, 1012.5); // t = 0.25
    // Short way -> 1575. The long way back would land near 1175.
    expect(a.players[0].pos.x).toBeCloseTo(1575);
    expect(a.players[0].pos.y).toBeCloseTo(500);

    const mid = render(interp, 1025); // t = 0.5 -> exactly on the seam
    expect(mid.players[0].pos.x).toBeCloseTo(0); // 1600 wraps to 0

    const c = render(interp, 1037.5); // t = 0.75 -> just across the seam
    expect(c.players[0].pos.x).toBeCloseTo(25);
    expect(ARENA_W).toBe(1600);
  });

  it('slides across the -x seam (opposite direction) the short way', () => {
    const interp = new SnapshotInterpolator();
    // 50 -> 1550 the short way is -100 through the seam (not +1500).
    pushAt(interp, mkSnapshot({ players: [mkPlayer({ id: 1, pos: { x: 50, y: 500 } })] }), 1000);
    pushAt(interp, mkSnapshot({ players: [mkPlayer({ id: 1, pos: { x: 1550, y: 500 } })] }), 1050);

    const a = render(interp, 1012.5); // t = 0.25
    // Short way -> 25 (wrapped). The long way would land near 425.
    expect(a.players[0].pos.x).toBeCloseTo(25);
  });

  it('wraps on the y axis too', () => {
    const interp = new SnapshotInterpolator();
    // 980 -> 20 the short way is +40 through the y = ARENA_H seam (not -960).
    pushAt(interp, mkSnapshot({ players: [mkPlayer({ id: 1, pos: { x: 500, y: 980 } })] }), 1000);
    pushAt(interp, mkSnapshot({ players: [mkPlayer({ id: 1, pos: { x: 500, y: 20 } })] }), 1050);

    const a = render(interp, 1012.5); // t = 0.25
    expect(a.players[0].pos.y).toBeCloseTo(990); // short way (long way ~740)
    expect(a.players[0].pos.x).toBeCloseTo(500);
    expect(ARENA_H).toBe(1000);
  });
});

describe('SnapshotInterpolator — local-player predicted-position override', () => {
  function localBracket(interp: SnapshotInterpolator): void {
    pushAt(
      interp,
      mkSnapshot({
        players: [
          mkPlayer({ id: 1, peerId: 'me', pos: { x: 0, y: 0 } }),
          mkPlayer({ id: 2, peerId: 'other', pos: { x: 0, y: 0 } }),
        ],
      }),
      1000,
    );
    pushAt(
      interp,
      mkSnapshot({
        players: [
          mkPlayer({ id: 1, peerId: 'me', pos: { x: 100, y: 100 } }),
          mkPlayer({ id: 2, peerId: 'other', pos: { x: 100, y: 100 } }),
        ],
      }),
      1050,
    );
  }

  it('overrides ONLY the local player position with predictedLocalPos', () => {
    const interp = new SnapshotInterpolator();
    localBracket(interp);

    const rs = render(
      interp,
      1025,
      opts({ localPlayerId: 1, predictedLocalPos: { x: 777, y: 333 } }),
    );
    const local = rs.players.find((p) => p.id === 1);
    const remote = rs.players.find((p) => p.id === 2);
    expect(local?.pos.x).toBeCloseTo(777); // predicted, exact
    expect(local?.pos.y).toBeCloseTo(333);
    expect(remote?.pos.x).toBeCloseTo(50); // still interpolated
    expect(remote?.pos.y).toBeCloseTo(50);
  });

  it('does not override when predictedLocalPos is null', () => {
    const interp = new SnapshotInterpolator();
    localBracket(interp);

    const rs = render(interp, 1025, opts({ localPlayerId: 1, predictedLocalPos: null }));
    expect(rs.players.find((p) => p.id === 1)?.pos.x).toBeCloseTo(50);
  });

  it('does not override when localPlayerId is null', () => {
    const interp = new SnapshotInterpolator();
    localBracket(interp);

    const rs = render(
      interp,
      1025,
      opts({ localPlayerId: null, predictedLocalPos: { x: 777, y: 333 } }),
    );
    expect(rs.players.find((p) => p.id === 1)?.pos.x).toBeCloseTo(50);
  });

  it('is a no-op when localPlayerId matches no player in the snapshot', () => {
    const interp = new SnapshotInterpolator();
    localBracket(interp);

    const rs = render(
      interp,
      1025,
      opts({ localPlayerId: 999, predictedLocalPos: { x: 777, y: 333 } }),
    );
    expect(rs.players.find((p) => p.id === 1)?.pos.x).toBeCloseTo(50);
    expect(rs.players.find((p) => p.id === 2)?.pos.x).toBeCloseTo(50);
  });

  it('does not mutate the pushed snapshot when overriding', () => {
    const interp = new SnapshotInterpolator();
    const newer = mkSnapshot({
      players: [mkPlayer({ id: 1, peerId: 'me', pos: { x: 100, y: 100 } })],
    });
    pushAt(
      interp,
      mkSnapshot({ players: [mkPlayer({ id: 1, peerId: 'me', pos: { x: 0, y: 0 } })] }),
      1000,
    );
    pushAt(interp, newer, 1050);

    render(interp, 1025, opts({ localPlayerId: 1, predictedLocalPos: { x: 777, y: 333 } }));
    // The source snapshot's player is untouched (interpolation copies).
    expect(newer.players[0].pos).toEqual({ x: 100, y: 100 });
  });
});

describe('SnapshotInterpolator — passthrough of opts & carry metadata', () => {
  it('passes localPlayerId and arena through, and takes tick/seed from the carry snapshot', () => {
    const interp = new SnapshotInterpolator();
    pushAt(interp, mkSnapshot({ tick: 7, seed: 99, players: [mkPlayer({ id: 1 })] }), 1000);

    const arena = { w: 320, h: 240 };
    const rs = render(interp, 1000, opts({ localPlayerId: 1, arena }));
    expect(rs.localPlayerId).toBe(1);
    expect(rs.arena).toEqual(arena);
    expect(rs.tick).toBe(7);
    expect(rs.seed).toBe(99);
  });
});

describe('SnapshotInterpolator — entities appearing / disappearing between snapshots', () => {
  it('renders a newly-appeared entity at its own position (no previous to lerp from)', () => {
    const interp = new SnapshotInterpolator();
    pushAt(interp, mkSnapshot({ players: [mkPlayer({ id: 1, pos: { x: 0, y: 0 } })] }), 1000);
    pushAt(
      interp,
      mkSnapshot({
        players: [
          mkPlayer({ id: 1, pos: { x: 100, y: 0 } }),
          mkPlayer({ id: 2, pos: { x: 500, y: 500 } }), // appears in newer only
        ],
      }),
      1050,
    );

    const rs = render(interp, 1025); // t = 0.5
    expect(rs.players).toHaveLength(2);
    expect(rs.players.find((p) => p.id === 1)?.pos.x).toBeCloseTo(50); // interpolated
    const fresh = rs.players.find((p) => p.id === 2);
    expect(fresh?.pos.x).toBeCloseTo(500); // verbatim (no prior)
    expect(fresh?.pos.y).toBeCloseTo(500);
  });

  it('drops an entity that is absent from the newer snapshot', () => {
    const interp = new SnapshotInterpolator();
    pushAt(
      interp,
      mkSnapshot({
        players: [
          mkPlayer({ id: 1, pos: { x: 0, y: 0 } }),
          mkPlayer({ id: 2, pos: { x: 600, y: 600 } }),
        ],
      }),
      1000,
    );
    pushAt(interp, mkSnapshot({ players: [mkPlayer({ id: 1, pos: { x: 100, y: 0 } })] }), 1050);

    const rs = render(interp, 1025);
    expect(rs.players).toHaveLength(1);
    expect(rs.players[0].id).toBe(1);
    expect(rs.players.find((p) => p.id === 2)).toBeUndefined();
  });
});

describe('SnapshotInterpolator — buffer pruning', () => {
  it('interpolates across two snapshots that are BOTH within MAX_AGE_MS (control)', () => {
    const interp = new SnapshotInterpolator();
    pushAt(
      interp,
      mkSnapshot({ tick: 1, players: [mkPlayer({ id: 1, pos: { x: 100, y: 0 } })] }),
      0,
    );
    pushAt(
      interp,
      mkSnapshot({ tick: 2, players: [mkPlayer({ id: 1, pos: { x: 200, y: 0 } })] }),
      500,
    );

    const rs = render(interp, 250); // both present -> t = 0.5 -> 150
    expect(rs.players[0].pos.x).toBeCloseTo(150);
  });

  it('prunes snapshots older than MAX_AGE_MS on push', () => {
    const interp = new SnapshotInterpolator();
    pushAt(
      interp,
      mkSnapshot({ tick: 1, players: [mkPlayer({ id: 1, pos: { x: 100, y: 0 } })] }),
      0,
    );
    // Second arrives 2000ms later; the first (age 2000 > MAX_AGE_MS 1000) is dropped.
    pushAt(
      interp,
      mkSnapshot({ tick: 2, players: [mkPlayer({ id: 1, pos: { x: 200, y: 0 } })] }),
      2000,
    );

    // If the old snapshot survived, renderTime 1000 would bracket the pair and
    // yield x = 150. Because it was pruned, only the newer remains -> x = 200.
    const rs = render(interp, 1000);
    expect(rs.tick).toBe(2);
    expect(rs.players[0].pos.x).toBeCloseTo(200);
  });

  it('caps the buffer at MAX_BUFFERED, dropping the oldest snapshots', () => {
    const interp = new SnapshotInterpolator();
    // 25 snapshots 10ms apart (all within MAX_AGE_MS) -> only the last 20 survive.
    for (let i = 1; i <= 25; i++) {
      pushAt(
        interp,
        mkSnapshot({
          tick: i,
          players: [mkPlayer({ id: 1, peerId: 'me', pos: { x: i * 10, y: 0 } })],
        }),
        (i - 1) * 10,
      );
    }

    // Survivors are ticks 6..25 (recvMs 50..240). Sampling before the earliest
    // survivor clamps to tick 6 — proving ticks 1..5 were dropped.
    const rs = render(interp, 25); // renderTime 25 < earliest survivor recvMs 50
    expect(rs.tick).toBe(6);
    expect(rs.players[0].pos.x).toBeCloseTo(60);
    // The newest is still tick 25.
    expect(interp.latestOwnView('me')?.pos.x).toBeCloseTo(250);
  });
});

describe('SnapshotInterpolator — latestOwnView', () => {
  it('returns null on an empty buffer', () => {
    const interp = new SnapshotInterpolator();
    expect(interp.latestOwnView('me')).toBeNull();
  });

  it('returns the newest view of the matching peer', () => {
    const interp = new SnapshotInterpolator();
    pushAt(
      interp,
      mkSnapshot({ players: [mkPlayer({ id: 1, peerId: 'me', pos: { x: 100, y: 0 } })] }),
      1000,
    );
    pushAt(
      interp,
      mkSnapshot({ players: [mkPlayer({ id: 1, peerId: 'me', pos: { x: 200, y: 0 } })] }),
      1050,
    );

    const own = interp.latestOwnView('me');
    expect(own?.pos.x).toBe(200); // raw (uninterpolated) newest view
  });

  it('scans back to an older snapshot when the peer is missing from the newest', () => {
    const interp = new SnapshotInterpolator();
    pushAt(
      interp,
      mkSnapshot({ players: [mkPlayer({ id: 1, peerId: 'me', pos: { x: 100, y: 0 } })] }),
      1000,
    );
    pushAt(interp, mkSnapshot({ players: [mkPlayer({ id: 2, peerId: 'other' })] }), 1050);

    expect(interp.latestOwnView('me')?.pos.x).toBe(100);
    expect(interp.latestOwnView('ghost')).toBeNull();
  });
});

describe('SnapshotInterpolator — events emitted exactly once', () => {
  const hit: GameEvent = { t: 'hit', pos: { x: 1, y: 1 }, amount: 10, targetId: 1, side: 'player' };
  const death: GameEvent = { t: 'death', id: 2, kind: 'add', pos: { x: 2, y: 2 } };
  const spawn: GameEvent = { t: 'spawn', id: 3, kind: 'add', pos: { x: 3, y: 3 } };

  it('emits every buffered snapshot event once, then nothing on a repeat sample', () => {
    const interp = new SnapshotInterpolator();
    pushAt(interp, mkSnapshot({ tick: 1, events: [hit] }), 1000);
    pushAt(interp, mkSnapshot({ tick: 2, events: [death] }), 1050);

    const first = render(interp, 1025);
    expect(first.events).toHaveLength(2);
    expect(first.events).toContainEqual(hit);
    expect(first.events).toContainEqual(death);

    // No new snapshots -> already-emitted ticks are not re-emitted.
    const second = render(interp, 1025);
    expect(second.events).toHaveLength(0);
  });

  it('emits only the events of newly-arrived (higher-tick) snapshots', () => {
    const interp = new SnapshotInterpolator();
    pushAt(interp, mkSnapshot({ tick: 1, events: [hit] }), 1000);
    pushAt(interp, mkSnapshot({ tick: 2, events: [death] }), 1050);
    render(interp, 1025); // drains ticks 1 & 2

    pushAt(interp, mkSnapshot({ tick: 3, events: [spawn] }), 1100);
    const rs = render(interp, 1075);
    expect(rs.events).toEqual([spawn]);
  });
});

describe('SnapshotInterpolator — reset', () => {
  it('clears the buffer so sample returns null again', () => {
    const interp = new SnapshotInterpolator();
    pushAt(interp, mkSnapshot({ tick: 1, players: [mkPlayer({ id: 1 })] }), 1000);
    expect(interp.sample(1100, opts())).not.toBeNull();

    interp.reset();
    expect(interp.sample(1100, opts())).toBeNull();
    expect(interp.latestOwnView('peer-1')).toBeNull();
  });

  it('resets the emitted-tick watermark so events fire again after reset', () => {
    const interp = new SnapshotInterpolator();
    const ev: GameEvent = { t: 'downed', id: 1, pos: { x: 0, y: 0 } };
    pushAt(interp, mkSnapshot({ tick: 5, events: [ev] }), 1000);
    expect(render(interp, 1000).events).toEqual([ev]);

    interp.reset();
    pushAt(interp, mkSnapshot({ tick: 5, events: [ev] }), 2000);
    // lastEmittedTick is back to -1, so tick 5 emits once more.
    expect(render(interp, 2000).events).toEqual([ev]);
  });
});
