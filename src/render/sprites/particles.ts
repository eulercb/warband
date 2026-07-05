/**
 * Warband — asset-free particle VFX. Pooled & bounded like `Fx`, and fed off the
 * SAME `GameEvent` stream (brief §8). The soft round "dot" texture is generated
 * once at init from a radial-gradient `Graphics` — no image assets.
 *
 * Particles augment (do not replace) the geometric bursts in `Fx`: the bursts
 * read as clean shockwaves, particles add the grit. Both are cheap and bounded.
 */
import { Container, Graphics, Sprite, type Renderer as PixiRenderer, type Texture } from 'pixi.js';
import type { GameEvent, Vec2, ProjectileKind } from '../../engine/types';
import type { Camera } from '../camera';

/** Hard cap on live particles; oldest is recycled past this. */
const CAP = 400;

/** Trail tint per projectile kind (matches entityView's projectile colours). */
const TRAIL_COLORS: Record<ProjectileKind, number> = {
  arrow: 0x76e34a,
  arcaneBolt: 0x9c5cf0,
  fireball: 0xff8a3d,
  shadowBolt: 0x8a3ff0,
  smite: 0xf2c14e,
};

interface P {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ttl: number;
  s0: number;
  s1: number;
  color: number;
  a0: number;
  gravity: number;
  drag: number;
  sprite: Sprite;
}

interface EmitOpts {
  color: number;
  spd: number;
  ttl: number;
  s0: number;
  s1: number;
  up?: number;
  gravity?: number;
  drag?: number;
  a0?: number;
}

export class Particles {
  readonly container = new Container();
  private readonly pool: P[] = [];
  private readonly tex: Texture;

  constructor(renderer: PixiRenderer) {
    this.tex = makeDotTexture(renderer);
    for (let i = 0; i < CAP; i++) {
      const sprite = new Sprite(this.tex);
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        age: 0,
        ttl: 0,
        s0: 1,
        s1: 1,
        color: 0xffffff,
        a0: 1,
        gravity: 0,
        drag: 0,
        sprite,
      });
    }
  }

  /** Emit particles for a frame's events. Call alongside `Fx.processEvents`. */
  processEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'cast':
          if (e.side === 'boss') {
            this.burst(e.pos, 20, { color: 0xff8a3d, spd: 60, up: 30, ttl: 0.6, s0: 4, s1: 1 });
          } else {
            this.ring(e.pos, 12, { color: 0x8fd3ff, spd: 90, ttl: 0.4, s0: 3, s1: 1 });
          }
          break;
        case 'hit':
          this.burst(e.pos, 8, {
            color: e.side === 'player' ? 0xff5a5a : 0xffe066,
            spd: 120,
            ttl: 0.3,
            s0: 3,
            s1: 0.5,
          });
          break;
        case 'heal':
          this.burst(e.pos, 10, { color: 0x66ff88, spd: 40, up: 60, ttl: 0.7, s0: 3, s1: 1 });
          break;
        case 'revive':
          this.burst(e.pos, 14, { color: 0x66ff88, spd: 50, up: 70, ttl: 0.8, s0: 3, s1: 1 });
          break;
        case 'blink':
          this.burst(e.from, 10, { color: 0x9c5cf0, spd: 70, ttl: 0.4, s0: 3, s1: 1 });
          this.burst(e.to, 10, { color: 0x9c5cf0, spd: 70, ttl: 0.4, s0: 3, s1: 1 });
          break;
        case 'dodge':
          this.burst(e.pos, 8, { color: 0xcfd8e3, spd: 80, ttl: 0.3, s0: 2, s1: 0.5 });
          break;
        case 'downed':
          this.burst(e.pos, 12, { color: 0x9aa0a8, spd: 60, ttl: 0.5, s0: 3, s1: 1, gravity: 50 });
          break;
        case 'enrage':
          this.burst(e.pos, 40, { color: 0xff3b30, spd: 160, ttl: 0.7, s0: 5, s1: 1 });
          break;
        case 'death':
          if (e.kind === 'boss') {
            this.burst(e.pos, 60, {
              color: 0xff3b30,
              spd: 180,
              ttl: 0.9,
              s0: 6,
              s1: 1,
              gravity: 40,
            });
          } else {
            this.burst(e.pos, 18, {
              color: e.kind === 'player' ? 0xdddddd : 0x9aa0a8,
              spd: 90,
              ttl: 0.6,
              s0: 3,
              s1: 1,
              gravity: 60,
            });
          }
          break;
        // 'projectile' one-shot spawn: covered by per-frame `trail()`.
        // 'telegraph': persistent, drawn by Fx.drawTelegraph — no particles.
      }
    }
  }

  /** Live-projectile trail; call each frame per projectile (brief §8). */
  trail(pos: Vec2, kind: ProjectileKind): void {
    this.burst(pos, 1, {
      color: TRAIL_COLORS[kind] ?? 0xffffff,
      spd: 18,
      ttl: 0.25,
      s0: 2,
      s1: 0.4,
    });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.ttl) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(camera: Camera): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.age / p.ttl;
      const scr = camera.worldToScreen({ x: p.x, y: p.y });
      p.sprite.position.set(scr.x, scr.y);
      p.sprite.tint = p.color;
      p.sprite.alpha = p.a0 * (1 - t);
      const sc = (p.s0 + (p.s1 - p.s0) * t) * camera.scale;
      p.sprite.scale.set(sc);
    }
  }

  /** Free the pooled sprites and generated dot texture. */
  destroy(): void {
    this.container.destroy();
    this.tex.destroy(true);
  }

  // --- emit helpers --------------------------------------------------------

  private ring(pos: Vec2, n: number, o: EmitOpts): void {
    for (let i = 0; i < n; i++) this.spawn(pos, (i / n) * Math.PI * 2, o);
  }

  private burst(pos: Vec2, n: number, o: EmitOpts): void {
    for (let i = 0; i < n; i++) this.spawn(pos, Math.random() * Math.PI * 2, o);
  }

  private spawn(pos: Vec2, ang: number, o: EmitOpts): void {
    const p = this.acquire();
    const spd = o.spd * (0.6 + 0.4 * Math.random());
    p.active = true;
    p.age = 0;
    p.ttl = o.ttl;
    p.x = pos.x;
    p.y = pos.y;
    p.vx = Math.cos(ang) * spd;
    p.vy = Math.sin(ang) * spd - (o.up ?? 0);
    p.color = o.color;
    p.a0 = o.a0 ?? 0.9;
    p.s0 = o.s0;
    p.s1 = o.s1;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 1.5;
    p.sprite.visible = true;
  }

  private acquire(): P {
    let oldest = this.pool[0];
    for (const p of this.pool) {
      if (!p.active) return p;
      if (p.age > oldest.age) oldest = p;
    }
    return oldest;
  }
}

/** Soft radial dot → RenderTexture. No image asset. */
function makeDotTexture(renderer: PixiRenderer): Texture {
  const g = new Graphics();
  const R = 16;
  for (let i = R; i > 0; i--) {
    const a = (i / R) ** 2; // soft falloff toward the rim
    g.circle(R, R, i).fill({ color: 0xffffff, alpha: 0.06 * a });
  }
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}
