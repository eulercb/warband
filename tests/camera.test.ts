/**
 * Warband — render Camera unit tests.
 *
 * Pure world<->screen math for the toroidal (wrap-around) arena: follow
 * smoothing, the party-spread zoom band, nearest-copy projection across the wrap
 * seam, tiled ±ARENA offset projection, and decaying screen shake. No Pixi / DOM.
 *
 * Every position/scale assertion uses `toBeCloseTo` — the projection routinely
 * yields `-0` and floating-point residue that a strict `toEqual` would reject
 * spuriously. Only ordering checks ("moved toward, not past") use greater/less.
 *
 * Observability: `zoom`, `coverScale` and `shakeEnergy` are private. We read the
 * zoom through `scale` by fitting the viewport to the exact arena size (then
 * `coverScale === 1`, so `scale === zoom`), and read the shake energy through the
 * magnitude of `shakeOffset` after pinning `Math.random` (with a constant `r`,
 * cos/sin form a unit vector, so `|shakeOffset| === shakeEnergy * r`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Camera, setShakeEnabled, isShakeEnabled } from '../src/render/pipeline/camera';
import { ARENA_W, ARENA_H } from '../src/engine/core/constants';
import type { Vec2 } from '../src/engine/core/types';

// --- Mirrors of camera.ts's private tunables (kept in sync by hand) ----------
// FOLLOW_RATE = 6, ZOOM_RATE = 3, SHAKE_DECAY = 7, FRAME_MARGIN = 120 (per sec).
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 1.5;
const MAX_SHAKE = 24;

function runFollow(cam: Camera, target: Vec2, steps: number, dtMs: number): void {
  for (let i = 0; i < steps; i++) cam.follow(target, dtMs);
}
function runUpdates(cam: Camera, steps: number, dtMs: number): void {
  for (let i = 0; i < steps; i++) cam.update(dtMs);
}
function mag(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

afterEach(() => {
  // Undo any vi.spyOn(Math, 'random') so pinned randomness never leaks.
  vi.restoreAllMocks();
});

describe('Camera: construction defaults', () => {
  it('centers on the arena middle with identity scale and zeroed offsets', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    expect(cam.center.x).toBeCloseTo(ARENA_W / 2); // 800
    expect(cam.center.y).toBeCloseTo(ARENA_H / 2); // 500
    expect(cam.scale).toBeCloseTo(1); // no fit yet
    expect(cam.screenCenter.x).toBeCloseTo(0);
    expect(cam.screenCenter.y).toBeCloseTo(0);
    expect(cam.shakeOffset.x).toBeCloseTo(0);
    expect(cam.shakeOffset.y).toBeCloseTo(0);
    expect(cam.viewSize.x).toBeCloseTo(0);
    expect(cam.viewSize.y).toBeCloseTo(0);
  });

  it('supports a non-square arena', () => {
    const cam = new Camera(400, 800);
    expect(cam.center.x).toBeCloseTo(200);
    expect(cam.center.y).toBeCloseTo(400);
  });
});

describe('Camera: fit (cover projection)', () => {
  it('uses a whole-arena COVER fit and the default (max) zoom', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.fit(ARENA_W, ARENA_H);
    // coverScale = max(1600/1600, 1000/1000) = 1; scale = coverScale * ZOOM_MAX.
    expect(cam.scale).toBeCloseTo(ZOOM_MAX); // 1.5 => default zoom is ZOOM_MAX
    expect(cam.screenCenter.x).toBeCloseTo(ARENA_W / 2);
    expect(cam.screenCenter.y).toBeCloseTo(ARENA_H / 2);
    expect(cam.viewSize.x).toBeCloseTo(ARENA_W);
    expect(cam.viewSize.y).toBeCloseTo(ARENA_H);
  });

  it('cover fit takes the MAX axis ratio (landscape viewport)', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.fit(2000, 1000);
    // coverScale = max(2000/1600, 1000/1000) = max(1.25, 1) = 1.25.
    expect(cam.scale).toBeCloseTo(1.25 * ZOOM_MAX); // 1.875
    expect(cam.screenCenter.x).toBeCloseTo(1000);
    expect(cam.screenCenter.y).toBeCloseTo(500);
  });

  it('cover fit takes the MAX axis ratio (portrait viewport)', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.fit(1000, 2000);
    // coverScale = max(1000/1600, 2000/1000) = max(0.625, 2) = 2.
    expect(cam.scale).toBeCloseTo(2 * ZOOM_MAX); // 3
    expect(cam.screenCenter.x).toBeCloseTo(500);
    expect(cam.screenCenter.y).toBeCloseTo(1000);
  });
});

describe('Camera: follow (center smoothing across the torus)', () => {
  it('seeds instantly on the first call, wrapping the target into the tile', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.follow({ x: ARENA_W + 100, y: ARENA_H + 100 }, 16);
    // The first follow snaps (no smoothing) to wrapPos(target).
    expect(cam.center.x).toBeCloseTo(100);
    expect(cam.center.y).toBeCloseTo(100);
  });

  it('eases toward the target without overshooting, then converges', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.follow({ x: 800, y: 500 }, 100); // seed
    cam.follow({ x: 900, y: 500 }, 100); // one 100ms smoothing step
    // k = 1 - e^{-FOLLOW_RATE*dt} = 1 - e^{-0.6}; x = 800 + 100*k.
    const k = 1 - Math.exp(-0.6);
    expect(cam.center.x).toBeCloseTo(800 + 100 * k); // ~845.12
    expect(cam.center.y).toBeCloseTo(500);
    expect(cam.center.x).toBeGreaterThan(800); // moved toward
    expect(cam.center.x).toBeLessThan(900); // ...but not past

    // Many steps converge onto the target and still never overshoot it.
    runFollow(cam, { x: 900, y: 500 }, 200, 100);
    expect(cam.center.x).toBeCloseTo(900, 4);
    expect(cam.center.x).toBeLessThanOrEqual(900 + 1e-6);
    expect(cam.center.y).toBeCloseTo(500);
  });

  it('advances further in a single step for a larger dt', () => {
    const slow = new Camera(ARENA_W, ARENA_H);
    const fast = new Camera(ARENA_W, ARENA_H);
    slow.follow({ x: 800, y: 500 }, 100); // seed
    fast.follow({ x: 800, y: 500 }, 100); // seed
    slow.follow({ x: 900, y: 500 }, 50);
    fast.follow({ x: 900, y: 500 }, 200);
    expect(slow.center.x).toBeCloseTo(800 + 100 * (1 - Math.exp(-0.3))); // ~825.9
    expect(fast.center.x).toBeCloseTo(800 + 100 * (1 - Math.exp(-1.2))); // ~869.9
    expect(fast.center.x).toBeGreaterThan(slow.center.x);
  });

  it('follows the SHORT way across the wrap seam, not the long way', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.follow({ x: 50, y: 500 }, 100); // seed near the left edge
    cam.follow({ x: 1590, y: 500 }, 100); // target near the right edge
    // The nearest copy of x=1590 relative to x=50 is x=-10 (1590 - 1600), so the
    // camera drifts LEFT toward the seam, not right across the whole arena.
    const k = 1 - Math.exp(-0.6);
    expect(cam.center.x).toBeCloseTo(50 + -60 * k); // ~22.93
    expect(cam.center.x).toBeLessThan(50); // moved toward the seam (short way)
    // The long way round would have pushed it toward ~745 instead.
    expect(cam.center.x).toBeLessThan(100);

    // Convergence wraps across the seam and settles on the canonical target.
    runFollow(cam, { x: 1590, y: 500 }, 300, 100);
    expect(cam.center.x).toBeCloseTo(1590, 2);
    expect(cam.center.y).toBeCloseTo(500);
  });
});

describe('Camera: zoom band (party-spread framing)', () => {
  it('zooms back IN to ZOOM_MAX when a spread party regroups tight', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.fit(ARENA_W, ARENA_H); // coverScale = 1, so scale === zoom
    cam.frameGroup(900); // wide spread -> target ZOOM_MIN
    runUpdates(cam, 200, 100);
    expect(cam.scale).toBeCloseTo(ZOOM_MIN); // zoomed all the way out first

    cam.frameGroup(0); // bunched -> desired 500/120 = 4.17 -> clamped ZOOM_MAX
    cam.update(100);
    expect(cam.scale).toBeGreaterThan(ZOOM_MIN); // easing back in...
    expect(cam.scale).toBeLessThan(ZOOM_MAX); // ...not yet arrived
    runUpdates(cam, 200, 100);
    expect(cam.scale).toBeCloseTo(ZOOM_MAX); // 1.5 tight framing
  });

  it('zooms OUT toward ZOOM_MIN as the group spreads apart', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.fit(ARENA_W, ARENA_H); // starts at ZOOM_MAX
    cam.frameGroup(900); // span 1020 -> desired 500/1020 = 0.49 -> ZOOM_MIN
    // One smoothing step eases from ZOOM_MAX toward the target, not all the way.
    cam.update(100);
    const kz = 1 - Math.exp(-0.3); // 1 - e^{-ZOOM_RATE*dt}
    expect(cam.scale).toBeCloseTo(ZOOM_MAX + (ZOOM_MIN - ZOOM_MAX) * kz); // ~1.370
    expect(cam.scale).toBeLessThan(ZOOM_MAX);
    expect(cam.scale).toBeGreaterThan(ZOOM_MIN);

    runUpdates(cam, 200, 100);
    expect(cam.scale).toBeCloseTo(ZOOM_MIN); // settles at the floor
  });

  it('settles at an intermediate zoom for a mid-range spread', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.fit(ARENA_W, ARENA_H);
    cam.frameGroup(280); // span 400 -> desired 500/400 = 1.25 (inside the band)
    runUpdates(cam, 200, 100);
    expect(cam.scale).toBeCloseTo(1.25);
  });

  it('never leaves the [ZOOM_MIN, ZOOM_MAX] band for any spread', () => {
    for (const halfSpan of [-1000, 0, 50, 200, 280, 400, 900, 100000]) {
      const cam = new Camera(ARENA_W, ARENA_H);
      cam.fit(ARENA_W, ARENA_H);
      cam.frameGroup(halfSpan); // exercises the max(1, ...) floor + both clamps
      for (let i = 0; i < 80; i++) {
        cam.update(100);
        expect(cam.scale).toBeGreaterThanOrEqual(ZOOM_MIN - 1e-9);
        expect(cam.scale).toBeLessThanOrEqual(ZOOM_MAX + 1e-9);
      }
    }
  });

  it('threads the cover scale through the zoom (non-unit fit)', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.fit(3200, 2000); // coverScale = max(2, 2) = 2
    cam.frameGroup(100000); // huge spread -> target ZOOM_MIN
    runUpdates(cam, 200, 100);
    expect(cam.scale).toBeCloseTo(2 * ZOOM_MIN); // 2.0 = coverScale * ZOOM_MIN
  });
});

describe('Camera: world -> screen projection', () => {
  // fit to the exact arena so coverScale = 1, scale = 1.5, screenCenter {800,500}.
  function fitted(): Camera {
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.fit(ARENA_W, ARENA_H);
    return cam;
  }

  it('maps the camera center to the screen center', () => {
    const cam = fitted();
    const s = cam.worldToScreen(cam.center);
    expect(s.x).toBeCloseTo(cam.screenCenter.x); // 800
    expect(s.y).toBeCloseTo(cam.screenCenter.y); // 500
  });

  it('scales offsets from the center by the world->screen scale', () => {
    const cam = fitted();
    cam.center = { x: 800, y: 500 };
    // 100 world units right of center -> 100 * 1.5 = 150 screen px right.
    const s = cam.worldToScreen({ x: 900, y: 500 });
    expect(s.x).toBeCloseTo(800 + 100 * 1.5); // 950
    expect(s.y).toBeCloseTo(500);
  });

  it('draws a point beyond the seam at its NEAREST torus copy (x wrap)', () => {
    const cam = fitted();
    cam.center = { x: 50, y: 500 }; // camera hugging the left edge
    const near = cam.worldToScreen({ x: 1590, y: 500 }); // point near right edge
    // Nearest copy is x = -10 (1590 - 1600): (-10 - 50)*1.5 + 800 = 710.
    expect(near.x).toBeCloseTo(710);
    expect(near.y).toBeCloseTo(500);
    // The raw (non-wrapping) projection of the SAME point lands far off-screen,
    // proving worldToScreen chose the near copy, not the far one.
    const far = cam.toScreen({ x: 1590, y: 500 });
    expect(far.x).toBeCloseTo(3110); // (1590 - 50)*1.5 + 800
    expect(near.x).toBeLessThan(far.x);
  });

  it('draws a point beyond the seam at its NEAREST torus copy (y wrap)', () => {
    const cam = fitted();
    cam.center = { x: 800, y: 50 };
    const s = cam.worldToScreen({ x: 800, y: 990 });
    // Nearest copy is y = -10 (990 - 1000): (-10 - 50)*1.5 + 500 = 410.
    expect(s.x).toBeCloseTo(800);
    expect(s.y).toBeCloseTo(410);
  });

  it('wraps on both axes at once', () => {
    const cam = fitted();
    cam.center = { x: 50, y: 50 };
    const s = cam.worldToScreen({ x: 1590, y: 990 });
    expect(s.x).toBeCloseTo(710);
    expect(s.y).toBeCloseTo(410);
  });

  it('toScreen tiles static layers at explicit ±ARENA offsets (no wrap)', () => {
    const cam = fitted();
    cam.center = { x: 800, y: 500 };
    const base = cam.toScreen({ x: 800, y: 500 });
    expect(base.x).toBeCloseTo(800);
    expect(base.y).toBeCloseTo(500);
    // One arena right / left along x: shifts by ARENA_W * scale = 2400 px.
    expect(cam.toScreen({ x: 800 + ARENA_W, y: 500 }).x).toBeCloseTo(800 + ARENA_W * 1.5); // 3200
    expect(cam.toScreen({ x: 800 - ARENA_W, y: 500 }).x).toBeCloseTo(800 - ARENA_W * 1.5); // -1600
    // One arena down / up along y: shifts by ARENA_H * scale = 1500 px.
    expect(cam.toScreen({ x: 800, y: 500 + ARENA_H }).y).toBeCloseTo(500 + ARENA_H * 1.5); // 2000
    expect(cam.toScreen({ x: 800, y: 500 - ARENA_H }).y).toBeCloseTo(500 - ARENA_H * 1.5); // -1000
    // worldToScreen, unlike toScreen, collapses that +ARENA copy back onto the
    // center (nearest copy), so the two disagree by exactly one arena width.
    expect(cam.worldToScreen({ x: 800 + ARENA_W, y: 500 }).x).toBeCloseTo(800);
  });

  it('screenToWorld inverts worldToScreen back into the canonical tile', () => {
    const cam = fitted();
    cam.center = { x: 640, y: 360 };
    const w = { x: 1000, y: 700 };
    const round = cam.screenToWorld(cam.worldToScreen(w));
    expect(round.x).toBeCloseTo(w.x);
    expect(round.y).toBeCloseTo(w.y);
    // The screen center always inverts to the camera center.
    const c = cam.screenToWorld(cam.screenCenter);
    expect(c.x).toBeCloseTo(cam.center.x);
    expect(c.y).toBeCloseTo(cam.center.y);
  });

  it('screenToWorld wraps out-of-tile results back in', () => {
    const cam = fitted();
    cam.center = { x: 800, y: 500 };
    // A screen point one arena-width (in px) right of center maps to world
    // x = 2400 in raw space, which wraps back to 800.
    const w = cam.screenToWorld({ x: 800 + ARENA_W * 1.5, y: 500 });
    expect(w.x).toBeCloseTo(800);
    expect(w.y).toBeCloseTo(500);
  });
});

describe('Camera: screen shake (energy add + decay)', () => {
  // With Math.random pinned to a constant r, the jitter angle is fixed and
  // |shakeOffset| = shakeEnergy * r (cos/sin of one angle form a unit vector).
  it('adds energy and jitters within it (below the cap)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.addShake(10);
    cam.update(0); // dt 0 -> no decay; reads the energy straight back
    expect(mag(cam.shakeOffset)).toBeCloseTo(10 * 0.5); // 5
  });

  it('accumulates successive shakes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.addShake(4);
    cam.addShake(6);
    cam.update(0);
    expect(mag(cam.shakeOffset)).toBeCloseTo(10 * 0.5); // 5
  });

  it('clamps accumulated energy to MAX_SHAKE', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.addShake(1000); // single huge add
    cam.update(0);
    expect(mag(cam.shakeOffset)).toBeCloseTo(MAX_SHAKE * 0.5); // 12

    const cam2 = new Camera(ARENA_W, ARENA_H);
    cam2.addShake(20);
    cam2.addShake(20); // 40 -> clamped to 24
    cam2.update(0);
    expect(mag(cam2.shakeOffset)).toBeCloseTo(MAX_SHAKE * 0.5); // 12
  });

  it('decays exponentially and then snaps the offset to zero', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const cam = new Camera(ARENA_W, ARENA_H);
    cam.addShake(MAX_SHAKE); // 24

    cam.update(100); // decay by e^{-SHAKE_DECAY*0.1} = e^{-0.7}
    const first = mag(cam.shakeOffset);
    expect(first).toBeCloseTo(MAX_SHAKE * Math.exp(-0.7) * 0.5); // ~5.96

    cam.update(100); // decay again
    const second = mag(cam.shakeOffset);
    expect(second).toBeCloseTo(MAX_SHAKE * Math.exp(-1.4) * 0.5); // ~2.96
    expect(second).toBeLessThan(first); // strictly decaying toward zero

    // Eventually the energy dips below the cutoff and the offset zeroes out.
    runUpdates(cam, 30, 100);
    expect(cam.shakeOffset.x).toBeCloseTo(0);
    expect(cam.shakeOffset.y).toBeCloseTo(0);
  });

  it('keeps a zero offset through updates when no shake was added', () => {
    const cam = new Camera(ARENA_W, ARENA_H);
    runUpdates(cam, 10, 16); // early-returns before touching Math.random
    expect(cam.shakeOffset.x).toBeCloseTo(0);
    expect(cam.shakeOffset.y).toBeCloseTo(0);
  });
});

describe('Camera: screen-shake accessibility toggle', () => {
  it('addShake is inert while the global toggle is off, then live again once restored', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      setShakeEnabled(false);
      expect(isShakeEnabled()).toBe(false);
      const cam = new Camera(ARENA_W, ARENA_H);
      cam.addShake(1000); // a huge event, but the disabled toggle swallows it whole
      cam.update(0); // dt 0 → no decay; reads the (still zero) energy straight back
      expect(mag(cam.shakeOffset)).toBeCloseTo(0); // no jitter accumulated at all
    } finally {
      setShakeEnabled(true); // restore the module-global default for the other specs
    }
    expect(isShakeEnabled()).toBe(true);
    // Re-enabled: the identical add now registers energy (|offset| = energy * r).
    const cam2 = new Camera(ARENA_W, ARENA_H);
    cam2.addShake(10);
    cam2.update(0);
    expect(mag(cam2.shakeOffset)).toBeCloseTo(10 * 0.5); // 5
  });
});
