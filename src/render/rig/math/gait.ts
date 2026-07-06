/**
 * Warband — procedural stepping gait.
 *
 * PURE + unit-tested. Advances a set of feet toward moving "home" targets: a
 * foot stays planted until it drifts past `stepDistance` from its home, then
 * swings to a new plant point (biased ahead along the move direction) over
 * `stepDuration`, subject to a concurrency cap and an antiphase partner rule so
 * a creature never lifts too many legs at once. Vertical lift is a DRAW-time
 * concern (sin(pi*t) * liftHeight) and intentionally not applied here.
 */
import type { Vec2 } from './vec';

export interface LegRuntime {
  foot: Vec2; // planted position, screen space
  stepping: boolean;
  t: number; // 0..1 step progress
  from: Vec2;
  to: Vec2;
}

export interface GaitParams {
  stepDistance: number; // trigger threshold (screen units)
  stepDuration: number; // seconds per step
  overstep: number; // plant this far ahead along moveDir (screen units)
  maxConcurrent: number; // e.g. 3 for a spider, 1 for a biped
  partnerOf: (i: number) => number; // antiphase partner index
  jitter: (i: number) => number; // per-leg threshold multiplier (seed by id)
}

/** A fresh, un-stepped leg planted at `foot`. */
export function makeLeg(foot: Vec2): LegRuntime {
  return { foot: { x: foot.x, y: foot.y }, stepping: false, t: 0, from: foot, to: foot };
}

/**
 * Advance the gait one frame. `homes[i]` = current rest target for leg i in
 * screen space (recompute each frame from the body transform). `moveDir` = the
 * body's unit velocity (zero vector when idle). Mutates `legs`.
 */
export function updateGait(
  legs: LegRuntime[],
  homes: Vec2[],
  moveDir: Vec2,
  dt: number,
  p: GaitParams,
): void {
  let stepping = 0;
  for (const l of legs) if (l.stepping) stepping++;

  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (l.stepping) {
      l.t += dt / p.stepDuration;
      if (l.t >= 1) {
        l.foot = l.to;
        l.stepping = false;
      } else {
        const e = smoothstep(l.t);
        l.foot = {
          x: l.from.x + (l.to.x - l.from.x) * e,
          y: l.from.y + (l.to.y - l.from.y) * e,
        };
      }
    } else {
      const home = homes[i];
      const dd = Math.hypot(l.foot.x - home.x, l.foot.y - home.y);
      const partnerGrounded = !legs[p.partnerOf(i)].stepping;
      if (dd > p.stepDistance * p.jitter(i) && stepping < p.maxConcurrent && partnerGrounded) {
        l.stepping = true;
        l.t = 0;
        l.from = l.foot;
        l.to = { x: home.x + moveDir.x * p.overstep, y: home.y + moveDir.y * p.overstep };
        stepping++;
      }
    }
  }
}

/** Classic Hermite smoothstep on [0,1]. */
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);
