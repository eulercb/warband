/**
 * Warband — retained sprite layer.
 *
 * Owns a Container of pooled bodies keyed by `EntityId` and reconciles it against
 * `RenderState` each frame: create on appear, update pos/anim/tint/flip on persist,
 * remove on vanish. This is the retained counterpart to the immediate-mode Graphics
 * in entityView.ts (see brief §1).
 *
 * Two body backends, chosen once at construction:
 *   - **flat** `AnimatedSprite` — the default. Atlas-optional: with no `Spritesheet`
 *     (or a missing clip) it renders a procedural white silhouette per actor, tinted
 *     by `ACTOR_PALETTE` (Phase 0 — proves reconciliation without art).
 *   - **lit** `LitMesh({ variant: 'textured' })` — "Path B" (issue #43). When a real
 *     atlas ships whose frames pack a tangent-space normal beside each albedo
 *     (`NORMAL_MAP.enabled`) and lighting is on, bodies sample that normal and catch
 *     the arena's dynamic point lights, exactly like the procedural rigs. The source
 *     atlas stays bound; each frame just slides the UV window (`LitMesh.setFrame`).
 *
 * Only categories whose `SPRITE_FLAGS` entry is true are reconciled here; the rest
 * keep their immediate-mode geometry in `renderer.ts`/`entityView.ts`.
 */
import {
  AnimatedSprite,
  Container,
  Graphics,
  Rectangle,
  type Renderer as PixiRenderer,
  type Spritesheet,
  type Texture,
} from 'pixi.js';
import type {
  RenderState,
  EntityId,
  AbilitySlot,
  GameEvent,
  ClassId,
} from '../../engine/core/types';
import type { Camera } from '../pipeline/camera';
import type { Fx } from '../overlays/fx';
import {
  MANIFEST,
  ACTOR_PALETTE,
  SPRITE_FLAGS,
  NORMAL_MAP,
  resolveTextures,
  packedFrameUV,
  type ActorKey,
  type ActorConfig,
} from './manifest';
import {
  playerAnim,
  bossAnim,
  addAnim,
  projectileAnim,
  EPS_MOVE,
  type AnimSelection,
} from './entityAnim';
import { getClass } from '../../engine/content/classes';
import { LitMesh } from '../lighting/litMesh';
import type { LightManager } from '../lighting/light';
import { LIGHTING } from '../lighting/presets';

/** One-shot instant-attack clip length (ms). Author to match the chosen art. */
const ATTACK_CLIP_MS = 320;

/** Enraged-boss body tint (red), matching the flat path's `tintFor`. */
const ENRAGED_TINT = 0xff6a5a;

/** z-index category biases so players stay above the boss/adds and projectiles
 * above everything (screen-y is added on top for natural top-down depth). */
const Z_BIAS = { add: 0, boss: 20000, player: 40000, projectile: 60000 } as const;

interface Node {
  /** Exactly one backend is set, per the layer's chosen path. */
  sprite: AnimatedSprite | null; // flat path
  lit: LitMesh | null; // lit (textured normal-map) path
  actor: ActorKey;
  clipKey: string; // last applied `${clip}|${dir}` — swap textures only on change
  frames: Texture[]; // current clip's frames (lit path selects among these)
  clipStartMs: number; // lit path: when the current clip began (frame timing)
  lastX: number; // screen-space, for motion derivation (NaN until seeded)
  lastY: number;
  attack: { slot: AbilitySlot; startMs: number } | null;
}

export class SpriteLayer {
  readonly container = new Container();
  private readonly nodes = new Map<EntityId, Node>();
  private readonly seen = new Set<EntityId>();
  private readonly placeholders = new Map<ActorKey, Texture[]>();

  /** True when bodies render through the lit `textured` path. Requires a real
   * atlas (normals packed per frame), the normal-map switch, lighting on, and a
   * `LightManager` to bind — otherwise the flat `AnimatedSprite` path is used. */
  private readonly lit: boolean;
  /** A representative texture from the atlas (any frame shares the atlas source),
   * bound once to each lit body; per-frame animation only slides the UV window. */
  private readonly atlasTex: Texture | null;

  constructor(
    private readonly sheet: Spritesheet | null,
    private readonly fx: Fx,
    renderer: PixiRenderer,
    private readonly lights: LightManager | null = null,
  ) {
    this.container.sortableChildren = true; // zIndex = screen y for top-down depth
    for (const actor of Object.keys(MANIFEST) as ActorKey[]) {
      this.placeholders.set(actor, [buildPlaceholder(renderer, actor, MANIFEST[actor])]);
    }
    this.atlasTex = sheet ? (Object.values(sheet.textures)[0] ?? null) : null;
    this.lit = LIGHTING.enabled && NORMAL_MAP.enabled && lights != null && this.atlasTex != null;
  }

  /** Consume one-shot player `cast` events into per-entity attack triggers. */
  ingestEvents(events: GameEvent[], nowMs: number): void {
    for (const e of events) {
      if (e.t !== 'cast' || e.side !== 'player') continue;
      const n = this.nodes.get(e.sourceId);
      if (!n) continue;
      // Resolve the exact slot from the ability name for accurate attack clips;
      // fall back to 'basic' if the name isn't found (e.g. renamed art).
      const slot = slotForAbilityName(n.actor as ClassId, e.ability) ?? 'basic';
      n.attack = { slot, startMs: nowMs };
    }
  }

  /** Reconcile + animate one frame. Call after ingestEvents, before fx.draw. */
  update(state: RenderState, camera: Camera, nowMs: number, dtMs: number): void {
    this.seen.clear();
    const s = camera.scale;

    if (SPRITE_FLAGS.player) {
      for (const p of state.players) {
        const n = this.ensure(p.id, p.classId);
        if (n.attack && nowMs - n.attack.startMs >= ATTACK_CLIP_MS) n.attack = null;
        const scr = camera.worldToScreen(p.pos);
        const moving = this.speed(n, scr, dtMs) > EPS_MOVE;
        // Sub-skill casts are instant (never rooted), so only base slots matter here.
        const baseCastSlot = p.castSlot === 'sub1' || p.castSlot === 'sub2' ? null : p.castSlot;
        const castTotalMs = p.castTimer > 0 ? castMs(p.classId, baseCastSlot) : null;
        const sel = playerAnim(p, {
          dirMode: MANIFEST[p.classId as ActorKey].dirMode,
          moving,
          attack: n.attack ? { slot: n.attack.slot, ageMs: nowMs - n.attack.startMs } : null,
          attackClipMs: ATTACK_CLIP_MS,
          castTotalMs,
        });
        this.apply(n, sel, scr, s, Z_BIAS.player, nowMs);
        this.paint(n, this.fx.flashAmount(p.id), false);
        this.seen.add(p.id);
      }
    }

    if (SPRITE_FLAGS.boss) {
      for (const b of state.bosses) {
        const actor = b.monsterId as ActorKey;
        const n = this.ensure(b.id, actor);
        const scr = camera.worldToScreen(b.pos);
        this.speed(n, scr, dtMs); // keep lastX/Y fresh (unused: boss anim is action-driven)
        const sel = bossAnim(b, MANIFEST[actor].dirMode);
        this.apply(n, sel, scr, s, Z_BIAS.boss, nowMs);
        this.paint(n, this.fx.flashAmount(b.id), b.phase === 'enraged');
        this.seen.add(b.id);
      }
    }

    if (SPRITE_FLAGS.add) {
      for (const a of state.adds) {
        const n = this.ensure(a.id, 'skeleton');
        const scr = camera.worldToScreen(a.pos);
        const moving = this.speed(n, scr, dtMs) > EPS_MOVE;
        this.apply(n, addAnim(a, moving), scr, s, Z_BIAS.add, nowMs);
        this.paint(n, this.fx.flashAmount(a.id), false);
        this.seen.add(a.id);
      }
    }

    if (SPRITE_FLAGS.projectile) {
      for (const pr of state.projectiles) {
        const actor = pr.kind as ActorKey;
        const n = this.ensure(pr.id, actor);
        const scr = camera.worldToScreen(pr.pos);
        // projectiles free-rotate to their velocity
        this.apply(
          n,
          projectileAnim(pr),
          scr,
          s,
          Z_BIAS.projectile,
          nowMs,
          Math.atan2(pr.vel.y, pr.vel.x),
        );
        this.paint(n, 0, false);
        this.seen.add(pr.id);
      }
    }

    // Remove vanished entities (immediate; particle bursts cover the death FX).
    for (const [id, n] of this.nodes) {
      if (this.seen.has(id)) continue;
      this.disposeNode(n);
      this.nodes.delete(id);
    }
  }

  /** Free GPU resources for the pooled bodies and placeholder textures. */
  destroy(): void {
    for (const [, n] of this.nodes) this.disposeNode(n);
    this.nodes.clear();
    for (const [, tex] of this.placeholders) for (const t of tex) t.destroy(true);
    this.placeholders.clear();
    this.container.destroy();
  }

  // --- internals -----------------------------------------------------------

  private ensure(id: EntityId, actor: ActorKey): Node {
    let n = this.nodes.get(id);
    if (n) return n;
    const cfg = MANIFEST[actor];
    const frames = this.texturesFor(actor, 'idle', null);
    let sprite: AnimatedSprite | null = null;
    let lit: LitMesh | null = null;
    if (this.lit) {
      // One lit quad, atlas bound once; the normal lives beside the albedo in each
      // packed frame, so the same atlas is both albedo and normal source.
      lit = new LitMesh({
        variant: 'textured',
        maxLights: this.lights!.maxLights,
        lights: this.lights!,
        preset: 'flesh', // pre-rendered characters read as flesh by default; tune per actor if needed
        texture: this.atlasTex!,
        normalTexture: this.atlasTex!,
        flipG: NORMAL_MAP.flipG,
      });
      this.container.addChild(lit);
    } else {
      sprite = new AnimatedSprite(frames);
      sprite.anchor.set(cfg.anchor.x, cfg.anchor.y);
      sprite.animationSpeed = cfg.defaultFps / 60;
      sprite.play();
      this.container.addChild(sprite);
    }
    n = {
      sprite,
      lit,
      actor,
      clipKey: '',
      frames,
      clipStartMs: 0,
      lastX: NaN,
      lastY: NaN,
      attack: null,
    };
    this.nodes.set(id, n);
    return n;
  }

  /** Textures for a semantic clip: atlas if present + populated, else placeholder.
   * The lit path never falls back to a placeholder (its source isn't the bound
   * atlas), so callers there keep the last atlas frames if a clip is missing. */
  private texturesFor(actor: ActorKey, clip: string, dir: AnimSelection['dir']): Texture[] {
    if (this.sheet) {
      const t = resolveTextures(this.sheet, actor, clip, dir);
      if (t && t.length > 0) return t;
    }
    return this.placeholders.get(actor)!;
  }

  /**
   * Apply a semantic selection to whichever backend this node uses: swap the
   * clip on change, drive the current frame, then pose/scale/z-order it.
   */
  private apply(
    n: Node,
    sel: AnimSelection,
    scr: { x: number; y: number },
    camScale: number,
    zBias: number,
    nowMs: number,
    rotation = 0,
  ): void {
    const key = `${sel.clip}|${sel.dir ?? ''}`;
    if (n.lit) this.applyLit(n, sel, key, scr, camScale, zBias, nowMs, rotation);
    else this.applyFlat(n, sel, key, scr, camScale, zBias, rotation);
  }

  /** Flat `AnimatedSprite` backend (unchanged Phase-0 behaviour). */
  private applyFlat(
    n: Node,
    sel: AnimSelection,
    key: string,
    scr: { x: number; y: number },
    camScale: number,
    zBias: number,
    rotation: number,
  ): void {
    const sprite = n.sprite!;
    if (key !== n.clipKey) {
      sprite.textures = this.texturesFor(n.actor, sel.clip, sel.dir);
      n.clipKey = key;
      if (sel.progress === null) {
        sprite.loop = sel.loop;
        sprite.gotoAndPlay(0);
      } else {
        sprite.loop = false;
      }
    }
    // Progress-driven frame (windups, rooted casts) — see brief §6.
    if (sel.progress !== null) {
      const frames = sprite.textures.length;
      sprite.gotoAndStop(Math.min(frames - 1, Math.floor(sel.progress * (frames - 1))));
    }
    // Scale so drawn radius ≈ targetRadiusPx * camScale (placeholders and art are
    // authored at 1px = 1 world unit); mirror left/right via a negative scale.x.
    sprite.scale.set(sel.flipX ? -camScale : camScale, camScale);
    sprite.position.set(scr.x, scr.y);
    sprite.rotation = rotation;
    sprite.zIndex = scr.y + zBias;
  }

  /** Lit `textured` backend: pick the frame, slide the atlas UV window (albedo +
   * its side-by-side normal), then pose the quad to match the sprite's anchor. */
  private applyLit(
    n: Node,
    sel: AnimSelection,
    key: string,
    scr: { x: number; y: number },
    camScale: number,
    zBias: number,
    nowMs: number,
    rotation: number,
  ): void {
    const lit = n.lit!;
    if (key !== n.clipKey) {
      const t = this.sheet ? resolveTextures(this.sheet, n.actor, sel.clip, sel.dir) : null;
      if (t && t.length > 0) n.frames = t; // keep last atlas frames if a clip is missing
      n.clipKey = key;
      n.clipStartMs = nowMs;
    }
    const tex = n.frames[litFrameIndex(n, sel, nowMs)] ?? n.frames[0];
    const f = tex.frame;
    const src = tex.source;
    const { atlasUV, normalDelta } = packedFrameUV(
      { x: f.x, y: f.y, w: f.width, h: f.height },
      src.width,
      src.height,
      NORMAL_MAP.half,
    );
    lit.setFrame(atlasUV, normalDelta);

    // The albedo occupies one half of each packed frame; size the quad to it and
    // place the sprite's anchor point on the entity's screen position.
    const cfg = MANIFEST[n.actor];
    const albedoW = (NORMAL_MAP.half === 'right' ? f.width / 2 : f.width) * camScale;
    const albedoH = (NORMAL_MAP.half === 'bottom' ? f.height / 2 : f.height) * camScale;
    const cx = scr.x + (sel.flipX ? -1 : 1) * (0.5 - cfg.anchor.x) * albedoW;
    const cy = scr.y + (0.5 - cfg.anchor.y) * albedoH;
    lit.setPose(cx, cy, (sel.flipX ? -albedoW : albedoW) / 2, albedoH / 2, rotation);
    lit.zIndex = scr.y + zBias;
  }

  /** Apply the body's colour: a lerp-to-white hit flash on the flat path's tint,
   * or the lit path's base-colour + shader-composited flash. */
  private paint(n: Node, flash: number, enraged: boolean): void {
    if (n.lit) {
      const base = enraged ? ENRAGED_TINT : ACTOR_PALETTE[n.actor];
      n.lit.setMaterial(base, 0, flash, 0xffffff);
    } else {
      n.sprite!.tint = tintFor(n.actor, flash, enraged);
    }
  }

  /** Destroy whichever backend a node holds. */
  private disposeNode(n: Node): void {
    if (n.lit) {
      this.container.removeChild(n.lit);
      n.lit.destroy();
    }
    if (n.sprite) {
      this.container.removeChild(n.sprite);
      n.sprite.destroy();
    }
  }

  /** Screen-space speed (px/s) since last frame; seeds lastX/Y on first sight. */
  private speed(n: Node, scr: { x: number; y: number }, dtMs: number): number {
    if (Number.isNaN(n.lastX)) {
      n.lastX = scr.x;
      n.lastY = scr.y;
      return 0;
    }
    const dx = scr.x - n.lastX;
    const dy = scr.y - n.lastY;
    n.lastX = scr.x;
    n.lastY = scr.y;
    return dtMs > 0 ? (Math.hypot(dx, dy) * 1000) / dtMs : 0;
  }
}

// --- Free helpers ------------------------------------------------------------

/**
 * The current frame index for the lit path (the flat path lets `AnimatedSprite`
 * do this internally): progress-driven clips map gameplay progress across the
 * frames; loops cycle at the actor's fps; one-shots hold the last frame.
 */
function litFrameIndex(n: Node, sel: AnimSelection, nowMs: number): number {
  const count = n.frames.length;
  if (count <= 1) return 0;
  if (sel.progress !== null) {
    const p = sel.progress < 0 ? 0 : sel.progress > 1 ? 1 : sel.progress;
    return Math.min(count - 1, Math.floor(p * (count - 1)));
  }
  const fps = MANIFEST[n.actor].defaultFps;
  const raw = Math.floor(((nowMs - n.clipStartMs) / 1000) * fps);
  if (raw <= 0) return 0;
  return sel.loop ? raw % count : Math.min(count - 1, raw);
}

/** Ability cast time (ms) for a (class, slot); null when not a rooted cast. */
function castMs(classId: ClassId, slot: AbilitySlot | null): number | null {
  if (!slot) return null;
  const sec = getClass(classId).abilities[slot].castTime ?? 0;
  return sec > 0 ? sec * 1000 : null;
}

/** Map a `cast` event's ability *name* back to its slot for the owning class.
 * Rooted casts emit `${name} (cast)` at cast-start (world.ts), so match the
 * base name; falls back to null (→ 'basic') when the name isn't recognised. */
function slotForAbilityName(classId: ClassId, name: string): AbilitySlot | null {
  const ab = getClass(classId)?.abilities;
  if (!ab) return null;
  const base = name.endsWith(CAST_SUFFIX) ? name.slice(0, -CAST_SUFFIX.length) : name;
  const slots: AbilitySlot[] = ['basic', 'a1', 'a2', 'a3'];
  for (const slot of slots) if (ab[slot].name === base) return slot;
  return null;
}

const CAST_SUFFIX = ' (cast)';

/** Actor palette tint, lerped toward white by `flash` (0..1); enraged bosses
 * read red before the flash is applied. Placeholder silhouettes are white, so
 * the tint both palette-swaps and drives the hit-flash brighten. */
function tintFor(actor: ActorKey, flash: number, enraged: boolean): number {
  const base = enraged ? ENRAGED_TINT : ACTOR_PALETTE[actor];
  return flash > 0 ? lerpColor(base, 0xffffff, flash) : base;
}

/** Linear interpolation between two packed 0xRRGGBB colors. */
function lerpColor(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const r = Math.round(ar + (((b >> 16) & 0xff) - ar) * k);
  const g = Math.round(ag + (((b >> 8) & 0xff) - ag) * k);
  const bl = Math.round(ab + ((b & 0xff) - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

/**
 * A white silhouette placeholder for one actor, drawn at 1px = 1 world unit so a
 * `camScale` transform sizes it correctly. The body centre lands on the actor's
 * declared anchor point, so an anchored sprite sits centred on the entity's
 * world position regardless of the anchor value. No image assets.
 */
function buildPlaceholder(renderer: PixiRenderer, actor: ActorKey, cfg: ActorConfig): Texture {
  const R = cfg.targetRadiusPx;
  const frameW = 4 * R;
  const frameH = 5 * R;
  const cx = cfg.anchor.x * frameW;
  const cy = cfg.anchor.y * frameH;
  const g = new Graphics();
  const white = 0xffffff;

  if (actor === 'dragon' || actor === 'troll' || actor === 'lich') {
    g.circle(cx, cy, R).fill({ color: white, alpha: 0.9 });
    g.circle(cx, cy, R).stroke({ width: Math.max(2, R * 0.05), color: white, alpha: 1 });
  } else if (
    actor === 'arrow' ||
    actor === 'arcaneBolt' ||
    actor === 'fireball' ||
    actor === 'shadowBolt' ||
    actor === 'smite'
  ) {
    g.circle(cx, cy, R).fill({ color: white, alpha: 1 });
  } else {
    // humanoid / skeleton pawn: body + head silhouette
    g.circle(cx, cy, R * 0.9).fill({ color: white, alpha: 0.95 });
    g.circle(cx, cy - R * 1.15, R * 0.5).fill({ color: white, alpha: 1 });
  }

  const tex = renderer.generateTexture({
    target: g,
    frame: new Rectangle(0, 0, frameW, frameH),
    antialias: true,
  });
  g.destroy();
  return tex;
}
