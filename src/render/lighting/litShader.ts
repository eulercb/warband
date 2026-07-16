/**
 * Warband — lit-mesh GLSL (WebGL / GLSL ES 3.00).
 *
 * A forward, per-fragment lighting program. Three normal variants share ONE
 * lighting function and differ only in how `vec3 N` is produced (brief §3):
 *   - `sphere`   analytic sphere imposter from the quad UV (bodies / heads).
 *   - `limb`     analytic cylinder imposter from a cross-limb coord (bone quads).
 *   - `textured` tangent-space normal map (pre-rendered sprites / props).
 *
 * The source is built per (variant, maxLights) so the light loop unrolls on a
 * compile-time bound, then cached — GlProgram.from de-dups the compiled program
 * across every mesh that shares source, so many LitMeshes cost one program.
 *
 * ── Uniform groups (all plain GL uniforms; verified vs PixiJS 8.19.0) ─────────
 *   globals (auto, group 100): uProjectionMatrix, uWorldTransformMatrix
 *   locals  (auto, group 101): uTransformMatrix
 *   lights  (shared): uLightPosR[N], uLightColI[N], uLightCount
 *   env     (shared): uAmbient, uKeyDir, uKeyColor, uKeyAmount
 *   material(shared): uRimColor, uRimPower, uRimStrength, uSpecStrength, uShininess
 *   model   (per mesh): uBaseColor, uEmissive, uTint, uTexture
 *                       (textured also: uNormalTex, uAtlasUV, uNormalDelta, uNormalFlipG)
 *
 * Author `#version 300 es` first: Pixi strips + re-inserts the version, injects
 * `precision` (downgrading highp→mediump on weak devices), and leaves our
 * `#define`s ahead of the code. Do NOT hardcode precision here.
 */

export type NormalVariant = 'sphere' | 'limb' | 'textured';

const VARIANT_DEFINE: Record<NormalVariant, string> = {
  sphere: 'NORMAL_SPHERE',
  limb: 'NORMAL_LIMB',
  textured: 'NORMAL_TEXTURED',
};

/** Build the vertex source. `limb` also forwards the rotated bone perpendicular. */
export function litVertexSource(variant: NormalVariant, maxLights: number): string {
  const limb = variant === 'limb';
  return `#version 300 es
#define ${VARIANT_DEFINE[variant]}
#define MAX_LIGHTS ${maxLights}
in vec2 aPosition;
in vec2 aUV;
${limb ? 'in vec2 aPerp;\nin float aV;' : ''}

out vec2 vUV;
out vec2 vScenePos;
${limb ? 'out vec2 vPerp;\nout float vV;' : ''}

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
    mat3 model = uWorldTransformMatrix * uTransformMatrix;
    vec3 pos   = model * vec3(aPosition, 1.0);
    vScenePos  = pos.xy;
    gl_Position = vec4((uProjectionMatrix * pos).xy, 0.0, 1.0);
    vUV = aUV;
${
  limb
    ? // Rotate the model-space perpendicular by the 2x2 linear part; normalizing
      // discards scale. Rotation about Z only touches XY, so N.z stays correct.
      '    vPerp = normalize(mat2(model[0].xy, model[1].xy) * aPerp);\n    vV = aV;'
    : ''
}
}
`;
}

/** Build the fragment source for a variant + light budget. */
export function litFragmentSource(variant: NormalVariant, maxLights: number): string {
  const limb = variant === 'limb';
  const textured = variant === 'textured';
  // Textured sprites are packed albedo+normal side-by-side in ONE atlas frame, so
  // the albedo is read through the same frame transform the normal is (see below),
  // never at raw quad UV — that's what keeps the two structurally in lock-step.
  const albedoUV = textured ? 'vUV * uAtlasUV.xy + uAtlasUV.zw' : 'vUV';
  return `#version 300 es
#define ${VARIANT_DEFINE[variant]}
#define MAX_LIGHTS ${maxLights}
in vec2 vUV;
in vec2 vScenePos;
${limb ? 'in vec2 vPerp;\nin float vV;' : ''}

out vec4 fragColor;

uniform sampler2D uTexture;
${
  textured
    ? `uniform sampler2D uNormalTex;   // tangent-space normals (may be the albedo atlas)
uniform vec4  uAtlasUV;         // xy = albedo frame scale, zw = frame offset (atlas UV)
uniform vec2  uNormalDelta;     // constant UV offset albedo->normal in the packed frame
uniform float uNormalFlipG;     // 1 = flip green (Blender +Y up -> Pixi Y down)
uniform float uAoStrength;      // 0..1 baked-AO mix (#48); 0 = off (no AO art yet)`
    : ''
}

// shared light group
uniform vec4  uLightPosR[MAX_LIGHTS];   // xy = pos, z = height, w = radius
uniform vec4  uLightColI[MAX_LIGHTS];   // rgb = colour, a = intensity
uniform float uLightCount;

// shared arena env (mood dial) — a constant key light gives volume with no
// dynamic lights nearby, reproducing the old baked top-left sphere shading.
uniform vec3  uAmbient;
uniform vec3  uKeyDir;
uniform vec3  uKeyColor;
uniform float uKeyAmount;

// shared surface material
uniform vec3  uRimColor;
uniform float uRimPower;
uniform float uRimStrength;
uniform float uSpecStrength;
uniform float uShininess;

// per-mesh instance
uniform vec3  uBaseColor;   // albedo tint (entity / part colour)
uniform float uEmissive;    // self-glow (eyes, runes, cores)
uniform vec4  uTint;        // rgb = flash colour, a = flash amount (hit feedback)

vec3 surfaceNormal() {
#if defined(NORMAL_LIMB)
    float v = clamp(vV, -0.999, 0.999);
    return normalize(vec3(vPerp * v, sqrt(1.0 - v * v)));
#elif defined(NORMAL_SPHERE)
    vec2  e  = (vUV - 0.5) * 2.0;
    float r2 = dot(e, e);
    if (r2 > 1.0) discard;
    return normalize(vec3(e, sqrt(1.0 - r2)));
#else // NORMAL_TEXTURED
    // Sample the normal at the SAME frame transform as the albedo, plus the fixed
    // albedo->normal delta (§3 gotcha 2: albedo + normal share one packed frame, so
    // one UV + a constant offset — trim/rotate desync is structurally impossible).
    vec2 nUV = vUV * uAtlasUV.xy + uAtlasUV.zw + uNormalDelta;
    vec3 nTex = texture(uNormalTex, nUV).rgb;
    // §3 gotcha 1: Blender bakes +Y up, Pixi's Y is down — flip green or every
    // top-lit surface shades bottom-lit (the OpenGL-vs-DirectX convention).
    nTex.g = mix(nTex.g, 1.0 - nTex.g, uNormalFlipG);
    return normalize(nTex * 2.0 - 1.0);
#endif
}

void main() {
    vec4 tex = texture(uTexture, ${albedoUV});
    if (tex.a < 0.004) discard;

    vec3  N = surfaceNormal();
    vec3  V = vec3(0.0, 0.0, 1.0);   // orthographic camera
    vec3  albedo = tex.rgb * uBaseColor;
    float alpha  = tex.a;

    // Constant key light (diffuse only) — the arena's dominant fill.
    vec3 keyN = normalize(uKeyDir);
    vec3 keyTerm = uKeyColor * (uKeyAmount * max(dot(N, keyN), 0.0));

    vec3 diffuse = vec3(0.0);
    vec3 spec    = vec3(0.0);

    // Constant loop bound + break: unrolls cleanly, portable across drivers.
    for (int i = 0; i < MAX_LIGHTS; ++i) {
        if (float(i) >= uLightCount) break;
        vec4  pr = uLightPosR[i];
        vec4  ci = uLightColI[i];
        vec3  toL  = vec3(pr.xy - vScenePos, pr.z);
        float dist = length(toL);
        if (dist > pr.w) continue;
        vec3  L   = toL / max(dist, 1e-4);
        float att = 1.0 - dist / pr.w;
        att      *= att;                              // quadratic, reaches 0 at radius
        vec3  radiance = ci.rgb * ci.a * att;
        float ndl = max(dot(N, L), 0.0);
        diffuse += radiance * ndl;
        vec3 H = normalize(L + V);
        spec  += radiance
               * pow(max(dot(N, H), 0.0), uShininess)
               * uSpecStrength
               * step(1e-3, ndl);                     // no spec on backfacing frags
    }

    float rim = pow(1.0 - clamp(N.z, 0.0, 1.0), uRimPower) * uRimStrength;

    // #48 (brief §12): baked ambient occlusion — a nearly-free contact-darkening
    // multiply on the indirect/ambient term (crevices, under-limbs) that adds
    // depth at zero runtime cost. It's packed in the normal map's ALPHA (normals
    // use rgb only) and read at the SAME frame transform as the normal, so
    // trim/rotate can't desync it. uAoStrength defaults to 0 -> identity, so this
    // is inert until AO-baked art ships with the textured path (#43); the analytic
    // sphere/limb imposters have no authored texture to carry an AO channel, so
    // only the textured variant compiles it.
    vec3 ambient = uAmbient;
#if defined(NORMAL_TEXTURED)
    vec2  aoUV = vUV * uAtlasUV.xy + uAtlasUV.zw + uNormalDelta;
    float ao   = texture(uNormalTex, aoUV).a;
    ambient   *= mix(1.0, ao, uAoStrength);
#endif

    // Additive terms (spec, rim) are multiplied by alpha so premultiplied albedo
    // and un-premultiplied highlights compose without a bright silhouette halo.
    vec3 lit = albedo * (ambient + keyTerm + diffuse + uEmissive)
             + (spec + uRimColor * rim) * alpha;
    lit = mix(lit, uTint.rgb * alpha, uTint.a);
    // item 77: soft-clip the composed colour so compounding lights + the hit-flash
    // tint HIGHLIGHT instead of blowing out to a flat white disc (until a bloom
    // stage, #45, exists to absorb the overflow). Identity below the knee; above
    // it each channel rolls off toward — but never reaches — 1.0, so hue, shading
    // and silhouette survive a hit-heavy multi-attacker fight instead of erasing.
    vec3 over = max(lit - 0.8, 0.0);
    lit = min(lit, vec3(0.8)) + 0.2 * (over / (over + 0.2));
    fragColor = vec4(lit, alpha);
}
`;
}

export interface LitProgramSource {
  vertex: string;
  fragment: string;
}

const sourceCache = new Map<string, LitProgramSource>();

/** Cached `{ vertex, fragment }` for a (variant, maxLights) pair. */
export function litProgramSource(variant: NormalVariant, maxLights: number): LitProgramSource {
  const key = `${variant}:${maxLights}`;
  let src = sourceCache.get(key);
  if (src) return src;
  src = {
    vertex: litVertexSource(variant, maxLights),
    fragment: litFragmentSource(variant, maxLights),
  };
  sourceCache.set(key, src);
  return src;
}
