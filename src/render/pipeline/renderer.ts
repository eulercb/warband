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
import type { RenderState, TerrainKind, Vec2 } from '../../engine/core/types';
import { PLAYER_RADIUS, CLASS_COLORS, ARENA_W, ARENA_H } from '../../engine/core/constants';
import { nearestCopy, wrapPos } from '../../engine/core/torus';
import { getMonster } from '../../engine/content/monsters';
import { getClass } from '../../engine/content/classes';
import { themeFor } from '../../engine/world/terrain';
import { Rng } from '../../engine/core/math';
import { Camera } from './camera';
import { Fx } from '../overlays/fx';
import { Balloons } from '../overlays/balloons';
import {
  drawPlayer,
  drawBoss,
  drawAdd,
  drawProjectile,
  drawZone,
  drawTerrain,
  drawObstacle,
  drawTotem,
  drawLoot,
  drawVortex,
  drawStation,
  drawPlayerOverlay,
  drawBossOverlay,
  drawAddOverlay,
} from './entityView';
import { SpriteLayer } from '../sprites/spriteLayer';
import { Particles } from '../sprites/particles';
import { SPRITE_FLAGS, SPRITE_ATLAS_URL } from '../sprites/manifest';
import { RigLayer } from '../rig/rigLayer';
import { bossUsesRig, playerUsesRig, addUsesRig } from '../rig/registry';
import { buffLabel } from '../overlays/buffGlyphs';

const GRID_STEP = 100; // world units between grid lines

export class Renderer {
  readonly app: Application;
  readonly camera: Camera;

  private readonly root: Container;

  private readonly floorLayer = new Graphics();
  private readonly terrainLayer = new Graphics();
  private readonly obstaclesLayer = new Graphics();
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
  private readonly rigs: RigLayer;
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
    this.rigs = new RigLayer(this.fx);
    this.particles = new Particles(app.renderer);

    this.root.addChild(
      this.floorLayer,
      this.terrainLayer, // static per-run hazards, under the action
      this.obstaclesLayer, // solid cover, above terrain
      this.zonesLayer,
      this.telegraphLayer,
      this.aimLayer, // local player's subtle aim/attack-area preview
      this.entitiesLayer, // geometry bodies (flag-off actors)
      this.sprites.container, // retained sprite bodies (flag-on actors)
      this.rigs.container, // retained articulated rig bodies (rig-opted actors)
      this.overlayLayer, // vector bars/rings for sprite- and rig-driven actors
      this.projectilesLayer,
      this.fxLayer,
      this.particles.container,
      this.fxTextLayer,
      this.labelLayer,
      this.balloons.container, // ability speech balloons, above everything
    );

    this.camera.fit(app.screen.width, app.screen.height);
  }

  static async create(container: HTMLElement, arena: { w: number; h: number }): Promise<Renderer> {
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

    // Keep the camera fit to the current canvas size, then follow the centre of
    // the action (party + boss) across the wrap-around arena, zooming out when
    // they spread apart so nobody drops off the edge into "nowhere".
    this.camera.fit(this.app.screen.width, this.app.screen.height);
    const frame = frameOf(state);
    this.camera.follow(frame.center, dtMs);
    this.camera.frameGroup(frame.halfSpan);
    this.camera.update(dtMs);
    // Bake screen shake into the root container so world<->screen stays camera-only.
    this.root.position.set(this.camera.shakeOffset.x, this.camera.shakeOffset.y);

    // Spawn floaters / bursts / flashes + shake, and feed the same event stream
    // to the sprite attack triggers and the particle emitter, BEFORE drawing.
    this.fx.processEvents(state.events, this.camera);
    this.sprites.ingestEvents(state.events, now);
    this.rigs.ingestEvents(state.events);
    this.particles.processEvents(state.events);
    this.balloons.ingest(state.events);

    this.drawFloor(state, now);
    this.drawTerrain(state, now);
    this.drawObstacles(state, now);
    this.drawZones(state);
    this.drawTelegraph(state);
    this.drawAimPreview(state);
    this.drawEntities(state, now); // geometry for flag-off, non-rig actors
    this.sprites.update(state, this.camera, now, dtMs); // sprites for flag-on actors
    this.rigs.update(state, this.camera, now, dtMs); // articulated rigs for rig-opted actors
    this.drawOverlays(state, now); // vector bars/rings for sprite- and rig-driven actors
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
    this.rigs.destroy();
    this.particles.destroy();
    this.balloons.destroy();
    this.app.destroy(true);
  }

  // --- Layer drawing --------------------------------------------------------

  private drawFloor(state: RenderState, nowMs: number): void {
    const g = this.floorLayer;
    const cam = this.camera;
    const arena = state.arena;
    g.clear();

    this.ensureGroundDecor(state);

    const { x: vw, y: vh } = cam.viewSize;
    // The torus has no walls: fill the whole viewport, then draw an endlessly
    // scrolling grid so the ground visibly rolls over as the party marches.
    g.rect(0, 0, vw, vh).fill({ color: this.groundBase });

    const halfW = vw / 2 / cam.scale;
    const halfH = vh / 2 / cam.scale;
    const left = cam.center.x - halfW;
    const right = cam.center.x + halfW;
    const top = cam.center.y - halfH;
    const bottom = cam.center.y + halfH;
    for (let gx = Math.floor(left / GRID_STEP) * GRID_STEP; gx <= right; gx += GRID_STEP) {
      const sx = cam.toScreen({ x: gx, y: 0 }).x;
      g.moveTo(sx, 0).lineTo(sx, vh);
    }
    for (let gy = Math.floor(top / GRID_STEP) * GRID_STEP; gy <= bottom; gy += GRID_STEP) {
      const sy = cam.toScreen({ x: 0, y: gy }).y;
      g.moveTo(0, sy).lineTo(vw, sy);
    }
    g.stroke({ width: 1, color: 0x24242f, alpha: 0.7 });

    // Seeded, boss-themed ground decor: mosaic slabs, specks and faint runes,
    // tiled so they recur as the arena wraps. Pure flavour — regenerated when
    // the fight seed changes, so every arena floor is different.
    const timeSec = nowMs / 1000;
    for (const d of this.groundDecor) {
      this.drawTiled({ x: d.x, y: d.y }, d.r, (s) => {
        const r = d.r * cam.scale;
        if (d.type === 'slab') {
          decorPoly(g, s.x, s.y, r, d.sides, d.rot, d.color, d.alpha);
        } else if (d.type === 'speck') {
          g.circle(s.x, s.y, Math.max(1, r * 0.25)).fill({ color: d.color, alpha: d.alpha });
        } else {
          // rune — a faint diamond that breathes very slowly.
          const a = d.alpha * (0.7 + 0.3 * Math.sin(timeSec * 0.7 + d.rot * 7));
          g.moveTo(s.x, s.y - r)
            .lineTo(s.x + r * 0.6, s.y)
            .lineTo(s.x, s.y + r)
            .lineTo(s.x - r * 0.6, s.y)
            .closePath()
            .stroke({ width: 1.2, color: d.color, alpha: a });
        }
      });
    }

    // Decorative pillars, tiled so they recur as the arena wraps.
    const pr = 26 * cam.scale;
    for (const p of PILLARS) {
      this.drawTiled({ x: p.x * arena.w, y: p.y * arena.h }, 26, (s) => {
        g.circle(s.x, s.y, pr).fill({ color: 0x1b1b26 });
        g.circle(s.x, s.y, pr).stroke({ width: 2, color: 0x2c2c3a, alpha: 0.9 });
      });
    }
  }

  // --- Procedural ground decor (seeded per fight) ---------------------------

  private groundKey = '';
  private groundBase = 0x14141c;
  private groundDecor: GroundDecor[] = [];

  /**
   * (Re)build the seeded floor decoration when the fight changes. The palette
   * follows the lead boss's terrain theme (magma arenas glow warm, crypts run
   * cold) and the layout comes from the run seed, so every arena floor tiles
   * differently — procedural tiles without a single asset.
   */
  private ensureGroundDecor(state: RenderState): void {
    const lead = state.bosses[0]?.monsterId ?? 'dummy';
    const key = `${state.seed}:${lead}`;
    if (key === this.groundKey) return;
    this.groundKey = key;

    const theme = themeFor([lead])[0] ?? 'ember';
    const pal = GROUND_PALETTES[theme] ?? GROUND_PALETTES.ember;
    this.groundBase = pal.base;

    const rng = new Rng((state.seed ^ 0xc0ffee) >>> 0 || 1);
    const out: GroundDecor[] = [];
    const slabs = rng.int(14, 22);
    for (let i = 0; i < slabs; i++) {
      out.push({
        type: 'slab',
        x: rng.range(0, ARENA_W),
        y: rng.range(0, ARENA_H),
        r: rng.range(18, 52),
        sides: rng.int(4, 7),
        rot: rng.range(0, Math.PI * 2),
        color: rng.next() < 0.5 ? pal.slabA : pal.slabB,
        alpha: rng.range(0.25, 0.5),
      });
    }
    const specks = rng.int(20, 32);
    for (let i = 0; i < specks; i++) {
      out.push({
        type: 'speck',
        x: rng.range(0, ARENA_W),
        y: rng.range(0, ARENA_H),
        r: rng.range(4, 12),
        sides: 0,
        rot: 0,
        color: pal.speck,
        alpha: rng.range(0.2, 0.45),
      });
    }
    const runes = rng.int(3, 6);
    for (let i = 0; i < runes; i++) {
      out.push({
        type: 'rune',
        x: rng.range(0, ARENA_W),
        y: rng.range(0, ARENA_H),
        r: rng.range(14, 26),
        sides: 0,
        rot: rng.range(0, Math.PI * 2),
        color: pal.rune,
        alpha: rng.range(0.1, 0.2),
      });
    }
    this.groundDecor = out;
  }

  /**
   * Invoke `cb(screen)` for each on-screen torus copy of a static world position
   * (the current tile plus its ±ARENA neighbours), so tiled ground features
   * repeat seamlessly across the wrapping view. Off-screen copies are culled.
   */
  private drawTiled(pos: Vec2, worldRadius: number, cb: (screen: Vec2) => void): void {
    const rScr = worldRadius * this.camera.scale + 4;
    const { x: vw, y: vh } = this.camera.viewSize;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const s = this.camera.toScreen({ x: pos.x + i * ARENA_W, y: pos.y + j * ARENA_H });
        if (s.x < -rScr || s.y < -rScr || s.x > vw + rScr || s.y > vh + rScr) continue;
        cb(s);
      }
    }
  }

  private drawTerrain(state: RenderState, nowMs: number): void {
    const g = this.terrainLayer;
    g.clear();
    if (state.terrain.length === 0) return;
    const timeSec = nowMs / 1000;
    for (const t of state.terrain) {
      this.drawTiled(t.pos, t.radius, (s) => drawTerrain(g, t, s, this.camera.scale, timeSec));
    }
  }

  private drawObstacles(state: RenderState, nowMs: number): void {
    const g = this.obstaclesLayer;
    g.clear();
    const totems = state.totems ?? [];
    const loot = state.loot ?? [];
    const vortex = state.vortex ?? null;
    const stations = state.stations ?? [];
    if (
      state.obstacles.length === 0 &&
      totems.length === 0 &&
      loot.length === 0 &&
      vortex === null &&
      stations.length === 0
    ) {
      return;
    }
    for (const o of state.obstacles) {
      this.drawTiled(o.pos, o.radius, (s) => drawObstacle(g, o, s, this.camera.scale));
    }
    const timeSec = nowMs / 1000;
    for (const t of totems) {
      this.drawTiled(t.pos, t.triggerRadius, (s) => drawTotem(g, t, s, this.camera.scale, timeSec));
    }
    // Reward-room furniture (local scene worlds only): the descent vortex under
    // the relics, then each relic pickup on top.
    if (vortex) {
      this.drawTiled(vortex.pos, vortex.activeRadius, (s) =>
        drawVortex(g, vortex, s, this.camera.scale, timeSec),
      );
    }
    for (const l of loot) {
      this.drawTiled(l.pos, l.pickupRadius, (s) => drawLoot(g, l, s, this.camera.scale, timeSec));
    }
    for (const st of stations) {
      this.drawTiled(st.pos, st.triggerRadius, (s) =>
        drawStation(g, st, s, this.camera.scale, timeSec),
      );
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
   * Subtle, local-only preview of the local player's MELEE basic attack area: a
   * faint cone showing where a cleave lands. Ranged classes get no preview — the
   * old "reticle line" from the hero to the pointer read as a rendering bug (and
   * followed you around the menu playground), so it was removed.
   */
  private drawAimPreview(state: RenderState): void {
    const g = this.aimLayer;
    g.clear();
    const localId = state.localPlayerId;
    if (localId == null) return;
    const p = state.players.find((pl) => pl.id === localId);
    if (!p || p.state !== 'alive') return;

    const ab = getClass(p.classId).abilities.basic;
    if (ab.kind !== 'meleeCone') return;
    const s = this.camera.scale;
    const scr = this.camera.worldToScreen(p.pos);
    const ang = Math.atan2(p.aim.y, p.aim.x);
    const color = CLASS_COLORS[p.classId] ?? 0xffffff;

    const R = (ab.range ?? 70) * s;
    const half = ((ab.halfAngleDeg ?? 45) * Math.PI) / 180;
    g.moveTo(scr.x, scr.y)
      .arc(scr.x, scr.y, R, ang - half, ang + half)
      .lineTo(scr.x, scr.y)
      .stroke({ width: 1.5, color, alpha: 0.28 });
  }

  private drawTelegraph(state: RenderState): void {
    const g = this.telegraphLayer;
    g.clear();
    for (const boss of state.bosses) {
      if (boss.telegraph) this.fx.drawTelegraph(g, boss.telegraph, this.camera);
    }
    // World-level corruption telegraphs (rain / vents / collapsing ring) that
    // aren't owned by any boss action — drawn with the same countdown fill.
    if (state.telegraphs) {
      for (const tg of state.telegraphs) this.fx.drawTelegraph(g, tg, this.camera);
    }
  }

  private drawEntities(state: RenderState, nowMs: number): void {
    const g = this.entitiesLayer;
    g.clear();
    const scale = this.camera.scale;
    const timeSec = nowMs / 1000;

    if (!SPRITE_FLAGS.add) {
      for (const a of state.adds) {
        if (addUsesRig(a)) continue;
        drawAdd(g, a, this.camera.worldToScreen(a.pos), scale, this.fx.flashAmount(a.id), timeSec);
      }
    }
    // Bosses below players so downed/standing players stay readable on top.
    if (!SPRITE_FLAGS.boss) {
      for (const boss of state.bosses) {
        if (bossUsesRig(boss)) continue;
        drawBoss(
          g,
          boss,
          this.camera.worldToScreen(boss.pos),
          scale,
          this.fx.flashAmount(boss.id),
          timeSec,
        );
      }
    }
    if (!SPRITE_FLAGS.player) {
      for (const p of state.players) {
        if (playerUsesRig(p)) continue; // rig draws the body (dead → geometry ghost here)
        drawPlayer(
          g,
          p,
          this.camera.worldToScreen(p.pos),
          scale,
          p.id === state.localPlayerId,
          this.fx.flashAmount(p.id),
          timeSec,
        );
      }
    }
  }

  /** Crisp vector overlays (HP bars, rings, facing) for sprite-driven actors. */
  private drawOverlays(state: RenderState, nowMs: number): void {
    const g = this.overlayLayer;
    g.clear();
    const scale = this.camera.scale;
    const timeSec = nowMs / 1000;

    for (const a of state.adds) {
      if (SPRITE_FLAGS.add || addUsesRig(a)) {
        drawAddOverlay(g, a, this.camera.worldToScreen(a.pos), scale, timeSec);
      }
    }
    for (const boss of state.bosses) {
      if (SPRITE_FLAGS.boss || bossUsesRig(boss)) {
        drawBossOverlay(g, boss, this.camera.worldToScreen(boss.pos), scale, timeSec);
      }
    }
    for (const p of state.players) {
      if (SPRITE_FLAGS.player || playerUsesRig(p)) {
        drawPlayerOverlay(
          g,
          p,
          this.camera.worldToScreen(p.pos),
          scale,
          p.id === state.localPlayerId,
          timeSec,
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
    const totems = state.totems ?? [];
    const loot = state.loot ?? [];
    const vortex = state.vortex ?? null;
    const stations = state.stations ?? [];
    this.ensureLabels(
      state.players.length +
        state.bosses.length +
        totems.length +
        loot.length +
        (vortex ? 1 : 0) +
        stations.length,
    );
    const scale = this.camera.scale;
    let i = 0;

    for (const p of state.players) {
      const t = this.labels[i++];
      t.visible = true;
      // Name, with a compact buff/debuff readout (glyph + seconds) beneath it.
      const badges = p.state === 'alive' ? buffLabel(p.buffs) : '';
      t.text = badges ? `${p.name}\n${badges}` : p.name;
      const s = this.camera.worldToScreen(p.pos);
      t.position.set(s.x, s.y - PLAYER_RADIUS * scale - 12);
      t.alpha = p.state === 'dead' ? 0.4 : 1;
    }

    for (const boss of state.bosses) {
      const def = getMonster(boss.monsterId);
      const t = this.labels[i++];
      t.visible = true;
      const name = boss.modName ? `${boss.modName} ${def.name}` : def.name;
      const badges = buffLabel(boss.buffs);
      t.text = badges ? `${name}\n${badges}` : name;
      const s = this.camera.worldToScreen(boss.pos);
      t.position.set(s.x, s.y - def.radius * scale - 10);
      t.alpha = boss.hp > 0 ? 1 : 0.4; // a felled twin's corpse label fades
    }

    for (const tot of totems) {
      const t = this.labels[i++];
      t.visible = true;
      t.text = TOTEM_LABELS[tot.kind];
      const s = this.camera.worldToScreen(tot.pos);
      t.position.set(s.x, s.y - tot.radius * scale - 26);
      t.alpha = tot.active ? 1 : 0.75;
    }

    // Reward-room relic captions (icon + name), dim once claimed/locked.
    for (const l of loot) {
      const t = this.labels[i++];
      t.visible = true;
      t.text = l.claimed ? `${l.label ?? ''} ✓` : (l.label ?? '');
      const s = this.camera.worldToScreen(l.pos);
      t.position.set(s.x, s.y - l.radius * scale - 24);
      t.alpha = l.claimed ? 0.85 : l.locked ? 0.3 : l.active ? 1 : 0.7;
    }

    // Reward-room vortex caption.
    if (vortex) {
      const t = this.labels[i++];
      t.visible = true;
      t.text = vortex.open ? '🌀 DESCEND' : '🌀 CLAIM YOUR BOONS';
      const s = this.camera.worldToScreen(vortex.pos);
      t.position.set(s.x, s.y - vortex.radius * scale - 30);
      t.alpha = vortex.open ? 1 : 0.6;
    }

    // Menu station captions (class effigy names, etc.). The selected one shows a
    // check so the current pick reads at a glance.
    for (const st of stations) {
      const t = this.labels[i++];
      t.visible = true;
      t.text = st.selected ? `${st.label ?? ''} ✓` : (st.label ?? '');
      const s = this.camera.worldToScreen(st.pos);
      t.position.set(s.x, s.y - st.radius * scale - 22);
      t.alpha = st.selected ? 1 : st.active ? 1 : 0.7;
    }

    for (; i < this.labels.length; i++) this.labels[i].visible = false;
  }
}

/** Floating captions over the playground totems. */
const TOTEM_LABELS: Record<string, string> = {
  host: '⚔ HOST A GAME',
  join: '🌀 JOIN A GAME',
  class: '🛡 CHANGE HERO',
  controls: '🎮 CONTROLS',
};

/** Fractional (0..1) arena positions for decorative floor pillars. */
const PILLARS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0.25, y: 0.28 },
  { x: 0.75, y: 0.28 },
  { x: 0.25, y: 0.72 },
  { x: 0.75, y: 0.72 },
];

/** One piece of seeded floor decoration (world-space, static per fight). */
interface GroundDecor {
  type: 'slab' | 'speck' | 'rune';
  x: number;
  y: number;
  r: number;
  sides: number;
  rot: number;
  color: number;
  alpha: number;
}

/** Floor palettes keyed by the lead boss's terrain theme. */
const GROUND_PALETTES: Record<
  TerrainKind,
  {
    base: number;
    slabA: number;
    slabB: number;
    speck: number;
    rune: number;
  }
> = {
  magma: { base: 0x171216, slabA: 0x221619, slabB: 0x1d1417, speck: 0x2e1c1a, rune: 0xff8a3d },
  ember: { base: 0x16130f, slabA: 0x201a13, slabB: 0x1b1610, speck: 0x2a2117, rune: 0xd9a05b },
  swamp: { base: 0x111a15, slabA: 0x18241c, slabB: 0x141f18, speck: 0x203026, rune: 0x5bbf7a },
  bog: { base: 0x121812, slabA: 0x1a231a, slabB: 0x151e15, speck: 0x232f22, rune: 0x8fd14a },
  ice: { base: 0x121722, slabA: 0x18202e, slabB: 0x141b28, speck: 0x1f2a3c, rune: 0x7fd4ff },
  deathfog: { base: 0x161220, slabA: 0x1e182c, slabB: 0x191426, speck: 0x281f38, rune: 0x9b6cff },
};

/** Fill a small rotated regular-ish polygon (mosaic slab). */
function decorPoly(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  sides: number,
  rot: number,
  color: number,
  alpha: number,
): void {
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath().fill({ color, alpha });
}

/**
 * The world point the camera should follow and how far the framed group spreads.
 * The centre is the torus-average of the living party AND the boss (so the enemy
 * stays in frame, not just the host), computed with nearest-copy so it doesn't
 * jump across the wrap seam. `halfSpan` is the farthest framed point from that
 * centre, which drives the dynamic zoom-out.
 */
function frameOf(state: RenderState): { center: Vec2; halfSpan: number } {
  const alive = state.players.filter((p) => p.state !== 'dead');
  const pts: Vec2[] = (alive.length > 0 ? alive : state.players).map((p) => p.pos);
  for (const boss of state.bosses) if (boss.hp > 0) pts.push(boss.pos);
  // Reward room: with no boss to widen the shot, frame the relics + vortex too so
  // the whole chamber reads as a diorama instead of a keyhole around the hero.
  if (state.loot) for (const l of state.loot) pts.push(l.pos);
  if (state.vortex) pts.push(state.vortex.pos);
  // Menu camp: keep the diegetic stations (class effigies…) in frame too.
  if (state.stations) for (const st of state.stations) pts.push(st.pos);
  if (pts.length === 0) return { center: { x: ARENA_W / 2, y: ARENA_H / 2 }, halfSpan: 0 };

  const base = pts[0];
  let sx = 0;
  let sy = 0;
  const copies = pts.map((p) => {
    const c = nearestCopy(p, base);
    sx += c.x;
    sy += c.y;
    return c;
  });
  const avg = { x: sx / copies.length, y: sy / copies.length };
  let halfSpan = 0;
  for (const c of copies) {
    const d = Math.hypot(c.x - avg.x, c.y - avg.y);
    if (d > halfSpan) halfSpan = d;
  }
  return { center: wrapPos(avg), halfSpan };
}
