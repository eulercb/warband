/**
 * Warband — lighting presets + config tests. Pure data + the cached material
 * `UniformGroup` factory (a plain data container, so it runs in Node).
 */
import { describe, it, expect } from 'vitest';
import {
  LIGHTING,
  MATERIAL_PRESETS,
  RIG_MATERIAL,
  AMBIENT_BY_THEME,
  materialGroup,
  type MaterialPreset,
} from '../src/render/lighting/presets';
import { DEFAULT_MAX_LIGHTS } from '../src/render/lighting/light';

const PRESET_NAMES: MaterialPreset[] = ['flesh', 'chitin', 'stone', 'metal', 'ooze'];

describe('LIGHTING flag', () => {
  it('ships enabled with the default budget (the escape hatch is present)', () => {
    expect(LIGHTING.enabled).toBe(true);
    expect(LIGHTING.maxLights).toBe(DEFAULT_MAX_LIGHTS);
  });
});

describe('MATERIAL_PRESETS', () => {
  it('defines all five shipped presets with sane, in-range params', () => {
    for (const name of PRESET_NAMES) {
      const p = MATERIAL_PRESETS[name];
      expect(p).toBeDefined();
      expect(p.rimColor).toHaveLength(3);
      p.rimColor.forEach((c) => expect(c).toBeGreaterThanOrEqual(0));
      p.rimColor.forEach((c) => expect(c).toBeLessThanOrEqual(1));
      expect(p.rimPower).toBeGreaterThanOrEqual(2);
      expect(p.rimPower).toBeLessThanOrEqual(5);
      expect(p.rimStrength).toBeGreaterThanOrEqual(0);
      expect(p.rimStrength).toBeLessThanOrEqual(1);
      expect(p.specStrength).toBeGreaterThanOrEqual(0);
      expect(p.shininess).toBeGreaterThan(0);
    }
  });

  it('reads metal as the shiniest, stone as the flattest (art-direction sanity)', () => {
    expect(MATERIAL_PRESETS.metal.shininess).toBeGreaterThan(MATERIAL_PRESETS.flesh.shininess);
    expect(MATERIAL_PRESETS.metal.specStrength).toBeGreaterThan(
      MATERIAL_PRESETS.stone.specStrength,
    );
    expect(MATERIAL_PRESETS.stone.specStrength).toBeLessThan(0.1);
  });
});

describe('RIG_MATERIAL', () => {
  it('maps every rig archetype to a valid preset', () => {
    const rigIds = [
      'spider',
      'serpent',
      'kraken',
      'treant',
      'insectoid',
      'humanoid',
      'beast',
      'blob',
      'golem',
      'gem',
      'eye',
      'dragon',
    ] as const;
    for (const id of rigIds) {
      expect(PRESET_NAMES).toContain(RIG_MATERIAL[id]);
    }
  });

  it('reads insectoids as chitin and constructs as stone', () => {
    expect(RIG_MATERIAL.insectoid).toBe('chitin');
    expect(RIG_MATERIAL.spider).toBe('chitin');
    expect(RIG_MATERIAL.golem).toBe('stone');
    expect(RIG_MATERIAL.blob).toBe('ooze');
  });
});

describe('AMBIENT_BY_THEME', () => {
  it('gives fire arenas a warm tint and crypts a cold one', () => {
    const magma = AMBIENT_BY_THEME.magma!;
    const ice = AMBIENT_BY_THEME.ice!;
    expect(magma[0]).toBeGreaterThan(magma[2]); // r > b → warm
    expect(ice[2]).toBeGreaterThan(ice[0]); // b > r → cold
  });

  it('every entry is a linear rgb triple in range', () => {
    for (const rgb of Object.values(AMBIENT_BY_THEME)) {
      expect(rgb).toHaveLength(3);
      rgb.forEach((c) => {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      });
    }
  });
});

describe('materialGroup', () => {
  it('returns a uniform group carrying the preset params', () => {
    const g = materialGroup('chitin');
    expect(g.uniforms.uShininess).toBe(MATERIAL_PRESETS.chitin.shininess);
    expect(g.uniforms.uSpecStrength).toBe(MATERIAL_PRESETS.chitin.specStrength);
    const rim = Array.from(g.uniforms.uRimColor as Float32Array);
    // Float32 storage widens back with tiny error, so compare per channel.
    MATERIAL_PRESETS.chitin.rimColor.forEach((c, i) => expect(rim[i]).toBeCloseTo(c, 5));
  });

  it('caches one group instance per preset (shared across meshes)', () => {
    expect(materialGroup('flesh')).toBe(materialGroup('flesh'));
    expect(materialGroup('flesh')).not.toBe(materialGroup('metal'));
  });
});
