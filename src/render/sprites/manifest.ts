/**
 * Warband — sprite atlas manifest + per-actor animation config.
 *
 * PixiJS v8 `Spritesheet` exposes `sheet.animations: Record<string, Texture[]>`
 * when the atlas JSON declares animation groups (Aseprite tags / TexturePacker
 * "animations"). We name each group `${actor}__${clip}__${dir}` (dir omitted for
 * `flip`/`single` actors) — see `animKey`.
 *
 * No PixiJS runtime is imported here beyond the two texture *types*, so this
 * module is pure config and safe to import from tests.
 */
import type { Texture, Spritesheet } from 'pixi.js';
import { CLASS_COLORS, ADD_RADIUS } from '../../engine/core/constants';
import { CLASS_IDS } from '../../engine/content/classes';
import { MONSTERS } from '../../engine/content/monsters';
import { PROJECTILE_KINDS } from '../../engine/core/types';
import type { ClassId, MonsterId, ProjectileKind, BossBodyShape } from '../../engine/core/types';

export type DirMode = '8dir' | '4dir' | 'flip' | 'single';
export type DirToken = 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'n' | 'ne' | 'side';
/** Which half of a side-by-side packed atlas frame holds the tangent-space normal. */
export type NormalPackHalf = 'right' | 'bottom';

/**
 * Logical actor keys in the atlas. Derived from the canonical content registries
 * (item 64) so EVERY class, monster, the skeleton add and every projectile kind
 * is representable — adding new content to `content/` can never leave an actor
 * unmapped (which used to throw the first frame a newer class/boss existed with a
 * `SPRITE_FLAGS` category on).
 */
export type ActorKey = ClassId | MonsterId | 'skeleton' | ProjectileKind;

/** Which drawable categories are sprite-driven. Everything else keeps the
 * immediate-mode geometry in entityView. All default OFF so the shipped game is
 * pixel-for-pixel unchanged until real art is dropped in (see §1 migration flag).
 * Flip a flag true to route that category through `SpriteLayer`; with no atlas
 * present it renders procedural placeholder silhouettes (Phase 0). */
export type SpriteCategory = 'player' | 'boss' | 'add' | 'projectile';
export const SPRITE_FLAGS: Record<SpriteCategory, boolean> = {
  player: false,
  boss: false,
  add: false,
  projectile: false,
};

/**
 * Atlas URL served from `public/`. `null` = no atlas shipped yet, so the loader
 * is skipped entirely (no 404 noise) and `SpriteLayer` uses placeholders. Point
 * this at a real `Assets.load`-able atlas JSON once art exists.
 */
export const SPRITE_ATLAS_URL: string | null = null;

/**
 * Normal-map wiring for the lit sprite path — "Path B" (issue #43, follow-up to
 * the lighting brief §3). Pre-rendered sprite art is authored with a tangent-space
 * normal map packed into the SAME atlas frame as its albedo, side by side, so the
 * packer trims/rotates both as one image and their UVs can never desync. With this
 * on (and `LIGHTING.enabled`), `SpriteLayer` renders flagged bodies through
 * `LitMesh({ variant: 'textured' })`, sampling the normal beside the albedo, so a
 * pre-rendered sprite catches the arena's dynamic lights like the procedural rigs.
 *
 * `enabled` defaults OFF and `SPRITE_ATLAS_URL` is `null`, so nothing changes until
 * real normal-mapped art is dropped in — activating it is a one-line edit here,
 * exactly like `SPRITE_FLAGS` / `SPRITE_ATLAS_URL`.
 */
export const NORMAL_MAP: {
  enabled: boolean;
  flipG: boolean;
  half: NormalPackHalf;
} = {
  enabled: false,
  // Blender's normal pass is camera-space +Y up; Pixi's Y is down. Flip green
  // (G = 1 − G) or every top-lit surface shades bottom-lit — the OpenGL-vs-DirectX
  // convention, and the single most common bug in this system (brief §3). Off only
  // for art that already ships DirectX-convention (Y-down) normals.
  flipG: true,
  half: 'right',
};

/** Per-kind projectile tints (mirrors entityView's PROJECTILE_COLORS). */
const PROJECTILE_PALETTE: Record<ProjectileKind, number> = {
  arrow: 0x76e34a,
  arcaneBolt: 0x9c5cf0,
  fireball: 0xff8a3d,
  shadowBolt: 0x8a3ff0,
  smite: 0xf2c14e,
  eldritch: 0x8ad46a,
  chaos: 0xd85ac0,
  sonic: 0xc98ce0,
  thorn: 0x6f9e3a,
};

/**
 * Tint applied to each actor's (white) placeholder silhouette, and to real art
 * as a base for the hit-flash lerp toward white. For already-coloured pixel art
 * set these to `0xffffff` so tint is an identity multiply. Built from the content
 * registries (item 64/65: monster colours now live on the defs, not a stale
 * side-table) so every actor has a colour by construction.
 */
function buildActorPalette(): Record<ActorKey, number> {
  const p = { skeleton: 0xbfc4cc } as Record<ActorKey, number>;
  for (const c of CLASS_IDS) p[c] = CLASS_COLORS[c];
  for (const id of Object.keys(MONSTERS) as MonsterId[]) p[id] = MONSTERS[id].color;
  for (const k of PROJECTILE_KINDS) p[k] = PROJECTILE_PALETTE[k];
  p.lich = 0x8a6cff; // override: reads as its violet glow, not the near-black fill
  return p;
}
export const ACTOR_PALETTE: Record<ActorKey, number> = buildActorPalette();

export interface ActorConfig {
  dirMode: DirMode;
  /** Author-space radius of the body in the art, in world units. The sprite is
   * scaled so its drawn body ≈ `targetRadiusPx * camera.scale` on screen. */
  targetRadiusPx: number;
  anchor: { x: number; y: number }; // usually feet-ish, e.g. { x: 0.5, y: 0.78 }
  defaultFps: number;
  /** Clips that loop; everything else plays once. */
  loopClips: ReadonlySet<string>;
  /** Clips whose frame is driven by gameplay progress (see brief §6). */
  progressClips: ReadonlySet<string>;
}

export type Manifest = Record<ActorKey, ActorConfig>;

/** Build the atlas animation-group key from a semantic selection. */
export function animKey(actor: ActorKey, clip: string, dir: DirToken | null): string {
  return dir && dir !== 'side' ? `${actor}__${clip}__${dir}` : `${actor}__${clip}`;
}

/** Resolve textures for a key, falling back through dir → non-dir → idle. */
export function resolveTextures(
  sheet: Spritesheet,
  actor: ActorKey,
  clip: string,
  dir: DirToken | null,
): Texture[] | null {
  const a = sheet.animations;
  return (
    a[animKey(actor, clip, dir)] ??
    a[animKey(actor, clip, null)] ??
    a[animKey(actor, 'idle', dir)] ??
    a[animKey(actor, 'idle', null)] ??
    null
  );
}

/** The albedo-half UV transform and albedo→normal UV delta the `textured` shader
 * reads for one side-by-side packed atlas frame.
 * - `atlasUV` (`[scaleX, scaleY, offsetX, offsetY]`) maps the unit quad's `[0,1]`
 *   UV onto the ALBEDO half of the frame within the atlas.
 * - `normalDelta` (`[du, dv]`) is the constant shift from that albedo UV to the
 *   normal half — the "one UV + a constant offset" that makes packer desync
 *   structurally impossible (brief §3, gotcha 2). */
export interface FrameUV {
  atlasUV: [number, number, number, number];
  normalDelta: [number, number];
}

/**
 * Compute the {@link FrameUV} for an atlas frame `{x,y,w,h}` (pixels) in an
 * `atlasW×atlasH` atlas whose `half` holds the normal map. Pure — the runtime
 * reads a Pixi `Texture`'s `frame`/`source` size and hands the numbers here, so
 * the packing convention lives in one testable place. `atlasW`/`atlasH` of 0 are
 * clamped to 1 so a not-yet-uploaded texture yields finite UVs instead of NaN.
 */
export function packedFrameUV(
  frame: { x: number; y: number; w: number; h: number },
  atlasW: number,
  atlasH: number,
  half: NormalPackHalf,
): FrameUV {
  const aw = atlasW || 1;
  const ah = atlasH || 1;
  const ox = frame.x / aw;
  const oy = frame.y / ah;
  if (half === 'bottom') {
    const hh = frame.h / 2 / ah;
    return { atlasUV: [frame.w / aw, hh, ox, oy], normalDelta: [0, hh] };
  }
  // 'right' (default): albedo in the left half, normal in the right half.
  const hw = frame.w / 2 / aw;
  return { atlasUV: [hw, frame.h / ah, ox, oy], normalDelta: [hw, 0] };
}

// --- Config presets ---------------------------------------------------------

function humanoid(): ActorConfig {
  return {
    dirMode: '8dir',
    targetRadiusPx: 16, // == PLAYER_RADIUS
    anchor: { x: 0.5, y: 0.78 },
    defaultFps: 10,
    loopClips: new Set(['idle', 'walk', 'downed', 'cast']),
    progressClips: new Set(['cast', 'cast_basic', 'cast_a1', 'cast_a2', 'cast_a3']),
  };
}

/** Placeholder facing granularity per body silhouette (real art can override). */
const BODY_DIR_MODE: Record<BossBodyShape, DirMode> = {
  humanoid: '8dir',
  beast: '4dir',
  serpent: '4dir',
  insect: '4dir',
  star: 'flip',
  blob: 'flip',
  diamond: 'flip',
  construct: 'flip',
  orb: 'flip',
  tree: 'flip',
};

function boss(id: MonsterId): ActorConfig {
  const def = MONSTERS[id];
  return {
    dirMode: BODY_DIR_MODE[def.bodyShape],
    targetRadiusPx: def.radius,
    anchor: { x: 0.5, y: 0.72 },
    defaultFps: 9,
    loopClips: new Set(['idle', 'move', 'idle_enraged', 'channel']),
    // item 64: windups sync to THIS boss's own telegraphs, derived from its
    // abilities — no hand-maintained list that freezes at the v1 roster.
    progressClips: new Set(def.abilities.map((a) => `windup_${a.id}`)),
  };
}

function proj(): ActorConfig {
  return {
    dirMode: 'single',
    targetRadiusPx: 6,
    anchor: { x: 0.5, y: 0.5 },
    defaultFps: 14,
    loopClips: new Set(['spin', 'idle']),
    progressClips: new Set(),
  };
}

/** Total by construction (item 64): a config for every class, monster, the
 * skeleton add and every projectile kind, so flipping any `SPRITE_FLAGS` category
 * on renders placeholders for the whole roster instead of throwing. */
function buildManifest(): Manifest {
  const m = {} as Record<ActorKey, ActorConfig>;
  for (const c of CLASS_IDS) m[c] = humanoid();
  for (const id of Object.keys(MONSTERS) as MonsterId[]) m[id] = boss(id);
  for (const k of PROJECTILE_KINDS) m[k] = proj();
  m.skeleton = {
    dirMode: 'flip',
    targetRadiusPx: ADD_RADIUS,
    anchor: { x: 0.5, y: 0.8 },
    defaultFps: 8,
    loopClips: new Set(['idle', 'walk']),
    progressClips: new Set(),
  };
  return m;
}
export const MANIFEST: Manifest = buildManifest();
