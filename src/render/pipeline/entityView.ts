import { sub as torusSub } from '../../engine/core/torus';
import { ZONE_TICK_INTERVAL } from '../../engine/core/constants';
import { playerVisualHeadroom } from '../rig/mageGarment';
import { drawSkeleton } from './skeletonVisual';
import { drawDefenseState } from './defenseVisuals';
import { CURSE_COLORS, drawCurseSigil } from './curseVisuals';
import { drawAuraField, drawBubble, drawSupportSymbol, supportStateKind } from './supportVisuals';
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
    case 'bloodRage':
    case 'wolfHunt':
    case 'guard':
    case 'counter':
    case 'momentum':
    case 'flow':
    case 'harmony':
    case 'discord':
    case 'spellSurge':
      return { color: 0xc06cff, good: true };
    case 'grandCadence':
      return { color: 0xf68042, good: true };
    case 'grandOpening':
      return { color: 0xffb168, good: false };
    case 'spellblade':
      return { color: 0xb488e0, good: true };
    case 'precision':
      return { color: 0xffd36b, good: true };
    case 'curse':
      return { color: 0xb488e0, good: false };
    case 'rebuke':
      return { color: 0xff9a3d, good: true };
    case 'stun':
      return { color: 0xffe14d, good: false }; // yellow — crowd-controlled
    case 'silence':
      return { color: 0xc06cff, good: false }; // violet — abilities muted
    case 'invuln':
      return { color: 0xbfe9ff, good: true }; // pale cyan — untouchable
    case 'flight':
      return { color: 0xbfe0ff, good: true }; // pale sky-blue — airborne (item 1)
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
  // item 1 — a constant flyer (MonsterDef.flying) carries no timed 'flight' buff, so
  // its permanent airborne aura is drawn from this flag. Timed flyers glow via the
  // 'flight' buff in the loop below; the two never coincide on the same body.
  flying = false,
): void {
  let i = 0;
  const drawRing = (glow: BuffGlow): void => {
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 4 + i * 1.7);
    const ringR = bodyR + 3 + i * 3.5;
    const baseA = glow.good ? 0.5 : 0.42;
    g.circle(x, y, ringR + 2).fill({ color: glow.color, alpha: 0.05 + 0.05 * pulse });
    g.circle(x, y, ringR).stroke({ width: 2, color: glow.color, alpha: baseA + 0.35 * pulse });
    i++;
  };
  if (flying) drawRing({ color: 0xbfe0ff, good: true });
  if (buffs) {
    if (buffs.some((b) => b.kind === 'absorption' && b.mult > 0 && b.remaining > 0))
      drawBubble(g, x, y, bodyR, timeSec);
    const states = [...new Set(buffs.map(supportStateKind).filter((k) => k !== null))].slice(0, 3);
    states.forEach((kind, index) =>
      drawSupportSymbol(
        g,
        kind,
        x + (index - (states.length - 1) / 2) * 13,
        y + bodyR + 12,
        4.5,
        0.85,
      ),
    );
    for (const b of buffs) {
      const glow = buffGlow(b.kind, b.mult);
      if (!glow) continue;
      drawRing(glow);
      if (i >= 4) break; // cap the stack so a buff pile doesn't smother the body
    }
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
  smoke: 0xb4b9d3, // concealment/escape, distinct from damaging poison
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
  if (!downed && p.paladinAura) drawAuraField(g, p.paladinAura, x, y, scale, isLocal, timeSec);
  if (!downed) {
    drawBuffGlows(g, x, y, r, p.buffs, timeSec);
    drawDefenseState(g, p, x, y, r);
  }

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

  // Cast-progress ring (a charged nuke mid-cast).
  drawCastRing(g, x, y, r, p);

  // Floating HP bar.
  const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
  drawBar(g, x, y - r - 9, Math.max(22, r * 2), 4, hpFrac, downed ? 0x9a9a9a : hpColor(hpFrac));
}

/**
 * A cast-progress ring hugging a player who is mid-cast (Fireball, a charged
 * subclass nuke…): a faint full track plus a bright arcane arc that sweeps from the
 * top and fills as the cast completes. Uses `castTimerMax` (the cast's full duration,
 * carried on the wire) so it's accurate even under Focus. Only a live hero casts
 * (castTimer>0 ⇒ alive), so it never clashes with the downed revive ring. Anchored to
 * the body, so it reads on the sprite and rig paths and on mobile alike.
 */
function drawCastRing(g: Graphics, x: number, y: number, r: number, p: PlayerView): void {
  if (p.castTimer <= 0 || p.castTimerMax <= 0) return;
  const frac = clamp(1 - p.castTimer / p.castTimerMax, 0, 1); // 0 at cast-start → 1 at finish
  const ringR = r + 5;
  g.circle(x, y, ringR).stroke({ width: 3, color: 0x0b1a33, alpha: 0.55 }); // faint track
  if (frac > 0.001) {
    const start = -Math.PI / 2;
    const end = start + frac * Math.PI * 2;
    g.moveTo(x + Math.cos(start) * ringR, y + Math.sin(start) * ringR)
      .arc(x, y, ringR, start, end)
      .stroke({ width: 3, color: 0x66d0ff, alpha: 0.95 }); // arcane-cyan progress
  }
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
  const r = (p.form === 'moonBear' ? 25 : PLAYER_RADIUS) * scale;
  const { x, y } = screen;
  const downed = p.state === 'downed';

  if (!downed && p.paladinAura) drawAuraField(g, p.paladinAura, x, y, scale, isLocal, timeSec);
  if (!downed) {
    drawBuffGlows(g, x, y, r, p.buffs, timeSec);
    drawDefenseState(g, p, x, y, r);
  }

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

  // Cast-progress ring (a charged nuke mid-cast) — same as the vector-body path.
  drawCastRing(g, x, y, r, p);

  const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
  drawBar(
    g,
    x,
    y - playerVisualHeadroom(p, r) - 9,
    Math.max(22, r * 2),
    4,
    hpFrac,
    downed ? 0x9a9a9a : hpColor(hpFrac),
  );
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

  // Active buff/debuff auras (e.g. stunned by Shield Bash, slowed by Frost Nova),
  // plus a permanent airborne aura for a constant flyer (item 1).
  drawBuffGlows(g, x, y, r, b.buffs, timeSec, def.flying === true);

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

  drawBuffGlows(g, x, y, r, b.buffs, timeSec, def.flying === true);

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
  if (a.appearance === 'skeleton') {
    drawSkeleton(g, screen, r, flash, Math.sin(timeSec * 6 + a.id), a.skeletonMotion);
  } else {
    g.circle(x, y, r).fill({ color: 0xbfc4cc });
    g.circle(x, y, r).stroke({ width: 1.5, color: 0x3a3f47, alpha: 0.85 });

    if (flash > 0) {
      g.circle(x, y, r).fill({ color: 0xffffff, alpha: clamp(flash, 0, 1) * 0.7 });
    }
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
  const at = (along: number, across = 0): [number, number] => [
    x + (dx * along - dy * across) * scale,
    y + (dy * along + dx * across) * scale,
  ];
  if (pr.presentation === 'arcaneBarrage') {
    for (const side of [-1, 1])
      g.poly([...at(4), ...at(-10, side * 7), ...at(-33, side * 5), ...at(-13, side * 2)]).fill({
        color: side < 0 ? 0x80cfff : 0xc691ff,
        alpha: 0.78,
      });
    g.poly([...at(12), ...at(0, -5), ...at(-9), ...at(0, 5)]).fill({ color: 0xb395ff });
    g.poly([...at(11), ...at(0, -3), ...at(-4), ...at(0, 0.8)]).fill({ color: 0xf4e7ff });
    return;
  }
  if (pr.presentation === 'arcaneBolt') {
    // A cut crystal and a split wake separate it from the fireball and arrows.
    g.poly([...at(-6, -2), ...at(-24, -5.5), ...at(-14, -0.9)]).fill({
      color: 0xa980ff,
      alpha: 0.69,
    });
    g.poly([...at(-6, 2), ...at(-24, 5.5), ...at(-14, 0.9)]).fill({ color: 0xa980ff, alpha: 0.69 });
    g.poly([...at(10), ...at(0, -5), ...at(-11), ...at(0, 5)])
      .fill({ color: 0xab7cff })
      .stroke({ color: 0x623aa7, width: Math.max(0.8, 1.2 * scale) });
    g.poly([...at(9), ...at(0, -3.8), ...at(-5), ...at(0, 1.1)]).fill({ color: 0xf2ddff });
    return;
  }
  if (pr.presentation === 'druidEarth') {
    g.poly([...at(13), ...at(3, -7), ...at(-13, -4), ...at(-10, 6), ...at(6, 7)])
      .fill({ color: 0x3a2b36 })
      .stroke({ color: 0xf08745, width: Math.max(1.5, scale * 2.1) });
    g.moveTo(...at(8, -2))
      .lineTo(...at(2, 1))
      .lineTo(...at(-4, -2))
      .lineTo(...at(-10, 3))
      .stroke({ color: 0xffc070, width: Math.max(1.5, scale * 2.2) });
    for (const side of [-1, 1])
      g.poly([...at(-16, side * 3), ...at(-25, side * 7), ...at(-21, side)]).fill({
        color: side < 0 ? 0xf58b43 : 0xffd484,
        alpha: 0.8,
      });
    return;
  }
  if (pr.presentation === 'brambleSpear') {
    g.moveTo(...at(-39))
      .quadraticCurveTo(...at(-24, 6), ...at(-8, -1))
      .stroke({ color: 0x81a963, alpha: 0.66, width: Math.max(1.8, scale * 3) });
    g.poly([
      ...at(14),
      ...at(1, -5),
      ...at(-8, -1),
      ...at(-24, -3),
      ...at(-18, 0),
      ...at(-25, 5),
      ...at(-6, 2),
      ...at(1, 5),
    ])
      .fill({ color: 0xb5c475 })
      .stroke({ color: 0x365136, width: Math.max(1, scale * 1.5) });
    for (const side of [-1, 1])
      g.poly([...at(-6), ...at(-18, side * 7), ...at(-14, side * 2)]).fill({ color: 0xe2e5a1 });
    return;
  }
  if (pr.presentation === 'railshot') {
    g.poly([...at(-52, -2), ...at(-11, -3), ...at(2), ...at(-12, 3)]).fill({
      color: 0xe3ae63,
      alpha: 0.52,
    });
    g.poly([...at(15), ...at(-3, -4), ...at(-7), ...at(-3, 4)]).fill({ color: 0xfff1ba });
    g.moveTo(...at(-29))
      .lineTo(...at(5))
      .stroke({ width: Math.max(2, scale * 2.8), color: 0xa9926c });
    for (const side of [-1, 1]) {
      g.poly([...at(-18), ...at(-31, side * 5.7), ...at(-36, side * 4), ...at(-29)]).fill({
        color: 0xd9e9e6,
      });
    }
    return;
  }
  if (pr.kind === 'arrow') {
    const [tailX, tailY] = at(-19);
    g.moveTo(tailX, tailY)
      .lineTo(x, y)
      .stroke({ color: 0xe9d2a7, width: Math.max(1.4, 1.8 * scale) });
    g.poly([...at(5), ...at(-4, -3.2), ...at(-2), ...at(-4, 3.2)]).fill({ color: 0xdeebeb });
    g.poly([...at(-12), ...at(-21, 3.5), ...at(-19), ...at(-21, -3.5)]).fill({ color });
    if (pr.presentation === 'frostArrow') {
      g.poly([...at(7), ...at(-3, -5), ...at(-1), ...at(-3, 5)]).fill({ color: 0xb6f1ff });
      g.poly([...at(-8), ...at(-20, -6), ...at(-17), ...at(-20, 6)]).fill({ color: 0x86d2f2 });
    }
    return;
  }
  if (pr.side === 'player') {
    // Authored silhouettes and directional wakes for the caster bolt families.
    const stroke = Math.max(1.1, 1.7 * scale);
    const path = (points: number[][], tint: number, alpha = 1) => {
      const [start, ...rest] = points;
      g.moveTo(start[0], start[1]);
      for (const point of rest) g.lineTo(point[0], point[1]);
      g.stroke({ color: tint, width: stroke, alpha, cap: 'round' });
    };
    if (pr.kind === 'smite') {
      g.poly([...at(10), ...at(0, 4), ...at(-10), ...at(0, -4)]).fill({ color: 0xffe8a5 });
      path([at(-22), at(8)], 0xffedbb, 0.66);
      path([at(1, -7), at(1, 7)], 0xffffff);
      return;
    }
    if (pr.kind === 'thorn') {
      path([at(-21, 3), at(-13, -2), at(-6, 1), at(8)], 0x7ea758);
      g.poly([...at(9), ...at(-5, -5), ...at(-1), ...at(-8, 5)]).fill({ color: 0xd6e296 });
      g.poly([...at(-5, 1), ...at(-13, 6), ...at(-10)]).fill({ color: 0x8eb26d });
      return;
    }
    if (pr.kind === 'sonic') {
      for (const [front, width] of [
        [9, 7],
        [0, 5],
        [-9, 3],
      ]) {
        g.moveTo(...at(front - 5, -width))
          .quadraticCurveTo(...at(front + 10), ...at(front - 5, width))
          .stroke({ color: front > 0 ? 0xffe0b0 : color, width: stroke, alpha: 0.52 + width / 18 });
      }
      return;
    }
    if (pr.kind === 'chaos') {
      path([at(-20, -5), at(-13, 5), at(-5, -5), at(5, 4), at(9)], 0xfc92ff, 0.77);
      path([at(-20, 4), at(-10, -4), at(-2, 4), at(9)], 0x81eafe, 0.8);
      g.poly([...at(10), ...at(1, -4), ...at(-2, 3)]).fill({ color: 0xffeaff });
      return;
    }
    if (pr.kind === 'eldritch') {
      g.poly([
        ...at(-22, -5),
        ...at(-7, -4),
        ...at(7, -6),
        ...at(11),
        ...at(7, 6),
        ...at(-7, 4),
        ...at(-22, 5),
      ])
        .fill({ color: 0x28213d })
        .stroke({ color: 0x9275af, width: stroke });
      g.poly([...at(8), ...at(1, -3), ...at(-9), ...at(1, 3)]).fill({ color: 0x8cdbbb });
      return;
    }
  }
  if (pr.kind === 'shadowBolt') {
    g.poly([...at(9), ...at(-2, -7), ...at(-19, -3), ...at(-10, 0), ...at(-18, 5), ...at(-1, 6)])
      .fill({ color: 0x322348 })
      .stroke({ color, width: Math.max(1.15, 1.5 * scale), alpha: 0.88 });
    g.poly([...at(8), ...at(-5, -3), ...at(0), ...at(-5, 3)]).fill({ color: 0xe7cdf4 });
    return;
  }
  if (pr.presentation === 'sorcererMeteor') {
    g.poly([...at(11, -2), ...at(4, 8), ...at(-5, 5), ...at(-10, -3), ...at(2, -8)])
      .fill({ color: 0x392b51 })
      .stroke({ color: 0xed9d73, width: Math.max(1.3, scale * 2) });
    g.moveTo(...at(7, -4))
      .lineTo(...at(2, 0))
      .lineTo(...at(-4, -1))
      .lineTo(...at(-5, 4))
      .stroke({ color: 0xffe0a0, width: 1.6 });
    for (let i = 0; i < 4; i++) {
      const [px, py] = at(-12 - i * 5, (i % 2 ? -1 : 1) * (i + 2));
      g.circle(px, py, Math.max(1, scale * (2.6 - i * 0.4))).fill({
        color: i % 2 ? 0xbb79ea : 0xffbf7a,
        alpha: 0.84 - i * 0.14,
      });
    }
    return;
  }
  if (pr.kind === 'fireball') {
    g.poly([...at(7), ...at(1, 6), ...at(-7, 4), ...at(-22, -1), ...at(-8, -5), ...at(2, -6)]).fill(
      { color: 0xef5a28, alpha: 0.78 },
    );
    g.poly([...at(5), ...at(-1, 4), ...at(-14), ...at(-1, -4)]).fill({ color: 0xffba48 });
    g.circle(x, y, Math.max(2, 3.1 * scale)).fill({ color: 0xffe3a8 });
    return;
  }

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

/** Draw the point, shaft and split fletching at a readable screen size. */
function rainArrow(
  g: Graphics,
  x: number,
  y: number,
  angle: number,
  length: number,
  alpha: number,
  amber = false,
): void {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const at = (forward: number, side = 0): [number, number] => [
    x + (c * forward - s * side) * length,
    y + (s * forward + c * side) * length,
  ];
  g.moveTo(...at(-1))
    .lineTo(x, y)
    .stroke({ width: 3.2, color: 0x392a25, alpha, cap: 'round' });
  g.moveTo(...at(-0.94))
    .lineTo(...at(-0.16))
    .stroke({ width: 1.55, color: 0xd6a877, alpha });
  g.poly([...at(0.08), ...at(-0.25, -0.142), ...at(-0.21), ...at(-0.25, 0.142)]).fill({
    color: amber ? 0xffcf7c : 0xffecd0,
    alpha,
  });
  for (const side of [-1, 1])
    g.poly([...at(-0.68), ...at(-1.11, side * 0.18), ...at(-0.99), ...at(-0.79)]).fill({
      color: amber ? 0xffcc6e : 0xb8e3d6,
      alpha,
    });
}

function drawRainApproach(
  g: Graphics,
  z: ZoneView,
  x: number,
  y: number,
  r: number,
  scale: number,
): void {
  const travel = clamp(1 - (z.armRemaining ?? 0) / (z.armTotal ?? 1), 0, 1);
  const delta = torusSub(z.armFrom!, z.pos);
  const fromX = x + delta.x * scale;
  const fromY = y + delta.y * scale - 10 * scale;
  const arcHeight = Math.max(36, Math.min(105, Math.hypot(delta.x, delta.y) * scale * 0.44));
  const aim = Math.atan2(y - fromY, x - fromX);
  for (const wing of [-1, 0, 1]) {
    const t = clamp(travel + wing * 0.055, 0, 1);
    const rise = Math.sin(t * Math.PI) * arcHeight;
    const px = fromX + (x - fromX) * t - Math.sin(aim) * wing * 6;
    const py = fromY + (y - fromY) * t - rise + Math.cos(aim) * wing * 6;
    const angle = Math.atan2(y - fromY - Math.cos(t * Math.PI) * arcHeight * Math.PI, x - fromX);
    rainArrow(g, px, py, angle, Math.max(14, 22 * scale), 0.93, true);
  }
  for (let i = 0; i < 5; i++) {
    const angle = aim + i * Math.PI * 0.4;
    const px = x + Math.cos(angle) * r * 0.81;
    const py = y + Math.sin(angle) * r * 0.81;
    g.ellipse(px, py, 3 + travel * 3, 2.5).fill({ color: 0xffdbae, alpha: 0.48 + travel * 0.34 });
  }
}

function drawArrowRain(
  g: Graphics,
  z: ZoneView,
  x: number,
  y: number,
  r: number,
  fade: number,
  time: number,
): void {
  const elapsed = z.duration - z.remaining;
  const impact =
    elapsed < ZONE_TICK_INTERVAL - 1e-5
      ? 0
      : 1 - Math.min(1, ((elapsed + 1e-5) % ZONE_TICK_INTERVAL) / 0.18);
  for (let i = 0; i < 12; i++) {
    const theta = (i + (z.id % 11)) * 2.399963;
    const radius = Math.sqrt((i + 0.5) / 12) * r;
    const px = x + Math.cos(theta) * radius;
    const py = y + Math.sin(theta) * radius;
    const phase = (time * 2.5 + i * 0.618034) % 1;
    const length = Math.max(13, Math.min(20, r * 0.28));
    if (phase < 0.65) {
      const height = (1 - phase / 0.65) * r * 0.86;
      rainArrow(g, px - height * 0.33, py - height, 1.25, length, fade * 0.93);
    } else if (impact > 0) {
      rainArrow(g, px, py, 1.29, length * 0.68, fade * impact * 0.83);
      for (const side of [-1, 1]) {
        const cx = px + side * (3 + (1 - impact) * 7);
        g.poly([cx - 2, py - 1, cx, py - 4, cx + 3, py + 1]).fill({
          color: 0xc5a678,
          alpha: fade * impact * 0.82,
        });
      }
    }
  }
}

function drawNatureField(
  g: Graphics,
  z: ZoneView,
  x: number,
  y: number,
  r: number,
  scale: number,
  time: number,
): void {
  const guarded = z.natureCanopy ?? false;
  const flowers = z.natureArt === 'grove';
  const briar = z.natureArt === 'briar';
  const spring = z.natureArt === 'spring';
  const fade = zoneFadeAlpha(z.remaining, z.duration);
  if (z.armFrom && z.armTotal && (z.armRemaining ?? 0) > 0) {
    const t = clamp(1 - (z.armRemaining ?? 0) / z.armTotal, 0, 1);
    const delta = torusSub(z.armFrom, z.pos);
    const px = x + delta.x * scale * (1 - t);
    const py = y + delta.y * scale * (1 - t) - Math.sin(t * Math.PI) * 36;
    g.poly([px - 7, py + 2, px - 3, py - 6, px + 7, py - 3, px + 3, py + 6])
      .fill({ color: 0xe2b871 })
      .stroke({ width: 1.25, color: 0x48392c });
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 0.4;
      g.ellipse(x + Math.cos(a) * r * 0.84, y + Math.sin(a) * r * 0.84, 3.8, 2.5).fill({
        color: 0xc4d497,
        alpha: 0.55 + t * 0.36,
      });
    }
    return;
  }
  if (fade <= 0) return;
  if (spring) {
    for (let i = 0; i < 10; i++) {
      const a = i * 2.399963 + time * 0.37;
      const reach = r * Math.sqrt((i + 0.5) / 10);
      const px = x + Math.cos(a) * reach;
      const py = y + Math.sin(a) * reach;
      const ripple = (time * 1.4 + i * 0.27) % 1;
      const spread = Math.max(5, r * (0.06 + ripple * 0.09));
      g.moveTo(px - spread, py)
        .quadraticCurveTo(px, py + spread * 0.72, px + spread, py - spread * 0.14)
        .stroke({
          color: guarded ? 0xe1e1a0 : 0x93dccc,
          alpha: fade * (0.82 - ripple * 0.56),
          width: 1.8,
        });
      g.ellipse(px, py - ripple * 9, 2.4, 3.6).fill({
        color: 0xc5f4de,
        alpha: fade * (1 - ripple),
      });
    }
    return;
  }
  const growth = Math.min(1, (z.duration - z.remaining) / 0.24);
  const width = Math.max(1.5, r * 0.033);
  const petals = flowers ? 9 : 12;
  for (let i = 0; i < petals; i++) {
    const a = i * 2.399963 + (z.id % 7) * 0.21;
    const rad = r * Math.sqrt((i + 0.6) / petals);
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    const lift = Math.max(7, r * (guarded ? 0.33 : briar ? 0.27 : 0.23)) * (0.46 + growth * 0.54);
    const sway = Math.sin(time * 3.8 + i) * lift * 0.19;
    const bend = Math.cos(a) * lift * 0.51 + sway;
    g.ellipse(px, py, lift * 0.52, Math.max(2, lift * 0.14)).fill({
      color: 0x6a7547,
      alpha: fade * 0.4,
    });
    g.moveTo(px - bend * 0.3, py)
      .quadraticCurveTo(px - bend * 0.82, py - lift * 0.48, px + bend, py - lift)
      .stroke({ color: flowers ? 0x95bd7a : 0xa5b575, alpha: fade * 0.9, width, cap: 'round' });
    if (briar) {
      const lead = z.natureFollowing ? Math.sin(time * 11 + i) * lift * 0.26 : 0;
      g.moveTo(px - lift * 0.56, py - lift * 0.15)
        .quadraticCurveTo(
          px + bend + lead,
          py - lift * 0.42,
          px + lift * 0.6 + lead,
          py - lift * 0.12,
        )
        .stroke({ color: 0xb98764, alpha: fade * 0.95, width });
      for (const side of [-1, 1])
        g.poly([
          px + side * lift * 0.24,
          py - lift * 0.24,
          px + side * lift * 0.57,
          py - lift * 0.78,
          px + side * lift * 0.45,
          py - lift * 0.19,
        ]).fill({ color: 0xd6b47e, alpha: fade * 0.95 });
    } else if (flowers) {
      for (const side of [-1, 1])
        g.ellipse(px + bend + side * lift * 0.18, py - lift, lift * 0.2, lift * 0.14).fill({
          color: side < 0 ? 0xe1caaa : 0xa9d29a,
          alpha: fade * 0.91,
        });
    } else {
      g.poly([
        px + bend,
        py - lift,
        px + bend + lift * 0.25,
        py - lift * 0.57,
        px - bend * 0.23,
        py - lift * 0.53,
      ]).fill({ color: guarded ? 0xe3ce85 : 0xc2d19a, alpha: fade * 0.91 });
    }
  }
}

export function drawZone(
  g: Graphics,
  z: ZoneView,
  screen: Vec2,
  scale: number,
  time = z.duration - z.remaining,
): void {
  // A themed tint override (affix/corruption hazards) wins over the per-kind palette.
  const style = z.side === 'boss' ? undefined : z.curseStyle;
  const color = z.color ?? (style ? CURSE_COLORS[style] : ZONE_COLORS[z.kind]) ?? 0xffffff;
  const r = z.radius * scale;
  const { x, y } = screen;

  if (z.mageBind) {
    const arming = (z.armRemaining ?? 0) > 0;
    if (arming) {
      drawZoneArming(g, z, screen, scale, 0xa994f1, r);
      return;
    }
    const fade = zoneFadeAlpha(z.remaining, z.duration);
    const height = r * 0.36;
    const color = z.prison ? 0xf3c6ff : 0xae9cf4;
    for (let i = 0; i < 8; i++) {
      const a = (2 * Math.PI * i) / 8 + Math.PI / 8;
      const next = a + Math.PI / 4;
      const dx = Math.cos(a),
        dy = Math.sin(a);
      const px = x + dx * r,
        py = y + dy * r;
      const nx = x + Math.cos(next) * r,
        ny = y + Math.sin(next) * r;
      const bend = r * 0.18;
      g.moveTo(px, py)
        .quadraticCurveTo(px + dx * bend, py - height, px - dx * bend, py - height)
        .stroke({ color, width: Math.max(2, scale * 4), alpha: fade * 0.86 });
      g.moveTo(px, py)
        .quadraticCurveTo(
          x + Math.cos((a + next) / 2) * r * 1.08,
          y + Math.sin((a + next) / 2) * r * 1.08,
          nx,
          ny,
        )
        .stroke({ color, width: Math.max(1.5, scale * 2), alpha: fade * 0.52 });
      if (z.prison) {
        g.moveTo(px - dy * bend, py + dx * bend - height * 0.28)
          .lineTo(px - dx * bend, py - dy * bend - height * 0.55)
          .lineTo(px + dy * bend, py - dx * bend - height * 0.28)
          .stroke({ color: 0xf4b5ec, width: Math.max(1.5, scale * 2), alpha: fade * 0.76 });
      }
    }
    drawZoneMarks(g, z, x, y, r, fade);
    return;
  }

  if (z.natureArt) {
    drawNatureField(g, z, x, y, r, scale, time);
    if (!(z.armRemaining && z.armRemaining > 0))
      drawZoneMarks(g, z, x, y, r, zoneFadeAlpha(z.remaining, z.duration));
    return;
  }

  // item 12 — a ranged AoE ARMS first: draw the incoming telegraph (an indicator
  // travelling from the caster + a filling target ring) instead of the live zone,
  // so players read where it will land before it bites.
  if ((z.armRemaining ?? 0) > 0 && z.armTotal && z.armFrom) {
    if (z.kind === 'rainOfArrows' && z.side === 'player') drawRainApproach(g, z, x, y, r, scale);
    else drawZoneArming(g, z, screen, scale, color, r);
    return;
  }

  // Ease the whole zone in on spawn and out near expiry so it visibly appears
  // and then disappears after a while rather than popping.
  const fade = zoneFadeAlpha(z.remaining, z.duration);
  if (fade <= 0) return;

  if (z.kind === 'rainOfArrows' && z.side === 'player') {
    drawArrowRain(g, z, x, y, r, fade, time);
    return;
  }

  // Gentle alpha pulse driven by the zone's own countdown.
  const pulse = 0.13 + 0.06 * (0.5 + 0.5 * Math.sin(z.remaining * 6));
  g.circle(x, y, r).fill({ color, alpha: pulse * fade });
  if (z.side === 'player') {
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      g.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r)
        .arc(x, y, r, angle, angle + Math.PI / 9)
        .stroke({ width: 2, color, alpha: 0.65 * fade });
    }
  } else
    g.circle(x, y, r).stroke({
      width: 2,
      color: z.side === 'boss' ? 0xff7b89 : color,
      alpha: 0.65 * fade,
    });
  drawZoneMarks(g, z, x, y, r, fade);
}

function drawZoneMarks(
  g: Graphics,
  z: ZoneView,
  x: number,
  y: number,
  r: number,
  fade: number,
): void {
  const style = z.side === 'boss' ? undefined : z.curseStyle;
  if (style) {
    // One large unbacked watermark inside the player's field; never little badges
    // that look attached to an overlapping boss pool or environmental prop.
    const symbolScale = Math.min(3, r / 12);
    g.context.save().scale(symbolScale, symbolScale).translate(x, y);
    drawCurseSigil(g, style, 0, 0, fade * 0.5);
    g.context.restore();
  }
  const marks = z.supportKinds ?? [];
  marks.forEach((kind, index) =>
    drawSupportSymbol(g, kind, x + (index - (marks.length - 1) / 2) * 17, y, 6, 0.8 * fade),
  );
}

/**
 * item 12 — the arming telegraph for a ranged AoE: a faint guide line from the
 * caster, a dashed target ring that fills as it arms, and a marker travelling toward
 * the impact point. The marker style varies by zone kind (a dart cluster for the
 * Ranger's arrow rain, a lobbed blob for a curse/venom pool) so each class reads
 * differently. Camera is a linear pan/zoom, so the caster's screen point is the
 * zone's screen plus the scaled world offset.
 */
function drawZoneArming(
  g: Graphics,
  z: ZoneView,
  screen: Vec2,
  scale: number,
  color: number,
  r: number,
): void {
  const { x, y } = screen;
  const progress = Math.min(1, Math.max(0, 1 - (z.armRemaining ?? 0) / (z.armTotal ?? 1)));
  const fx = x + (z.armFrom!.x - z.pos.x) * scale; // caster's screen point
  const fy = y + (z.armFrom!.y - z.pos.y) * scale;
  const ix = fx + (x - fx) * progress; // travelling marker
  const iy = fy + (y - fy) * progress;

  // Faint guide line caster → target.
  g.moveTo(fx, fy)
    .lineTo(x, y)
    .stroke({ width: Math.max(1, 1.2 * scale), color, alpha: 0.22 });

  // Target ring + a sweeping arc that fills as the AoE arms.
  g.circle(x, y, r).stroke({ width: 2, color, alpha: 0.45 });
  const start = -Math.PI / 2;
  const end = start + progress * Math.PI * 2;
  g.moveTo(x + Math.cos(start) * r, y + Math.sin(start) * r)
    .arc(x, y, r, start, end)
    .stroke({ width: Math.max(2, 3 * scale), color, alpha: 0.9 });

  // The travelling indicator — per-kind so classes read distinctly.
  const m = Math.max(4, 7 * scale);
  if (z.kind === 'rainOfArrows') {
    for (const o of [-0.55, 0, 0.55]) {
      g.moveTo(ix + o * m, iy - m)
        .lineTo(ix + o * m * 0.35, iy + m)
        .stroke({ width: Math.max(1.5, 2 * scale), color, alpha: 0.95 });
    }
  } else {
    g.circle(ix, iy, m * 0.55).fill({ color, alpha: 0.9 });
    g.circle(ix, iy, m).stroke({ width: Math.max(1, 1.5 * scale), color, alpha: 0.55 });
  }
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

/** Class effigy / modifier toggle: a tall banner-shard in the accent colour on a
 *  pedestal. A disabled effigy (a full add-bot slot, or a gauntlet-only modifier
 *  while single-fight is chosen) greys out and dims, mirroring the sealed portal. */
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
  const disabled = st.disabled === true;
  const selected = st.selected === true && !disabled;
  const active = st.active === true && !disabled;
  const shardColor = disabled ? 0x555560 : color;
  g.ellipse(x, y + r * 0.5, r * 1.1, r * 0.45).fill({ color: 0x000000, alpha: 0.32 });
  g.ellipse(x, y + r * 0.34, r * 0.9, r * 0.34).fill({ color: 0x2e2a36 });
  g.ellipse(x, y + r * 0.34, r * 0.9, r * 0.34).stroke({ width: 1.5, color: 0x14121a, alpha: 0.9 });
  const bob = disabled ? 0 : Math.sin(timeSec * 1.8 + st.id) * 0.1 * r;
  const topY = y - r * 1.15 - bob;
  const midY = y - r * 0.1;
  const alpha = disabled ? 0.4 : selected ? 1 : active ? 0.95 : 0.72;
  g.moveTo(x, topY)
    .lineTo(x + r * 0.5, midY)
    .lineTo(x, y + r * 0.15)
    .lineTo(x - r * 0.5, midY)
    .closePath()
    .fill({ color: shardColor, alpha });
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
