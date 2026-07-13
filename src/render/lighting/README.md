# Dynamic lighting (forward, per-object)

Per-fragment lighting for the arena: point lights attach to game entities (boss
cores, impacts, telegraph charges) and shade lit meshes in real time. Turns flat
2D shapes into volumetric ones and gives combat physical weight.

Built from the "Normal-Mapped Dynamic Lighting" brief, adapted to two facts about
this codebase that the brief (written blind) assumed otherwise. **Read this before
touching the shader or the coordinate math** — both adaptations are load-bearing.

## What's here

| File              | Role                                                                            | Coverage              |
| ----------------- | ------------------------------------------------------------------------------- | --------------------- |
| `light.ts`        | `Light` model + `LightManager` — cull/expire/pack into a shared uniform group   | unit-tested           |
| `presets.ts`      | `LIGHTING` flag, material presets (§6), per-arena ambient, rig→preset map       | unit-tested           |
| `litShader.ts`    | GLSL ES 3.00 source builders for the sphere / limb / textured variants          | unit-tested (strings) |
| `limbGeometry.ts` | Quad-strip extrusion (centre-line → 2-wide vertex strip) for the `limb` variant | unit-tested           |
| `litMesh.ts`      | `LitMesh` (unit-quad sphere) + `LitLimb` (dynamic bone strip); the GPU glue     | excluded (GPU only)   |

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

## Wired

- Sphere-imposter lighting on all rig **body parts** (bosses + players).
- **Spine segments + limbs** — brief milestone **M3**. Spine segments become
  sphere imposters exactly like body parts; legs / arms / tentacles become
  `LitLimb` quad-strips extruded along each bone (`limbGeometry.ts`) and shaded by
  the `limb` cylinder-imposter variant (`N = vec3(perp·v, √(1−v²))`). The rig
  writes limb centre-lines in screen space and the strip keeps an identity
  transform, so `aPerp` is already in the shader's space (see Adaptation 1).
- **Hit-flash** lights (§7.1) — 60 ms white pop per impact.
- **Boss-core glow** (§7.2) — persistent coloured light parented to each boss.
- **Telegraph ramp** (§7.3) — the glow brightens + widens with the windup, so the
  arena physically brightens as an attack charges.
- **Per-arena ambient** (§7.5) — mood tint keyed to the lead boss's terrain theme.
- A constant **key light** reproduces the old baked top-left volume, so a surface
  with no dynamic light nearby still reads as a lit sphere.
- **Textured normal-map path** (Path B, §3) — pre-rendered sprite bodies. The
  `textured` variant is wired into `SpriteLayer`: a flagged actor renders as a
  `LitMesh({ variant: 'textured' })` that samples a tangent-space normal packed
  beside its albedo (one atlas frame → `setFrame` slides the UV window per
  animation frame), so a sprite catches the same dynamic lights as the rigs. The
  two §3 gotchas are handled **structurally** in the shader: the green channel is
  flipped (Blender +Y-up → Pixi Y-down) under a uniform, and albedo + normal share
  one packed frame read through one UV + a constant offset, so packer trim/rotate
  desync is impossible. Dormant until real normal-mapped art ships — see
  `sprites/manifest.ts` (`NORMAL_MAP`) and the sprites README.

## Deliberately deferred (follow-ups)

- **Weapons** stay flat-shaded `Graphics` strokes (thin, low visual mass — folding
  them into the lit path is optional polish, not part of M3).
- **Normal-mapped art itself** — Path B is wired but no atlas with packed normals
  ships yet, so it's inert (`NORMAL_MAP.enabled = false`); on-GPU tuning of anchor
  offset / material preset per actor waits for real art.
- **WGSL port** (re-enable WebGPU), **bloom** on the emissive/overbright channel,
  **desktop 16-light variant**, on-device perf pass — brief §12 / M6.

## Escape hatch

`LIGHTING.enabled = false` (`presets.ts`) routes lit actors back to the original
baked-sphere sprites — pixel-identical to the pre-lighting look, zero corruption.
Verified via the headless `smoke` test in both states. `maxLights` is the first
knob to turn for fill-rate (§8).
