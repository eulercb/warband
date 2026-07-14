/**
 * Warband — a single articulated rig instance.
 *
 * Retained STATE (planted feet, spine points, smoothed velocity), immediate
 * DRAW. Each frame `update()` advances the gait / chain from the entity's screen
 * position + facing, then repaints: body parts are tinted sphere sprites (one
 * shared texture), and limbs / spine slither / tentacles / decor are stroked onto
 * a small stack of `Graphics`. The pure math (IK / gait / chain) lives in `math/`
 * and is unit-tested; everything here is the imperative glue that drives it.
 *
 * When dynamic lighting is on, the shaded shapes become per-fragment-lit imposters
 * instead: body parts + spine segments are sphere-imposter `LitMesh`es, and legs /
 * arms / tentacles are cylinder-imposter `LitLimb` quad-strips extruded along each
 * bone. Weapons + decor stay stroked. `LIGHTING.enabled = false` (or no
 * `LightManager`) routes everything back to the sprite/stroke look, pixel-identical.
 *
 * The `view` Container interleaves sub-layers back → front so limbs sort correctly
 * against the body:
 *   ground shadows → behind limbs(lit legs/tentacles) → behind graphics(stroked
 *   legs/tentacles) → behind sprites → main sprites/meshes(spine+body) → front
 *   limbs(lit arms/tentacles) → front graphics(stroked arms/weapon) → front
 *   sprites/meshes(head) → decor.
 */
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { EntityId } from '../../engine/core/types';
import type { Vec2 } from './math/vec';
import { vperp } from './math/vec';
import { solveTwoBone } from './math/ik';
import { updateGait, makeLeg, type LegRuntime, type GaitParams } from './math/gait';
import { updateChain, makeChain } from './math/chain';
import { drawLimb, contactShadow, footShadow, lighten, darken, mixColor } from './shading';
import type { RigSpec, BodyPartSpec, RigDriveCtx } from './types';
import { LitMesh, LitLimb } from '../lighting/litMesh';
import { LIGHTING, RIG_MATERIAL } from '../lighting/presets';
import type { LightManager } from '../lighting/light';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Screen speed (px/s) below which a body is treated as idle. */
const EPS_MOVE = 8;
/** Velocity smoothing time-constant (s). */
const VEL_TAU = 0.09;
/** Attack-swing envelope duration (s) for event-driven melee/ranged strikes. */
const ATTACK_DUR = 0.28;
const ENRAGE_TINT = 0xff3b30;

export class CreatureRig {
  readonly view = new Container();

  private readonly gGround = new Graphics();
  private readonly behindLimbC = new Container();
  private readonly gBehind = new Graphics();
  private readonly behindC = new Container();
  private readonly mainC = new Container();
  private readonly frontLimbC = new Container();
  private readonly gFront = new Graphics();
  private readonly frontC = new Container();
  private readonly gDecor = new Graphics();

  private readonly partSprites = new Map<string, Sprite>();
  /** Lit sphere-imposter body parts, when dynamic lighting is on (else empty). */
  private readonly partMeshes = new Map<string, LitMesh>();
  private readonly lit: boolean;
  private readonly spineSprites: Sprite[] = [];
  /** Lit sphere-imposter spine segments, when lighting is on (else spineSprites). */
  private readonly spineMeshes: LitMesh[] = [];
  /** Lit cylinder-imposter limb strips, when lighting is on (else stroked graphics). */
  private readonly legMeshes: LitLimb[] = [];
  private readonly armMeshes: LitLimb[] = [];
  private readonly tentacleMeshes: LitLimb[] = [];
  private readonly legs: LegRuntime[] = [];
  private readonly legHomes: Vec2[] = [];
  private readonly jitterVals: number[] = [];
  private chain: Vec2[] = [];

  private origin: Vec2 = { x: 0, y: 0 };
  private lastPos: Vec2 = { x: 0, y: 0 };
  private vel: Vec2 = { x: 0, y: 0 };
  private facing = 0;
  private cos = 1;
  private sin = 0;
  private legAround = 0;
  private seeded = false;

  private attackAge = -1; // < 0 = no active attack swing

  constructor(
    readonly spec: RigSpec,
    readonly id: EntityId,
    sphereTex: Texture,
    private readonly baseRadius: number,
    lights: LightManager | null = null,
  ) {
    this.view.addChild(
      this.gGround,
      this.behindLimbC,
      this.gBehind,
      this.behindC,
      this.mainC,
      this.frontLimbC,
      this.gFront,
      this.frontC,
      this.gDecor,
    );

    // Body parts become per-fragment-lit sphere imposters when a LightManager is
    // supplied and lighting is enabled; otherwise they stay baked-sphere sprites
    // (the escape hatch — pixel-identical to the pre-lighting look). Limbs, spine
    // and decor keep their current shading in v1 (a documented follow-up).
    this.lit = lights != null && LIGHTING.enabled;
    const preset = RIG_MATERIAL[spec.id];

    // Spine segments draw under the body parts (added to mainC first). Lit: sphere
    // imposters exactly like body parts; unlit: the original tinted sprites.
    if (spec.spine) {
      for (let i = 0; i < spec.spine.segments; i++) {
        if (this.lit) {
          const m = new LitMesh({
            variant: 'sphere',
            maxLights: lights!.maxLights,
            lights: lights!,
            preset,
          });
          this.mainC.addChild(m);
          this.spineMeshes.push(m);
        } else {
          const s = new Sprite(sphereTex);
          s.anchor.set(0.5);
          this.mainC.addChild(s);
          this.spineSprites.push(s);
        }
      }
    }

    for (const part of spec.parts) {
      if (this.lit) {
        const m = new LitMesh({
          variant: 'sphere',
          maxLights: lights!.maxLights,
          lights: lights!,
          preset,
        });
        this.parentFor(part.z).addChild(m);
        this.partMeshes.set(part.id, m);
      } else {
        const s = new Sprite(sphereTex);
        s.anchor.set(0.5);
        this.parentFor(part.z).addChild(s);
        this.partSprites.set(part.id, s);
      }
    }

    // Limbs become cylinder-imposter strips when lit (one `LitLimb` per leg / arm /
    // tentacle, reshaped each frame in draw); otherwise they stay stroked graphics.
    // A leg/arm is a 3-point centre-line (shoulder → joint → tip); a tentacle is
    // one point per segment plus the anchor. Weapons stay stroked.
    if (this.lit) {
      const litLimb = (points: number): LitLimb =>
        new LitLimb({ points, maxLights: lights!.maxLights, lights: lights!, preset });
      if (spec.legs) {
        for (let i = 0; i < spec.legs.count; i++) {
          const m = litLimb(3);
          this.behindLimbC.addChild(m);
          this.legMeshes.push(m);
        }
      }
      if (spec.arms) {
        for (let i = 0; i < spec.arms.length; i++) {
          const m = litLimb(3);
          this.frontLimbC.addChild(m);
          this.armMeshes.push(m);
        }
      }
      if (spec.tentacles) {
        for (const t of spec.tentacles) {
          const m = litLimb(t.segments + 1);
          ((t.z ?? 'behind') === 'front' ? this.frontLimbC : this.behindLimbC).addChild(m);
          this.tentacleMeshes.push(m);
        }
      }
    }

    if (spec.legs) {
      for (let i = 0; i < spec.legs.count; i++) {
        this.legs.push(makeLeg({ x: 0, y: 0 }));
        this.legHomes.push({ x: 0, y: 0 });
        // Deterministic per-leg threshold jitter seeded from the entity id, so a
        // given creature's gait looks stable frame-to-frame (avoids popping).
        const frac = ((Math.imul(id, 2654435761) + Math.imul(i, 40503)) >>> 0) / 4294967296;
        this.jitterVals.push(0.85 + frac * 0.4);
      }
    }
  }

  private parentFor(z: BodyPartSpec['z']): Container {
    return z === 'behind' ? this.behindC : z === 'front' ? this.frontC : this.mainC;
  }

  /** Trigger a one-shot weapon swing (humanoid attack), consumed at draw time. */
  triggerAttack(): void {
    this.attackAge = 0;
  }

  /**
   * Advance + repaint one frame. `pos` / `facing` are the entity's smoothed screen
   * position and primary orientation (aim for a humanoid, facing for a creature);
   * `scale` is the camera world→screen factor.
   */
  update(
    pos: Vec2,
    facing: number,
    scale: number,
    dtMs: number,
    timeSec: number,
    ctx: RigDriveCtx,
  ): void {
    const dt = clamp(dtMs, 1, 100) / 1000;
    const R = this.baseRadius * scale;
    this.facing = facing;
    this.cos = Math.cos(facing);
    this.sin = Math.sin(facing);

    // Screen-space velocity (EMA), with a teleport guard that re-seeds feet so a
    // blink doesn't stretch a limb across the arena for one frame.
    const jump = Math.hypot(pos.x - this.lastPos.x, pos.y - this.lastPos.y);
    if (!this.seeded || jump > Math.max(320, 9 * R)) {
      this.origin = { x: pos.x, y: pos.y };
      this.lastPos = { x: pos.x, y: pos.y };
      this.vel = { x: 0, y: 0 };
      this.seedFeet(R);
      this.seedChain(R);
      this.seeded = true;
    } else {
      const raw = { x: (pos.x - this.lastPos.x) / dt, y: (pos.y - this.lastPos.y) / dt };
      const a = 1 - Math.exp(-dt / VEL_TAU);
      this.vel = {
        x: this.vel.x + (raw.x - this.vel.x) * a,
        y: this.vel.y + (raw.y - this.vel.y) * a,
      };
      this.origin = { x: pos.x, y: pos.y };
      this.lastPos = { x: pos.x, y: pos.y };
    }

    const speed = Math.hypot(this.vel.x, this.vel.y);
    const moving = speed > EPS_MOVE;
    const moveDir: Vec2 = moving
      ? { x: this.vel.x / speed, y: this.vel.y / speed }
      : { x: 0, y: 0 };

    if (this.attackAge >= 0) {
      this.attackAge += dt;
      if (this.attackAge > ATTACK_DUR) this.attackAge = -1;
    }

    const downed = ctx.state === 'downed';
    if (this.spec.legs) {
      // Downed: don't gait, but still anchor feet under the body each frame so a
      // collapsed hero's legs track the body when the camera pans (no detach).
      if (downed) this.settleLegs(R);
      else this.updateLegs(R, moveDir, moving, dt, ctx);
    }
    if (this.spec.spine) this.updateSpine(R);

    this.draw(R, timeSec, ctx, downed);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  // --- state advance ---------------------------------------------------------

  private legAngleAround(moving: boolean): number {
    if (this.spec.legs?.around === 'velocity') {
      return moving ? Math.atan2(this.vel.y, this.vel.x) : this.facing;
    }
    return this.facing;
  }

  private computeHomes(R: number, around: number): void {
    const lg = this.spec.legs!;
    const anchor = this.bodyPoint(this.partLocal(lg.anchorPart), R);
    for (let i = 0; i < lg.count; i++) {
      const ang = around + (lg.baseAngleDeg(i) * Math.PI) / 180;
      const d = lg.homeDist(i) * R;
      this.legHomes[i] = { x: anchor.x + Math.cos(ang) * d, y: anchor.y + Math.sin(ang) * d };
    }
  }

  private seedFeet(R: number): void {
    if (!this.spec.legs) return;
    this.legAround = this.legAngleAround(false);
    this.computeHomes(R, this.legAround);
    for (let i = 0; i < this.legs.length; i++) this.legs[i] = makeLeg(this.legHomes[i]);
  }

  /** Collapse pose: snap every foot to its rest home under the body (no gait). */
  private settleLegs(R: number): void {
    this.legAround = this.legAngleAround(false);
    this.computeHomes(R, this.legAround);
    for (let i = 0; i < this.legs.length; i++) {
      const l = this.legs[i];
      l.foot = { x: this.legHomes[i].x, y: this.legHomes[i].y };
      l.stepping = false;
      l.t = 0;
    }
  }

  private updateLegs(
    R: number,
    moveDir: Vec2,
    moving: boolean,
    dt: number,
    ctx: RigDriveCtx,
  ): void {
    const lg = this.spec.legs!;
    this.legAround = this.legAngleAround(moving);
    this.computeHomes(R, this.legAround);
    const stride = lg.gait.partnerStride;
    const params: GaitParams = {
      stepDistance: lg.gait.stepDistance * R,
      stepDuration: lg.gait.stepDuration * (ctx.enraged ? 0.7 : 1),
      overstep: lg.gait.overstep * R,
      maxConcurrent: lg.gait.maxConcurrent,
      partnerOf: (i) => (i + stride) % lg.count,
      jitter: (i) => this.jitterVals[i],
    };
    updateGait(this.legs, this.legHomes, moveDir, dt, params);
  }

  private seedChain(R: number): void {
    if (!this.spec.spine) return;
    const head = this.bodyPoint({ x: 0, y: 0 }, R);
    const back = { x: -this.cos, y: -this.sin };
    this.chain = makeChain(head, back, this.spec.spine.segments, this.spec.spine.spacing * R);
  }

  private updateSpine(R: number): void {
    const sp = this.spec.spine!;
    const head = this.bodyPoint({ x: 0, y: 0 }, R);
    if (this.chain.length !== sp.segments) this.seedChain(R);
    updateChain(this.chain, head, sp.spacing * R, sp.ease);
  }

  // --- draw ------------------------------------------------------------------

  private draw(R: number, timeSec: number, ctx: RigDriveCtx, downed: boolean): void {
    this.gGround.clear();
    this.gBehind.clear();
    this.gFront.clear();
    this.gDecor.clear();

    const windupT = this.windupAmount(ctx);
    const breathe = this.spec.idle
      ? 1 + this.spec.idle.breatheAmp * Math.sin(timeSec * this.spec.idle.breatheFreq)
      : 1;
    // Victory dance: rhythmic full-body hops while the cheer is live. In the
    // top-down view a scale pulse reads as jumping for joy.
    const cheerPulse = ctx.cheer != null ? Math.abs(Math.sin(ctx.cheer * 5.5)) : 0;
    const bodyScale = (downed ? 1 : breathe) * (1 + 0.14 * windupT) * (1 + 0.13 * cheerPulse);

    const anchorLocal = this.spec.legs ? this.partLocal(this.spec.legs.anchorPart) : { x: 0, y: 0 };
    const shadowAt = this.bodyPoint(anchorLocal, R);
    contactShadow(this.gGround, shadowAt.x, shadowAt.y, R * 1.05, R * 0.5);

    if (this.spec.tentacles) this.drawTentacles(R, timeSec, ctx);
    if (this.spec.legs) this.drawLegs(R, windupT, ctx, downed);
    if (this.spec.spine) this.drawSpine(R, timeSec, bodyScale, ctx);

    this.drawBodyParts(R, bodyScale, downed, ctx);

    if (this.spec.arms) this.drawArms(R, ctx, downed);
    if (this.spec.weapon && !downed) this.drawWeapon(R, ctx);
    if (this.spec.decor) this.drawDecor(R, ctx);
  }

  private drawBodyParts(R: number, bodyScale: number, downed: boolean, ctx: RigDriveCtx): void {
    for (const part of this.spec.parts) {
      const p = this.bodyPoint(part.local, R);
      const rx = part.rx * R * bodyScale;
      const ry = part.ry * R * bodyScale * (downed ? 0.72 : 1);
      const alpha = downed ? 0.85 : 1;
      if (this.lit) {
        // Lit path: base colour excludes the flash (that rides the shader's white
        // pop instead), and the sphere imposter is drawn axis-aligned like the
        // sprite — a sphere's shading is rotation-invariant.
        const m = this.partMeshes.get(part.id)!;
        m.setPose(p.x, p.y, rx, ry);
        // item 77: flash toward a LIGHTENED version of the body's own colour, not
        // pure white, so even a full-strength hit-flash keeps the palette's hue and
        // the silhouette instead of erasing the body to a white disc.
        const base = this.partColor(part.tint, ctx, false);
        m.setMaterial(base, 0, ctx.flash, lighten(base, 0.6));
        m.alpha = alpha;
      } else {
        const s = this.partSprites.get(part.id)!;
        s.position.set(p.x, p.y);
        s.width = 2 * rx;
        s.height = 2 * ry;
        s.tint = this.partColor(part.tint, ctx);
        s.alpha = alpha;
      }
    }
  }

  private drawLegs(R: number, windupT: number, ctx: RigDriveCtx, downed: boolean): void {
    const lg = this.spec.legs!;
    const anchor = this.bodyPoint(this.partLocal(lg.anchorPart), R);
    const around = this.legAround;
    // Lit: the hit-flash rides the shader, so keep it out of the stroke/albedo colour.
    const legColor = this.limbColor(darken(ctx.color, 0.35), ctx, !this.lit);
    const wRoot = lg.legWidthRoot * R;
    const wTip = lg.legWidthTip * R;
    const bipedRef = this.bipedBendRef(R);

    for (let i = 0; i < lg.count; i++) {
      const baseAng = (lg.baseAngleDeg(i) * Math.PI) / 180;
      const shoulder = {
        x: anchor.x + Math.cos(around + baseAng) * lg.attachDist * R,
        y: anchor.y + Math.sin(around + baseAng) * lg.attachDist * R,
      };
      const leg = this.legs[i];
      // Clamp the planted foot to the leg's full reach from the hip. When the
      // body outruns the gait (fast movement, one-foot-at-a-time biped) a foot
      // can lag arbitrarily far behind; without this the two-bone solve draws a
      // fully-extended straight limb that reads as a leg "stretching forever".
      const maxReach = (lg.l1 + lg.l2) * R * 0.98;
      const planted = clampToReach(leg.foot, shoulder, maxReach);
      // Front-leg raise telegraph: legs pointing forward lift during a windup.
      const forwardness = Math.cos(baseAng);
      const raise =
        windupT > 0 && forwardness > 0.2 ? windupT * forwardness * lg.liftHeight * R : 0;
      const lift = leg.stepping ? Math.sin(Math.PI * leg.t) * lg.liftHeight * R : 0;
      const foot = { x: planted.x, y: planted.y - lift - raise };

      if (!leg.stepping && !downed) footShadow(this.gGround, planted.x, planted.y, wTip * 1.6);

      const bendRef = lg.bendOutward ? anchor : bipedRef;
      const knee = solveTwoBone(shoulder, foot, lg.l1 * R, lg.l2 * R, bendRef);
      if (this.lit) {
        // Quad-strip along shoulder → knee → foot, half-widths tapering root → tip.
        const m = this.legMeshes[i];
        m.setStrip([shoulder, knee, foot], [wRoot * 0.5, (wRoot + wTip) * 0.25, wTip * 0.5]);
        m.setMaterial(legColor, 0, ctx.flash);
      } else {
        drawLimb(this.gBehind, shoulder, knee, foot, wRoot, wTip, legColor);
      }
    }
  }

  private drawSpine(R: number, timeSec: number, bodyScale: number, ctx: RigDriveCtx): void {
    const sp = this.spec.spine!;
    // Lit: the hit-flash rides the shader's white pop, so keep it out of the albedo.
    const color = this.partColor('base', ctx, !this.lit);
    const n = this.lit ? this.spineMeshes.length : this.spineSprites.length;
    for (let i = 0; i < n; i++) {
      const pt = this.chain[i];
      const prev = i === 0 ? this.bodyPoint({ x: 0, y: 0 }, R) : this.chain[i - 1];
      const dir = normalizeOr({ x: pt.x - prev.x, y: pt.y - prev.y }, { x: this.cos, y: this.sin });
      const perp = vperp(dir);
      const wave = Math.sin(timeSec * sp.sinFreq + i * 0.6) * sp.sinAmp * R;
      const t = i / Math.max(1, n - 1);
      const seg = 1 - t + t * sp.taper; // taper head → tail
      const cx = pt.x + perp.x * wave;
      const cy = pt.y + perp.y * wave;
      const halfW = sp.rx * R * seg * bodyScale;
      const halfH = sp.ry * R * seg * bodyScale;
      if (this.lit) {
        const m = this.spineMeshes[i];
        m.setPose(cx, cy, halfW, halfH);
        m.setMaterial(color, 0, ctx.flash);
      } else {
        const s = this.spineSprites[i];
        s.position.set(cx, cy);
        s.width = 2 * halfW;
        s.height = 2 * halfH;
        s.tint = color;
      }
    }
  }

  private drawTentacles(R: number, timeSec: number, ctx: RigDriveCtx): void {
    const tentacles = this.spec.tentacles!;
    const color = this.limbColor(darken(ctx.color, 0.2), ctx, !this.lit);
    for (let ti = 0; ti < tentacles.length; ti++) {
      const t = tentacles[ti];
      const anchor = this.bodyPoint(this.partLocal(t.anchorPart), R);
      let ang = this.facing + (t.baseAngleDeg * Math.PI) / 180;
      let px = anchor.x;
      let py = anchor.y;
      const reachBias = t.reach === 'telegraph' ? this.windupAmount(ctx) * 0.25 : 0;
      if (this.lit) {
        // Collect the curled centre-line (anchor + one point per segment) and taper
        // the half-width toward the tip, then drive the cylinder-imposter strip.
        const pts: Vec2[] = [{ x: px, y: py }];
        const hw: number[] = [t.width * R * 0.5];
        for (let i = 0; i < t.segments; i++) {
          const curl = Math.sin(timeSec * t.sinFreq + t.phase + i * 0.5) * t.sinAmp + reachBias;
          ang += curl;
          px += Math.cos(ang) * t.segLen * R;
          py += Math.sin(ang) * t.segLen * R;
          pts.push({ x: px, y: py });
          hw.push(t.width * R * 0.5 * (1 - (i + 1) / (t.segments + 1)));
        }
        const m = this.tentacleMeshes[ti];
        m.setStrip(pts, hw);
        m.setMaterial(color, 0, ctx.flash);
      } else {
        const g = (t.z ?? 'behind') === 'front' ? this.gFront : this.gBehind;
        for (let i = 0; i < t.segments; i++) {
          const curl = Math.sin(timeSec * t.sinFreq + t.phase + i * 0.5) * t.sinAmp + reachBias;
          ang += curl;
          const nx = px + Math.cos(ang) * t.segLen * R;
          const ny = py + Math.sin(ang) * t.segLen * R;
          const w = t.width * R * (1 - i / (t.segments + 1));
          g.moveTo(px, py)
            .lineTo(nx, ny)
            .stroke({ width: Math.max(1, w), color, cap: 'round' });
          px = nx;
          py = ny;
        }
        g.circle(px, py, Math.max(1, t.width * R * 0.4)).fill({ color: darken(color, 0.2) });
      }
    }
  }

  private drawArms(R: number, ctx: RigDriveCtx, downed: boolean): void {
    const arms = this.spec.arms!;
    const color = this.limbColor(darken(ctx.color, 0.25), ctx, !this.lit);
    const center = this.origin;
    const grip = this.gripPoint(R, ctx, downed);
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const shoulder = this.bodyPoint(arm.shoulderLocal, R);
      const hand = downed
        ? this.bodyPoint({ x: -0.2, y: arm.side * 1.3 }, R)
        : {
            x: grip.x + this.cos * arm.side * 0.12 * R,
            y: grip.y + this.sin * arm.side * 0.12 * R,
          };
      const bendRef = arm.bendOutward
        ? center
        : { x: center.x + this.cos * 6 * R, y: center.y + this.sin * 6 * R };
      const elbow = solveTwoBone(shoulder, hand, arm.l1 * R, arm.l2 * R, bendRef);
      const wRoot = arm.width * R;
      const wTip = arm.width * R * 0.8;
      if (this.lit) {
        const m = this.armMeshes[i];
        m.setStrip([shoulder, elbow, hand], [wRoot * 0.5, (wRoot + wTip) * 0.25, wTip * 0.5]);
        m.setMaterial(color, 0, ctx.flash);
      } else {
        drawLimb(this.gFront, shoulder, elbow, hand, wRoot, wTip, color);
      }
    }
  }

  private drawWeapon(R: number, ctx: RigDriveCtx): void {
    const w = this.spec.weapon!;
    const grip = this.gripPoint(R, ctx, false);
    const g = this.gFront;
    const fx = this.cos;
    const fy = this.sin;
    const perp = { x: -fy, y: fx };
    const metal = 0xcdd2da;
    const swing =
      this.attackAge >= 0 ? Math.sin(Math.PI * clamp(this.attackAge / ATTACK_DUR, 0, 1)) : 0;

    const at = (fwd: number, side = 0): Vec2 => ({
      x: grip.x + fx * fwd * R + perp.x * side * R,
      y: grip.y + fy * fwd * R + perp.y * side * R,
    });

    switch (w.kind) {
      case 'sword': {
        const tip = at(w.length);
        g.moveTo(grip.x, grip.y)
          .lineTo(tip.x, tip.y)
          .stroke({ width: 0.16 * R, color: metal, cap: 'round' });
        const gA = at(0, 0.28);
        const gB = at(0, -0.28);
        g.moveTo(gA.x, gA.y)
          .lineTo(gB.x, gB.y)
          .stroke({ width: 0.1 * R, color: w.color });
        g.circle(grip.x, grip.y, 0.12 * R).fill({ color: w.color });
        break;
      }
      case 'axe': {
        const haft = at(w.length);
        g.moveTo(grip.x, grip.y)
          .lineTo(haft.x, haft.y)
          .stroke({ width: 0.14 * R, color: 0x6b4a2a, cap: 'round' });
        const a = at(w.length * 0.72, 0.34);
        const b = at(w.length * 0.72, -0.05);
        const c = at(w.length * 0.98, 0.05);
        g.poly([a.x, a.y, b.x, b.y, c.x, c.y]).fill({ color: metal });
        break;
      }
      case 'mace': {
        const head = at(w.length);
        g.moveTo(grip.x, grip.y)
          .lineTo(head.x, head.y)
          .stroke({ width: 0.12 * R, color: 0x8a7a5a, cap: 'round' });
        g.circle(head.x, head.y, 0.26 * R).fill({ color: metal });
        break;
      }
      case 'dagger': {
        const tip = at(w.length);
        g.moveTo(grip.x, grip.y)
          .lineTo(tip.x, tip.y)
          .stroke({ width: 0.13 * R, color: metal, cap: 'round' });
        g.circle(grip.x, grip.y, 0.1 * R).fill({ color: w.color });
        if (w.offhand === 'dagger') {
          const o = at(w.length * 0.85, -0.5);
          const ob = at(0, -0.5);
          g.moveTo(ob.x, ob.y)
            .lineTo(o.x, o.y)
            .stroke({ width: 0.11 * R, color: metal, cap: 'round' });
        }
        break;
      }
      case 'bow': {
        const top = at(0, 0.9);
        const bot = at(0, -0.9);
        const belly = at(0.5 + swing * 0.2);
        g.moveTo(top.x, top.y)
          .quadraticCurveTo(belly.x, belly.y, bot.x, bot.y)
          .stroke({ width: 0.09 * R, color: w.color });
        const nock = at(-0.15 - swing * 0.35);
        g.moveTo(top.x, top.y)
          .lineTo(nock.x, nock.y)
          .lineTo(bot.x, bot.y)
          .stroke({ width: 0.04 * R, color: metal });
        break;
      }
      case 'staff': {
        const tip = at(w.length);
        g.moveTo(grip.x, grip.y)
          .lineTo(tip.x, tip.y)
          .stroke({ width: 0.11 * R, color: 0x6b4a2a, cap: 'round' });
        const glow = 0.22 * R * (1 + 0.4 * swing);
        g.circle(tip.x, tip.y, glow * 1.6).fill({ color: w.color, alpha: 0.25 });
        g.circle(tip.x, tip.y, glow).fill({ color: lighten(w.color, 0.3) });
        break;
      }
      case 'claws': {
        for (let k = -1; k <= 1; k++) {
          const tip = at(w.length, k * 0.28);
          g.moveTo(grip.x, grip.y)
            .lineTo(tip.x, tip.y)
            .stroke({ width: 0.06 * R, color: metal, cap: 'round' });
        }
        break;
      }
      case 'shield':
        break;
    }

    // Off-hand shield (paladin): a small rounded plate to the side/back.
    if (w.offhand === 'shield') {
      const c = this.bodyPoint({ x: -0.1, y: -0.85 }, R);
      g.roundRect(c.x - 0.34 * R, c.y - 0.44 * R, 0.68 * R, 0.88 * R, 0.18 * R).fill({
        color: w.color,
      });
      g.roundRect(c.x - 0.34 * R, c.y - 0.44 * R, 0.68 * R, 0.88 * R, 0.18 * R).stroke({
        width: 0.06 * R,
        color: darken(w.color, 0.3),
      });
    }
  }

  private drawDecor(R: number, ctx: RigDriveCtx): void {
    const g = this.gDecor;
    for (const d of this.spec.decor!) {
      const anchorLocal = this.partLocal(d.anchorPart);
      const base = this.bodyPoint(anchorLocal, R);
      const at = this.bodyPoint({ x: anchorLocal.x + d.local.x, y: anchorLocal.y + d.local.y }, R);
      const color = d.color ?? lighten(ctx.color, 0.4);
      switch (d.kind) {
        case 'eyes': {
          const n = d.count ?? 8;
          for (let i = 0; i < n; i++) {
            const a = this.facing + ((i - (n - 1) / 2) / n) * 1.6;
            const rr = d.scale * R * (0.7 + 0.5 * (i % 2));
            g.circle(at.x + Math.cos(a) * rr, at.y + Math.sin(a) * rr, d.scale * R * 0.5).fill({
              color,
            });
          }
          break;
        }
        case 'marking': {
          const s = d.scale * R;
          g.poly([at.x, at.y - s, at.x + s * 0.7, at.y, at.x, at.y + s, at.x - s * 0.7, at.y]).fill(
            {
              color,
            },
          );
          break;
        }
        case 'mandible': {
          const s = d.scale * R;
          g.ellipse(at.x, at.y, s, s * 0.5).fill({ color: darken(ctx.color, 0.5) });
          break;
        }
        case 'horn': {
          const n = d.count ?? 2;
          const s = d.scale * R;
          for (let i = 0; i < n; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const bx = base.x - this.sin * side * 0.4 * R;
            const by = base.y + this.cos * side * 0.4 * R;
            const tx = bx + this.cos * s - this.sin * side * 0.2 * R;
            const ty = by + this.sin * s + this.cos * side * 0.2 * R;
            g.moveTo(bx, by)
              .lineTo(tx, ty)
              .stroke({ width: s * 0.35, color, cap: 'round' });
          }
          break;
        }
      }
    }
  }

  // --- pose helpers ----------------------------------------------------------

  private gripPoint(R: number, ctx: RigDriveCtx, downed: boolean): Vec2 {
    const w = this.spec.weapon;
    let dist = 1.5;
    if (!downed && w) {
      const swing =
        this.attackAge >= 0 ? Math.sin(Math.PI * clamp(this.attackAge / ATTACK_DUR, 0, 1)) : 0;
      if (w.style === 'melee') {
        dist *= 1 + 0.45 * swing;
      } else {
        const cast = ctx.castSlot != null && ctx.castT != null ? clamp(ctx.castT, 0, 1) : 0;
        dist *= 1 - 0.3 * cast + 0.35 * swing;
      }
    }
    return { x: this.origin.x + this.cos * dist * R, y: this.origin.y + this.sin * dist * R };
  }

  /** Biped knee bias: bend toward the travel direction (none when idle). */
  private bipedBendRef(R: number): Vec2 {
    const s = Math.hypot(this.vel.x, this.vel.y);
    if (s < EPS_MOVE) return { x: this.origin.x, y: this.origin.y };
    return {
      x: this.origin.x - (this.vel.x / s) * 8 * R,
      y: this.origin.y - (this.vel.y / s) * 8 * R,
    };
  }

  private windupAmount(ctx: RigDriveCtx): number {
    switch (ctx.action) {
      case 'windup':
        return clamp(ctx.telegraphT ?? 0.5, 0, 1);
      case 'channel':
        return 1;
      case 'recover':
        return 0.3;
      default:
        return 0;
    }
  }

  private partColor(tint: BodyPartSpec['tint'], ctx: RigDriveCtx, withFlash = true): number {
    let c = tint == null || tint === 'base' ? ctx.color : tint;
    if (ctx.enraged) c = mixColor(c, ENRAGE_TINT, 0.35);
    // The lit path drives the hit-flash through the shader (a white pop) instead
    // of lightening the albedo, so it opts out of the colour-space flash here.
    if (withFlash && ctx.flash > 0) c = lighten(c, clamp(ctx.flash, 0, 1) * 0.85);
    return c;
  }

  private limbColor(c: number, ctx: RigDriveCtx, withFlash = true): number {
    let out = c;
    if (ctx.enraged) out = mixColor(out, ENRAGE_TINT, 0.3);
    // The lit path drives the hit-flash through the shader (a white pop), so it opts
    // out of the colour-space flash here (matching `partColor`).
    if (withFlash && ctx.flash > 0) out = lighten(out, clamp(ctx.flash, 0, 1) * 0.7);
    return out;
  }

  private partLocal(id: string): Vec2 {
    const p = this.spec.parts.find((q) => q.id === id);
    return p ? p.local : { x: 0, y: 0 };
  }

  /** Body-local → screen: rotate `local * R` by facing and offset from origin. */
  private bodyPoint(local: Vec2, R: number): Vec2 {
    const lx = local.x * R;
    const ly = local.y * R;
    return {
      x: this.origin.x + lx * this.cos - ly * this.sin,
      y: this.origin.y + lx * this.sin + ly * this.cos,
    };
  }
}

// --- free helpers ------------------------------------------------------------

function normalizeOr(a: Vec2, fallback: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  if (l < 1e-6) return fallback;
  return { x: a.x / l, y: a.y / l };
}

/** Pull `p` back toward `origin` so it sits no farther than `maxDist` away. */
function clampToReach(p: Vec2, origin: Vec2, maxDist: number): Vec2 {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxDist || d < 1e-6) return { x: p.x, y: p.y };
  const s = maxDist / d;
  return { x: origin.x + dx * s, y: origin.y + dy * s };
}
