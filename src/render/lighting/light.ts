/**
 * Warband — dynamic light model + manager (forward, per-object lighting).
 *
 * A `Light` is a coloured point light in WORLD space with a height `z` above the
 * arena plane and a hard `radius` cutoff. `LightManager` owns the whole active
 * set, expires timed lights, and each frame selects the strongest `maxLights`
 * near the action, packs them into two `vec4` arrays and uploads them through a
 * single shared `UniformGroup`. Every `LitMesh` references that SAME group, so
 * one update per frame lights every object.
 *
 * ── Coordinate space (see the lighting README / rig §"scene space") ───────────
 * Warband projects world → screen on the CPU (`Camera.worldToScreen`); the rig
 * and its lit meshes are positioned in SCREEN pixels, and no GPU container
 * applies the camera transform. So the shader's `vScenePos` is screen space, and
 * light positions must be projected to screen space before upload. The manager
 * stays space-agnostic: `update()` takes a `project` callback that maps a world
 * light to the shader's space (screen px + camera scale + shake). Scoring/culling
 * runs in WORLD units (stable across zoom); only the packed values are projected.
 * Verified against PixiJS 8.19.0 (2026-07); the mesh GL shader feeds
 * `uWorldTransformMatrix`/`uTransformMatrix` as plain uniforms — see litShader.ts.
 */
import { UniformGroup } from 'pixi.js';

/** Default per-frame light budget. Mobile ships 8; a desktop build may use 16. */
export const DEFAULT_MAX_LIGHTS = 8;

/** A coloured point light. Positions/radius are WORLD units; colour is linear. */
export interface Light {
  x: number;
  y: number;
  /** Height above the arena plane. 20–80 typical. Low = grazing, high = flat. */
  z: number;
  /** World-unit hard cutoff; attenuation reaches exactly 0 here. */
  radius: number;
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
  /** 0..~4. Above 1 blows out — intended, feed it to bloom later. */
  intensity: number;
  /** Seconds remaining. Omit for a persistent light. */
  ttl?: number;
}

/** A light projected into the shader's space (screen px + scaled z/radius). */
export interface ProjectedLight {
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** Maps a world-space light to the shader's coordinate space. */
export type LightProjector = (light: Light) => ProjectedLight;

/**
 * Cull score: brighter and nearer-the-action lights win the limited slots.
 * `intensity / (1 + normalizedDistance)` — a light exactly `radius` away from the
 * focus scores half its intensity; one at the focus scores its full intensity.
 * Bigger-radius lights fall off more slowly, so a boss's wide core glow outranks
 * a pinpoint spark at the same distance. Returns the raw score (higher = keep).
 */
export function scoreLight(light: Light, fx: number, fy: number): number {
  const dist = Math.hypot(light.x - fx, light.y - fy);
  const norm = dist / Math.max(light.radius, 1e-4);
  return light.intensity / (1 + norm);
}

/**
 * Choose up to `max` lights to keep, strongest first. Pure (no allocation of the
 * input), so it is unit-testable in isolation. Ties keep earlier-added lights,
 * which keeps persistent lights (added once, early) stable as sparks come and go.
 */
export function selectLights(lights: readonly Light[], focus: Vec2Like, max: number): Light[] {
  if (lights.length <= max) return lights.slice();
  // Decorate with score + original index, sort desc (stable on ties via index).
  const scored = lights.map((l, i) => ({ l, i, s: scoreLight(l, focus.x, focus.y) }));
  scored.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.i - b.i));
  scored.length = max;
  // Restore original add-order among the survivors so slot assignment is stable.
  scored.sort((a, b) => a.i - b.i);
  return scored.map((e) => e.l);
}

interface Vec2Like {
  x: number;
  y: number;
}

/**
 * Owns the active lights and the shared GPU uniform groups. One instance per
 * renderer; every `LitMesh` binds `manager.lightsGroup` and `manager.envGroup`.
 */
export class LightManager {
  /** Shared group: uLightPosR[], uLightColI[], uLightCount. */
  readonly lightsGroup: UniformGroup;
  /** Shared "arena mood" group (§7.5): uAmbient, uKeyDir, uKeyColor, uKeyAmount. */
  readonly envGroup: UniformGroup;

  readonly maxLights: number;

  private readonly lights: Light[] = [];
  private readonly posR: Float32Array;
  private readonly colI: Float32Array;

  // Env (ambient + a constant key light that reproduces the pre-lighting look so
  // an unlit-by-dynamics surface still reads as volumetric — dynamic point lights
  // add drama on top). Stored as Float32Arrays so we can mutate + re-upload.
  private readonly ambient = new Float32Array([0.34, 0.35, 0.42]);
  private readonly keyDir = new Float32Array([-0.5, -0.62, 0.6]); // up-left, toward viewer
  private readonly keyColor = new Float32Array([1, 0.98, 0.92]); // faintly warm

  constructor(maxLights: number = DEFAULT_MAX_LIGHTS) {
    this.maxLights = maxLights;
    this.posR = new Float32Array(maxLights * 4);
    this.colI = new Float32Array(maxLights * 4);
    // normalize the seeded key direction.
    normalize3(this.keyDir);

    this.lightsGroup = new UniformGroup({
      uLightPosR: { value: this.posR, type: 'vec4<f32>', size: maxLights },
      uLightColI: { value: this.colI, type: 'vec4<f32>', size: maxLights },
      uLightCount: { value: 0, type: 'f32' },
    });
    this.envGroup = new UniformGroup({
      uAmbient: { value: this.ambient, type: 'vec3<f32>' },
      uKeyDir: { value: this.keyDir, type: 'vec3<f32>' },
      uKeyColor: { value: this.keyColor, type: 'vec3<f32>' },
      uKeyAmount: { value: 0.65, type: 'f32' },
    });
  }

  /** Add a light. Returns it so callers can hold a handle and mutate/remove it. */
  add(light: Light): Light {
    this.lights.push(light);
    return light;
  }

  /** Remove a previously-added light (swap-pop; order among the rest is irrelevant
   * — `selectLights` restores add-order deterministically from indices each frame). */
  remove(light: Light): void {
    const i = this.lights.indexOf(light);
    if (i < 0) return;
    const last = this.lights.length - 1;
    if (i !== last) this.lights[i] = this.lights[last];
    this.lights.pop();
  }

  /** Drop every light (e.g. on scene teardown / fight restart). */
  clear(): void {
    this.lights.length = 0;
  }

  /** Number of live lights (pre-cull). */
  get size(): number {
    return this.lights.length;
  }

  /** The arena's ambient (shadow) tint — the per-arena mood dial (§7.5). */
  setAmbient(r: number, g: number, b: number): void {
    this.ambient[0] = r;
    this.ambient[1] = g;
    this.ambient[2] = b;
    this.envGroup.update();
  }

  /** The constant key light: direction (screen space, will be normalized), colour
   * and strength. Reproduces the old baked top-left sphere key so unlit surfaces
   * keep their volume; set amount to 0 for a pure dynamic-only look. */
  setKeyLight(
    dir: Vec2Like & { z: number },
    color: [number, number, number],
    amount: number,
  ): void {
    // Ignore a degenerate direction — keep the previous key so the fill never
    // collapses to zero (which would flatten every surface).
    if (Math.hypot(dir.x, dir.y, dir.z) > 1e-6) {
      this.keyDir[0] = dir.x;
      this.keyDir[1] = dir.y;
      this.keyDir[2] = dir.z;
      normalize3(this.keyDir);
    }
    this.keyColor[0] = color[0];
    this.keyColor[1] = color[1];
    this.keyColor[2] = color[2];
    this.envGroup.uniforms.uKeyAmount = amount;
    this.envGroup.update();
  }

  /**
   * Once per frame, after entity transforms settle. Expires timed lights, culls
   * to the budget around `focus` (world space), projects survivors into shader
   * space and uploads. `dtSec` advances ttls; pass 0 to just repack.
   */
  update(dtSec: number, focus: Vec2Like, project: LightProjector): void {
    // 1. expire ttl lights (iterate backwards for safe splice).
    if (dtSec > 0) {
      for (let i = this.lights.length - 1; i >= 0; i--) {
        const l = this.lights[i];
        if (l.ttl === undefined) continue;
        l.ttl -= dtSec;
        if (l.ttl <= 0) {
          const last = this.lights.length - 1;
          if (i !== last) this.lights[i] = this.lights[last];
          this.lights.pop();
        }
      }
    }

    // 2–3. score + cull to the budget.
    const chosen = selectLights(this.lights, focus, this.maxLights);

    // 4. pack projected values; zero the unused tail.
    const posR = this.posR;
    const colI = this.colI;
    for (let i = 0; i < this.maxLights; i++) {
      const o = i * 4;
      if (i < chosen.length) {
        const l = chosen[i];
        const p = project(l);
        posR[o] = p.x;
        posR[o + 1] = p.y;
        posR[o + 2] = p.z;
        posR[o + 3] = p.radius;
        colI[o] = l.r;
        colI[o + 1] = l.g;
        colI[o + 2] = l.b;
        colI[o + 3] = l.intensity;
      } else {
        posR[o] = posR[o + 1] = posR[o + 2] = posR[o + 3] = 0;
        colI[o] = colI[o + 1] = colI[o + 2] = colI[o + 3] = 0;
      }
    }

    // 5–6. publish count + flag the group dirty so Pixi re-uploads.
    this.lightsGroup.uniforms.uLightCount = chosen.length;
    this.lightsGroup.update();
  }

  /** Read-only view of the packed position/radius array (for tests/diagnostics). */
  get packedPosR(): Readonly<Float32Array> {
    return this.posR;
  }

  /** Read-only view of the packed colour/intensity array (for tests/diagnostics). */
  get packedColI(): Readonly<Float32Array> {
    return this.colI;
  }
}

/** Normalize a 3-component Float32Array in place. Callers guarantee a non-zero
 * vector (the constructor seeds one; `setKeyLight` rejects a degenerate dir). */
function normalize3(v: Float32Array): void {
  const len = Math.hypot(v[0], v[1], v[2]);
  v[0] /= len;
  v[1] /= len;
  v[2] /= len;
}
