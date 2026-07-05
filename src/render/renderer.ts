/**
 * Warband — PixiJS v8 renderer.
 *
 * Immediate-mode: one `Graphics` per layer, cleared and fully redrawn from the
 * `RenderState` every frame. Entity counts are tiny, so this is the simplest
 * correct model. The renderer owns the camera, the FX system, and pooled `Text`
 * for entity name/boss labels. It knows nothing about net / input / UI.
 *
 * Bodies can migrate from immediate-mode geometry to retained sprites per actor
 * category (see `SpriteLayer` + `SPRITE_FLAGS`); a category whose flag is off
 * keeps drawing into `entitiesLayer`, one whose flag is on is drawn by
 * `SpriteLayer` with its crisp vector overlay (bars/rings) in `overlayLayer`.
 * Particle VFX augment the geometric `Fx` bursts.
 *
 * Layer z-order (back -> front):
 *   floor -> zones -> telegraph -> entities(geometry) -> sprites -> overlay ->
 *   projectiles -> fx -> particles -> fxText -> labels
 */
import { Application, Assets, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Spritesheet } from 'pixi.js';
import type { RenderState, Vec2 } from '../engine/types';
import { PLAYER_RADIUS, CLASS_COLORS } from '../engine/constants';
import { getMonster } from '../engine/monsters';
import { getClass } from '../engine/classes';
import { Camera } from './camera';
import { Fx } from './fx';
import { Balloons } from './balloons';
import {
  drawPlayer,
  drawBoss,
  drawAdd,
  drawProjectile,
  drawZone,
  drawTerrain,
  drawPlayerOverlay,
  drawBossOverlay,
  drawAddOverlay,
} from './entityView';
import { SpriteLayer } from './sprites/spriteLayer';
import { Particles } from './sprites/particles';
import { SPRITE_FLAGS, SPRITE_ATLAS_URL } from './sprites/manifest';

const GRID_STEP = 100; // world units between grid lines

export class Renderer {
  readonly app: Application;
  readonly camera: Camera;

  private readonly root: Container;

  private readonly floorLayer = new Graphics();
  private readonly terrainLayer = new Graphics();
  private readonly zonesLayer = new Graphics();
  private readonly telegraphLayer = new Graphics();
  private readonly aimLayer = new Graphics();
  private readonly entitiesLayer = new Graphics();
  private readonly overlayLayer = new Graphics();
  private readonly projectilesLayer = new Graphics();
  private readonly fxLayer = new Graphics();
  private readonly fxTextLayer = new Container();
  private readonly labelLayer = new Container();

  private readonly fx: Fx;
  private readonly balloons: Balloons;
  private readonly sprites: SpriteLayer;
  private readonly particles: Particles;
  private readonly labels: Text[] = [];

  private lastRenderMs = 0;

  private constructor(
    app: Application,
    arena: { w: number; h: number },
    sheet: Spritesheet | null,
  ) {
    this.app = app;
    this.camera = new Camera(arena.w, arena.h);

    this.root = new Container();
    app.stage.addChild(this.root);

    this.fx = new Fx(this.fxTextLayer);
    this.balloons = new Balloons();
    this.sprites = new SpriteLayer(sheet, this.fx, app.renderer);
    this.particles = new Particles(app.renderer);

    this.root.addChild(
      this.floorLayer,
      this.terrainLayer, // static per-run hazards, under the action
      this.zonesLayer,
      this.telegraphLayer,
      this.aimLayer, // local player's subtle aim/attack-area preview
      this.entitiesLayer, // geometry bodies (flag-off actors)
      this.sprites.container, // retained sprite bodies (flag-on actors)
      this.overlayLayer, // vector bars/rings for sprite-driven actors
      this.projectilesLayer,
      this.fxLayer,
      this.particles.container,
      this.fxTextLayer,
      this.labelLayer,
      this.balloons.container, // ability speech balloons, above everything
    );

    this.camera.fit(app.screen.width, app.screen.height);
  }

  static async create(
    container: HTMLElement,
    arena: { w: number; h: number },
  ): Promise<Renderer> {
    const app = new Application();
    await app.init({
      background: '#0e0e14',
      antialias: true,
      resizeTo: container,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    container.appendChild(app.canvas);

    // Load the sprite atlas if one is configured; otherwise SpriteLayer renders
    // procedural placeholder silhouettes. Failure is non-fatal (placeholders).
    let sheet: Spritesheet | null = null;
    if (SPRITE_ATLAS_URL) {
      try {
        sheet = await Assets.load<Spritesheet>(SPRITE_ATLAS_URL);
      } catch (err) {
        console.warn('[warband] sprite atlas failed to load; using placeholders', err);
      }
    }

    return new Renderer(app, arena, sheet);
  }

  /** Draw one frame from the given render state. Caller drives the cadence. */
  render(state: RenderState): void {
    const now = performance.now();
    const dtMs = this.lastRenderMs === 0 ? 16 : Math.min(100, now - this.lastRenderMs);
    this.lastRenderMs = now;

    // Keep the camera fit to the current canvas size (cheap for our arena).
    this.camera.fit(this.app.screen.width, this.app.screen.height);
    this.camera.update(dtMs);
    // Bake screen shake into the root container so world<->screen stays camera-only.
    this.root.position.set(this.camera.shakeOffset.x, this.camera.shakeOffset.y);

    // Spawn floaters / bursts / flashes + shake, and feed the same event stream
    // to the sprite attack triggers and the particle emitter, BEFORE drawing.
    this.fx.processEvents(state.events, this.camera);
    this.sprites.ingestEvents(state.events, now);
    this.particles.processEvents(state.events);
    this.balloons.ingest(state.events);

    this.drawFloor(state.arena);
    this.drawTerrain(state, now);
    this.drawZones(state);
    this.drawTelegraph(state);
    this.drawAimPreview(state);
    this.drawEntities(state); // geometry for flag-off actors
    this.sprites.update(state, this.camera, now, dtMs); // sprites for flag-on actors
    this.drawOverlays(state); // vector bars/rings for flag-on actors
    this.drawProjectiles(state); // geometry for flag-off projectiles

    this.fx.update(dtMs);
    this.fx.draw(this.fxLayer, this.camera);
    this.balloons.update(state, this.camera, dtMs);

    // Live-projectile particle trails, then advance + draw the particle pool.
    if (state.projectiles.length > 0) {
      for (const pr of state.projectiles) this.particles.trail(pr.pos, pr.kind);
    }
    this.particles.update(dtMs);
    this.particles.draw(this.camera);

    this.updateLabels(state);
  }

  worldToScreen(v: Vec2): Vec2 {
    return this.camera.worldToScreen(v);
  }

  /** Refit the camera to the current (already-resized) canvas. */
  resize(): void {
    this.camera.fit(this.app.screen.width, this.app.screen.height);
  }

  dispose(): void {
    this.sprites.destroy();
    this.particles.destroy();
    this.balloons.destroy();
    this.app.destroy(true);
  }

  // --- Layer drawing --------------------------------------------------------

  private drawFloor(arena: { w: number; h: number }): void {
    const g = this.floorLayer;
    g.clear();

    const tl = this.camera.worldToScreen({ x: 0, y: 0 });
    const br = this.camera.worldToScreen({ x: arena.w, y: arena.h });
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    // Arena base.
    g.rect(tl.x, tl.y, w, h).fill({ color: 0x14141c });

    // Grid.
    for (let gx = 0; gx <= arena.w; gx += GRID_STEP) {
      const sx = tl.x + gx * this.camera.scale;
      g.moveTo(sx, tl.y).lineTo(sx, br.y);
    }
    for (let gy = 0; gy <= arena.h; gy += GRID_STEP) {
      const sy = tl.y + gy * this.camera.scale;
      g.moveTo(tl.x, sy).lineTo(br.x, sy);
    }
    g.stroke({ width: 1, color: 0x24242f, alpha: 0.7 });

    // Subtle decorative pillars.
    const pr = 26 * this.camera.scale;
    for (const p of PILLARS) {
      const s = this.camera.worldToScreen({ x: p.x * arena.w, y: p.y * arena.h });
      g.circle(s.x, s.y, pr).fill({ color: 0x1b1b26 });
      g.circle(s.x, s.y, pr).stroke({ width: 2, color: 0x2c2c3a, alpha: 0.9 });
    }

    // Border.
    g.rect(tl.x, tl.y, w, h).stroke({ width: 2, color: 0x3a3a4e, alpha: 0.95 });
  }

  private drawTerrain(state: RenderState, nowMs: number): void {
    const g = this.terrainLayer;
    g.clear();
    if (state.terrain.length === 0) return;
    const timeSec = nowMs / 1000;
    for (const t of state.terrain) {
      drawTerrain(g, t, this.camera.worldToScreen(t.pos), this.camera.scale, timeSec);
    }
  }

  private drawZones(state: RenderState): void {
    const g = this.zonesLayer;
    g.clear();
    for (const z of state.groundZones) {
      drawZone(g, z, this.camera.worldToScreen(z.pos), this.camera.scale);
    }
  }

  /**
   * Subtle, local-only preview of the local player's basic attack area: a faint
   * cone for melee cleaves, a short reticle line for ranged shots. Helps the
   * player read where their attack lands without cluttering the shared field.
   */
  private drawAimPreview(state: RenderState): void {
    const g = this.aimLayer;
    g.clear();
    const localId = state.localPlayerId;
    if (localId == null) return;
    const p = state.players.find((pl) => pl.id === localId);
    if (!p || p.state !== 'alive') return;

    const ab = getClass(p.classId).abilities.basic;
    const s = this.camera.scale;
    const scr = this.camera.worldToScreen(p.pos);
    const ang = Math.atan2(p.aim.y, p.aim.x);
    const color = CLASS_COLORS[p.classId] ?? 0xffffff;

    if (ab.kind === 'meleeCone') {
      const R = (ab.range ?? 70) * s;
      const half = ((ab.halfAngleDeg ?? 45) * Math.PI) / 180;
      g.moveTo(scr.x, scr.y)
        .arc(scr.x, scr.y, R, ang - half, ang + half)
        .lineTo(scr.x, scr.y)
        .stroke({ width: 1.5, color, alpha: 0.28 });
    } else if (ab.kind === 'projectile') {
      const R = 130 * s;
      const startR = PLAYER_RADIUS * s * 1.6;
      const sx = scr.x + Math.cos(ang) * startR;
      const sy = scr.y + Math.sin(ang) * startR;
      const ex = scr.x + Math.cos(ang) * R;
      const ey = scr.y + Math.sin(ang) * R;
      g.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 1.5, color, alpha: 0.22 });
      g.circle(ex, ey, 3).fill({ color, alpha: 0.3 });
    }
  }

  private drawTelegraph(state: RenderState): void {
    const g = this.telegraphLayer;
    g.clear();
    if (state.boss?.telegraph) {
      this.fx.drawTelegraph(g, state.boss.telegraph, this.camera);
    }
  }

  private drawEntities(state: RenderState): void {
    const g = this.entitiesLayer;
    g.clear();
    const scale = this.camera.scale;

    if (!SPRITE_FLAGS.add) {
      for (const a of state.adds) {
        drawAdd(g, a, this.camera.worldToScreen(a.pos), scale, this.fx.flashAmount(a.id));
      }
    }
    // Boss below players so downed/standing players stay readable on top of it.
    if (!SPRITE_FLAGS.boss && state.boss) {
      drawBoss(g, state.boss, this.camera.worldToScreen(state.boss.pos), scale, this.fx.flashAmount(state.boss.id));
    }
    if (!SPRITE_FLAGS.player) {
      for (const p of state.players) {
        drawPlayer(
          g,
          p,
          this.camera.worldToScreen(p.pos),
          scale,
          p.id === state.localPlayerId,
          this.fx.flashAmount(p.id),
        );
      }
    }
  }

  /** Crisp vector overlays (HP bars, rings, facing) for sprite-driven actors. */
  private drawOverlays(state: RenderState): void {
    const g = this.overlayLayer;
    g.clear();
    const scale = this.camera.scale;

    if (SPRITE_FLAGS.add) {
      for (const a of state.adds) {
        drawAddOverlay(g, a, this.camera.worldToScreen(a.pos), scale);
      }
    }
    if (SPRITE_FLAGS.boss && state.boss) {
      drawBossOverlay(g, state.boss, this.camera.worldToScreen(state.boss.pos), scale);
    }
    if (SPRITE_FLAGS.player) {
      for (const p of state.players) {
        drawPlayerOverlay(
          g,
          p,
          this.camera.worldToScreen(p.pos),
          scale,
          p.id === state.localPlayerId,
        );
      }
    }
  }

  private drawProjectiles(state: RenderState): void {
    const g = this.projectilesLayer;
    g.clear();
    if (SPRITE_FLAGS.projectile) return; // SpriteLayer draws projectiles
    for (const pr of state.projectiles) {
      drawProjectile(g, pr, this.camera.worldToScreen(pr.pos), this.camera.scale);
    }
  }

  // --- Labels (pooled Text) -------------------------------------------------

  private ensureLabels(n: number): void {
    while (this.labels.length < n) {
      const t = new Text({
        text: '',
        style: new TextStyle({
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          fill: 0xffffff,
          align: 'center',
          stroke: { color: 0x000000, width: 3 },
        }),
      });
      t.anchor.set(0.5, 1);
      t.visible = false;
      this.labelLayer.addChild(t);
      this.labels.push(t);
    }
  }

  private updateLabels(state: RenderState): void {
    this.ensureLabels(state.players.length + (state.boss ? 1 : 0));
    const scale = this.camera.scale;
    let i = 0;

    for (const p of state.players) {
      const t = this.labels[i++];
      t.visible = true;
      t.text = p.name;
      const s = this.camera.worldToScreen(p.pos);
      t.position.set(s.x, s.y - PLAYER_RADIUS * scale - 12);
      t.alpha = p.state === 'dead' ? 0.4 : 1;
    }

    if (state.boss) {
      const def = getMonster(state.boss.monsterId);
      const t = this.labels[i++];
      t.visible = true;
      t.text = def.name;
      const s = this.camera.worldToScreen(state.boss.pos);
      t.position.set(s.x, s.y - def.radius * scale - 10);
      t.alpha = 1;
    }

    for (; i < this.labels.length; i++) this.labels[i].visible = false;
  }
}

/** Fractional (0..1) arena positions for decorative floor pillars. */
const PILLARS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0.25, y: 0.28 },
  { x: 0.75, y: 0.28 },
  { x: 0.25, y: 0.72 },
  { x: 0.75, y: 0.72 },
];
