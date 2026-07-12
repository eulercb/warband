/**
 * Warband — quad-strip extrusion for the `limb` lit-mesh variant.
 *
 * PURE (no PixiJS / DOM) and unit-tested, mirroring the `light.ts` / `litShader.ts`
 * split: the shader owns the analytic cylinder normal `N = vec3(perp·v, √(1−v²))`,
 * and this module builds the geometry that feeds it. A limb (leg / arm / tentacle)
 * is a centre-line polyline of `n` points; extruding ±perpendicular by a per-point
 * half-width gives a two-wide vertex strip. Each point emits a LEFT vertex (on the
 * +perp side, `aV = +1`) and a RIGHT vertex (`aV = −1`); both carry the same model-
 * space perpendicular `aPerp`, so the fragment shader interpolates a smooth
 * cross-limb normal that reads as a lit tube. The `litMesh.LitLimb` GPU glue owns
 * the buffers and re-uploads `positions` + `perp` after each `extrudeStrip`.
 *
 * Coordinate space: the rig writes limb centre-lines in SCREEN pixels (like every
 * other rig primitive) and the lit-mesh keeps an identity transform, so `aPerp` is
 * already in the shader's space — see the lighting README's "screen space"
 * adaptation and `LitLimb`.
 */
import type { Vec2 } from '../../engine/core/types';

/** Static + per-frame vertex buffers for an `n`-point limb strip (2·n vertices). */
export interface StripBuffers {
  /** vec2 per vertex — rewritten every frame by `extrudeStrip`. */
  positions: Float32Array;
  /** vec2 per vertex — static; along-limb t in x, cross-limb 0/1 in y. */
  uvs: Float32Array;
  /** vec2 per vertex — the +perp direction; rewritten every frame. */
  perp: Float32Array;
  /** float per vertex — cross-limb coord, +1 (left) / −1 (right); static. */
  v: Float32Array;
  /** Two triangles per segment (6·(n−1) indices); static. */
  indices: Uint32Array;
  /** Centre-line point count this strip was allocated for. */
  points: number;
}

/**
 * Allocate a strip for an `n`-point centre-line and fill everything that never
 * changes: UVs, the cross-limb sign `aV`, and the triangle indices. `positions`
 * and `perp` are left zeroed for `extrudeStrip` to fill each frame. `n` must be
 * ≥ 1; a 1-point strip has no segments (no triangles) and draws nothing.
 */
export function makeStrip(n: number): StripBuffers {
  const verts = 2 * n;
  const positions = new Float32Array(verts * 2);
  const uvs = new Float32Array(verts * 2);
  const perp = new Float32Array(verts * 2);
  const v = new Float32Array(verts);
  const segs = n > 1 ? n - 1 : 0;
  const indices = new Uint32Array(segs * 6);

  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const li = 2 * i; // left  vertex (on the +perp side)
    const ri = 2 * i + 1; // right vertex
    uvs[li * 2] = t;
    uvs[li * 2 + 1] = 0;
    uvs[ri * 2] = t;
    uvs[ri * 2 + 1] = 1;
    v[li] = 1;
    v[ri] = -1;
  }

  // One quad per segment (points i, i+1): triangles (L_i,R_i,R_{i+1}) and
  // (L_i,R_{i+1},L_{i+1}). Winding is irrelevant — the imposter lights both faces
  // (N.z ≥ 0) and the mesh isn't back-face culled.
  for (let i = 0; i < segs; i++) {
    const o = i * 6;
    const l0 = 2 * i;
    const r0 = 2 * i + 1;
    const l1 = 2 * i + 2;
    const r1 = 2 * i + 3;
    indices[o] = l0;
    indices[o + 1] = r0;
    indices[o + 2] = r1;
    indices[o + 3] = l0;
    indices[o + 4] = r1;
    indices[o + 5] = l1;
  }

  return { positions, uvs, perp, v, indices, points: n };
}

/** Miter never stretches an offset past this factor (guards near-180° fold-backs). */
const MAX_MITER = 4;
const MIN_COS = 1 / MAX_MITER;

/**
 * Rewrite `buf.positions` + `buf.perp` for a limb whose centre-line is `pts` with
 * per-point half-widths `hw` (screen pixels). `pts.length` and `hw.length` must
 * equal `buf.points`. Endpoints extrude along the single adjacent segment; interior
 * joints extrude along the angle-bisector perpendicular, widened by 1/cos(½·bend)
 * (clamped) so the tube keeps its width around a curl. Both the LEFT (+perp) and
 * RIGHT (−perp) vertex of a point share the same `aPerp`; only `aV` (baked by
 * `makeStrip`) flips, which is what gives the shader its ±perp → +z normal sweep.
 */
export function extrudeStrip(buf: StripBuffers, pts: readonly Vec2[], hw: readonly number[]): void {
  const n = buf.points;
  const { positions, perp } = buf;

  for (let i = 0; i < n; i++) {
    // Incoming / outgoing unit segment directions around point i (either may be
    // absent at an endpoint; a zero-length segment resolves to null and is skipped).
    const inDir = i > 0 ? unit(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) : null;
    const outDir = i < n - 1 ? unit(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) : null;

    let px: number;
    let py: number;
    let scale = 1;
    if (inDir && outDir) {
      // Interior joint: bisector perpendicular, widened to hold the width at a bend.
      let mx = -inDir.y - outDir.y; // perp(inDir) + perp(outDir), perp(d) = (−dy, dx)
      let my = inDir.x + outDir.x;
      const ml = Math.hypot(mx, my);
      if (ml < 1e-6) {
        // Near-total fold-back: bisector collapses — fall back to one segment's perp.
        mx = -inDir.y;
        my = inDir.x;
      } else {
        mx /= ml;
        my /= ml;
        // cos(½·bend) between the miter and a segment perpendicular.
        const cos = mx * -inDir.y + my * inDir.x;
        scale = 1 / Math.max(Math.abs(cos), MIN_COS);
      }
      px = mx;
      py = my;
    } else {
      // Endpoint (or a degenerate limb): perpendicular of whichever segment exists.
      const d = inDir ?? outDir ?? { x: 1, y: 0 };
      px = -d.y;
      py = d.x;
    }

    const off = hw[i] * scale;
    const li = 2 * i;
    const ri = 2 * i + 1;
    positions[li * 2] = pts[i].x + px * off;
    positions[li * 2 + 1] = pts[i].y + py * off;
    positions[ri * 2] = pts[i].x - px * off;
    positions[ri * 2 + 1] = pts[i].y - py * off;
    perp[li * 2] = px;
    perp[li * 2 + 1] = py;
    perp[ri * 2] = px;
    perp[ri * 2 + 1] = py;
  }
}

/** Unit vector, or `null` when the input is (near) zero length. */
function unit(x: number, y: number): { x: number; y: number } | null {
  const l = Math.hypot(x, y);
  if (l < 1e-9) return null;
  return { x: x / l, y: y / l };
}
