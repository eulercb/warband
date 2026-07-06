/**
 * Warband — stepping gait unit tests (render/rig/math/gait).
 *
 * Pins the gait's contract: a stretched leg with a grounded partner and free
 * concurrency starts a step; the concurrency cap and partner rule hold; a step
 * lands the foot exactly on its plant target after enough ticks; and an idle
 * body (moveDir = 0) still re-plants feet that have drifted.
 */
import { describe, it, expect } from 'vitest';
import {
  updateGait,
  makeLeg,
  smoothstep,
  type GaitParams,
  type LegRuntime,
} from '../src/render/rig/math/gait';
import type { Vec2 } from '../src/render/rig/math/vec';

function params(over: Partial<GaitParams> = {}): GaitParams {
  return {
    stepDistance: 10,
    stepDuration: 0.16,
    overstep: 0,
    maxConcurrent: 3,
    partnerOf: (i) => (i + 1) % 2,
    jitter: () => 1,
    ...over,
  };
}

describe('smoothstep', () => {
  it('pins the endpoints and midpoint', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('updateGait', () => {
  it('starts a step when a foot drifts past the threshold', () => {
    const legs: LegRuntime[] = [makeLeg({ x: 0, y: 0 }), makeLeg({ x: 100, y: 0 })];
    const homes: Vec2[] = [
      { x: 40, y: 0 }, // leg 0 is 40 away from home > stepDistance 10
      { x: 100, y: 0 }, // leg 1 is home
    ];
    updateGait(legs, homes, { x: 1, y: 0 }, 0.016, params());
    expect(legs[0].stepping).toBe(true);
    expect(legs[1].stepping).toBe(false);
  });

  it('does not step a foot still within threshold', () => {
    const legs = [makeLeg({ x: 0, y: 0 }), makeLeg({ x: 100, y: 0 })];
    const homes: Vec2[] = [
      { x: 5, y: 0 }, // 5 < stepDistance 10
      { x: 100, y: 0 },
    ];
    updateGait(legs, homes, { x: 1, y: 0 }, 0.016, params());
    expect(legs[0].stepping).toBe(false);
  });

  it('honours the concurrency cap', () => {
    // Four legs all stretched; cap of 1 means only one lifts this frame.
    const legs = [0, 1, 2, 3].map((i) => makeLeg({ x: i * 100, y: 0 }));
    const homes: Vec2[] = legs.map((l) => ({ x: l.foot.x + 40, y: 0 }));
    updateGait(
      legs,
      homes,
      { x: 1, y: 0 },
      0.016,
      params({ maxConcurrent: 1, partnerOf: (i) => (i + 2) % 4 }),
    );
    expect(legs.filter((l) => l.stepping).length).toBe(1);
  });

  it('will not lift a leg whose antiphase partner is already stepping', () => {
    const legs = [makeLeg({ x: 0, y: 0 }), makeLeg({ x: 100, y: 0 })];
    legs[1].stepping = true; // partner of leg 0 (partnerOf(0) === 1) is airborne
    const homes: Vec2[] = [
      { x: 40, y: 0 },
      { x: 140, y: 0 },
    ];
    updateGait(legs, homes, { x: 1, y: 0 }, 0.016, params({ maxConcurrent: 3 }));
    expect(legs[0].stepping).toBe(false);
  });

  it('lands the foot exactly on its plant target after a full step', () => {
    const legs = [makeLeg({ x: 0, y: 0 }), makeLeg({ x: 100, y: 0 })];
    const home = { x: 30, y: 0 };
    const homes: Vec2[] = [home, { x: 100, y: 0 }];
    const p = params({ overstep: 6, stepDuration: 0.16 });
    // Kick off the step, then run enough fixed ticks (0.02s each) to exceed 1.
    updateGait(legs, homes, { x: 1, y: 0 }, 0.02, p);
    expect(legs[0].stepping).toBe(true);
    const expected = { x: home.x + 6, y: 0 }; // home + moveDir*overstep
    for (let i = 0; i < 10 && legs[0].stepping; i++) {
      updateGait(legs, homes, { x: 1, y: 0 }, 0.02, p);
    }
    expect(legs[0].stepping).toBe(false);
    expect(legs[0].foot.x).toBeCloseTo(expected.x, 6);
    expect(legs[0].foot.y).toBeCloseTo(expected.y, 6);
  });

  it('re-plants a drifted foot even when idle (moveDir = 0)', () => {
    const legs = [makeLeg({ x: 0, y: 0 }), makeLeg({ x: 100, y: 0 })];
    const home = { x: 40, y: 0 };
    const homes: Vec2[] = [home, { x: 100, y: 0 }];
    const p = params({ overstep: 12 });
    updateGait(legs, homes, { x: 0, y: 0 }, 0.02, p);
    expect(legs[0].stepping).toBe(true);
    for (let i = 0; i < 12 && legs[0].stepping; i++) {
      updateGait(legs, homes, { x: 0, y: 0 }, 0.02, p);
    }
    // With no move direction the foot settles onto the home itself (overstep*0).
    expect(legs[0].foot.x).toBeCloseTo(home.x, 6);
    expect(legs[0].foot.y).toBeCloseTo(home.y, 6);
  });
});
