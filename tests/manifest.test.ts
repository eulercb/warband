import { describe, it, expect } from 'vitest';
import {
  animKey,
  resolveTextures,
  packedFrameUV,
  MANIFEST,
  ACTOR_PALETTE,
  SPRITE_FLAGS,
  SPRITE_ATLAS_URL,
  NORMAL_MAP,
} from '../src/render/sprites/manifest';
import type { ActorKey } from '../src/render/sprites/manifest';
import type { Texture, Spritesheet } from 'pixi.js';

const ACTORS = Object.keys(MANIFEST) as ActorKey[];

describe('animKey', () => {
  it('includes a real direction token', () => {
    expect(animKey('knight', 'walk', 'e')).toBe('knight__walk__e');
    expect(animKey('dragon', 'idle', 'sw')).toBe('dragon__idle__sw');
  });

  it('omits the direction for null or the "side" token', () => {
    expect(animKey('lich', 'idle', null)).toBe('lich__idle');
    expect(animKey('lich', 'idle', 'side')).toBe('lich__idle');
  });
});

describe('resolveTextures', () => {
  const tex = (n: string): Texture[] => [{ label: n } as unknown as Texture];
  const sheet = (anims: Record<string, Texture[]>): Spritesheet =>
    ({ animations: anims }) as unknown as Spritesheet;

  it('prefers the exact dir key', () => {
    const s = sheet({ knight__walk__e: tex('dir'), knight__walk: tex('nodir') });
    expect(resolveTextures(s, 'knight', 'walk', 'e')?.[0].label).toBe('dir');
  });

  it('falls back to the non-dir key', () => {
    const s = sheet({ knight__walk: tex('nodir') });
    expect(resolveTextures(s, 'knight', 'walk', 'e')?.[0].label).toBe('nodir');
  });

  it('falls back to idle (dir then non-dir)', () => {
    expect(
      resolveTextures(sheet({ knight__idle__e: tex('idleDir') }), 'knight', 'walk', 'e')?.[0].label,
    ).toBe('idleDir');
    expect(
      resolveTextures(sheet({ knight__idle: tex('idle') }), 'knight', 'walk', 'e')?.[0].label,
    ).toBe('idle');
  });

  it('returns null when nothing matches', () => {
    expect(resolveTextures(sheet({}), 'knight', 'walk', 'e')).toBeNull();
  });
});

describe('MANIFEST + palette config', () => {
  it('has a well-formed config for every actor', () => {
    for (const a of ACTORS) {
      const c = MANIFEST[a];
      expect(['8dir', '4dir', 'flip', 'single']).toContain(c.dirMode);
      expect(c.targetRadiusPx).toBeGreaterThan(0);
      expect(c.defaultFps).toBeGreaterThan(0);
      expect(c.anchor.x).toBeGreaterThanOrEqual(0);
      expect(c.anchor.y).toBeGreaterThanOrEqual(0);
      expect(c.loopClips).toBeInstanceOf(Set);
      expect(c.progressClips).toBeInstanceOf(Set);
    }
  });

  it('defines a palette colour for every actor', () => {
    for (const a of ACTORS) {
      expect(ACTOR_PALETTE[a]).toBeGreaterThanOrEqual(0);
      expect(ACTOR_PALETTE[a]).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('ships with all sprite categories OFF and no atlas by default', () => {
    expect(Object.values(SPRITE_FLAGS).every((v) => v === false)).toBe(true);
    expect(SPRITE_ATLAS_URL).toBeNull();
  });

  it('ships the normal-map path dormant but flips green by default (Blender→Pixi)', () => {
    // Dormant until real normal-mapped art lands (no atlas ships), but the correct
    // Blender→Pixi green flip is the baked-in default so it's right the moment art
    // arrives — the gotcha that "costs an afternoon" can't bite.
    expect(NORMAL_MAP.enabled).toBe(false);
    expect(NORMAL_MAP.flipG).toBe(true);
    expect(['right', 'bottom']).toContain(NORMAL_MAP.half);
  });
});

describe('packedFrameUV', () => {
  it('splits a right-packed frame into albedo (left) + a constant normal delta', () => {
    // 64×32 frame at the atlas origin in a 128×128 atlas: albedo is the left 32px
    // (U 0→0.25), normal the right 32px reached by +0.25 in U.
    const { atlasUV, normalDelta } = packedFrameUV({ x: 0, y: 0, w: 64, h: 32 }, 128, 128, 'right');
    expect(atlasUV).toEqual([0.25, 0.25, 0, 0]);
    expect(normalDelta).toEqual([0.25, 0]);
  });

  it('splits a bottom-packed frame into albedo (top) + a downward normal delta', () => {
    const { atlasUV, normalDelta } = packedFrameUV(
      { x: 0, y: 0, w: 32, h: 64 },
      128,
      128,
      'bottom',
    );
    expect(atlasUV).toEqual([0.25, 0.25, 0, 0]);
    expect(normalDelta).toEqual([0, 0.25]);
  });

  it('honours a frame offset within a non-square atlas', () => {
    const { atlasUV, normalDelta } = packedFrameUV(
      { x: 64, y: 32, w: 64, h: 32 },
      256,
      128,
      'right',
    );
    // scale = half-width/atlasW, height/atlasH ; offset = frame origin / atlas size
    expect(atlasUV[0]).toBeCloseTo(32 / 256, 6);
    expect(atlasUV[1]).toBeCloseTo(32 / 128, 6);
    expect(atlasUV[2]).toBeCloseTo(64 / 256, 6);
    expect(atlasUV[3]).toBeCloseTo(32 / 128, 6);
    expect(normalDelta[0]).toBeCloseTo(32 / 256, 6);
    expect(normalDelta[1]).toBe(0);
  });

  it('never divides by zero for a not-yet-uploaded (0×0) atlas', () => {
    const { atlasUV, normalDelta } = packedFrameUV({ x: 0, y: 0, w: 64, h: 32 }, 0, 0, 'right');
    for (const v of [...atlasUV, ...normalDelta]) expect(Number.isFinite(v)).toBe(true);
  });
});
