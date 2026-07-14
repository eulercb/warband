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
  TerrainView,
  TerrainKind,
  ObstacleView,
  ObstacleKind,
  TotemView,
  LootView,
  VortexView,
  StationView,
  MonsterId,
  BuffView,
  BuffKind,
  Vec2,
  ProjectileKind,
  ZoneKind,
} from '../../engine/core/types';
import {
  PLAYER_RADIUS,
  CLASS_COLORS,
  ADD_RADIUS,
  REVIVE_TIME,
  ZONE_FADE_IN,
  ZONE_FADE_OUT,
} from '../../engine/core/constants';
import { getMonster } from '../../engine/content/monsters';
import { affixColors } from '../../engine/content/affixes';
import { clamp } from '../../engine/core/math';

const OUTLINE = 0x0a0a12;

// ---------------------------------------------------------------------------
// Buff / debuff glows — a distinct colored aura per active effect so players
// can read, at a glance, what is boosting or hindering any creature. Slows,
// mitigation, stuns and empowers each get their own hue.
// ---------------------------------------------------------------------------

export interface BuffGlow {
  color: number;
  /** True for helpful effects (drawn a touch brighter), false for debuffs. */
  good: boolean;
}

/** Map one buff/debuff to a glow color, or null if it shouldn't glow. */
export function buffGlow(kind: BuffKind, mult: number): BuffGlow | null {
  switch (kind) {
    case 'stun':
      return { color: 0xffe14d, good: false }; // yellow — crowd-controlled
    case 'silence':
      return { color: 0xc06cff, good: false }; // violet — abilities muted
    case 'invuln':
      return { color: 0xbfe9ff, good: true }; // pale cyan — untouchable
    case 'moveSpeed':
      return mult < 1
        ? { color: 0x59a0ff, good: false } // icy blue — slowed
        : { color: 0x7dffa0, good: true }; // green — hastened
    case 'damageDealt':
      return mult >= 1
        ? { color: 0xff9a3d, good: true } // orange — empowered
        : { color: 0x9a7dff, good: false }; // violet — weakened
    case 'damageTaken':
      return mult <= 1
        ? { color: 0x59d9ff, good: true } // cyan — shielded / mitigated
        : { color: 0xff5a5a, good: false }; // red — vulnerable
    default:
      return null;
  }
}

/**
 * Draw a stacked ring of colored auras around an entity, one per active effect.
 * Rings sit just outside the body radius and pulse gently so an ongoing effect
 * reads as "live". Drawn under the body so the silhouette stays crisp.
 */
export function drawBuffGlows(
  g: Graphics,
  x: number,
  y: number,
  bodyR: number,
  buffs: BuffView[] | undefined,
  timeSec: number,
): void {
  if (!buffs || buffs.length === 0) return;
  let i = 0;
  for (const b of buffs) {
    const glow = buffGlow(b.kind, b.mult);
    if (!glow) continue;
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 4 + i * 1.7);
    const ringR = bodyR + 3 + i * 3.5;
    const baseA = glow.good ? 0.5 : 0.42;
    g.circle(x, y, ringR + 2).fill({ color: glow.color, alpha: 0.05 + 0.05 * pulse });
    g.circle(x, y, ringR).stroke({ width: 2, color: glow.color, alpha: baseA + 0.35 * pulse });
    if (++i >= 4) break; // cap the stack so a buff pile doesn't smother the body
  }
}

const PROJECTILE_COLORS: Record<ProjectileKind, number> = {
  arrow: 0x76e34a, // green
  arcaneBolt: 0x9c5cf0, // violet
  fireball: 0xff8a3d, // orange
  shadowBolt: 0x8a3ff0, // purple
  smite: 0xf2c14e, // gold
  eldritch: 0x8ad46a, // sickly green-violet (Warlock)
  chaos: 0xd85ac0, // twin-hued magenta (Sorcerer)
  sonic: 0xc98ce0, // orchid (Bard)
  thorn: 0x6f9e3a, // moss (Druid)
};

const ZONE_COLORS: Record<ZoneKind, number> = {
  voidZone: 0x9c4bd6, // purple
  rainOfArrows: 0x4caf50, // green
  sanctuary: 0xf2c14e, // gold
  poison: 0x8fd14a, // toxic green
  entangle: 0x5bbf7a, // vine green
  consecration: 0xe8d36a, // radiant gold
  antimagic: 0x4bd6c6, // null-magic teal — a standable silence pool reads apart from a void
};

/** Terrain palette: [fill, edge]. Damaging kinds read hot/toxic; slows read cool. */
const TERRAIN_COLORS: Record<TerrainKind, { fill: number; edge: number; hot: boolean }> = {
  magma: { fill: 0xff521f, edge: 0xffc24a, hot: true },
  ember: { fill: 0xc9591f, edge: 0xffa040, hot: true },
  swamp: { fill: 0x4e6a24, edge: 0x8fc24a, hot: false },
  bog: { fill: 0x3d5230, edge: 0x6f9050, hot: false },
  ice: { fill: 0x74b3dc, edge: 0xdcf3ff, hot: false },
  deathfog: { fill: 0x574a6e, edge: 0xa084d6, hot: true },
  // Signature terrains (item 28): deep ocean and a black chasm.
  tide: { fill: 0x1f5f9e, edge: 0x6cc6ff, hot: false },
  abyss: { fill: 0x14101f, edge: 0x7b5cff, hot: true },
  // Signature terrains (item 28 follow-up): a mire of blood and molten brimstone.
  bloodmire: { fill: 0x6a1524, edge: 0xd0466a, hot: true },
  brimstone: { fill: 0x7a2a10, edge: 0xff7a3d, hot: true },
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
  timeSec = 0,
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

  // Active buff/debuff auras (under the body so the silhouette stays crisp).
  if (!downed) drawBuffGlows(g, x, y, r, p.buffs, timeSec);

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
    g.moveTo(x - m, y - m)
      .lineTo(x + m, y + m)
      .stroke({ width: 2, color: 0x2a2a2a, alpha: 0.85 });
    g.moveTo(x - m, y + m)
      .lineTo(x + m, y - m)
      .stroke({ width: 2, color: 0x2a2a2a, alpha: 0.85 });
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
  timeSec = 0,
): void {
  if (p.state === 'dead') return; // ghost body only, no bar/rings
  const r = PLAYER_RADIUS * scale;
  const { x, y } = screen;
  const downed = p.state === 'downed';

  if (!downed) drawBuffGlows(g, x, y, r, p.buffs, timeSec);

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

/**
 * Draw an AFFIX corona around a boss: a slow-rotating ring of motes coloured by
 * its affixes (a Vampiric Frenzied boss orbits crimson + orange), so an "elite"
 * boss reads as procedurally distinct at a glance — pairing the procedural
 * BEHAVIOUR (world.ts) with a procedural APPEARANCE. Graphics-only + cheap; must
 * be drawn for BOTH the geometry path (drawBoss) and the rig path (drawBossOverlay).
 */
export function drawAffixAura(
  g: Graphics,
  x: number,
  y: number,
  bodyR: number,
  affixes: import('../../engine/core/types').AffixId[] | undefined,
  timeSec: number,
): void {
  const colors = affixColors(affixes);
  if (colors.length === 0) return;
  const ringR = bodyR + 12;
  const pulse = 0.5 + 0.5 * Math.sin(timeSec * 2.5);
  // A thin ring in the primary colour anchors the corona.
  g.circle(x, y, ringR).stroke({ width: 2, color: colors[0], alpha: 0.3 + 0.25 * pulse });
  // Orbiting motes, cycling through every affix's colour.
  const motes = 3 + colors.length * 3;
  const spin = timeSec * 0.8;
  const moteR = Math.max(1.6, bodyR * 0.07);
  for (let i = 0; i < motes; i++) {
    const a = spin + (i / motes) * Math.PI * 2;
    const mr = ringR + 4 + 3 * Math.sin(timeSec * 3 + i);
    const color = colors[i % colors.length];
    g.circle(x + Math.cos(a) * mr, y + Math.sin(a) * mr, moteR).fill({
      color,
      alpha: 0.45 + 0.4 * pulse,
    });
  }
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
  timeSec = 0,
): void {
  const def = getMonster(b.monsterId);
  const r = def.radius * scale;
  const color = def.color;
  const { x, y } = screen;
  const enraged = b.phase === 'enraged';

  // Active buff/debuff auras (e.g. stunned by Shield Bash, slowed by Frost Nova).
  drawBuffGlows(g, x, y, r, b.buffs, timeSec);

  // Endless "type" modifier glow (Frost/Dark/Infernal…), pulsing under the body.
  if (b.modColor != null) {
    const p = 0.5 + 0.5 * Math.sin(timeSec * 3);
    g.circle(x, y, r * 1.3).fill({ color: b.modColor, alpha: 0.1 + 0.06 * p });
    g.circle(x, y, r + 8).stroke({ width: 2, color: b.modColor, alpha: 0.4 + 0.25 * p });
  }

  // Affix corona (Vampiric / Frenzied / … — elite look). Geometry path.
  drawAffixAura(g, x, y, r, b.affixes, timeSec);

  // Grounding shadow.
  g.ellipse(x, y + r * 0.5, r * 1.0, r * 0.45).fill({ color: 0x000000, alpha: 0.28 });

  drawBossBody(g, def.bodyShape, x, y, r, color, b.facing);

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
 * Vector overlay for a boss whose body is drawn by the sprite or rig layer: the
 * facing indicator and the enrage rings. The body fill/flash live on that layer.
 * (Bosses still on the immediate-geometry fallback — today only the practice
 * `dummy` — draw their body AND these overlays together in `drawBoss` instead.)
 */
export function drawBossOverlay(
  g: Graphics,
  b: BossView,
  screen: Vec2,
  scale: number,
  timeSec = 0,
): void {
  const def = getMonster(b.monsterId);
  const r = def.radius * scale;
  const { x, y } = screen;

  drawBuffGlows(g, x, y, r, b.buffs, timeSec);

  // Endless "type" modifier glow (Frost/Dark/Infernal…), pulsing under the body —
  // drawn by the body pass for geometry bosses, so it lives here for sprite/rig ones.
  if (b.modColor != null) {
    const p = 0.5 + 0.5 * Math.sin(timeSec * 3);
    g.circle(x, y, r * 1.3).fill({ color: b.modColor, alpha: 0.1 + 0.06 * p });
    g.circle(x, y, r + 8).stroke({ width: 2, color: b.modColor, alpha: 0.4 + 0.25 * p });
  }

  // Affix corona — drawn here for sprite/rig bosses (body isn't in this pass).
  drawAffixAura(g, x, y, r, b.affixes, timeSec);

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
  timeSec = 0,
): void {
  const r = ADD_RADIUS * scale;
  const { x, y } = screen;

  drawBuffGlows(g, x, y, r, a.buffs, timeSec);

  g.ellipse(x, y + r * 0.5, r * 0.9, r * 0.35).fill({ color: 0x000000, alpha: 0.2 });
  g.circle(x, y, r).fill({ color: 0xbfc4cc });
  g.circle(x, y, r).stroke({ width: 1.5, color: 0x3a3f47, alpha: 0.85 });

  if (flash > 0) {
    g.circle(x, y, r).fill({ color: 0xffffff, alpha: clamp(flash, 0, 1) * 0.7 });
  }

  const hpFrac = clamp(a.hp / a.maxHp, 0, 1);
  drawBar(g, x, y - r - 6, Math.max(14, r * 2), 3, hpFrac, 0xcc5555);
}

/** Vector overlay (floating HP bar + buff glows) for an add whose body is a sprite. */
export function drawAddOverlay(
  g: Graphics,
  a: AddView,
  screen: Vec2,
  scale: number,
  timeSec = 0,
): void {
  const r = ADD_RADIUS * scale;
  const { x, y } = screen;
  drawBuffGlows(g, x, y, r, a.buffs, timeSec);
  const hpFrac = clamp(a.hp / a.maxHp, 0, 1);
  drawBar(g, x, y - r - 6, Math.max(14, r * 2), 3, hpFrac, 0xcc5555);
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------

export function drawProjectile(g: Graphics, pr: ProjectileView, screen: Vec2, scale: number): void {
  const color = pr.color ?? PROJECTILE_COLORS[pr.kind] ?? 0xffffff;
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
  // A themed tint override (affix/corruption hazards) wins over the per-kind palette.
  const color = z.color ?? ZONE_COLORS[z.kind] ?? 0xffffff;
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

// ---------------------------------------------------------------------------
// Terrain (static per-run hazards)
// ---------------------------------------------------------------------------

/**
 * Draw one static terrain patch. `timeSec` drives a slow shimmer so lava/fog
 * feel alive; `seed` (the patch id) offsets the phase so patches don't pulse in
 * lockstep. Damaging kinds glow warmer and pulse; slows read as calm pools.
 */
export function drawTerrain(
  g: Graphics,
  t: TerrainView,
  screen: Vec2,
  scale: number,
  timeSec: number,
): void {
  const pal = TERRAIN_COLORS[t.kind] ?? { fill: 0x666666, edge: 0x999999, hot: false };
  const r = t.radius * scale;
  const { x, y } = screen;
  const phase = (t.id % 7) * 0.9;
  const pulse = pal.hot
    ? 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(timeSec * 2.2 + phase))
    : 0.06 + 0.03 * (0.5 + 0.5 * Math.sin(timeSec * 1.1 + phase));

  // Soft outer glow, base pool, and a brighter irregular core for texture.
  g.circle(x, y, r).fill({ color: pal.fill, alpha: 0.16 + pulse });
  g.circle(x, y, r).stroke({ width: 2, color: pal.edge, alpha: 0.55 });
  const coreR = r * (0.55 + 0.05 * Math.sin(timeSec * 1.7 + phase));
  g.circle(x, y, coreR).fill({ color: pal.edge, alpha: (pal.hot ? 0.16 : 0.08) + pulse * 0.4 });

  // A few deterministic blobs so the patch doesn't read as a flat disc.
  for (let i = 0; i < 3; i++) {
    const a = phase + (i * Math.PI * 2) / 3 + timeSec * (pal.hot ? 0.6 : 0.25);
    const rr = r * 0.5;
    const bx = x + Math.cos(a) * rr * 0.6;
    const by = y + Math.sin(a) * rr * 0.6;
    g.circle(bx, by, r * 0.22).fill({ color: pal.edge, alpha: 0.1 + pulse * 0.3 });
  }

  // A bottomless lethal CORE (the abyss, item 28): a near-black void ringed by a
  // pulsing warning band, so the deadly heart of the chasm reads at a glance — a
  // surge that drags you in here is an environmental death.
  if (t.lethalRadius && t.lethalRadius > 0) {
    const lr = t.lethalRadius * scale;
    const warn = 0.5 + 0.5 * Math.sin(timeSec * 3 + phase);
    g.circle(x, y, lr).fill({ color: 0x05030a, alpha: 0.92 });
    g.circle(x, y, lr).stroke({ width: 2, color: pal.edge, alpha: 0.5 + 0.4 * warn });
  }
}

// ---------------------------------------------------------------------------
// Obstacles (static per-run cover that blocks ranged attacks)
// ---------------------------------------------------------------------------

/** Cheap deterministic hash → [0,1). Stable per (seed, i) across frames. */
function jitter(seed: number, i: number): number {
  const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Push an irregular closed polygon around (x,y): `n` vertices, radius jittered
 * by `rough` (fraction of r), rotated by `rot`. Returns nothing; caller fills. */
function blobPath(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  n: number,
  rough: number,
  seed: number,
  rot = 0,
): void {
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const rr = r * (1 - rough / 2 + rough * jitter(seed, i));
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

/** Per-kind palettes for the cover silhouettes. */
const OBSTACLE_PALETTES: Record<ObstacleKind, { body: number; lit: number; dark: number }> = {
  rock: { body: 0x40444d, lit: 0x565b66, dark: 0x33363e },
  pillar: { body: 0x4a4a55, lit: 0x64646f, dark: 0x35353f },
  crystal: { body: 0x3b4a6b, lit: 0x7fa8e0, dark: 0x2a3550 },
  stump: { body: 0x4a3a28, lit: 0x6b573c, dark: 0x36291b },
  monolith: { body: 0x3d4046, lit: 0x5a5e66, dark: 0x2b2d33 },
  totem: { body: 0x4a4030, lit: 0x6e5f45, dark: 0x342d20 },
};

/**
 * Draw one solid cover obstacle. Collision is always the circle; the SHAPE is
 * procedural flavour keyed by `kind` + `variant` — jagged rocks, faceted
 * crystals, ringed stumps, carved monoliths — so no two arenas' cover looks
 * alike. All silhouettes stay opaque so they read as physical blockers (unlike
 * the translucent terrain hazard pools).
 */
export function drawObstacle(g: Graphics, o: ObstacleView, screen: Vec2, scale: number): void {
  const r = o.radius * scale;
  const { x, y } = screen;
  const kind: ObstacleKind = o.kind ?? 'rock';
  const seed = (o.variant ?? o.id) + 1;
  const pal = OBSTACLE_PALETTES[kind];
  const rot = jitter(seed, 99) * Math.PI * 2;

  // Grounding shadow.
  g.ellipse(x, y + r * 0.35, r * 1.05, r * 0.5).fill({ color: 0x000000, alpha: 0.34 });

  switch (kind) {
    case 'crystal': {
      // A cluster of sharp shards with a faint inner glow.
      blobPath(g, x, y, r, 6, 0.55, seed, rot);
      g.fill({ color: pal.body });
      g.stroke({ width: 2, color: 0x1a1c22, alpha: 0.9 });
      blobPath(g, x - r * 0.15, y - r * 0.18, r * 0.55, 5, 0.5, seed + 7, rot + 0.6);
      g.fill({ color: pal.lit, alpha: 0.85 });
      g.circle(x, y, r * 0.28).fill({ color: 0xbfe0ff, alpha: 0.5 });
      break;
    }
    case 'stump': {
      // A felled ancient tree: bark ring + growth rings.
      blobPath(g, x, y, r, 9, 0.18, seed, rot);
      g.fill({ color: pal.body });
      g.stroke({ width: 3, color: pal.dark, alpha: 0.95 });
      g.circle(x, y, r * 0.72).stroke({ width: 1.5, color: pal.dark, alpha: 0.6 });
      g.circle(x, y, r * 0.45).stroke({ width: 1.5, color: pal.dark, alpha: 0.5 });
      g.circle(x, y, r * 0.2).fill({ color: pal.lit, alpha: 0.8 });
      break;
    }
    case 'pillar': {
      // A round column seen from above: concentric caps.
      g.circle(x, y, r).fill({ color: pal.body });
      g.circle(x, y, r).stroke({ width: 2, color: 0x1a1c22, alpha: 0.9 });
      g.circle(x - r * 0.1, y - r * 0.12, r * 0.72).fill({ color: pal.lit });
      g.circle(x - r * 0.16, y - r * 0.2, r * 0.4).fill({ color: 0x8a8f9a, alpha: 0.9 });
      break;
    }
    case 'monolith':
    case 'totem': {
      // A carved standing stone: rotated slab + rune notches.
      const w = r * 0.95;
      const h = r * 1.5;
      g.rect(x - w / 2, y - h / 2, w, h).fill({ color: pal.body });
      g.rect(x - w / 2, y - h / 2, w, h).stroke({ width: 2, color: 0x1a1c22, alpha: 0.9 });
      g.rect(x - w / 2 + 3, y - h / 2 + 3, w * 0.55, h - 6).fill({ color: pal.lit, alpha: 0.55 });
      for (let i = 0; i < 3; i++) {
        const ny = y - h * 0.3 + i * h * 0.28;
        g.rect(x - w * 0.22, ny, w * 0.44, 2).fill({ color: pal.dark, alpha: 0.9 });
      }
      break;
    }
    default: {
      // rock — a jagged boulder with a lit cap and facets.
      blobPath(g, x, y, r, 8, 0.3, seed, rot);
      g.fill({ color: pal.body });
      g.stroke({ width: 2, color: 0x1a1c22, alpha: 0.9 });
      blobPath(g, x - r * 0.2, y - r * 0.22, r * 0.6, 7, 0.3, seed + 3, rot + 0.4);
      g.fill({ color: pal.lit, alpha: 0.9 });
      for (let i = 0; i < 3; i++) {
        const a = rot + (i * Math.PI * 2) / 3;
        const bx = x + Math.cos(a) * r * 0.25;
        const by = y + Math.sin(a) * r * 0.25;
        g.circle(bx, by, r * 0.16).fill({ color: pal.dark, alpha: 0.55 });
      }
      g.circle(x - r * 0.3, y - r * 0.35, r * 0.15).fill({ color: 0x6f7480, alpha: 0.85 });
    }
  }
}

// ---------------------------------------------------------------------------
// Totems (menu playground interaction pillars)
// ---------------------------------------------------------------------------

export const TOTEM_COLORS: Record<TotemView['kind'], number> = {
  host: 0xf2c14e, // gold — raise your banner
  join: 0x4a90d9, // blue — answer a call
  class: 0x9c5cf0, // violet — change your destiny
  controls: 0x5bbf7a, // green — practical matters
};

/**
 * Draw one playground totem: a carved standing stone with a colored rune eye
 * and a trigger ring that lights up when the local hero steps inside. `timeSec`
 * drives a slow idle pulse; activation blooms the ring and the eye.
 */
export function drawTotem(
  g: Graphics,
  t: TotemView,
  screen: Vec2,
  scale: number,
  timeSec: number,
): void {
  const { x, y } = screen;
  const r = t.radius * scale;
  const color = TOTEM_COLORS[t.kind];
  const pulse = 0.5 + 0.5 * Math.sin(timeSec * 2 + t.id);
  const active = t.active === true;

  // Trigger ring: faint while idle, bright bloom when the hero is inside.
  const ringR = t.triggerRadius * scale;
  g.circle(x, y, ringR).stroke({
    width: active ? 3 : 1.5,
    color,
    alpha: active ? 0.65 : 0.16 + pulse * 0.06,
  });
  if (active) g.circle(x, y, ringR).fill({ color, alpha: 0.06 });

  // Grounding shadow + carved stone body.
  g.ellipse(x, y + r * 0.4, r * 1.15, r * 0.55).fill({ color: 0x000000, alpha: 0.35 });
  const w = r * 1.1;
  const h = r * 1.7;
  g.rect(x - w / 2, y - h / 2, w, h).fill({ color: 0x2e2a36 });
  g.rect(x - w / 2, y - h / 2, w, h).stroke({ width: 2, color: 0x14121a, alpha: 0.95 });
  g.rect(x - w / 2 + 3, y - h / 2 + 3, w * 0.5, h - 6).fill({ color: 0x413b4d, alpha: 0.8 });

  // Rune eye + notches in the totem's color.
  const eyeR = r * 0.34 * (active ? 1.25 : 1);
  g.circle(x, y - h * 0.12, eyeR + 4).fill({ color, alpha: active ? 0.5 : 0.18 + pulse * 0.1 });
  g.circle(x, y - h * 0.12, eyeR).fill({ color, alpha: active ? 1 : 0.75 });
  for (let i = 0; i < 2; i++) {
    const ny = y + h * 0.16 + i * h * 0.16;
    g.rect(x - w * 0.24, ny, w * 0.48, 2.5).fill({ color, alpha: 0.55 });
  }
}

/** Reward-room relic colors: gold for generic boons, violet for class boons,
 *  teal for the walk-up coin shop (item 2). */
export const LOOT_COLORS: Record<LootView['kind'], number> = {
  generic: 0xf2c14e, // gold
  char: 0x9c5cf0, // violet
  shop: 0x2fb8a6, // teal — the coin stall
};

/**
 * Draw one reward-room relic: a faceted gem hovering (bobbing) over a small
 * pedestal, ringed by its pickup halo. Unclaimed relics glow and the halo
 * brightens when the hero is near; a claimed relic collapses to a bright spark;
 * a locked relic (another of its kind was taken) dims to a grey husk.
 */
export function drawLoot(
  g: Graphics,
  loot: LootView,
  screen: Vec2,
  scale: number,
  timeSec: number,
): void {
  const { x, y } = screen;
  const color = LOOT_COLORS[loot.kind];
  const claimed = loot.claimed === true;
  const locked = loot.locked === true && !claimed;
  const active = loot.active === true && !claimed && !locked;
  const pulse = 0.5 + 0.5 * Math.sin(timeSec * 2.4 + loot.id * 1.7);

  // Pickup halo on the ground (brightens when readable).
  const haloR = loot.pickupRadius * scale;
  if (!claimed && !locked) {
    g.circle(x, y, haloR).stroke({
      width: active ? 2.5 : 1.4,
      color,
      alpha: active ? 0.5 : 0.16 + pulse * 0.06,
    });
    if (active) g.circle(x, y, haloR).fill({ color, alpha: 0.05 });
  }

  // Grounding shadow + pedestal.
  const r = loot.radius * scale;
  g.ellipse(x, y + r * 0.5, r * 0.95, r * 0.4).fill({ color: 0x000000, alpha: 0.32 });
  const baseC = locked ? 0x2a2a33 : 0x2e2a36;
  g.ellipse(x, y + r * 0.35, r * 0.8, r * 0.32).fill({ color: baseC });

  if (claimed) {
    // Claimed: a bright afterglow spark that fades as it ages upward.
    const a = 0.35 + 0.35 * pulse;
    g.circle(x, y - r * 0.2, r * 0.5).fill({ color, alpha: a });
    g.circle(x, y - r * 0.2, r * 1.1).stroke({ width: 1.5, color, alpha: a * 0.5 });
    return;
  }

  // Hovering gem (bobs on the idle pulse; brighter when active).
  const bob = (locked ? 0.5 : 1) * (Math.sin(timeSec * 2 + loot.id) * 0.14 + 0.1) * r;
  const gy = y - r * 0.55 - bob;
  const gemR = r * (active ? 1.08 : 0.95);
  const gemColor = locked ? 0x4a4753 : color;
  const gemAlpha = locked ? 0.6 : 1;
  // A four-point faceted gem (diamond with a bright top facet).
  g.poly([x, gy - gemR, x + gemR * 0.7, gy, x, gy + gemR, x - gemR * 0.7, gy]).fill({
    color: gemColor,
    alpha: gemAlpha,
  });
  g.poly([x, gy - gemR, x + gemR * 0.7, gy, x, gy, x - gemR * 0.7, gy]).fill({
    color: 0xffffff,
    alpha: locked ? 0.12 : 0.28,
  });
  g.poly([x, gy - gemR, x + gemR * 0.7, gy, x, gy + gemR, x - gemR * 0.7, gy]).stroke({
    width: 1.6,
    color: OUTLINE,
    alpha: 0.7,
  });
  if (active) {
    g.circle(x, gy, gemR * 1.6).stroke({ width: 1.2, color, alpha: 0.3 + pulse * 0.25 });
  }
}

/**
 * Draw the reward-room descent vortex: a swirling ring of arms that quickens and
 * brightens as `charge` climbs from 0 (sealed) to 1 (open). While a hero stands
 * inside an open vortex it drinks inward with a bright pull. Purely procedural.
 */
export function drawVortex(
  g: Graphics,
  vortex: VortexView,
  screen: Vec2,
  scale: number,
  timeSec: number,
): void {
  const { x, y } = screen;
  const r = vortex.radius * scale;
  const charge = clamp(vortex.charge, 0, 1);
  const open = vortex.open === true;
  const standing = vortex.standing === true;
  const color = open ? 0x7fd4ff : 0x4a6a86; // icy blue when open, dim slate when sealed
  const spin = timeSec * (0.6 + charge * 2.2) * (standing ? 1.8 : 1);

  // Active ring on the ground: where standing inside triggers the descent.
  const activeR = vortex.activeRadius * scale;
  g.circle(x, y, activeR).stroke({
    width: open ? 2 : 1,
    color,
    alpha: open ? 0.3 + 0.15 * Math.sin(timeSec * 3) : 0.12,
  });

  // Grounding shadow.
  g.ellipse(x, y + r * 0.35, r * 1.2, r * 0.5).fill({ color: 0x000000, alpha: 0.3 });

  // Swirling arms — more arms + brighter as the vortex charges up.
  const arms = 5;
  const turns = 1.6;
  for (let a = 0; a < arms; a++) {
    const base = spin + (a / arms) * Math.PI * 2;
    const steps = 14;
    let started = false;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const rad = r * (0.12 + f * 0.95);
      const ang = base + f * turns * Math.PI * 2;
      const px = x + Math.cos(ang) * rad;
      const py = y + Math.sin(ang) * rad * 0.9;
      if (!started) {
        g.moveTo(px, py);
        started = true;
      } else {
        g.lineTo(px, py);
      }
    }
    g.stroke({ width: 2, color, alpha: (open ? 0.55 : 0.28) + charge * 0.25 });
  }

  // Bright eye at the centre; blooms wide and hot while a hero descends.
  const eyeR = r * (0.2 + charge * 0.16) * (standing ? 1.6 : 1);
  g.circle(x, y, eyeR + 3).fill({ color, alpha: open ? 0.5 : 0.2 });
  g.circle(x, y, eyeR).fill({ color: open ? 0xffffff : color, alpha: open ? 0.85 : 0.5 });
  if (standing) {
    g.circle(x, y, r * 1.3).stroke({ width: 2.5, color: 0xffffff, alpha: 0.4 });
  }
}

/**
 * Draw a diegetic menu station. Dispatches by kind: class/boss effigies are lit
 * pedestals (a banner-shard, or the boss's own silhouette); tier gates are
 * labelled banners; and `portal` stations (host / run-mode / muster…) are
 * swirling gateways you walk into. All share a ground ring + a channel arc that
 * fills while the hero dwells to commit.
 */
export function drawStation(
  g: Graphics,
  st: StationView,
  screen: Vec2,
  scale: number,
  timeSec: number,
): void {
  const { x, y } = screen;
  const color = st.color ?? 0xffffff;
  const selected = st.selected === true;
  const active = st.active === true;
  const disabled = st.disabled === true;
  const pulse = 0.5 + 0.5 * Math.sin(timeSec * 2 + st.id);

  // Shared ground ring.
  const ringR = st.triggerRadius * scale;
  const ringColor = disabled ? 0x555560 : selected ? 0xf2c14e : color;
  g.circle(x, y, ringR).stroke({
    width: selected ? 3 : active ? 2.4 : 1.3,
    color: ringColor,
    alpha: disabled ? 0.2 : selected ? 0.75 : active ? 0.5 : 0.14 + pulse * 0.06,
  });
  if ((selected || active) && !disabled) g.circle(x, y, ringR).fill({ color, alpha: 0.05 });

  // Shared channel arc (dwell-to-commit).
  if (st.channel && st.channel > 0) {
    const a0 = -Math.PI / 2;
    g.arc(x, y, ringR - 2, a0, a0 + st.channel * Math.PI * 2).stroke({
      width: 3.5,
      color: 0xffe066,
      alpha: 0.95,
    });
  }

  if (st.portal) {
    drawPortalStation(g, st, x, y, scale, timeSec);
    return;
  }
  if (st.kind === 'boss' && st.refId) {
    drawBossStation(g, st, x, y, scale, timeSec);
    return;
  }
  if (st.kind === 'tier') {
    drawTierStation(g, st, x, y, scale, timeSec);
    return;
  }
  drawEffigyStation(g, color, st, x, y, scale, timeSec);
}

/** Class effigy: a tall banner-shard in the class colour on a pedestal. */
function drawEffigyStation(
  g: Graphics,
  color: number,
  st: StationView,
  x: number,
  y: number,
  scale: number,
  timeSec: number,
): void {
  const r = st.radius * scale;
  const selected = st.selected === true;
  const active = st.active === true;
  g.ellipse(x, y + r * 0.5, r * 1.1, r * 0.45).fill({ color: 0x000000, alpha: 0.32 });
  g.ellipse(x, y + r * 0.34, r * 0.9, r * 0.34).fill({ color: 0x2e2a36 });
  g.ellipse(x, y + r * 0.34, r * 0.9, r * 0.34).stroke({ width: 1.5, color: 0x14121a, alpha: 0.9 });
  const bob = Math.sin(timeSec * 1.8 + st.id) * 0.1 * r;
  const topY = y - r * 1.15 - bob;
  const midY = y - r * 0.1;
  const alpha = selected ? 1 : active ? 0.95 : 0.72;
  g.moveTo(x, topY)
    .lineTo(x + r * 0.5, midY)
    .lineTo(x, y + r * 0.15)
    .lineTo(x - r * 0.5, midY)
    .closePath()
    .fill({ color, alpha });
  g.moveTo(x, topY)
    .lineTo(x + r * 0.5, midY)
    .lineTo(x, midY)
    .closePath()
    .fill({ color: 0xffffff, alpha: alpha * 0.25 });
  g.moveTo(x, topY)
    .lineTo(x + r * 0.5, midY)
    .lineTo(x, y + r * 0.15)
    .lineTo(x - r * 0.5, midY)
    .closePath()
    .stroke({ width: 1.6, color: OUTLINE, alpha: 0.65 });
  if (selected) {
    g.circle(x, midY - r * 0.2, r * 1.5).stroke({ width: 1.4, color: 0xf2c14e, alpha: 0.3 });
  }
}

/** Boss effigy: the boss's own silhouette risen over a pedestal. */
function drawBossStation(
  g: Graphics,
  st: StationView,
  x: number,
  y: number,
  scale: number,
  timeSec: number,
): void {
  const def = getMonster(st.refId as MonsterId);
  const r = st.radius * scale;
  const selected = st.selected === true;
  // Pedestal.
  g.ellipse(x, y + r * 0.55, r * 1.15, r * 0.4).fill({ color: 0x000000, alpha: 0.32 });
  g.ellipse(x, y + r * 0.4, r * 0.95, r * 0.32).fill({ color: 0x2e2a36 });
  // The silhouette, bobbing, facing the viewer (down).
  const bob = Math.sin(timeSec * 1.6 + st.id) * 0.08 * r;
  drawBossBody(g, def.bodyShape, x, y - r * 0.35 - bob, r * 0.85, def.color, Math.PI / 2);
  if (selected) {
    g.circle(x, y - r * 0.35, r * 1.35).stroke({ width: 1.5, color: 0xf2c14e, alpha: 0.4 });
  }
}

/** Tier gate: a labelled banner, lit when it is the active gallery tier. */
function drawTierStation(
  g: Graphics,
  st: StationView,
  x: number,
  y: number,
  scale: number,
  timeSec: number,
): void {
  const color = st.color ?? 0xffffff;
  const r = st.radius * scale;
  const selected = st.selected === true; // = active tier
  const active = st.active === true;
  const pulse = 0.5 + 0.5 * Math.sin(timeSec * 2 + st.id);
  g.ellipse(x, y + r * 0.4, r * 1.0, r * 0.35).fill({ color: 0x000000, alpha: 0.3 });
  // Two posts + a lintel (a gate).
  const w = r * 1.1;
  const h = r * 1.7;
  const postW = r * 0.28;
  const alpha = selected ? 1 : active ? 0.9 : 0.6;
  for (const sx of [x - w / 2, x + w / 2 - postW]) {
    g.rect(sx, y - h / 2, postW, h).fill({ color, alpha });
    g.rect(sx, y - h / 2, postW, h).stroke({ width: 1.4, color: OUTLINE, alpha: 0.6 });
  }
  g.rect(x - w / 2, y - h / 2, w, r * 0.34).fill({ color, alpha });
  // Glow through the gate when active/selected.
  g.rect(x - w / 2 + postW, y - h / 2 + r * 0.34, w - postW * 2, h - r * 0.34).fill({
    color,
    alpha: selected ? 0.28 : active ? 0.18 : 0.08 + pulse * 0.05,
  });
}

/** Portal station (host / join / run-mode / muster / start): a walk-in gateway. */
function drawPortalStation(
  g: Graphics,
  st: StationView,
  x: number,
  y: number,
  scale: number,
  timeSec: number,
): void {
  const disabled = st.disabled === true;
  const selected = st.selected === true;
  const color = disabled ? 0x555560 : (st.color ?? 0x7fd4ff);
  const r = st.radius * scale;
  const spin = timeSec * (disabled ? 0.4 : 1.6) * (selected ? 1.5 : 1);
  g.ellipse(x, y + r * 0.35, r * 1.1, r * 0.45).fill({ color: 0x000000, alpha: 0.3 });
  const arms = 4;
  for (let a = 0; a < arms; a++) {
    const base = spin + (a / arms) * Math.PI * 2;
    const steps = 12;
    let started = false;
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const rad = r * (0.15 + f * 0.95);
      const ang = base + f * 1.5 * Math.PI * 2;
      const px = x + Math.cos(ang) * rad;
      const py = y + Math.sin(ang) * rad * 0.9;
      if (!started) {
        g.moveTo(px, py);
        started = true;
      } else {
        g.lineTo(px, py);
      }
    }
    g.stroke({ width: 2, color, alpha: disabled ? 0.3 : selected ? 0.8 : 0.55 });
  }
  const eyeR = r * (selected ? 0.34 : 0.24);
  g.circle(x, y, eyeR + 3).fill({ color, alpha: disabled ? 0.2 : 0.45 });
  g.circle(x, y, eyeR).fill({ color: disabled ? color : 0xffffff, alpha: disabled ? 0.4 : 0.85 });
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

/**
 * Draw a boss silhouette by archetype so 30+ bosses read distinctly without any
 * art assets. Every shape is centered on (x,y), sized to radius `r`, tinted by
 * `color`, and outlined for a crisp top-down read.
 */
function drawBossBody(
  g: Graphics,
  shape: string,
  x: number,
  y: number,
  r: number,
  color: number,
  facing: number,
): void {
  const stroke = (): void => {
    g.stroke({ width: 2, color: OUTLINE, alpha: 0.7 });
  };
  switch (shape) {
    case 'star': {
      const pts = starPoints(x, y, 9, r, r * 0.62, facing);
      g.poly(pts).fill({ color });
      g.poly(pts).stroke({ width: 2, color: OUTLINE, alpha: 0.7 });
      break;
    }
    case 'blob': {
      g.circle(x - r * 0.45, y - r * 0.35, r * 0.55).fill({ color });
      g.circle(x + r * 0.45, y - r * 0.28, r * 0.5).fill({ color });
      g.circle(x, y, r).fill({ color });
      g.circle(x, y, r).stroke({ width: 2, color: OUTLINE, alpha: 0.7 });
      break;
    }
    case 'diamond': {
      g.circle(x, y, r * 1.3).fill({ color, alpha: 0.14 });
      g.poly([x, y - r, x + r * 0.78, y, x, y + r, x - r * 0.78, y]).fill({ color });
      g.poly([x, y - r, x + r * 0.78, y, x, y + r, x - r * 0.78, y]).stroke({
        width: 2,
        color: 0xffffff,
        alpha: 0.35,
      });
      break;
    }
    case 'humanoid': {
      // Torso + head + shoulders.
      g.ellipse(x, y + r * 0.1, r * 0.72, r).fill({ color });
      g.ellipse(x, y + r * 0.1, r * 0.72, r);
      stroke();
      g.circle(x - r * 0.6, y - r * 0.35, r * 0.3).fill({ color });
      g.circle(x + r * 0.6, y - r * 0.35, r * 0.3).fill({ color });
      g.circle(x, y - r * 0.7, r * 0.42).fill({ color });
      g.circle(x, y - r * 0.7, r * 0.42);
      stroke();
      break;
    }
    case 'beast': {
      // Elongated body + head + ears/horns.
      g.ellipse(x, y, r * 1.1, r * 0.72).fill({ color });
      g.ellipse(x, y, r * 1.1, r * 0.72);
      stroke();
      const hx = x + Math.cos(facing) * r * 0.85;
      const hy = y + Math.sin(facing) * r * 0.85;
      g.circle(hx, hy, r * 0.48).fill({ color });
      g.circle(hx, hy, r * 0.48);
      stroke();
      // ears
      g.poly([hx - r * 0.4, hy - r * 0.3, hx - r * 0.15, hy - r * 0.75, hx, hy - r * 0.35]).fill({
        color,
      });
      g.poly([hx + r * 0.4, hy - r * 0.3, hx + r * 0.15, hy - r * 0.75, hx, hy - r * 0.35]).fill({
        color,
      });
      break;
    }
    case 'construct': {
      // Blocky hexagon.
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = facing + (i / 6) * Math.PI * 2;
        pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.poly(pts).fill({ color });
      g.poly(pts).stroke({ width: 3, color: OUTLINE, alpha: 0.8 });
      g.rect(x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.8).fill({ color: 0xffffff, alpha: 0.08 });
      break;
    }
    case 'orb': {
      // Floating eye: outer glow, iris, pupil looking toward facing.
      g.circle(x, y, r * 1.15).fill({ color, alpha: 0.16 });
      g.circle(x, y, r).fill({ color });
      g.circle(x, y, r);
      stroke();
      g.circle(x, y, r * 0.55).fill({ color: 0xffffff, alpha: 0.85 });
      const px = x + Math.cos(facing) * r * 0.4;
      const py = y + Math.sin(facing) * r * 0.4;
      g.circle(px, py, r * 0.3).fill({ color: 0x101018 });
      break;
    }
    case 'insect': {
      // Abdomen + head + radiating legs.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(x, y)
          .lineTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.1)
          .stroke({ width: 2, color, alpha: 0.85 });
      }
      g.circle(x, y + r * 0.2, r * 0.85).fill({ color });
      g.circle(x, y + r * 0.2, r * 0.85);
      stroke();
      g.circle(x, y - r * 0.6, r * 0.45).fill({ color });
      break;
    }
    case 'serpent': {
      // Coiled segments.
      for (let i = 3; i >= 0; i--) {
        const a = facing + i * 0.9;
        const sx = x + Math.cos(a) * r * 0.55 * i * 0.4;
        const sy = y + Math.sin(a) * r * 0.55 * i * 0.4;
        g.circle(sx, sy, r * (0.9 - i * 0.12)).fill({ color });
      }
      g.circle(x, y, r * 0.9).stroke({ width: 2, color: OUTLINE, alpha: 0.6 });
      break;
    }
    case 'tree': {
      // Trunk + canopy.
      g.rect(x - r * 0.28, y - r * 0.1, r * 0.56, r * 1.2).fill({ color: 0x5a4a2a });
      g.circle(x, y - r * 0.4, r).fill({ color });
      g.circle(x - r * 0.55, y - r * 0.1, r * 0.6).fill({ color });
      g.circle(x + r * 0.55, y - r * 0.1, r * 0.6).fill({ color });
      g.circle(x, y - r * 0.4, r);
      stroke();
      break;
    }
    default: {
      g.circle(x, y, r).fill({ color });
      g.circle(x, y, r);
      stroke();
    }
  }
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
