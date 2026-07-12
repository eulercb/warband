/**
 * Warband — lighting config: the feature flag, surface material presets, and the
 * per-arena ambient dial. Pure data + a small cached `UniformGroup` factory, so
 * the presets are importable from tests without a GPU.
 *
 * Surface presets are the vocabulary the art direction gets expressed in (brief
 * §6): pick a preset, not raw shininess numbers. Rim light is the cheapest
 * "make it pop" term — it separates a boss's silhouette from the background — so
 * every preset carries a deliberate rim.
 */
import { UniformGroup } from 'pixi.js';
import type { TerrainKind } from '../../engine/core/types';
import type { RigId } from '../rig/types';
import { DEFAULT_MAX_LIGHTS } from './light';

/**
 * The lighting escape hatch (brief §9). `enabled = false` routes lit actors back
 * to the original baked-sphere sprite look with zero visual corruption — keep it.
 * `maxLights` is the per-frame budget and the first knob to turn if a device
 * blows its fill-rate budget (§8). Mutable so a device/perf probe can lower it.
 */
export const LIGHTING = {
  enabled: true,
  maxLights: DEFAULT_MAX_LIGHTS,
};

export type MaterialPreset = 'flesh' | 'chitin' | 'stone' | 'metal' | 'ooze';

/** Per-material surface response. Ambient lives in the arena env, not here. */
export interface SurfaceParams {
  /** Rim (fresnel) colour, linear rgb. */
  rimColor: [number, number, number];
  rimPower: number; // 2..5 — higher = tighter rim
  rimStrength: number; // 0..1
  specStrength: number; // 0 matte, 0.5+ wet/chitinous
  shininess: number; // 8..64 — higher = tighter highlight
}

/** The five shipped presets (brief §6). */
export const MATERIAL_PRESETS: Record<MaterialPreset, SurfaceParams> = {
  flesh: {
    rimColor: [0.85, 0.8, 0.85],
    rimPower: 3.0,
    rimStrength: 0.3,
    specStrength: 0.05,
    shininess: 12,
  },
  chitin: {
    rimColor: [0.7, 0.85, 0.95],
    rimPower: 3.5,
    rimStrength: 0.5,
    specStrength: 0.6,
    shininess: 40,
  },
  stone: {
    rimColor: [0.9, 0.82, 0.7],
    rimPower: 2.0,
    rimStrength: 0.15,
    specStrength: 0.02,
    shininess: 8,
  },
  metal: {
    rimColor: [0.8, 0.88, 1.0],
    rimPower: 4.0,
    rimStrength: 0.7,
    specStrength: 0.9,
    shininess: 64,
  },
  ooze: {
    rimColor: [0.7, 1.0, 0.8],
    rimPower: 2.5,
    rimStrength: 0.8,
    specStrength: 0.8,
    shininess: 24,
  },
};

/**
 * Which surface preset each creature archetype wears. Keeps a spec-free default
 * mapping so a new boss is lit sensibly with zero extra config — insectoids read
 * as hard chitin, constructs as stone, blobs as wet ooze, everything else flesh.
 */
export const RIG_MATERIAL: Record<RigId, MaterialPreset> = {
  spider: 'chitin',
  insectoid: 'chitin',
  serpent: 'flesh',
  kraken: 'ooze',
  treant: 'stone',
  humanoid: 'flesh',
  beast: 'flesh',
  blob: 'ooze',
  golem: 'stone',
  gem: 'metal',
  eye: 'ooze',
  dragon: 'chitin',
};

/**
 * Per-arena ambient (shadow) tint, keyed by the lead boss's terrain theme — the
 * mood dial from §7.5. Warm for fire arenas, cold for crypts. Linear rgb; the
 * renderer feeds this into `LightManager.setAmbient`. Missing themes fall back to
 * the manager's neutral default.
 */
export const AMBIENT_BY_THEME: Partial<Record<TerrainKind, [number, number, number]>> = {
  magma: [0.4, 0.26, 0.22],
  ember: [0.38, 0.3, 0.22],
  swamp: [0.24, 0.34, 0.28],
  bog: [0.26, 0.34, 0.22],
  ice: [0.28, 0.33, 0.44],
  deathfog: [0.3, 0.26, 0.4],
  tide: [0.2, 0.3, 0.42],
  abyss: [0.22, 0.2, 0.36],
  bloodmire: [0.4, 0.22, 0.28],
  brimstone: [0.42, 0.28, 0.2],
};

// --- Cached uniform groups ---------------------------------------------------

const groupCache = new Map<MaterialPreset, UniformGroup>();

/**
 * The shared `UniformGroup` for a preset. Cached by name so every mesh of the
 * same material binds ONE group (the surface params never change per instance).
 */
export function materialGroup(preset: MaterialPreset): UniformGroup {
  let g = groupCache.get(preset);
  if (g) return g;
  const p = MATERIAL_PRESETS[preset];
  g = new UniformGroup({
    uRimColor: { value: new Float32Array(p.rimColor), type: 'vec3<f32>' },
    uRimPower: { value: p.rimPower, type: 'f32' },
    uRimStrength: { value: p.rimStrength, type: 'f32' },
    uSpecStrength: { value: p.specStrength, type: 'f32' },
    uShininess: { value: p.shininess, type: 'f32' },
  });
  groupCache.set(preset, g);
  return g;
}
