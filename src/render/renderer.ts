/**
 * Warband — PixiJS v8 renderer.
 *
 * Immediate-mode: one `Graphics` per layer, cleared and fully redrawn from the
 * `RenderState` every frame. Entity counts are tiny, so this is the simplest
 * correct model. The renderer owns the camera, the FX system, and pooled `Text`
 * for entity name/boss labels. It knows nothing about net / input / UI.
 *
 * Layer z-order (back -> front):
 *   floor -> zones -> telegraph -> entities -> projectiles -> fx -> fxText -> labels
 */
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { RenderState, Vec2 } from '../engine/types';
import { PLAYER_RADIUS } from '../engine/constants';
import { getMonster } from '../engine/monsters';
import { Camera } from './camera';
import { Fx } from './fx';
import { drawPlayer, drawBoss, drawAdd, drawProjectile, drawZone } from './entityView';

const GRID_STEP = 100; // world units between grid lines

export class Renderer {
  readonly app: Application;
  readonly camera: Camera;

  private readonly root: Container;

  private readonly floorLayer = new Graphics();
  private readonly zonesLayer = new Graphics();
  private readonly telegraphLayer = new Graphics();
  private readonly entitiesLayer = new Graphics();
  private readonly projectilesLayer = new Graphics();
  private readonly fxLayer = new Graphics();
  private readonly fxTextLayer = new Container();
  private readonly labelLayer = new Container();

  private readonly fx: Fx;
  private readonly labels: Text[] = [];

  private lastRenderMs = 0;

  private constructor(app: Application, arena: { w: number; h: number }) {
    this.app = app;
    this.camera = new Camera(arena.w, arena.h);

    this.root = new Container();
    app.stage.addChild(this.root);
    this.root.addChild(
      this.floorLayer,
      this.zonesLayer,
      this.telegraphLayer,
      this.entitiesLayer,
      this.projectilesLayer,
      this.fxLayer,
      this.fxTextLayer,
      this.labelLayer,
    );

    this.fx = new Fx(this.fxTextLayer);
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
    return new Renderer(app, arena);
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

    // Spawn floaters / bursts / flashes + shake BEFORE drawing this frame.
    this.fx.processEvents(state.events, this.camera);

    this.drawFloor(state.arena);
    this.drawZones(state);
    this.drawTelegraph(state);
    this.drawEntities(state);
    this.drawProjectiles(state);

    this.fx.update(dtMs);
    this.fx.draw(this.fxLayer, this.camera);

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

  private drawZones(state: RenderState): void {
    const g = this.zonesLayer;
    g.clear();
    for (const z of state.groundZones) {
      drawZone(g, z, this.camera.worldToScreen(z.pos), this.camera.scale);
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

    for (const a of state.adds) {
      drawAdd(g, a, this.camera.worldToScreen(a.pos), scale, this.fx.flashAmount(a.id));
    }
    // Boss below players so downed/standing players stay readable on top of it.
    if (state.boss) {
      drawBoss(g, state.boss, this.camera.worldToScreen(state.boss.pos), scale, this.fx.flashAmount(state.boss.id));
    }
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

  private drawProjectiles(state: RenderState): void {
    const g = this.projectilesLayer;
    g.clear();
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
