# Dynamic lighting (forward, per-object)

Per-fragment lighting for the arena: point lights attach to game entities (boss
cores, impacts, telegraph charges) and shade lit meshes in real time. Turns flat
2D shapes into volumetric ones and gives combat physical weight.

Built from the "Normal-Mapped Dynamic Lighting" brief, adapted to two facts about
this codebase that the brief (written blind) assumed otherwise. **Read this before
touching the shader or the coordinate math** — both adaptations are load-bearing.

## What's here

| File           | Role                                                                          | Coverage              |
| -------------- | ----------------------------------------------------------------------------- | --------------------- |
| `light.ts`     | `Light` model + `LightManager` — cull/expire/pack into a shared uniform group | unit-tested           |
| `presets.ts`   | `LIGHTING` flag, material presets (§6), per-arena ambient, rig→preset map     | unit-tested           |
| `litShader.ts` | GLSL ES 3.00 source builders for the sphere / limb / textured variants        | unit-tested (strings) |
| `litMesh.ts`   | `LitMesh` = Pixi `Mesh` + the lighting shader; the GPU glue                   | excluded (GPU only)   |

Integration points: `pipeline/renderer.ts` (owns the manager, forces WebGL,
registers hit-flash lights, drives the per-frame update), `rig/rigLayer.ts`
(boss-core glow + telegraph ramp + hit-flash), `rig/rig.ts` (body parts →
sphere-imposter lit meshes).

## Adaptation 1 — coordinate space is SCREEN space (brief §4.4)

The brief's nicer case ("upload lights raw in world space") needs the camera to be
a GPU render group. It isn't: `pipeline/camera.ts` projects world→screen **on the
CPU** (`worldToScreen`, incl. the torus nearest-copy), and the rig positions every
sprite/mesh in screen pixels. No container carries the camera transform, so the
shader's `vScenePos` is **screen space**.

So lights are transformed to screen space before upload: `worldToScreen(light)`,
`z`/`radius` scaled by `camera.scale`, plus the root screen-shake offset (bodies
live under the shaken root, so lights must shake with them). This is the "drifts"
case, resolved by construction rather than by guessing. See
`Renderer.updateLights`. Verified against **PixiJS 8.19.0, 2026-07** — revisit if
the scene graph is restructured into render groups.

## Adaptation 2 — body parts are sphere imposters (brief §3, Path A)

The brief assumed the procedural rig emits skinned mesh geometry. It doesn't — it
draws **tinted baked-sphere sprites** for bodies and stroked `Graphics` for limbs.
That maps _perfectly_ onto the brief's sphere-imposter path: a body part is already
a sphere, so each one becomes a unit-quad `LitMesh` whose fragment shader derives
the normal analytically from the quad UV (`N = vec3(e, sqrt(1 - r²))`). Zero assets,
exact shading, rotation-invariant (matches the old axis-aligned sprite).

The GL program is shared across every sphere mesh (`GlProgram.from` caches by
source); each `LitMesh` owns only a tiny per-instance uniform group (base colour,
emissive, hit-flash) and binds the shared `lights` / `env` / `material` groups.

## Wired in v1

- Sphere-imposter lighting on all rig **body parts** (bosses + players).
- **Hit-flash** lights (§7.1) — 60 ms white pop per impact.
- **Boss-core glow** (§7.2) — persistent coloured light parented to each boss.
- **Telegraph ramp** (§7.3) — the glow brightens + widens with the windup, so the
  arena physically brightens as an attack charges.
- **Per-arena ambient** (§7.5) — mood tint keyed to the lead boss's terrain theme.
- A constant **key light** reproduces the old baked top-left volume, so a surface
  with no dynamic light nearby still reads as a lit sphere.

## Deliberately deferred (follow-ups)

- **Limbs / spine / weapons** stay flat-shaded (they're `Graphics` strokes). The
  `limb` shader variant + `LitMesh` limb geometry exist and are tested, but wiring
  them into the IK mesh builder is brief milestone M3.
- **Textured / normal-map path** (Path B) — the `textured` variant is complete but
  unused (no sprite atlas ships yet; see `sprites/manifest.ts`).
- **WGSL port** (re-enable WebGPU), **bloom** on the emissive/overbright channel,
  **desktop 16-light variant**, on-device perf pass — brief §12 / M6.

## Escape hatch

`LIGHTING.enabled = false` (`presets.ts`) routes lit actors back to the original
baked-sphere sprites — pixel-identical to the pre-lighting look, zero corruption.
Verified via the headless `smoke` test in both states. `maxLights` is the first
knob to turn for fill-rate (§8).
