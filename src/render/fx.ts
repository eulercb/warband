/**
 * Warband — visual FX / "juice": telegraphs, floating damage numbers, hit
 * flashes, event bursts and screen shake.
 *
 * Everything is pooled and bounded. The renderer:
 *   1. calls `processEvents(events, camera)` BEFORE drawing the frame,
 *   2. draws entities (querying `flashAmount(id)` for hit-flash intensity),
 *   3. calls `drawTelegraph(...)` for the boss telegraph,
 *   4. calls `update(dtMs)` then `draw(g, camera)` for bursts + damage numbers.
 *
 * Bursts render into a screen-space `Graphics`; damage numbers are pooled `Text`
 * objects living in a container the renderer supplies at construction.
 */
import { Text, TextStyle } from 'pixi.js';
import type { Container, Graphics } from 'pixi.js';
import type { GameEvent, Telegraph, SkillArea, Vec2 } from '../engine/types';
import type { Camera } from './camera';
import { clamp } from '../engine/math';

// --- Tunables ---------------------------------------------------------------

const FLOATER_CAP = 80;
const BURST_CAP = 80;
const AREA_FLASH_CAP = 24;

const FLOATER_TTL = 0.8; // s
const FLOATER_RISE_PX = 42; // total rise over its life

const HIT_FLASH_TIME = 0.16; // s
const AREA_FLASH_TTL = 0.45; // s — how long an ability's area cue lingers

/** Boss abilities heavy enough to warrant a screen shake on cast. */
const HEAVY_CAST = new Set(['groundSlam', 'tailSweep', 'smash', 'wingGust', 'charge']);

// --- Pooled objects ---------------------------------------------------------

interface Floater {
  active: boolean;
  world: Vec2;
  age: number;
  text: Text;
}

interface Burst {
  active: boolean;
  world: Vec2;
  age: number;
  ttl: number;
  startR: number; // world units
  endR: number; // world units
  color: number;
  alpha0: number;
  filled: boolean;
  lineWidth: number;
  rise: number; // screen px the burst floats upward over its life
}

/** A short-lived cue that flashes a player/boss ability's effect area. */
interface AreaFlash {
  active: boolean;
  area: SkillArea;
  color: number;
  age: number;
}

export class Fx {
  private readonly floaters: Floater[] = [];
  private readonly bursts: Burst[] = [];
  private readonly areaFlashes: AreaFlash[] = [];
  private readonly flashes = new Map<number, number>();

  constructor(textLayer: Container) {
    for (let i = 0; i < FLOATER_CAP; i++) {
      const text = new Text({
        text: '',
        style: new TextStyle({
          fontFamily: 'system-ui, sans-serif',
          fontSize: 16,
          fontWeight: '700',
          fill: 0xffffff,
          align: 'center',
          stroke: { color: 0x000000, width: 3 },
        }),
      });
      text.anchor.set(0.5);
      text.visible = false;
      textLayer.addChild(text);
      this.floaters.push({ active: false, world: { x: 0, y: 0 }, age: 0, text });
    }
    for (let i = 0; i < BURST_CAP; i++) {
      this.bursts.push({
        active: false,
        world: { x: 0, y: 0 },
        age: 0,
        ttl: 0,
        startR: 0,
        endR: 0,
        color: 0xffffff,
        alpha0: 1,
        filled: false,
        lineWidth: 2,
        rise: 0,
      });
    }
    for (let i = 0; i < AREA_FLASH_CAP; i++) {
      this.areaFlashes.push({
        active: false,
        area: { kind: 'circle', origin: { x: 0, y: 0 }, angle: 0, range: 0, radius: 0, halfAngle: 0 },
        color: 0xffffff,
        age: 0,
      });
    }
  }

  // --- Events -> FX ---------------------------------------------------------

  processEvents(events: GameEvent[], camera: Camera): void {
    for (const e of events) {
      switch (e.t) {
        case 'hit': {
          const color = e.side === 'player' ? 0xff5a5a : 0xffe066;
          this.spawnFloater(e.pos, String(Math.round(e.amount)), color);
          this.flashes.set(e.targetId, HIT_FLASH_TIME);
          if (e.amount >= 40) camera.addShake(clamp(e.amount * 0.08, 2, 8));
          break;
        }
        case 'heal': {
          this.spawnFloater(e.pos, '+' + Math.round(e.amount), 0x66ff88);
          this.spawnBurst(e.pos, {
            startR: 4,
            endR: 26,
            ttl: 0.5,
            color: 0x66ff88,
            alpha0: 0.4,
            filled: false,
            lineWidth: 2,
          });
          break;
        }
        case 'cast': {
          const color = e.side === 'player' ? 0x8fd3ff : 0xff8a3d;
          this.spawnBurst(e.pos, {
            startR: 2,
            endR: 30,
            ttl: 0.3,
            color,
            alpha0: 0.5,
            filled: true,
          });
          if (e.side === 'boss' && HEAVY_CAST.has(e.ability)) camera.addShake(8);
          break;
        }
        case 'skillArea': {
          this.spawnAreaFlash(e.area, e.color);
          break;
        }
        case 'spawn': {
          // A summoned add "arrives" — a quick rising puff at its spawn point.
          this.spawnBurst(e.pos, {
            startR: 4,
            endR: 34,
            ttl: 0.45,
            color: 0x8a6cff,
            alpha0: 0.7,
            filled: false,
            lineWidth: 3,
            rise: 18,
          });
          break;
        }
        case 'death': {
          if (e.kind === 'boss') {
            this.spawnBurst(e.pos, {
              startR: 12,
              endR: 300,
              ttl: 0.9,
              color: 0xff3b30,
              alpha0: 0.9,
              filled: false,
              lineWidth: 6,
            });
            camera.addShake(24);
          } else {
            const color = e.kind === 'player' ? 0xdddddd : 0x9aa0a8;
            this.spawnBurst(e.pos, {
              startR: 6,
              endR: e.kind === 'player' ? 64 : 46,
              ttl: 0.5,
              color,
              alpha0: 0.8,
              filled: false,
              lineWidth: 3,
            });
          }
          break;
        }
        case 'revive': {
          this.spawnBurst(e.pos, {
            startR: 4,
            endR: 20,
            ttl: 0.7,
            color: 0x66ff88,
            alpha0: 0.9,
            filled: true,
            rise: 34,
          });
          break;
        }
        case 'downed': {
          this.spawnBurst(e.pos, {
            startR: 8,
            endR: 40,
            ttl: 0.4,
            color: 0x808088,
            alpha0: 0.6,
            filled: false,
            lineWidth: 2,
          });
          break;
        }
        case 'dodge': {
          this.spawnBurst(e.pos, {
            startR: 6,
            endR: 42,
            ttl: 0.35,
            color: 0xcfd8e3,
            alpha0: 0.6,
            filled: false,
            lineWidth: 2,
          });
          break;
        }
        case 'blink': {
          const puff = {
            startR: 6,
            endR: 40,
            ttl: 0.4,
            color: 0x9c5cf0,
            alpha0: 0.6,
            filled: false,
            lineWidth: 2,
          } as const;
          this.spawnBurst(e.from, puff);
          this.spawnBurst(e.to, puff);
          break;
        }
        case 'enrage': {
          this.spawnBurst(e.pos, {
            startR: 10,
            endR: 220,
            ttl: 0.6,
            color: 0xff3b30,
            alpha0: 0.8,
            filled: false,
            lineWidth: 5,
          });
          camera.addShake(16);
          break;
        }
        case 'projectile': {
          this.spawnBurst(e.pos, {
            startR: 1,
            endR: 14,
            ttl: 0.2,
            color: 0xffffff,
            alpha0: 0.4,
            filled: true,
          });
          break;
        }
        case 'telegraph':
          // Persistent boss telegraph is drawn from `boss.telegraph`; nothing here.
          break;
      }
    }
  }

  // --- Telegraph ------------------------------------------------------------

  /**
   * Draw the boss telegraph in screen space. The inner "danger" region fills as
   * `remainingWindup -> 0`; the color lerps orange -> red as it fills. At impact
   * the shape is drawn fully lit.
   */
  drawTelegraph(g: Graphics, t: Telegraph, camera: Camera): void {
    const total = Math.max(t.totalWindup, 1e-6);
    const frac = clamp(1 - t.remainingWindup / total, 0, 1);
    const active = t.remainingWindup <= 0.02;
    const color = lerpColor(0xff9a3d, 0xff2b2b, frac);
    const fillAlpha = active ? 0.55 : 0.16 + 0.24 * frac;
    const s = camera.scale;

    if (t.kind === 'circle') {
      const c = camera.worldToScreen(t.target);
      const R = t.radius * s;
      g.circle(c.x, c.y, R).stroke({ width: 2, color, alpha: 0.9 });
      g.circle(c.x, c.y, Math.max(0.001, R * frac)).fill({ color, alpha: fillAlpha });
    } else if (t.kind === 'cone') {
      const o = camera.worldToScreen(t.origin);
      const R = t.range * s;
      const a0 = t.angle - t.halfAngle;
      const a1 = t.angle + t.halfAngle;
      g.moveTo(o.x, o.y)
        .arc(o.x, o.y, R, a0, a1)
        .lineTo(o.x, o.y)
        .stroke({ width: 2, color, alpha: 0.9 });
      const Rf = Math.max(0.001, R * frac);
      g.moveTo(o.x, o.y)
        .arc(o.x, o.y, Rf, a0, a1)
        .lineTo(o.x, o.y)
        .fill({ color, alpha: fillAlpha });
    } else {
      // line: a rotated rectangle capsule from origin to target.
      const o = camera.worldToScreen(t.origin);
      const target = camera.worldToScreen(t.target);
      const dx = target.x - o.x;
      const dy = target.y - o.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      const hw = (t.width * s) / 2;
      linePoly(g, o.x, o.y, ux, uy, nx, ny, len, hw).stroke({ width: 2, color, alpha: 0.9 });
      linePoly(g, o.x, o.y, ux, uy, nx, ny, len * frac, hw).fill({ color, alpha: fillAlpha });
    }
  }

  // --- Per-frame ------------------------------------------------------------

  update(dtMs: number): void {
    const dt = dtMs / 1000;

    // Decay hit flashes.
    for (const [id, v] of this.flashes) {
      const nv = v - dt;
      if (nv <= 0) this.flashes.delete(id);
      else this.flashes.set(id, nv);
    }

    // Advance floaters (visual placement happens in draw()).
    for (const f of this.floaters) {
      if (!f.active) continue;
      f.age += dt;
      if (f.age >= FLOATER_TTL) {
        f.active = false;
        f.text.visible = false;
      }
    }

    // Advance bursts.
    for (const b of this.bursts) {
      if (!b.active) continue;
      b.age += dt;
      if (b.age >= b.ttl) b.active = false;
    }

    // Advance ability area flashes.
    for (const a of this.areaFlashes) {
      if (!a.active) continue;
      a.age += dt;
      if (a.age >= AREA_FLASH_TTL) a.active = false;
    }
  }

  /** Render bursts to `g` and position/fade the pooled damage-number `Text`. */
  draw(g: Graphics, camera: Camera): void {
    // PixiJS Graphics is retained-mode: every circle/fill below APPENDS geometry.
    // Clear first so we fully redraw the live bursts each frame — otherwise every
    // frame's circles pile up forever and each attack leaves a permanent ring on
    // the ground (the fx layer, unlike the others, is only cleared here).
    g.clear();

    // Ability area cues (under the bursts): flash the region an ability hit.
    for (const a of this.areaFlashes) {
      if (!a.active) continue;
      this.drawAreaFlash(g, a, camera);
    }

    // Bursts.
    for (const b of this.bursts) {
      if (!b.active) continue;
      const t = clamp(b.age / b.ttl, 0, 1);
      const e = 1 - (1 - t) * (1 - t); // ease-out
      const scr = camera.worldToScreen(b.world);
      const rad = Math.max(0.5, (b.startR + (b.endR - b.startR) * e) * camera.scale);
      const alpha = b.alpha0 * (1 - t);
      const cy = scr.y - b.rise * e;
      if (b.filled) {
        g.circle(scr.x, cy, rad).fill({ color: b.color, alpha });
      } else {
        g.circle(scr.x, cy, rad).stroke({ width: b.lineWidth, color: b.color, alpha });
      }
    }

    // Damage numbers.
    for (const f of this.floaters) {
      if (!f.active) continue;
      const t = clamp(f.age / FLOATER_TTL, 0, 1);
      const scr = camera.worldToScreen(f.world);
      f.text.position.set(scr.x, scr.y - 18 - FLOATER_RISE_PX * t);
      f.text.alpha = 1 - t;
    }
  }

  /** Hit-flash intensity 0..1 for an entity id (0 if none). */
  flashAmount(id: number): number {
    const v = this.flashes.get(id);
    return v ? clamp(v / HIT_FLASH_TIME, 0, 1) : 0;
  }

  // --- Pool helpers ---------------------------------------------------------

  private spawnFloater(pos: Vec2, str: string, color: number): void {
    const f = this.acquireFloater();
    f.active = true;
    f.age = 0;
    f.world.x = pos.x;
    f.world.y = pos.y;
    f.text.text = str;
    f.text.style.fill = color;
    f.text.visible = true;
  }

  private acquireFloater(): Floater {
    let oldest = this.floaters[0];
    for (const f of this.floaters) {
      if (!f.active) return f;
      if (f.age > oldest.age) oldest = f;
    }
    return oldest;
  }

  private spawnBurst(
    pos: Vec2,
    opts: {
      startR: number;
      endR: number;
      ttl: number;
      color: number;
      alpha0: number;
      filled: boolean;
      lineWidth?: number;
      rise?: number;
    },
  ): void {
    const b = this.acquireBurst();
    b.active = true;
    b.age = 0;
    b.world.x = pos.x;
    b.world.y = pos.y;
    b.startR = opts.startR;
    b.endR = opts.endR;
    b.ttl = opts.ttl;
    b.color = opts.color;
    b.alpha0 = opts.alpha0;
    b.filled = opts.filled;
    b.lineWidth = opts.lineWidth ?? 2;
    b.rise = opts.rise ?? 0;
  }

  private acquireBurst(): Burst {
    let oldest = this.bursts[0];
    for (const b of this.bursts) {
      if (!b.active) return b;
      if (b.age > oldest.age) oldest = b;
    }
    return oldest;
  }

  private spawnAreaFlash(area: SkillArea, color: number): void {
    const a = this.acquireAreaFlash();
    a.active = true;
    a.age = 0;
    a.color = color;
    // Deep-copy the geometry (events are transient / reused).
    a.area = {
      kind: area.kind,
      origin: { x: area.origin.x, y: area.origin.y },
      angle: area.angle,
      range: area.range,
      radius: area.radius,
      halfAngle: area.halfAngle,
    };
  }

  private acquireAreaFlash(): AreaFlash {
    let oldest = this.areaFlashes[0];
    for (const a of this.areaFlashes) {
      if (!a.active) return a;
      if (a.age > oldest.age) oldest = a;
    }
    return oldest;
  }

  /** Draw one ability area cue (cone / circle / line) fading over its life. */
  private drawAreaFlash(g: Graphics, a: AreaFlash, camera: Camera): void {
    const t = clamp(a.age / AREA_FLASH_TTL, 0, 1);
    const fade = 1 - t; // linear fade-out
    const fillAlpha = 0.28 * fade;
    const strokeAlpha = 0.8 * fade;
    const s = camera.scale;
    const { area, color } = a;

    if (area.kind === 'circle') {
      const c = camera.worldToScreen(area.origin);
      const R = area.radius * s;
      g.circle(c.x, c.y, R).fill({ color, alpha: fillAlpha });
      g.circle(c.x, c.y, R).stroke({ width: 2, color, alpha: strokeAlpha });
    } else if (area.kind === 'cone') {
      const o = camera.worldToScreen(area.origin);
      const R = area.range * s;
      const a0 = area.angle - area.halfAngle;
      const a1 = area.angle + area.halfAngle;
      g.moveTo(o.x, o.y).arc(o.x, o.y, R, a0, a1).lineTo(o.x, o.y).fill({ color, alpha: fillAlpha });
      g.moveTo(o.x, o.y).arc(o.x, o.y, R, a0, a1).lineTo(o.x, o.y).stroke({ width: 2, color, alpha: strokeAlpha });
    } else {
      // line: capsule from origin along angle for `range`, half-width `radius`.
      const o = camera.worldToScreen(area.origin);
      const ux = Math.cos(area.angle);
      const uy = Math.sin(area.angle);
      const nx = -uy;
      const ny = ux;
      const L = area.range * s;
      const hw = Math.max(2, area.radius * s);
      linePoly(g, o.x, o.y, ux, uy, nx, ny, L, hw).fill({ color, alpha: fillAlpha });
      linePoly(g, o.x, o.y, ux, uy, nx, ny, L, hw).stroke({ width: 2, color, alpha: strokeAlpha });
    }
  }
}

// --- Free functions ---------------------------------------------------------

/** Emit the poly for a rectangle of length `L` and half-width `hw` from an
 * origin along unit axis (ux,uy) with unit normal (nx,ny). Returns `g` so the
 * caller can chain `.fill()` / `.stroke()`. */
function linePoly(
  g: Graphics,
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  nx: number,
  ny: number,
  L: number,
  hw: number,
): Graphics {
  return g.poly([
    ox + nx * hw,
    oy + ny * hw,
    ox + ux * L + nx * hw,
    oy + uy * L + ny * hw,
    ox + ux * L - nx * hw,
    oy + uy * L - ny * hw,
    ox - nx * hw,
    oy - ny * hw,
  ]);
}

/** Linear interpolation between two packed 0xRRGGBB colors. */
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const gg = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gg << 8) | bl;
}
