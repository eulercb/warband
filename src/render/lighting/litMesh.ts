/**
 * Warband — a single lit mesh (PixiJS `Mesh` + the forward lighting shader).
 *
 * A drop-in for a shaded body sprite: a unit quad whose fragment shader derives a
 * per-fragment normal (sphere / limb imposter, or a normal map) and sums the
 * shared light buffer. Each instance owns its geometry, a small per-mesh `model`
 * uniform group (base colour / emissive / hit-flash) and a `Shader`, but SHARES
 * the compiled GL program (via `GlProgram.from`'s source cache) and the lights /
 * env / material uniform groups. So N lit meshes cost one program + one light
 * upload per frame.
 *
 * Coverage: excluded (GPU glue). The pure light math + shader source it depends
 * on live in `light.ts` / `litShader.ts` and are unit-tested.
 */
import { Mesh, MeshGeometry, Shader, Texture, UniformGroup } from 'pixi.js';
import type { LightManager } from './light';
import { litProgramSource, type NormalVariant } from './litShader';
import { materialGroup, type MaterialPreset } from './presets';

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

export class LitMesh extends Mesh<MeshGeometry, Shader> {
  private readonly model: UniformGroup;
  /** Live-mutated uploaded buffers (same references held by the model group). */
  private readonly baseColor: Float32Array;
  private readonly flashRGBA: Float32Array; // rgb flash colour, a = amount

  constructor(opts: LitMeshOptions) {
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

    super({ geometry: buildGeometry(opts.variant), shader, texture: albedo });

    this.model = model;
    this.baseColor = baseColor;
    this.flashRGBA = flashRGBA;
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

/** Unit quad centred at the origin, UV [0,1]. Limb adds aPerp / aV attributes. */
function buildGeometry(variant: NormalVariant): MeshGeometry {
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
