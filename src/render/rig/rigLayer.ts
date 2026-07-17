/**
 * Warband — retained rig layer.
 *
 * The third body-rendering path (alongside immediate geometry and the sprite
 * layer). Owns a `Container` of `CreatureRig`s keyed by `EntityId` and reconciles
 * it against `RenderState` each frame — create on appear, drive on persist, remove
 * on vanish — exactly like `SpriteLayer`. z-index reuses the same category bias +
 * screen-y so rigs interleave correctly with sprites, geometry and projectiles.
 * The rig replaces only the BODY; bars / rings / glows stay in the overlay pass.
 */
import { Container, Texture } from 'pixi.js';
import type {
  RenderState,
  EntityId,
  GameEvent,
  PlayerView,
  Telegraph,
} from '../../engine/core/types';
import type { Camera } from '../pipeline/camera';
import type { Fx } from '../overlays/fx';
import { PLAYER_RADIUS, CLASS_COLORS } from '../../engine/core/constants';
import { getMonster } from '../../engine/content/monsters';
import { CreatureRig } from './rig';
import { makeSphereTexture } from './shading';
import type { RigSpec } from './types';
import { bossUsesRig, playerUsesRig, bossRigSpec, classRigSpec } from './registry';
import { LIGHTING } from '../lighting/presets';
import type { LightManager, Light } from '../lighting/light';

/** z-index category biases (matches `SpriteLayer`); screen-y is added on top. */
const Z_BIAS = { add: 0, boss: 20000, player: 40000 } as const;

interface Node {
  rig: CreatureRig;
  spec: RigSpec;
  baseRadius: number;
}

export class RigLayer {
  readonly container = new Container();
  private readonly nodes = new Map<EntityId, Node>();
  private readonly seen = new Set<EntityId>();
  private readonly sphereTex: Texture;

  /** Whether dynamic lighting is live (a manager was supplied + the flag is on). */
  private readonly lit: boolean;
  /** Persistent per-boss "core" glow lights (§7.2), keyed by boss id. */
  private readonly bossGlows = new Map<EntityId, Light>();

  constructor(
    private readonly fx: Fx,
    private readonly lights: LightManager | null = null,
  ) {
    this.container.sortableChildren = true;
    this.sphereTex = makeSphereTexture();
    this.lit = lights != null && LIGHTING.enabled;
  }

  /** ms timestamp the current victory celebration started at, or null. */
  private victoryAtMs: number | null = null;
  private lastBrandishMs = 0;

  /** Trigger a weapon/attack swing on the caster's rig for each cast event;
   * a `victory` event starts the whole band's procedural victory dance. */
  ingestEvents(events: GameEvent[]): void {
    for (const e of events) {
      if (e.t === 'victory') {
        this.victoryAtMs = performance.now();
        this.lastBrandishMs = 0;
      }
      // Hit-flash light (§7.1): a brief bright pop at each impact. The single
      // largest perceived-quality jump — every hit briefly lights its surroundings.
      // item 77: dropped from intensity 3 to 1.6 — in a 4-member fight hits land
      // near-continuously, and at 3 they compounded (with the core glow + flash
      // tint) past what the shader's soft-clip can hold, flattening bodies to white
      // discs. 1.6 still reads as a clear pop without erasing the silhouette.
      if (e.t === 'hit' && this.lit) {
        this.lights!.add({
          x: e.pos.x,
          y: e.pos.y,
          z: 30,
          radius: 110,
          r: 1,
          g: 1,
          b: 1,
          intensity: 1.6,
          ttl: 0.06,
        });
      }
      if (e.t !== 'cast') continue;
      this.nodes.get(e.sourceId)?.rig.triggerAttack();
    }
  }

  /** Reconcile + drive one frame. Call after `ingestEvents`, before the overlay pass. */
  update(state: RenderState, camera: Camera, nowMs: number, dtMs: number): void {
    this.seen.clear();
    const scale = camera.scale;
    const timeSec = nowMs / 1000;

    // Bosses (twin encounters drive one rig per boss). A felled twin stays in
    // the arena as a collapsed corpse (the 'downed' pose) while its partner
    // fights on.
    for (const b of state.bosses) {
      if (!bossUsesRig(b)) continue;
      const spec = bossRigSpec(b.monsterId);
      if (!spec) continue;
      const def = getMonster(b.monsterId);
      const node = this.ensure(b.id, spec, def.radius);
      const scr = camera.worldToScreen(b.pos);
      const dead = b.hp <= 0;
      // item 7 — a FLYING boss (constant flyer OR a live flight buff) lifts off the
      // ground so its airborne state reads at a glance; z-order keeps the ground pos.
      const flying =
        !dead && (def.flying === true || (b.buffs?.some((bf) => bf.kind === 'flight') ?? false));
      const bodyScr = flying ? { x: scr.x, y: scr.y - def.radius * scale * 0.45 } : scr;
      node.rig.update(bodyScr, b.facing, scale, dtMs, timeSec, {
        color: def.color,
        flash: this.fx.flashAmount(b.id),
        enraged: !dead && b.phase === 'enraged',
        action: dead ? 'idle' : b.action,
        telegraphT: dead ? 0 : telegraphProgress(b.telegraph),
        state: dead ? 'downed' : undefined,
      });
      node.rig.view.zIndex = Z_BIAS.boss + scr.y;
      if (this.lit) {
        this.updateBossGlow(
          b.id,
          b.pos,
          def.color,
          dead,
          telegraphProgress(b.telegraph) ?? 0,
          def.radius,
        );
      }
      this.seen.add(b.id);
    }

    // Victory dance: once the fight is won, every living hero hops, twirls and
    // pumps their weapon until the result screen takes over. A fresh fight
    // (any boss back at hp > 0) clears the celebration.
    let cheer: number | undefined;
    let brandishNow = false;
    if (this.victoryAtMs != null) {
      if (state.bosses.some((b) => b.hp > 0)) {
        this.victoryAtMs = null;
      } else {
        cheer = (nowMs - this.victoryAtMs) / 1000;
        if (nowMs - this.lastBrandishMs > 460) {
          this.lastBrandishMs = nowMs;
          brandishNow = true; // living HEROES pump their weapons (not corpses)
        }
      }
    }

    // Players.
    for (const p of state.players) {
      if (!playerUsesRig(p)) continue;
      const spec = classRigSpec(p.classId);
      if (!spec) continue;
      const node = this.ensure(p.id, spec, PLAYER_RADIUS);
      const scr = camera.worldToScreen(p.pos);
      // item 7 — a flying hero (Dragon Wings & co.) lifts off the ground too.
      const flying = p.state === 'alive' && (p.buffs?.some((bf) => bf.kind === 'flight') ?? false);
      const bodyScr = flying ? { x: scr.x, y: scr.y - PLAYER_RADIUS * scale * 0.45 } : scr;
      const celebrate = cheer != null && p.state === 'alive';
      if (celebrate && brandishNow) node.rig.triggerAttack();
      // Twirl during the dance: spin the facing a full turn per second-ish.
      const facing = celebrate
        ? Math.atan2(p.aim.y, p.aim.x) + Math.sin((cheer ?? 0) * 2.6) * 2.4
        : Math.atan2(p.aim.y, p.aim.x);
      node.rig.update(bodyScr, facing, scale, dtMs, timeSec, {
        color: CLASS_COLORS[p.classId] ?? 0xffffff,
        flash: this.fx.flashAmount(p.id),
        enraged: false,
        state: p.state,
        // A charged cast drives the cast pose. Sub slots have no dedicated pose, so they
        // fall back to the a1 cast pose; the cast bar over the head carries the progress.
        castSlot: p.castSlot === 'sub1' || p.castSlot === 'sub2' ? 'a1' : p.castSlot,
        castT: castProgress(p),
        aim: p.aim,
        cheer: celebrate ? cheer : undefined,
      });
      node.rig.view.zIndex = Z_BIAS.player + scr.y;
      this.seen.add(p.id);
    }

    // Remove vanished rigs (death FX is handled by particles / the geometry ghost).
    for (const [id, node] of this.nodes) {
      if (this.seen.has(id)) continue;
      this.container.removeChild(node.rig.view);
      node.rig.destroy();
      this.nodes.delete(id);
      const glow = this.bossGlows.get(id);
      if (glow) {
        this.lights?.remove(glow);
        this.bossGlows.delete(id);
      }
    }
  }

  /**
   * Drive a boss's persistent core glow: a coloured point light anchored to the
   * boss (§7.2) that ramps its intensity + reach with the telegraph windup (§7.3),
   * so the arena physically brightens as an attack charges — readable in
   * peripheral vision. Created on first sight, removed when the boss vanishes.
   */
  private updateBossGlow(
    id: EntityId,
    pos: { x: number; y: number },
    color: number,
    dead: boolean,
    tele: number,
    bodyR: number,
  ): void {
    let glow = this.bossGlows.get(id);
    if (!glow) {
      glow = this.lights!.add({
        x: pos.x,
        y: pos.y,
        z: 46,
        radius: bodyR * 2.2,
        r: 1,
        g: 1,
        b: 1,
        intensity: 1,
      });
      this.bossGlows.set(id, glow);
    }
    glow.x = pos.x;
    glow.y = pos.y;
    glow.r = ((color >> 16) & 0xff) / 255;
    glow.g = ((color >> 8) & 0xff) / 255;
    glow.b = (color & 0xff) / 255;
    const t = dead ? 0 : tele;
    glow.intensity = dead ? 0.15 : 0.85 + 1.9 * t; // felled twin dims to an ember
    glow.radius = bodyR * (2.2 + 3.0 * t);
  }

  destroy(): void {
    for (const glow of this.bossGlows.values()) this.lights?.remove(glow);
    this.bossGlows.clear();
    for (const [, node] of this.nodes) node.rig.destroy();
    this.nodes.clear();
    // Guard the shared-singleton fallback: makeSphereTexture returns Texture.WHITE
    // if a 2D canvas context is unavailable, and that global must not be freed.
    if (this.sphereTex !== Texture.WHITE) this.sphereTex.destroy(true);
    this.container.destroy();
  }

  private ensure(id: EntityId, spec: RigSpec, baseRadius: number): Node {
    const existing = this.nodes.get(id);
    // Reuse only when the spec AND base radius match. A gauntlet rebuilds the
    // World with a reset id counter, so a boss id can persist across stages while
    // the monster (and its radius) changes — recreate so the size is refreshed.
    if (existing && existing.spec === spec && existing.baseRadius === baseRadius) return existing;
    if (existing) {
      this.container.removeChild(existing.rig.view);
      existing.rig.destroy();
    }
    const rig = new CreatureRig(spec, id, this.sphereTex, baseRadius, this.lights);
    this.container.addChild(rig.view);
    const node: Node = { rig, spec, baseRadius };
    this.nodes.set(id, node);
    return node;
  }
}

/** 0..1 windup fill from a telegraph, or undefined when there's no telegraph. */
function telegraphProgress(tg: Telegraph | null): number | undefined {
  if (!tg || tg.totalWindup <= 0) return undefined;
  const p = 1 - tg.remainingWindup / tg.totalWindup;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** 0..1 rooted-cast progress for a player, or undefined when not mid-cast. The full
 * duration crosses the wire (castTimerMax), so this is accurate under Focus and needs
 * no per-class base-castTime lookup. */
function castProgress(p: PlayerView): number | undefined {
  if (p.castTimer <= 0 || p.castTimerMax <= 0) return undefined;
  const t = 1 - p.castTimer / p.castTimerMax;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
