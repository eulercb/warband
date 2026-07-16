/**
 * Warband — per-device light budget (brief M6 / #46).
 *
 * v1 shipped ONE shader variant at `MAX_LIGHTS = 8` (`DEFAULT_MAX_LIGHTS`), the
 * mobile-safe floor, perf-checked only on desktop Chromium. The bottleneck is
 * fill rate, not light count — every lit fragment runs the whole light loop — so
 * the budget scales with the GPU class, not the scene.
 *
 * The plumbing to raise it was already in place: `litShader.ts` builds its source
 * per `(variant, maxLights)`, every `LitMesh` reads its budget from the
 * `LightManager`, and `LIGHTING.maxLights` is mutable. So picking the desktop
 * 16-light variant is a *detect-and-pick at init* — no new shader code (#46).
 * `Renderer.create` calls `pickMaxLights(probeDeviceCaps(gl))` once, before the
 * `LightManager` is constructed, and the whole chain (manager arrays + every
 * mesh's compiled `MAX_LIGHTS`) is sized to the chosen budget in lock-step.
 *
 * Keep this the FIRST knob to turn if a device is still over its fill-rate budget
 * (§8): a probe only ever raises to the desktop budget or falls back to the
 * floor, and a manual `LIGHTING.maxLights = …` can always lower it further.
 */
import { DEFAULT_MAX_LIGHTS } from './light';

/** The desktop light budget — double the mobile floor (`DEFAULT_MAX_LIGHTS`). */
export const DESKTOP_MAX_LIGHTS = 16;

/**
 * Fragment uniform vectors the 16-light program needs with comfortable headroom.
 * The two light arrays alone are 2 × 16 = 32 `vec4` (32 vectors); env, material,
 * the per-mesh model group and varyings add a handful more. GLSL ES 3.00
 * guarantees `gl_MaxFragmentUniformVectors ≥ 224`, so any real WebGL2 desktop
 * clears this comfortably — but a software / heavily-constrained context that
 * reports fewer keeps the 8-light floor rather than risk a shader link failure.
 */
export const UNIFORM_VECTORS_FOR_16 = 64;

/** The device facts the light-budget tier decision reads. */
export interface DeviceCaps {
  /** Phone/tablet-class device — keep the mobile floor regardless of GL headroom
   *  (a mobile GPU has far less fill rate, which is the real bottleneck). */
  isMobile: boolean;
  /** `gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)`; the safety gate for the
   *  wider light arrays. 0 when the context or the parameter is unavailable. */
  maxFragmentUniformVectors: number;
}

/**
 * Pure tier decision (brief M6 / #46): the desktop budget only on a non-mobile
 * device whose GL context has room for the wider light arrays; the mobile floor
 * otherwise. Pure + total, so it unit-tests without a GPU — the lighting module's
 * standing convention (cf. `light.ts`'s `selectLights`).
 */
export function pickMaxLights(caps: DeviceCaps): number {
  if (caps.isMobile) return DEFAULT_MAX_LIGHTS;
  if (caps.maxFragmentUniformVectors < UNIFORM_VECTORS_FOR_16) return DEFAULT_MAX_LIGHTS;
  return DESKTOP_MAX_LIGHTS;
}

/** Minimal structural view of the GL parameter reader we need (WebGL 1 or 2). */
interface GlParamReader {
  getParameter(pname: number): unknown;
  readonly MAX_FRAGMENT_UNIFORM_VECTORS: number;
}

/**
 * Read this device's capabilities from the live GL context and the host
 * environment. Impure and deliberately defensive: it takes the renderer's raw
 * context as `unknown` (a WebGPU/canvas renderer has none) and any missing
 * global, wrong shape, or throwing / lost context yields the conservative shape
 * that `pickMaxLights` maps to the 8-light floor. It never throws — a probe
 * failure must only ever keep the safe budget, never break rendering.
 */
export function probeDeviceCaps(gl: unknown): DeviceCaps {
  let maxFragmentUniformVectors = 0;
  try {
    const reader = gl as GlParamReader | null;
    if (reader && typeof reader.getParameter === 'function') {
      const v = reader.getParameter(reader.MAX_FRAGMENT_UNIFORM_VECTORS);
      if (typeof v === 'number' && Number.isFinite(v)) maxFragmentUniformVectors = v;
    }
  } catch {
    maxFragmentUniformVectors = 0;
  }
  return { isMobile: isMobileDevice(), maxFragmentUniformVectors };
}

/**
 * Coarse phone/tablet detection. The UA token covers the common cases; iPadOS 13+
 * masquerades as desktop Safari, so a coarse-pointer + genuine multi-touch device
 * is treated as mobile too (a plain desktop-with-mouse never matches both). This
 * is conservative by design: a false "mobile" only costs a few lights, never
 * correctness.
 */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk|Kindle/i.test(ua)
  ) {
    return true;
  }
  // iPadOS-as-Mac tiebreak: require BOTH a coarse pointer AND real multi-touch.
  const coarse =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches === true;
  const multiTouch = (navigator.maxTouchPoints ?? 0) > 1;
  return coarse && multiTouch;
}
