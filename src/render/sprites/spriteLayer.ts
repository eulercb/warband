/**
 * Warband — retained sprite layer.
 *
 * Owns a Container of pooled `AnimatedSprite`s keyed by `EntityId` and reconciles
 * it against `RenderState` each frame: create on appear, update
 * pos/anim/tint/flip on persist, remove on vanish. This is the retained
 * counterpart to the immediate-mode Graphics in entityView.ts (see brief §1).
 *
 * Atlas-optional: if no `Spritesheet` is supplied (or a clip is missing from it)
 * the layer renders a procedurally-generated white silhouette per actor, tinted
 * by `ACTOR_PALETTE`. That is Phase 0 — it proves reconciliation, z-order,
 * scaling, flipping and tint without any art assets. Only categories whose
 * `SPRITE_FLAGS` entry is true are reconciled here; the rest keep their
 * immediate-mode geometry in `renderer.ts`/`entityView.ts`.
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
  resolveTextures,
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

/** One-shot instant-attack clip length (ms). Author to match the chosen art. */
const ATTACK_CLIP_MS = 320;

/** z-index category biases so players stay above the boss/adds and projectiles
 * above everything (screen-y is added on top for natural top-down depth). */
const Z_BIAS = { add: 0, boss: 20000, player: 40000, projectile: 60000 } as const;

interface Node {
  sprite: AnimatedSprite;
  actor: ActorKey;
  clipKey: string; // last applied `${clip}|${dir}` — swap textures only on change
  lastX: number; // screen-space, for motion derivation (NaN until seeded)
  lastY: number;
  attack: { slot: AbilitySlot; startMs: number } | null;
}

export class SpriteLayer {
  readonly container = new Container();
  private readonly nodes = new Map<EntityId, Node>();
  private readonly seen = new Set<EntityId>();
  private readonly placeholders = new Map<ActorKey, Texture[]>();

  constructor(
    private readonly sheet: Spritesheet | null,
    private readonly fx: Fx,
    renderer: PixiRenderer,
  ) {
    this.container.sortableChildren = true; // zIndex = screen y for top-down depth
    for (const actor of Object.keys(MANIFEST) as ActorKey[]) {
      this.placeholders.set(actor, [buildPlaceholder(renderer, actor, MANIFEST[actor])]);
    }
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
        const n = this.ensure(p.id, p.classId as ActorKey);
        if (n.attack && nowMs - n.attack.startMs >= ATTACK_CLIP_MS) n.attack = null;
        const scr = camera.worldToScreen(p.pos);
        const moving = this.speed(n, scr, dtMs) > EPS_MOVE;
        // Sub-skill casts are instant (never rooted), so only base slots matter here.
        const baseCastSlot =
          p.castSlot === 'sub1' || p.castSlot === 'sub2' ? null : p.castSlot;
        const castTotalMs = p.castTimer > 0 ? castMs(p.classId, baseCastSlot) : null;
        const sel = playerAnim(p, {
          dirMode: MANIFEST[p.classId as ActorKey].dirMode,
          moving,
          attack: n.attack ? { slot: n.attack.slot, ageMs: nowMs - n.attack.startMs } : null,
          attackClipMs: ATTACK_CLIP_MS,
          castTotalMs,
        });
        this.apply(n, sel, scr, s, Z_BIAS.player);
        n.sprite.tint = tintFor(p.classId as ActorKey, this.fx.flashAmount(p.id), false);
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
        this.apply(n, sel, scr, s, Z_BIAS.boss);
        n.sprite.tint = tintFor(actor, this.fx.flashAmount(b.id), b.phase === 'enraged');
        this.seen.add(b.id);
      }
    }

    if (SPRITE_FLAGS.add) {
      for (const a of state.adds) {
        const n = this.ensure(a.id, 'skeleton');
        const scr = camera.worldToScreen(a.pos);
        const moving = this.speed(n, scr, dtMs) > EPS_MOVE;
        this.apply(n, addAnim(a, moving), scr, s, Z_BIAS.add);
        n.sprite.tint = tintFor('skeleton', this.fx.flashAmount(a.id), false);
        this.seen.add(a.id);
      }
    }

    if (SPRITE_FLAGS.projectile) {
      for (const pr of state.projectiles) {
        const actor = pr.kind as ActorKey;
        const n = this.ensure(pr.id, actor);
        const scr = camera.worldToScreen(pr.pos);
        this.apply(n, projectileAnim(pr), scr, s, Z_BIAS.projectile);
        n.sprite.rotation = Math.atan2(pr.vel.y, pr.vel.x); // projectiles may rotate
        n.sprite.tint = tintFor(actor, 0, false);
        this.seen.add(pr.id);
      }
    }

    // Remove vanished entities (immediate; particle bursts cover the death FX).
    for (const [id, n] of this.nodes) {
      if (this.seen.has(id)) continue;
      this.container.removeChild(n.sprite);
      n.sprite.destroy();
      this.nodes.delete(id);
    }
  }

  /** Free GPU resources for the pooled sprites and placeholder textures. */
  destroy(): void {
    for (const [, n] of this.nodes) n.sprite.destroy();
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
    const sprite = new AnimatedSprite(this.texturesFor(actor, 'idle', null));
    sprite.anchor.set(cfg.anchor.x, cfg.anchor.y);
    sprite.animationSpeed = cfg.defaultFps / 60;
    sprite.play();
    this.container.addChild(sprite);
    n = { sprite, actor, clipKey: '', lastX: NaN, lastY: NaN, attack: null };
    this.nodes.set(id, n);
    return n;
  }

  /** Textures for a semantic clip: atlas if present + populated, else placeholder. */
  private texturesFor(actor: ActorKey, clip: string, dir: AnimSelection['dir']): Texture[] {
    if (this.sheet) {
      const t = resolveTextures(this.sheet, actor, clip, dir);
      if (t && t.length > 0) return t;
    }
    return this.placeholders.get(actor)!;
  }

  /** Apply a semantic selection: swap textures only on change, then scale/pos. */
  private apply(
    n: Node,
    sel: AnimSelection,
    scr: { x: number; y: number },
    camScale: number,
    zBias: number,
  ): void {
    const key = `${sel.clip}|${sel.dir ?? ''}`;
    if (key !== n.clipKey) {
      n.sprite.textures = this.texturesFor(n.actor, sel.clip, sel.dir);
      n.clipKey = key;
      if (sel.progress === null) {
        n.sprite.loop = sel.loop;
        n.sprite.gotoAndPlay(0);
      } else {
        n.sprite.loop = false;
      }
    }
    // Progress-driven frame (windups, rooted casts) — see brief §6.
    if (sel.progress !== null) {
      const frames = n.sprite.textures.length;
      n.sprite.gotoAndStop(Math.min(frames - 1, Math.floor(sel.progress * (frames - 1))));
    }
    // Scale so drawn radius ≈ targetRadiusPx * camScale (placeholders and art are
    // authored at 1px = 1 world unit); mirror left/right via a negative scale.x.
    n.sprite.scale.set(sel.flipX ? -camScale : camScale, camScale);
    n.sprite.position.set(scr.x, scr.y);
    n.sprite.zIndex = scr.y + zBias;
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
  const base = enraged ? 0xff6a5a : ACTOR_PALETTE[actor];
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
