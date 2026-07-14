/**
 * Warband — lit-shader source builder tests. Pure string generation: variant
 * defines, the compile-time light bound, the right attributes/samplers per
 * variant, and the `#version` header Pixi's preprocessor expects.
 */
import { describe, it, expect } from 'vitest';
import {
  litVertexSource,
  litFragmentSource,
  litProgramSource,
  type NormalVariant,
} from '../src/render/lighting/litShader';

const VARIANTS: NormalVariant[] = ['sphere', 'limb', 'textured'];
const DEFINE: Record<NormalVariant, string> = {
  sphere: 'NORMAL_SPHERE',
  limb: 'NORMAL_LIMB',
  textured: 'NORMAL_TEXTURED',
};

describe('litVertexSource', () => {
  it.each(VARIANTS)('starts with the ES 3.00 version + variant/count defines (%s)', (v) => {
    const src = litVertexSource(v, 8);
    expect(src.startsWith('#version 300 es')).toBe(true);
    expect(src).toContain(`#define ${DEFINE[v]}`);
    expect(src).toContain('#define MAX_LIGHTS 8');
    // Feeds the plain mesh uniforms Pixi auto-binds for a custom mesh shader.
    expect(src).toContain('uniform mat3 uProjectionMatrix;');
    expect(src).toContain('uniform mat3 uWorldTransformMatrix;');
    expect(src).toContain('uniform mat3 uTransformMatrix;');
    expect(src).toContain('vScenePos');
  });

  it('emits the bone perpendicular attributes only for the limb variant', () => {
    const limb = litVertexSource('limb', 8);
    expect(limb).toContain('in vec2 aPerp;');
    expect(limb).toContain('in float aV;');
    expect(limb).toContain('vPerp = normalize');
    for (const v of ['sphere', 'textured'] as NormalVariant[]) {
      const src = litVertexSource(v, 8);
      expect(src).not.toContain('aPerp');
      expect(src).not.toContain('aV');
    }
  });
});

describe('litFragmentSource', () => {
  it.each(VARIANTS)('carries the light loop bound + shared uniforms (%s)', (v) => {
    const src = litFragmentSource(v, 16);
    expect(src.startsWith('#version 300 es')).toBe(true);
    expect(src).toContain('#define MAX_LIGHTS 16');
    expect(src).toContain('uniform vec4  uLightPosR[MAX_LIGHTS];');
    expect(src).toContain('uniform float uLightCount;');
    expect(src).toContain('uniform vec3  uAmbient;');
    expect(src).toContain('uniform vec3  uKeyDir;');
    expect(src).toContain('uniform vec3  uBaseColor;');
    // The loop is bounded by the compile-time constant with an early break.
    expect(src).toContain('for (int i = 0; i < MAX_LIGHTS; ++i)');
    expect(src).toContain('if (float(i) >= uLightCount) break;');
    // Additive terms are premultiplied by alpha (no silhouette halo, §4.3).
    expect(src).toContain('* alpha;');
    // item 77: composed colour is soft-clipped (knee 0.8, headroom 0.2) so
    // compounding lights + flash roll off toward — never reach — pure white,
    // instead of hard-clamping bodies to a flat white disc.
    expect(src).toContain('vec3 over = max(lit - 0.8, 0.0);');
    expect(src).toContain('lit = min(lit, vec3(0.8)) + 0.2 * (over / (over + 0.2));');
  });

  it('declares the normal-map sampler + atlas uniforms only for the textured variant', () => {
    // The #else branch references these in every variant's source string, but the
    // DECLARATIONS are conditional (only textured compiles that branch).
    const textured = litFragmentSource('textured', 8);
    expect(textured).toContain('uniform sampler2D uNormalTex;');
    expect(textured).toContain('uniform vec4  uAtlasUV;');
    expect(textured).toContain('uniform vec2  uNormalDelta;');
    expect(textured).toContain('uniform float uNormalFlipG;');
    for (const v of ['sphere', 'limb'] as NormalVariant[]) {
      const src = litFragmentSource(v, 8);
      expect(src).not.toContain('uniform sampler2D uNormalTex;');
      expect(src).not.toContain('uniform vec4  uAtlasUV;');
      expect(src).not.toContain('uniform vec2  uNormalDelta;');
      expect(src).not.toContain('uniform float uNormalFlipG;');
    }
  });

  it('handles the two §3 normal-map gotchas structurally (textured only)', () => {
    const textured = litFragmentSource('textured', 8);
    // Gotcha 1 — flip green (Blender +Y up vs Pixi Y down), gated by a uniform so
    // art that already ships DirectX-convention normals can turn it off.
    expect(textured).toContain('mix(nTex.g, 1.0 - nTex.g, uNormalFlipG)');
    // Gotcha 2 — albedo + normal read through the SAME packed-frame transform, so
    // the normal is albedo's UV plus a constant delta (no independent-trim desync).
    expect(textured).toContain('vUV * uAtlasUV.xy + uAtlasUV.zw + uNormalDelta');
    // The renormalize the brief calls for is already present.
    expect(textured).toContain('normalize(nTex * 2.0 - 1.0)');
  });

  it('routes albedo through the atlas frame transform only for the textured variant', () => {
    // Textured bodies live in an atlas sub-rect, so their albedo is sampled through
    // the frame transform; sphere/limb use the full-texture unit quad at raw UV.
    expect(litFragmentSource('textured', 8)).toContain(
      'texture(uTexture, vUV * uAtlasUV.xy + uAtlasUV.zw);',
    );
    expect(litFragmentSource('sphere', 8)).toContain('texture(uTexture, vUV);');
    expect(litFragmentSource('limb', 8)).toContain('texture(uTexture, vUV);');
  });

  it('selects the sphere disc-discard math and the limb perpendicular math', () => {
    const sphere = litFragmentSource('sphere', 8);
    expect(sphere).toContain('if (r2 > 1.0) discard;');
    const limb = litFragmentSource('limb', 8);
    expect(limb).toContain('vPerp * v');
  });
});

describe('litProgramSource', () => {
  it('bundles a matching vertex + fragment pair', () => {
    const src = litProgramSource('sphere', 8);
    expect(src.vertex).toBe(litVertexSource('sphere', 8));
    expect(src.fragment).toBe(litFragmentSource('sphere', 8));
  });

  it('caches by (variant, maxLights) so GlProgram.from can de-dup', () => {
    expect(litProgramSource('sphere', 8)).toBe(litProgramSource('sphere', 8));
    expect(litProgramSource('sphere', 8)).not.toBe(litProgramSource('sphere', 16));
    expect(litProgramSource('sphere', 8)).not.toBe(litProgramSource('limb', 8));
  });
});
