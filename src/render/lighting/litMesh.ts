/**
 * Warband — lit meshes (PixiJS `Mesh` + the forward lighting shader).
 *
 * Two shapes share one lighting program (via `GlProgram.from`'s source cache) and
 * the shared lights / env / material uniform groups; each instance owns only its
 * geometry, a small per-mesh `model` group (base colour / emissive / hit-flash)
 * and a `Shader`:
 *   - `LitMesh`  a unit quad — drop-in for a shaded body sprite. Its fragment
 *                shader derives the normal from the quad UV (sphere imposter) or a
 *                normal map, and it's positioned by a transform (`setPose`).
 *   - `LitLimb`  a dynamic quad-strip for the `limb` variant — a leg / arm /
 *                tentacle extruded along its bone. The centre-line moves every
 *                frame, so the geometry is rewritten in place (`setStrip`) rather
 *                than transformed; vertices are authored directly in screen space
 *                (identity transform), matching the lights' screen space.
 * So N lit meshes cost one program + one light upload per frame.
 *
 * Coverage: excluded (GPU glue). The pure light math, shader source and strip
 * extrusion it depends on live in `light.ts` / `litShader.ts` / `limbGeometry.ts`
 * and are unit-tested.
 */
import { Buffer, Mesh, MeshGeometry, Shader, Texture, UniformGroup } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';
import type { LightManager } from './light';
import { litProgramSource, type NormalVariant } from './litShader';
import { materialGroup, type MaterialPreset } from './presets';
import { makeStrip, extrudeStrip, type StripBuffers } from './limbGeometry';

export interface LitMeshOptions {
  variant: NormalVariant;
  maxLights: number;
  lights: LightManager;
  preset: MaterialPreset;
  /** Albedo texture. Defaults to white (flat-colour parts tinted by uBaseColor). */
  texture?: Texture;
  /** Tangent-space normal map — required for the `textured` variant. */
  normalTexture?: Texture;
}

/**
 * Shared plumbing for every lit mesh: the compiled shader (base colour / emissive /
 * hit-flash in a per-instance `model` group, everything else bound from the shared
 * light / env / material groups), the `setMaterial` uploader, and a `destroy` that
 * frees only this instance's own resources.
 */
abstract class LitMeshBase extends Mesh<MeshGeometry, Shader> {
  private readonly model: UniformGroup;
  /** Live-mutated uploaded buffers (same references held by the model group). */
  private readonly baseColor: Float32Array;
  private readonly flashRGBA: Float32Array; // rgb flash colour, a = amount

  protected constructor(geometry: MeshGeometry, opts: LitMeshOptions) {
    const albedo = opts.texture ?? Texture.WHITE;
    // These arrays ARE the uploaded uniform values; mutate + `model.update()`.
    const baseColor = new Float32Array([1, 1, 1]);
    const flashRGBA = new Float32Array([1, 1, 1, 0]);
    const model = new UniformGroup({
      uBaseColor: { value: baseColor, type: 'vec3<f32>' },
      uEmissive: { value: 0, type: 'f32' },
      uTint: { value: flashRGBA, type: 'vec4<f32>' },
    });

    const resources: Record<string, unknown> = {
      uTexture: albedo.source,
      lights: opts.lights.lightsGroup,
      env: opts.lights.envGroup,
      material: materialGroup(opts.preset),
      model,
    };
    if (opts.variant === 'textured') {
      resources.uNormalTex = (opts.normalTexture ?? Texture.WHITE).source;
    }

    const src = litProgramSource(opts.variant, opts.maxLights);
    const shader = Shader.from({ gl: src, resources });

    super({ geometry, shader, texture: albedo });

    this.model = model;
    this.baseColor = baseColor;
    this.flashRGBA = flashRGBA;
  }

  /**
   * Per-frame surface state: albedo tint (packed 0xRRGGBB), self-glow, and a
   * hit-flash (0 = none, 1 = full white pop). Writes the model group once.
   */
  setMaterial(color: number, emissive: number, flash: number, flashColor = 0xffffff): void {
    this.baseColor[0] = ((color >> 16) & 0xff) / 255;
    this.baseColor[1] = ((color >> 8) & 0xff) / 255;
    this.baseColor[2] = (color & 0xff) / 255;
    this.flashRGBA[0] = ((flashColor >> 16) & 0xff) / 255;
    this.flashRGBA[1] = ((flashColor >> 8) & 0xff) / 255;
    this.flashRGBA[2] = (flashColor & 0xff) / 255;
    this.flashRGBA[3] = flash < 0 ? 0 : flash > 1 ? 1 : flash;
    this.model.uniforms.uEmissive = emissive;
    this.model.update();
  }

  override destroy(): void {
    // Capture the geometry + shader BEFORE super.destroy() nulls them, then drop
    // this instance's OWN resources — never the shared uniform groups
    // (lights/env/material) or the global white texture. Shader.destroy(false)
    // tears down only this shader's bind group, detaching its change-listeners
    // from the shared groups (so respawning rigs don't leak listeners);
    // UniformGroups themselves are inert to destroy.
    const geo = this.geometry;
    const shader = this.shader;
    super.destroy({ texture: false, textureSource: false });
    geo?.destroy();
    shader?.destroy(false);
  }
}

export class LitMesh extends LitMeshBase {
  constructor(opts: LitMeshOptions) {
    super(buildQuadGeometry(opts.variant), opts);
  }

  /**
   * Position + size the quad in screen space. `sx`/`sy` are half-extents (like a
   * sprite's rx/ry). Rotation is optional — the sphere imposter is rotationally
   * symmetric, so body parts leave it at 0 (matching the old axis-aligned sprite).
   */
  setPose(x: number, y: number, sx: number, sy: number, rotation = 0): void {
    this.position.set(x, y);
    this.scale.set(sx, sy);
    this.rotation = rotation;
  }
}

/** Options for a `LitLimb`: everything a `LitMesh` needs minus the fixed `limb`
 * variant, plus the centre-line point count the strip is allocated for. */
export interface LitLimbOptions {
  maxLights: number;
  lights: LightManager;
  preset: MaterialPreset;
  /** Centre-line points (bones + 1). A leg/arm is 3; a tentacle is segments + 1. */
  points: number;
}

/**
 * A `limb`-variant lit mesh: a quad-strip extruded along a bone centre-line whose
 * fragment shader reads an analytic cylinder normal from `(aPerp, aV)`. The strip
 * is allocated once for `points` centre-line points; each frame `setStrip` re-runs
 * the pure extrusion and re-uploads just the position + perpendicular buffers
 * (UVs / cross-limb sign / indices are static). The transform stays identity — the
 * rig authors the centre-line in screen pixels, so `aPerp` is already in the
 * shader's space (see the lighting README's "screen space" adaptation).
 */
export class LitLimb extends LitMeshBase {
  private readonly strip: StripBuffers;
  private readonly posBuffer: Buffer;
  private readonly perpBuffer: Buffer;

  constructor(opts: LitLimbOptions) {
    const strip = makeStrip(opts.points);
    const geometry = new MeshGeometry({
      positions: strip.positions,
      uvs: strip.uvs,
      indices: strip.indices,
    });
    // The cross-limb coord + rotated perpendicular the `limb` shader variant reads.
    geometry.addAttribute('aPerp', { buffer: strip.perp, format: 'float32x2' });
    geometry.addAttribute('aV', { buffer: strip.v, format: 'float32' });

    super(geometry, {
      variant: 'limb',
      maxLights: opts.maxLights,
      lights: opts.lights,
      preset: opts.preset,
    });

    this.strip = strip;
    // These Buffers wrap `strip.positions` / `strip.perp` in place, so mutating the
    // strip then `update()` re-uploads without reallocating.
    this.posBuffer = geometry.getBuffer('aPosition');
    this.perpBuffer = geometry.getBuffer('aPerp');
  }

  /**
   * Reshape the limb to a screen-space centre-line `points` with per-point
   * half-widths `halfWidths` (both length `opts.points`). Rewrites the strip and
   * re-uploads the two dynamic attribute buffers.
   */
  setStrip(points: readonly Vec2[], halfWidths: readonly number[]): void {
    extrudeStrip(this.strip, points, halfWidths);
    this.posBuffer.update();
    this.perpBuffer.update();
  }
}

/** Unit quad centred at the origin, UV [0,1]. Limb adds aPerp / aV attributes for a
 * single straight segment (a real multi-segment limb uses `LitLimb` instead). */
function buildQuadGeometry(variant: NormalVariant): MeshGeometry {
  const positions = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  const geo = new MeshGeometry({ positions, uvs, indices });
  if (variant === 'limb') {
    // Cross-limb coord v ∈ [-1,1] along local Y; the perpendicular is local +Y,
    // rotated per-instance by the model transform in the vertex shader.
    geo.addAttribute('aPerp', {
      buffer: new Float32Array([0, 1, 0, 1, 0, 1, 0, 1]),
      format: 'float32x2',
    });
    geo.addAttribute('aV', { buffer: new Float32Array([-1, -1, 1, 1]), format: 'float32' });
  }
  return geo;
}
