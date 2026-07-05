# `src/render/sprites/` — pixel-art sprites & particle VFX

A **retained** sprite layer beside the existing **immediate-mode** `Graphics`
renderer (see build brief §1). Bodies can migrate from procedural geometry to
animated `AnimatedSprite`s per actor category; vector overlays (HP bars, rings,
labels) stay `Graphics`. Particle VFX are **asset-free** and augment the
existing `Fx` bursts.

## Files

| File             | What                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `direction.ts`   | Pure. Facing angle → discrete sprite direction (`8dir`/`4dir`/`flip`/`single`) + horizontal flip.                                       |
| `entityAnim.ts`  | Pure. Serializable view (+ derived ctx) → semantic `AnimSelection` (clip/dir/loop/progress). Unit-tested in `tests/entityAnim.test.ts`. |
| `manifest.ts`    | Atlas config, `SPRITE_FLAGS`, `SPRITE_ATLAS_URL`, `ACTOR_PALETTE`, `resolveTextures`.                                                   |
| `spriteLayer.ts` | Retained reconciler: pooled `AnimatedSprite`s keyed by `EntityId`, atlas-optional (procedural placeholders when no art).                |
| `particles.ts`   | Pooled, bounded, asset-free particle pool fed off the `GameEvent` stream.                                                               |

## Current state (no art shipped)

- `SPRITE_ATLAS_URL = null` → no atlas is loaded; `SpriteLayer` renders
  **procedural white silhouettes** tinted by `ACTOR_PALETTE`.
- All `SPRITE_FLAGS` are **false** → every body is still drawn by the existing
  `entityView` geometry, so the game looks **exactly** as before.
- Particles are **on** and additive-only — pure visual gain, no assets.

## Activating sprites (per category)

1. Author/obtain an atlas whose PixiJS v8 `sheet.animations` groups are named
   `` `${actor}__${clip}__${dir}` `` (dir omitted for `flip`/`single`); see
   `animKey`. Actors, clips and `DirMode` are in `manifest.ts` / brief §4–§7.
2. Drop it under `public/sprites/…` and set `SPRITE_ATLAS_URL` to its URL.
3. For already-coloured art, set that actor's `ACTOR_PALETTE` entry to
   `0xffffff` (tint becomes an identity multiply; hit-flash still lerps to white).
4. Flip the category's `SPRITE_FLAGS` entry to `true`. `Renderer` then routes
   that category through `SpriteLayer` (body) + `drawOverlays` (bars/rings) and
   skips its `entityView` geometry. Missing clips fall back via `resolveTextures`
   (dir → non-dir → idle) and, ultimately, to the placeholder.

## Timing (brief §6)

- Free-run loops (`idle`/`walk`/projectile `spin`): `AnimatedSprite.play()`.
- Progress-driven (boss `windup_*`, rooted player `cast_*`): frame is derived
  from gameplay progress via `gotoAndStop` — boss windups sync to the telegraph
  fill (`1 - remainingWindup/totalWindup`); rooted casts to `castTime`.

## Tuning hooks (brief §13)

`ATTACK_CLIP_MS` (spriteLayer), per-actor `defaultFps`/`anchor`/`targetRadiusPx`
and `progressClips` (manifest). Note: warband entity `pos` is the body **centre**;
placeholders are drawn so the body centres on `pos` regardless of anchor. Real
feet-anchored art may need its anchor tuned here.
