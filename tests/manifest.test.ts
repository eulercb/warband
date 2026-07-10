import { describe, it, expect } from 'vitest';
import {
  animKey,
  resolveTextures,
  MANIFEST,
  ACTOR_PALETTE,
  SPRITE_FLAGS,
  SPRITE_ATLAS_URL,
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
});
