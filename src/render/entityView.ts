/**
 * Warband — immediate-mode entity drawing helpers.
 *
 * Every helper draws a single entity onto a SHARED, already-cleared `Graphics`
 * at a SCREEN-space position, using `scale` (the camera's world->screen factor)
 * to size world-units. The renderer clears the layer, then calls these once per
 * entity per frame. Text labels (names) are owned by the renderer, not here.
 *
 * Style: clean geometric minimalist top-down, all procedural (no assets).
 */
import type { Graphics } from 'pixi.js';
import type {
  PlayerView,
  BossView,
  AddView,
  ProjectileView,
  ZoneView,
  Vec2,
  ProjectileKind,
  ZoneKind,
} from '../engine/types';
import {
  PLAYER_RADIUS,
  CLASS_COLORS,
  ADD_RADIUS,
  REVIVE_TIME,
  ZONE_FADE_IN,
  ZONE_FADE_OUT,
} from '../engine/constants';
import { getMonster } from '../engine/monsters';
import { clamp } from '../engine/math';

const OUTLINE = 0x0a0a12;

const PROJECTILE_COLORS: Record<ProjectileKind, number> = {
  arrow: 0x76e34a, // green
  arcaneBolt: 0x9c5cf0, // violet
  fireball: 0xff8a3d, // orange
  shadowBolt: 0x8a3ff0, // purple
  smite: 0xf2c14e, // gold
};

const ZONE_COLORS: Record<ZoneKind, number> = {
  voidZone: 0x9c4bd6, // purple
  rainOfArrows: 0x4caf50, // green
  sanctuary: 0xf2c14e, // gold
};

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export function drawPlayer(
  g: Graphics,
  p: PlayerView,
  screen: Vec2,
  scale: number,
  isLocal: boolean,
  flash: number,
): void {
  const r = PLAYER_RADIUS * scale;
  const { x, y } = screen;
  const classColor = CLASS_COLORS[p.classId] ?? 0xffffff;

  // Dead => faint ghost, no HP bar.
  if (p.state === 'dead') {
    g.circle(x, y, r).fill({ color: classColor, alpha: 0.16 });
    g.circle(x, y, r).stroke({ width: 1.5, color: 0xffffff, alpha: 0.14 });
    return;
  }

  const downed = p.state === 'downed';
  const bodyColor = downed ? 0x808088 : classColor;

  // Grounding shadow.
  g.ellipse(x, y + r * 0.55, r * 0.95, r * 0.42).fill({ color: 0x000000, alpha: 0.22 });

  // Body.
  g.circle(x, y, r).fill({ color: bodyColor, alpha: downed ? 0.7 : 1 });
  g.circle(x, y, r).stroke({ width: 2, color: OUTLINE, alpha: 0.6 });

  if (!downed) {
    // Aim notch: a small triangle poking out along the aim vector.
    const ang = Math.atan2(p.aim.y, p.aim.x);
    const tip = r * 1.7;
    const base = r * 0.55;
    g.poly([
      x + Math.cos(ang) * tip,
      y + Math.sin(ang) * tip,
      x + Math.cos(ang + Math.PI / 2) * base,
      y + Math.sin(ang + Math.PI / 2) * base,
      x + Math.cos(ang - Math.PI / 2) * base,
      y + Math.sin(ang - Math.PI / 2) * base,
    ]).fill({ color: 0xffffff, alpha: 0.9 });
  } else {
    // Prone marker (X) + revive-progress ring.
    const m = r * 0.5;
    g.moveTo(x - m, y - m).lineTo(x + m, y + m).stroke({ width: 2, color: 0x2a2a2a, alpha: 0.85 });
    g.moveTo(x - m, y + m).lineTo(x + m, y - m).stroke({ width: 2, color: 0x2a2a2a, alpha: 0.85 });
    const frac = clamp(p.reviveProgress / REVIVE_TIME, 0, 1);
    if (frac > 0) {
      const start = -Math.PI / 2;
      const end = start + frac * Math.PI * 2;
      const ringR = r + 4;
      g.moveTo(x + Math.cos(start) * ringR, y + Math.sin(start) * ringR)
        .arc(x, y, ringR, start, end)
        .stroke({ width: 3, color: 0x66ff88, alpha: 0.95 });
    }
  }

  // Local player highlight ring.
  if (isLocal) {
    g.circle(x, y, r + 3).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
  }

  // Damage flash overlay.
  if (flash > 0) {
    g.circle(x, y, r).fill({ color: 0xffffff, alpha: clamp(flash, 0, 1) * 0.75 });
  }

  // Floating HP bar.
  const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
  drawBar(g, x, y - r - 9, Math.max(22, r * 2), 4, hpFrac, downed ? 0x9a9a9a : hpColor(hpFrac));
}

/**
 * Vector overlay for a player whose *body* is drawn by `SpriteLayer`: the local
 * highlight ring, the downed revive-progress ring and the floating HP bar. Kept
 * as crisp Graphics (brief §1) even when the body is a sprite. The prone-X, aim
 * notch and hit-flash live on the sprite, so they are intentionally absent here.
 */
export function drawPlayerOverlay(
  g: Graphics,
  p: PlayerView,
  screen: Vec2,
  scale: number,
  isLocal: boolean,
): void {
  if (p.state === 'dead') return; // ghost body only, no bar/rings
  const r = PLAYER_RADIUS * scale;
  const { x, y } = screen;
  const downed = p.state === 'downed';

  if (downed) {
    const frac = clamp(p.reviveProgress / REVIVE_TIME, 0, 1);
    if (frac > 0) {
      const start = -Math.PI / 2;
      const end = start + frac * Math.PI * 2;
      const ringR = r + 4;
      g.moveTo(x + Math.cos(start) * ringR, y + Math.sin(start) * ringR)
        .arc(x, y, ringR, start, end)
        .stroke({ width: 3, color: 0x66ff88, alpha: 0.95 });
    }
  }

  if (isLocal) {
    g.circle(x, y, r + 3).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
  }

  const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
  drawBar(g, x, y - r - 9, Math.max(22, r * 2), 4, hpFrac, downed ? 0x9a9a9a : hpColor(hpFrac));
}

// ---------------------------------------------------------------------------
// Boss
// ---------------------------------------------------------------------------

export function drawBoss(
  g: Graphics,
  b: BossView,
  screen: Vec2,
  scale: number,
  flash: number,
): void {
  const def = getMonster(b.monsterId);
  const r = def.radius * scale;
  const color = def.color;
  const { x, y } = screen;
  const enraged = b.phase === 'enraged';

  // Grounding shadow.
  g.ellipse(x, y + r * 0.5, r * 1.0, r * 0.45).fill({ color: 0x000000, alpha: 0.28 });

  switch (b.monsterId) {
    case 'dragon': {
      // Spiky star.
      const pts = starPoints(x, y, 9, r, r * 0.62, b.facing);
      g.poly(pts).fill({ color });
      g.poly(pts).stroke({ width: 2, color: OUTLINE, alpha: 0.7 });
      break;
    }
    case 'troll': {
      // Bulky rounded blob (body + shoulder bumps).
      g.circle(x - r * 0.45, y - r * 0.35, r * 0.55).fill({ color });
      g.circle(x + r * 0.45, y - r * 0.28, r * 0.5).fill({ color });
      g.circle(x, y, r).fill({ color });
      g.circle(x, y, r).stroke({ width: 2, color: OUTLINE, alpha: 0.7 });
      break;
    }
    case 'lich': {
      // Dark hovering diamond with a soft glow.
      g.circle(x, y, r * 1.35).fill({ color: 0x8a6cff, alpha: 0.14 });
      g.poly([x, y - r, x + r * 0.78, y, x, y + r, x - r * 0.78, y]).fill({ color });
      g.poly([x, y - r, x + r * 0.78, y, x, y + r, x - r * 0.78, y]).stroke({
        width: 2,
        color: 0x8a6cff,
        alpha: 0.6,
      });
      break;
    }
  }

  // Facing indicator.
  const fx = x + Math.cos(b.facing) * r;
  const fy = y + Math.sin(b.facing) * r;
  g.moveTo(x, y).lineTo(fx, fy).stroke({ width: 3, color: 0xffffff, alpha: 0.45 });
  g.circle(fx, fy, Math.max(3, r * 0.12)).fill({ color: 0xffffff, alpha: 0.7 });

  // Enrage glow.
  if (enraged) {
    g.circle(x, y, r + 6).stroke({ width: 3, color: 0xff3b30, alpha: 0.85 });
    g.circle(x, y, r + 12).stroke({ width: 2, color: 0xff3b30, alpha: 0.3 });
  }

  // Damage flash overlay.
  if (flash > 0) {
    g.circle(x, y, r).fill({ color: 0xffffff, alpha: clamp(flash, 0, 1) * 0.6 });
  }
}

/**
 * Vector overlay for a boss whose body is a sprite: the facing indicator and the
 * enrage rings. The body fill/flash live on the sprite. (The dragon "star",
 * troll "blob", lich "diamond" silhouettes stay in `drawBoss` for the geometry
 * fallback path.)
 */
export function drawBossOverlay(g: Graphics, b: BossView, screen: Vec2, scale: number): void {
  const def = getMonster(b.monsterId);
  const r = def.radius * scale;
  const { x, y } = screen;

  const fx = x + Math.cos(b.facing) * r;
  const fy = y + Math.sin(b.facing) * r;
  g.moveTo(x, y).lineTo(fx, fy).stroke({ width: 3, color: 0xffffff, alpha: 0.45 });
  g.circle(fx, fy, Math.max(3, r * 0.12)).fill({ color: 0xffffff, alpha: 0.7 });

  if (b.phase === 'enraged') {
    g.circle(x, y, r + 6).stroke({ width: 3, color: 0xff3b30, alpha: 0.85 });
    g.circle(x, y, r + 12).stroke({ width: 2, color: 0xff3b30, alpha: 0.3 });
  }
}

// ---------------------------------------------------------------------------
// Adds (skeletons)
// ---------------------------------------------------------------------------

export function drawAdd(
  g: Graphics,
  a: AddView,
  screen: Vec2,
  scale: number,
  flash: number,
): void {
  const r = ADD_RADIUS * scale;
  const { x, y } = screen;

  g.ellipse(x, y + r * 0.5, r * 0.9, r * 0.35).fill({ color: 0x000000, alpha: 0.2 });
  g.circle(x, y, r).fill({ color: 0xbfc4cc });
  g.circle(x, y, r).stroke({ width: 1.5, color: 0x3a3f47, alpha: 0.85 });

  if (flash > 0) {
    g.circle(x, y, r).fill({ color: 0xffffff, alpha: clamp(flash, 0, 1) * 0.7 });
  }

  const hpFrac = clamp(a.hp / a.maxHp, 0, 1);
  drawBar(g, x, y - r - 6, Math.max(14, r * 2), 3, hpFrac, 0xcc5555);
}

/** Vector overlay (floating HP bar) for an add whose body is a sprite. */
export function drawAddOverlay(g: Graphics, a: AddView, screen: Vec2, scale: number): void {
  const r = ADD_RADIUS * scale;
  const { x, y } = screen;
  const hpFrac = clamp(a.hp / a.maxHp, 0, 1);
  drawBar(g, x, y - r - 6, Math.max(14, r * 2), 3, hpFrac, 0xcc5555);
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------

export function drawProjectile(
  g: Graphics,
  pr: ProjectileView,
  screen: Vec2,
  scale: number,
): void {
  const color = PROJECTILE_COLORS[pr.kind] ?? 0xffffff;
  const { x, y } = screen;

  const speed = Math.hypot(pr.vel.x, pr.vel.y) || 1;
  const dx = pr.vel.x / speed;
  const dy = pr.vel.y / speed;
  const trail = Math.max(10, 16 * scale);

  // Short motion trail behind the head.
  g.moveTo(x - dx * trail, y - dy * trail)
    .lineTo(x, y)
    .stroke({ width: Math.max(2, 3 * scale), color, alpha: 0.35 });

  // Glow + bright core.
  g.circle(x, y, Math.max(4, 6 * scale)).fill({ color, alpha: 0.25 });
  g.circle(x, y, Math.max(2.5, 3.5 * scale)).fill({ color, alpha: 1 });
}

// ---------------------------------------------------------------------------
// Ground zones
// ---------------------------------------------------------------------------

export function drawZone(g: Graphics, z: ZoneView, screen: Vec2, scale: number): void {
  const color = ZONE_COLORS[z.kind] ?? 0xffffff;
  const r = z.radius * scale;
  const { x, y } = screen;

  // Ease the whole zone in on spawn and out near expiry so it visibly appears
  // and then disappears after a while rather than popping.
  const fade = zoneFadeAlpha(z.remaining, z.duration);
  if (fade <= 0) return;

  // Gentle alpha pulse driven by the zone's own countdown.
  const pulse = 0.13 + 0.06 * (0.5 + 0.5 * Math.sin(z.remaining * 6));
  g.circle(x, y, r).fill({ color, alpha: pulse * fade });
  g.circle(x, y, r).stroke({ width: 2, color, alpha: 0.55 * fade });
}

/**
 * Opacity multiplier (0..1) for a ground zone's fade envelope: ramps up over
 * the first `ZONE_FADE_IN` seconds of its life and back down over the last
 * `ZONE_FADE_OUT` seconds before it expires. Pure so it can be unit-tested
 * without a renderer. `remaining` is seconds left; `duration` its full lifetime.
 */
export function zoneFadeAlpha(remaining: number, duration: number): number {
  if (remaining <= 0) return 0;
  const age = duration - remaining;
  const fadeIn = ZONE_FADE_IN > 0 ? clamp(age / ZONE_FADE_IN, 0, 1) : 1;
  const fadeOut = ZONE_FADE_OUT > 0 ? clamp(remaining / ZONE_FADE_OUT, 0, 1) : 1;
  return Math.min(fadeIn, fadeOut);
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** A background-track + fill HP/pip bar centered horizontally on `cx`. */
function drawBar(
  g: Graphics,
  cx: number,
  topY: number,
  w: number,
  h: number,
  frac: number,
  color: number,
): void {
  const x0 = cx - w / 2;
  g.rect(x0, topY, w, h).fill({ color: 0x000000, alpha: 0.55 });
  if (frac > 0) {
    g.rect(x0, topY, w * frac, h).fill({ color, alpha: 0.95 });
  }
}

/** HP-fraction -> bar color (green / gold / red). */
function hpColor(frac: number): number {
  if (frac > 0.6) return 0x5fd35f;
  if (frac > 0.3) return 0xf2c14e;
  return 0xd9463e;
}

/** Vertices for a `spikes`-point star centered at (cx,cy), rotated by `rot`. */
function starPoints(
  cx: number,
  cy: number,
  spikes: number,
  outerR: number,
  innerR: number,
  rot: number,
): number[] {
  const pts: number[] = [];
  const step = Math.PI / spikes;
  let a = rot;
  for (let i = 0; i < spikes; i++) {
    pts.push(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
    a += step;
    pts.push(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
    a += step;
  }
  return pts;
}
