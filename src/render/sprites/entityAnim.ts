/**
 * Warband — pure animation state machine.
 *
 * Maps a serializable view (+ small derived context) to a *semantic* animation
 * selection. No PixiJS here — `SpriteLayer` turns a selection into textures via
 * the manifest. Kept pure so it can be unit-tested like fx/zones.
 */
import type {
  PlayerView,
  BossView,
  AddView,
  ProjectileView,
  AbilitySlot,
} from '../../engine/core/types';
import type { DirMode, DirToken } from './manifest';
import { facingFor } from './direction';

export interface AnimSelection {
  clip: string;
  dir: DirToken | null;
  flipX: boolean;
  loop: boolean;
  /** 0..1 → drive the frame from gameplay progress; null → free-run loop. */
  progress: number | null;
}

/** px/s (screen) below which a player/add is treated as "idle". */
const EPS_MOVE = 8;

// --- Players ---------------------------------------------------------------

export interface PlayerAnimCtx {
  dirMode: DirMode;
  moving: boolean; // derived from Δpos (SpriteLayer)
  attack: { slot: AbilitySlot; ageMs: number } | null; // from a `cast` event
  attackClipMs: number; // one-shot clip length (config)
  castTotalMs: number | null; // looked up from classes.ts by SpriteLayer
}

export function playerAnim(p: PlayerView, ctx: PlayerAnimCtx): AnimSelection {
  const { dir, flipX } = facingFor(Math.atan2(p.aim.y, p.aim.x), ctx.dirMode);

  if (p.state === 'dead') {
    return { clip: 'death', dir, flipX, loop: false, progress: null };
  }
  if (p.state === 'downed') {
    return { clip: 'downed', dir, flipX, loop: true, progress: null };
  }

  // Rooted cast (e.g. mage Fireball) — hold the cast pose, synced if we know total.
  if (p.castTimer > 0) {
    const slot = p.castSlot ?? 'a1';
    const progress = ctx.castTotalMs ? clamp01(1 - (p.castTimer * 1000) / ctx.castTotalMs) : null;
    return { clip: `cast_${slot}`, dir, flipX, loop: progress === null, progress };
  }

  // Instant one-shot attack, still playing out.
  if (ctx.attack && ctx.attack.ageMs < ctx.attackClipMs) {
    return { clip: `attack_${ctx.attack.slot}`, dir, flipX, loop: false, progress: null };
  }

  return { clip: ctx.moving ? 'walk' : 'idle', dir, flipX, loop: true, progress: null };
}

// --- Boss ------------------------------------------------------------------

export function bossAnim(b: BossView, dirMode: DirMode): AnimSelection {
  const { dir, flipX } = facingFor(b.facing, dirMode);
  const enraged = b.phase === 'enraged';

  if (b.action === 'windup' && b.abilityId && b.telegraph) {
    const t = b.telegraph;
    const progress = clamp01(1 - t.remainingWindup / Math.max(t.totalWindup, 1e-6));
    return { clip: `windup_${b.abilityId}`, dir, flipX, loop: false, progress };
  }
  if (b.action === 'channel' && b.abilityId) {
    return { clip: `channel_${b.abilityId}`, dir, flipX, loop: true, progress: null };
  }
  if (b.action === 'recover') {
    return { clip: 'recover', dir, flipX, loop: false, progress: null };
  }
  return { clip: enraged ? 'idle_enraged' : 'idle', dir, flipX, loop: true, progress: null };
}

// --- Adds / projectiles ----------------------------------------------------

export function addAnim(_a: AddView, moving: boolean): AnimSelection {
  return { clip: moving ? 'walk' : 'idle', dir: 'side', flipX: false, loop: true, progress: null };
}

/** Projectiles free-rotate (SpriteLayer sets rotation from vel); clip just spins. */
export function projectileAnim(_p: ProjectileView): AnimSelection {
  return { clip: 'spin', dir: null, flipX: false, loop: true, progress: null };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export { EPS_MOVE };
