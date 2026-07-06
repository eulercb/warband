/**
 * Warband — rig shading helpers.
 *
 * The "sphere" look (light from the top-left, dark far edge) that RECOLOURS per
 * entity and is cheap enough to run every frame. We bake ONE white radial-sphere
 * texture at load and tint + scale it per body part — no per-frame gradient fills
 * (which also sidesteps PixiJS `FillGradient` API churn across v8 minors). Limbs,
 * shadows and decor are drawn as plain shapes on a single per-rig `Graphics`.
 *
 * The baked highlight sits at the texture's top-left, so body sprites are drawn
 * axis-aligned (never rotated) and the light reads consistently top-left across
 * every creature regardless of which way it faces — matching the single global
 * `LIGHT` direction below. Part *positions* rotate with the body; part *images*
 * do not. Body parts are near-circular, so the un-rotated ellipse is imperceptible.
 */
import { Texture, type Graphics } from 'pixi.js';
import type { Vec2 } from './math/vec';

/** Global light direction (screen space, y-down): up and to the left. */
export const LIGHT: Vec2 = { x: -0.6, y: -0.8 };

/**
 * Bake a soft white radial "sphere" on a transparent background. White so a
 * sprite `tint` both palette-swaps AND darkens toward the edge. Built once.
 */
export function makeSphereTexture(size = 128): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return Texture.WHITE;
  // Highlight offset toward the top-left (matches LIGHT); dark rim at the edge.
  const g = ctx.createRadialGradient(
    size * 0.4,
    size * 0.38,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  );
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(216,216,216,1)');
  g.addColorStop(0.85, 'rgba(150,150,150,1)');
  g.addColorStop(1, 'rgba(92,92,92,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  return Texture.from(c);
}

// --- Colour maths (channel mixes toward white / black) -----------------------

function mix(color: number, toward: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (color >> 16) & 0xff;
  const ag = (color >> 8) & 0xff;
  const ab = color & 0xff;
  const br = (toward >> 16) & 0xff;
  const bg = (toward >> 8) & 0xff;
  const bb = toward & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const b = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | b;
}

/** Blend `color` toward white by `t` (0..1). */
export const lighten = (color: number, t: number): number => mix(color, 0xffffff, t);
/** Blend `color` toward black by `t` (0..1). */
export const darken = (color: number, t: number): number => mix(color, 0x000000, t);
/** Blend two packed colours (`t` = 0 → a, 1 → b). */
export const mixColor = (a: number, b: number, t: number): number => mix(a, b, t);

export interface Palette {
  base: number;
  shadow: number;
  hi: number;
  rim: number;
}

/** Derive a small shading palette from one entity colour. */
export function palette(color: number): Palette {
  return {
    base: color,
    shadow: darken(color, 0.4),
    hi: lighten(color, 0.5),
    rim: lighten(color, 0.7),
  };
}

// --- Graphics primitives -----------------------------------------------------

/**
 * A tapered two-segment limb (root → joint → tip) with rounded joints and a dark
 * tip cap. Used for legs, arms and tentacle-free appendages. Widths are already
 * in screen pixels.
 */
export function drawLimb(
  g: Graphics,
  root: Vec2,
  joint: Vec2,
  tip: Vec2,
  wRoot: number,
  wTip: number,
  color: number,
): void {
  g.moveTo(root.x, root.y)
    .lineTo(joint.x, joint.y)
    .stroke({ width: wRoot, color, cap: 'round', join: 'round' });
  g.moveTo(joint.x, joint.y)
    .lineTo(tip.x, tip.y)
    .stroke({ width: wTip, color, cap: 'round', join: 'round' });
  g.circle(tip.x, tip.y, Math.max(0.6, wTip * 0.7)).fill({ color: darken(color, 0.3) });
}

/** Soft grounding shadow beneath a body, offset slightly toward the light's foot. */
export function contactShadow(g: Graphics, x: number, y: number, rx: number, ry: number): void {
  g.ellipse(x, y + ry * 0.15, rx, ry).fill({ color: 0x000000, alpha: 0.26 });
}

/** Tiny grounding shadow beneath a planted foot. */
export function footShadow(g: Graphics, x: number, y: number, r: number): void {
  g.ellipse(x, y + r * 0.4, r, r * 0.5).fill({ color: 0x000000, alpha: 0.18 });
}
