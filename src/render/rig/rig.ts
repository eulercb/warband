import type { CelebrationPose } from './celebration';
import { weaponWindup } from '../../engine/content/weaponTiming';
import type { DruidGesture, ExtSlot, WeaponWindupView } from '../../engine/core/types';
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
import { drawMageGarment } from './mageGarment';
import { drawRosterGarment } from './rosterGarments';
import { drawBardLute, drawGreatAxe, drawStaffCrown } from './heroGear';
import { drawMeleeGarment, drawSunShield } from './meleeGarments';
import { drawKnightArmor, drawKnightShield } from './knightArmor';
import { heroStance } from './math/heroStance';
import { bladeSweepSeconds } from '../overlays/meleeVisual';
import type { BladeAreaStyle, EntityId } from '../../engine/core/types';
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
const RANGED_RELEASE_DURATION = 0.39;
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

  private elementalAge = 1;
  private elementalPose: 'fireball' | 'frostNova' = 'fireball';
  private nextBipedLeg = 0;
  private aimFacing = 0;
  private stanceFacing = 0;
  private shieldBrace = 0;
  private blinkAge = 1;
  private lightningAge = 1;
  private lightningAngle = 0;
  private recoilAge = 1;
  private recoilAngle = 0;
  private cheerPose?: CelebrationPose;
  private druidGesture?: DruidGesture;
  private rangedSlot?: ExtSlot;
  private bowDraw = 0;
  private preparingWeapon = false;
  private blade?: {
    style: BladeAreaStyle;
    angle: number;
    halfAngle: number;
    daggerHand?: 0 | 1;
    duration?: number;
  };
  private carryBlend = 0;
  private palmAges = [1, 1];
  private palmAngles = [0, 0];
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
      const litLimb = (points: number): LitLimb => new LitLimb({ points, lights: lights!, preset });
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
  triggerBlade(
    style: BladeAreaStyle,
    angle: number,
    halfAngle: number,
    daggerHand?: 0 | 1,
    duration?: number,
  ): void {
    this.preparingWeapon = false;
    this.rangedSlot = undefined;
    this.attackAge = weaponWindup(style);
    this.blade = { style, angle, halfAngle, daggerHand, duration };
    if (style === 'monkPalm' && daggerHand !== undefined) {
      this.palmAges[daggerHand] = 0;
      this.palmAngles[daggerHand] = angle;
    }
  }

  presentWeaponWindup(pose: WeaponWindupView | undefined, dt: number): void {
    if (pose) {
      const age = this.preparingWeapon ? this.attackAge + dt : 0;
      this.preparingWeapon = true;
      this.blade = pose;
      const duration = weaponWindup(pose.style);
      this.attackAge = Math.min(duration, Math.max(age, duration * pose.progress));
    } else if (this.preparingWeapon) {
      this.preparingWeapon = false;
      this.attackAge = -1;
      this.blade = undefined;
    }
  }

  private get weaponPreparation(): number {
    return weaponWindup(this.blade?.style);
  }

  private get weaponSetup(): number {
    const duration = this.weaponPreparation;
    if (duration <= 0 || this.attackAge >= duration) return 1;
    const t = clamp(this.attackAge / duration, 0, 1);
    return t * t * (3 - 2 * t);
  }

  private get weaponRecovery(): number {
    if (this.blade?.style === 'bardFlourish') return 0.3;
    return this.blade?.style === 'axeSwing' ||
      this.blade?.style === 'cleave' ||
      this.blade?.style === 'holyStrike'
      ? 0.24
      : 0.11;
  }

  triggerDruidGesture(gesture: DruidGesture): void {
    this.triggerAttack();
    this.druidGesture = gesture;
  }

  triggerAttack(slot?: ExtSlot): void {
    if (this.preparingWeapon) return;
    if (this.blade?.duration && this.attackAge >= 0 && this.attackAge < this.blade.duration) return;
    this.blade = undefined;
    this.rangedSlot = slot;
    this.druidGesture = undefined;
    this.attackAge = 0;
  }

  triggerElemental(style: 'fireball' | 'frostNova'): void {
    this.attackAge = -1;
    this.elementalAge = 0;
    this.blinkAge = 1;
    this.lightningAge = 1;
    this.elementalPose = style;
  }

  triggerBlink(mage: boolean): void {
    this.seeded = false;
    if (mage) {
      this.attackAge = -1;
      this.blinkAge = 0;
      this.lightningAge = 1;
      this.elementalAge = 1;
    }
  }

  /** Keep planted feet in the same world positions when the camera pans or zooms. */
  reprojectFeet(oldGround: Vec2, newGround: Vec2, ratio: number): void {
    const project = (p: Vec2): Vec2 => ({
      x: newGround.x + (p.x - oldGround.x) * ratio,
      y: newGround.y + (p.y - oldGround.y) * ratio,
    });
    this.lastPos = project(this.lastPos);
    this.vel = { x: this.vel.x * ratio, y: this.vel.y * ratio };
    for (const leg of this.legs) {
      leg.foot = project(leg.foot);
      leg.from = project(leg.from);
      leg.to = project(leg.to);
    }
  }

  triggerLightning(angle: number): void {
    this.attackAge = -1;
    this.lightningAge = 0;
    this.blinkAge = 1;
    this.elementalAge = 1;
    this.lightningAngle = angle;
  }

  triggerLightningRecoil(angle: number): void {
    this.recoilAge = 0;
    this.recoilAngle = angle;
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
    this.cheerPose = ctx.cheer;
    this.bowDraw = ctx.drawingProjectile ? (ctx.castT ?? 0) : 0;
    this.palmAges[0] += dt;
    this.palmAges[1] += dt;
    this.lightningAge += dt;
    this.blinkAge += dt;
    this.elementalAge += dt;
    this.recoilAge += dt;
    this.shieldBrace += (Number(ctx.guarding ?? false) - this.shieldBrace) * Math.min(1, dt * 16);
    const activeCarry = Math.max(
      releasePose(this.lightningAge),
      releasePose(this.elementalAge),
      releasePose(this.blinkAge),
      (ctx.castT ?? 0) > 0 ? 0.88 : 0,
      this.attackAge >= 0 ? Math.max(0, 1 - this.attackAge / ATTACK_DUR) : 0,
    );
    this.carryBlend +=
      (activeCarry - this.carryBlend) *
      (1 - Math.exp(-dt * (activeCarry > this.carryBlend ? 26 : 10)));
    this.aimFacing = this.lightningAge < 0.19 ? this.lightningAngle : facing;
    const poseFacing = this.aimFacing;
    this.facing = poseFacing;
    this.cos = Math.cos(poseFacing);
    this.sin = Math.sin(poseFacing);
    const bite =
      this.blade?.style === 'savageBite'
        ? (this.preparingWeapon ? -0.13 * this.weaponSetup : 0.33 * (1 - this.bladePhase())) * R
        : 0;
    const roll = ctx.rangerRoll;
    const tumble = roll ? clamp(1 - roll.remaining / roll.range, 0, 1) : 0;
    const crouch = roll ? Math.sin(tumble * Math.PI) : 0;
    const recoil = Math.min(7, R * 0.12) * Math.max(0, 1 - this.recoilAge / 0.18) ** 2;
    const release = this.rangedSlot === 'basic' ? this.rangedRelease : 0;
    const lean = release * R * (this.spec.garment === 'warlock' ? -0.18 : 0.24);
    this.view.pivot.set(
      pos.x - bite * Math.cos(this.blade?.angle ?? 0),
      pos.y - bite * Math.sin(this.blade?.angle ?? 0),
    );
    this.view.position.set(
      pos.x + recoil * Math.cos(this.recoilAngle) + lean * this.cos,
      pos.y +
        recoil * Math.sin(this.recoilAngle) -
        R * (ctx.cheer?.lift ?? 0) +
        lean * this.sin +
        crouch * R * 0.3,
    );
    this.view.rotation = roll
      ? Math.sin(tumble * Math.PI * 2) * (roll.dir.x >= 0 ? 0.83 : -0.83)
      : 0;
    this.view.scale.set(1 + crouch * 0.15, 1 - crouch * 0.42);

    // Screen-space velocity (EMA), with a teleport guard that re-seeds feet so a
    // blink doesn't stretch a limb across the arena for one frame.
    const jump = Math.hypot(pos.x - this.lastPos.x, pos.y - this.lastPos.y);
    if (!this.seeded || jump > Math.max(320, 9 * R)) {
      this.origin = { x: pos.x, y: pos.y };
      this.lastPos = { x: pos.x, y: pos.y };
      this.vel = { x: 0, y: 0 };
      this.stanceFacing = this.aimFacing;
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

    if (this.spec.garment && ctx.state === 'alive' && ctx.cheer == null) {
      this.stanceFacing = heroStance(
        this.stanceFacing,
        this.aimFacing,
        Math.atan2(moveDir.y, moveDir.x),
        speed > 12 * scale,
        dt,
      );
      this.facing = this.stanceFacing;
      this.cos = Math.cos(this.facing);
      this.sin = Math.sin(this.facing);
    }

    if (this.attackAge >= 0 && !this.preparingWeapon) {
      this.attackAge += dt;
      if (
        this.attackAge >
        (this.blade
          ? (this.blade.duration ?? bladeSweepSeconds(this.blade.style, this.blade.halfAngle)) +
            this.weaponPreparation +
            this.weaponRecovery
          : this.rangedSlot || this.druidGesture
            ? RANGED_RELEASE_DURATION
            : ATTACK_DUR)
      ) {
        this.attackAge = -1;
        this.rangedSlot = undefined;
        this.druidGesture = undefined;
        this.blade = undefined;
      }
    }

    const downed = ctx.state === 'downed';
    if (this.spec.legs) {
      // Downed: don't gait, but still anchor feet under the body each frame so a
      // collapsed hero's legs track the body when the camera pans (no detach).
      if (downed) this.settleLegs(R);
      else this.updateLegs(R, moveDir, moving, dt, ctx);
    }
    if (this.spec.spine) this.updateSpine(R);

    const stance = this.facing;
    if (this.fullTurn && !downed && !this.preparingWeapon) {
      this.facing = this.bladeAngle();
      this.cos = Math.cos(this.facing);
      this.sin = Math.sin(this.facing);
    }
    this.draw(R, timeSec, ctx, downed);
    this.facing = stance;
    this.cos = Math.cos(stance);
    this.sin = Math.sin(stance);
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
      const d = lg.homeDist(i) * R * (this.spec.garment ? 0.64 : 1);
      this.legHomes[i] = { x: anchor.x + Math.cos(ang) * d, y: anchor.y + Math.sin(ang) * d };
    }
  }

  private seedFeet(R: number): void {
    if (!this.spec.legs) return;
    this.legAround = this.facing;
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
    const pivot = Boolean(this.spec.garment) && !moving;
    this.legAround = this.legAngleAround(moving);
    this.computeHomes(R, this.legAround);
    const stride = lg.gait.partnerStride;
    const raised = Boolean(this.spec.garment);
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const stepDuration = pivot
      ? 0.1
      : raised
        ? clamp((R * 0.92) / Math.max(1, speed), 0.08, 0.14)
        : lg.gait.stepDuration;
    const params: GaitParams = {
      stepDistance: R * (pivot ? 0.31 : lg.gait.stepDistance * (raised ? 0.65 : 1)),
      stepDuration: stepDuration * (ctx.enraged ? 0.7 : 1),
      overstep: raised ? Math.min(R, speed * stepDuration * 0.82) : lg.gait.overstep * R,
      maxConcurrent: lg.gait.maxConcurrent,
      firstLeg: lg.count === 2 ? this.nextBipedLeg : 0,
      partnerOf: (i) => (i + stride) % lg.count,
      jitter: (i) => this.jitterVals[i],
    };
    updateGait(this.legs, this.legHomes, moveDir, dt, params);
    if (lg.count === 2) {
      const active = this.legs.findIndex((leg) => leg.stepping);
      if (active >= 0) this.nextBipedLeg = 1 - active;
    }
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
    const bodyScale = (downed ? 1 : breathe) * (1 + 0.14 * windupT);

    const anchorLocal = this.spec.legs ? this.partLocal(this.spec.legs.anchorPart) : { x: 0, y: 0 };
    const shadowAt = this.bodyPoint(anchorLocal, R);
    contactShadow(this.gGround, shadowAt.x, shadowAt.y, R * 1.05, R * 0.5);

    if (ctx.rangerRoll) {
      const { dir } = ctx.rangerRoll;
      for (let i = 0; i < 4; i++) {
        const offset = (i - 1.5) * R * 0.31;
        const back = R * (0.9 + i * 0.34);
        this.gGround
          .ellipse(
            this.origin.x - dir.x * back - dir.y * offset,
            this.origin.y - dir.y * back + dir.x * offset,
            R * (0.27 + i * 0.065),
            R * 0.16,
          )
          .fill({ color: 0xd2ae80, alpha: 0.52 - i * 0.09 });
      }
    }
    if (this.spec.tentacles) this.drawTentacles(R, timeSec, ctx);
    if (this.spec.legs) this.drawLegs(R, windupT, ctx, downed);
    if (this.spec.spine) this.drawSpine(R, timeSec, bodyScale, ctx);

    this.drawBodyParts(R, bodyScale, downed, ctx);

    if (this.spec.arms) this.drawArms(R, ctx, downed);
    if (this.spec.weapon && !downed) this.drawWeapon(R, ctx, timeSec);
    if (this.spec.decor && this.spec.garment !== 'knight' && this.spec.garment !== 'cleric')
      this.drawDecor(R, ctx);
    if (this.spec.garment === 'knight' && !downed) {
      drawKnightArmor(
        this.gDecor,
        (x, y, height) => {
          const point = this.bodyPoint({ x, y }, R);
          return { x: point.x, y: this.origin.y + (point.y - this.origin.y) * 0.53 - height * R };
        },
        R,
      );
    }
    const garment = this.spec.garment;
    if (garment && garment !== 'mage' && garment !== 'knight') {
      const heightScale = downed ? 0.28 : garment === 'rogue' ? 0.85 : 1;
      const project = (x: number, y: number, h: number) => {
        const point = this.bodyPoint({ x, y }, R);
        return {
          x: point.x,
          y: this.origin.y + (point.y - this.origin.y) * 0.53 - h * R * heightScale,
        };
      };
      const sway = clamp((-this.vel.x * this.sin + this.vel.y * this.cos) / 220, -0.28, 0.28);
      if (
        garment === 'paladin' ||
        garment === 'rogue' ||
        garment === 'monk' ||
        garment === 'barbarian'
      )
        drawMeleeGarment(this.gBehind, this.gDecor, project, R, garment, sway);
      else drawRosterGarment(this.gBehind, this.gDecor, project, R, garment, sway);
      if (garment === 'bard' && !downed) {
        const strum = this.bardHand(1, R, true);
        drawBardLute(
          this.gDecor,
          this.bardHand(-1, R),
          strum,
          R,
          this.rangedSlot !== 'basic' || this.attackAge < 0,
        );
        const beat = this.rangedSlot === 'basic' ? this.rangedRelease : 0;
        if (beat > 0) {
          const wrist = this.bardHand(1, R);
          const flare = Math.max(11, R * 1.42);
          this.gDecor
            .moveTo(strum.x - flare * 0.48, strum.y - flare * 0.67)
            .quadraticCurveTo(
              strum.x + flare * 0.71,
              strum.y - flare * 0.56,
              wrist.x + flare * 0.28,
              wrist.y + flare * 0.52,
            )
            .stroke({
              color: 0xffbb73,
              alpha: beat * 0.9,
              width: Math.max(2, R * 0.19),
              cap: 'round',
            });
          this.gDecor
            .moveTo(strum.x - flare * 0.06, strum.y - flare * 0.5)
            .quadraticCurveTo(
              strum.x + flare * 0.6,
              strum.y - flare * 0.42,
              wrist.x,
              wrist.y + flare * 0.28,
            )
            .stroke({ color: 0xffeacc, alpha: beat, width: Math.max(1.2, R * 0.11), cap: 'round' });
        }
        this.drawFlourishBlade(R);
      }
    }
    if (this.spec.garment === 'mage' && !downed) {
      const lateralSpeed = -this.vel.x * this.sin + this.vel.y * this.cos;
      const drift = clamp(-lateralSpeed / 300, -0.24, 0.24) + Math.sin(timeSec * 4) * 0.07;
      drawMageGarment(
        this.gBehind,
        this.gDecor,
        (x, y, height = 0) => {
          const point = this.bodyPoint({ x, y }, R);
          return { x: point.x, y: this.origin.y + (point.y - this.origin.y) * 0.53 - height * R };
        },
        R,
        drift,
        Math.max(
          releasePose(this.lightningAge),
          releasePose(this.elementalAge),
          releasePose(this.blinkAge),
        ),
      );
    }
  }

  private drawBodyParts(R: number, bodyScale: number, downed: boolean, ctx: RigDriveCtx): void {
    for (const part of this.spec.parts) {
      const p = this.bodyPoint(this.effLocal(part), R);
      if (this.spec.garment && !downed) {
        p.y -= R * (part.id === 'head' || part.parent === 'head' ? 1.46 : 0.64);
      }
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
    const around = this.fullTurn && !downed ? this.facing : this.legAround;
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
      const spin = this.fullTurn && !downed;
      const pivot = spin ? this.bodyPoint({ x: 0.13, y: (i === 0 ? -1 : 1) * 0.88 }, R) : leg.foot;
      const planted = clampToReach(pivot, shoulder, maxReach);
      // Front-leg raise telegraph: legs pointing forward lift during a windup.
      const forwardness = Math.cos(baseAng);
      const raise =
        windupT > 0 && forwardness > 0.2 ? windupT * forwardness * lg.liftHeight * R : 0;
      const lift = leg.stepping ? Math.sin(Math.PI * leg.t) * lg.liftHeight * R : 0;
      const step = spin && i === 1 ? Math.sin(Math.PI * this.bladePhase()) * R * 0.37 : 0;
      const foot = { x: planted.x, y: planted.y - lift - raise - step };

      if (!leg.stepping && !downed) footShadow(this.gGround, planted.x, planted.y, wTip * 1.6);

      const bendRef = lg.bendOutward ? anchor : bipedRef;
      if (this.spec.garment && !downed) shoulder.y -= 0.48 * R;
      const knee = solveTwoBone(shoulder, foot, lg.l1 * R, lg.l2 * R, bendRef);
      if (this.lit) {
        // Quad-strip along shoulder → knee → foot, half-widths tapering root → tip.
        const m = this.legMeshes[i];
        m.setStrip([shoulder, knee, foot], [wRoot * 0.5, (wRoot + wTip) * 0.25, wTip * 0.5]);
        m.setMaterial(legColor, 0, ctx.flash);
      } else {
        drawLimb(this.gBehind, shoulder, knee, foot, wRoot, wTip, legColor);
      }
      if (this.spec.garment && !downed) {
        this.gBehind
          .ellipse(foot.x, foot.y, R * 0.17, R * 0.12)
          .fill({ color: 0x393044 })
          .stroke({ color: 0xaa865f, width: Math.max(0.7, R * 0.04) });
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
    const mage = this.spec.garment === 'mage' && !downed;
    const grip = this.gripPoint(R, ctx, downed);
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const shoulder = this.bodyPoint(arm.shoulderLocal, R);
      if (this.spec.garment && !downed) shoulder.y -= 0.78 * R;
      let hand = downed
        ? this.bodyPoint({ x: -0.2, y: arm.side * 1.3 }, R)
        : {
            x: grip.x + this.cos * arm.side * 0.12 * R,
            y: grip.y + this.sin * arm.side * 0.12 * R,
          };
      if (mage) {
        if (arm.side === 1) hand = grip;
        else {
          const travel = clamp(Math.hypot(this.vel.x, this.vel.y) / 125, 0, 1);
          const lead = this.legs.findIndex((leg) => leg.stepping);
          const sweep =
            lead < 0
              ? 0
              : Math.sin(Math.PI * this.legs[lead].t) * (lead === 0 ? -1 : 1) * travel * 0.29;
          const release = releasePose(this.elementalAge);
          const lightning = releasePose(this.lightningAge);
          const fold = releasePose(this.blinkAge);
          const opening = this.elementalPose === 'frostNova' ? release * 1.08 : release * 0.45;
          hand = this.bodyPoint(
            {
              x:
                -0.11 +
                this.carryBlend * 0.38 +
                sweep +
                lightning * 1.21 +
                (ctx.castT ?? 0) * 0.57 +
                (this.elementalPose === 'fireball' ? release * 0.73 : 0) -
                fold * 0.36,
              y: -0.94 - opening + lightning * 0.25 + fold * 0.7,
            },
            R,
          );
          hand.y -=
            R *
            (0.23 +
              this.carryBlend * 0.26 +
              opening * 0.57 +
              (ctx.castT ?? 0) * 0.43 +
              fold * 0.52);
        }
      }
      if (this.spec.garment === 'knight' && !downed) {
        hand = arm.side === -1 ? this.knightShieldAnchor(R) : grip;
      } else if (
        (this.spec.garment === 'rogue' || this.blade?.style === 'daggerSlash') &&
        !downed
      ) {
        hand = arm.side === -1 ? this.daggerOffhand(R) : grip;
      } else if (
        (this.spec.garment === 'paladin' || this.blade?.style === 'holyStrike') &&
        !downed
      ) {
        hand = arm.side === -1 ? this.paladinShieldAnchor(R) : grip;
      }
      if (!downed && this.spec.garment === 'monk') {
        const index = arm.side === 1 ? 0 : 1;
        const recovery = clamp((this.palmAges[index] - 0.035) / 0.17, 0, 1);
        const strike =
          this.blade?.style === 'monkPalm'
            ? 1 - recovery * recovery * (3 - 2 * recovery)
            : arm.side === 1 && this.attackAge >= 0
              ? Math.max(0, 1 - this.attackAge / 0.16)
              : 0;
        hand = this.bodyPoint(
          { x: (arm.side === 1 ? 0.83 : 0.38) + strike * 1.25, y: arm.side * (0.6 - strike * 0.3) },
          R,
        );
        if (this.blade?.style === 'monkPalm' && !this.fullTurn) {
          hand.x += (Math.cos(this.palmAngles[index]) - this.cos) * R * strike * 1.25;
          hand.y += (Math.sin(this.palmAngles[index]) - this.sin) * R * strike * 1.25;
        }
        hand.y -= R * ((arm.side === 1 ? 0.75 : 1.18) + strike * 0.14);
      } else if (!downed && this.spec.garment === 'barbarian') {
        const angle = this.bladeAngle();
        if (arm.side === 1) hand = grip;
        else {
          hand = this.bodyPoint({ x: 0.22, y: -0.83 }, R);
          hand.y -= R * 0.65;
          const setup = this.weaponSetup;
          if (this.blade?.style === 'axeSwing') {
            const phase =
              this.weaponPreparation + bladeSweepSeconds('axeSwing', this.blade.halfAngle);
            const release = clamp((this.attackAge - phase) / this.weaponRecovery, 0, 1);
            const brace = setup * (1 - release * release * (3 - 2 * release));
            const haftAngle = angle;
            hand.x += (grip.x - Math.cos(haftAngle) * R * 0.62 - hand.x) * brace;
            hand.y += (grip.y - Math.sin(haftAngle) * R * 0.62 - hand.y) * brace;
          }
        }
      }
      if (!downed && this.spec.garment === 'ranger') hand = this.rangerHand(arm.side, R);
      else if (!downed && this.spec.garment === 'bard') hand = this.bardHand(arm.side, R);
      else if (
        !downed &&
        this.spec.garment &&
        ['cleric', 'druid', 'sorcerer', 'warlock'].includes(this.spec.garment)
      ) {
        const cast =
          this.attackAge >= 0 ? Math.sin(Math.PI * clamp(this.attackAge / ATTACK_DUR, 0, 1)) : 0;
        const sorcerer = this.spec.garment === 'sorcerer';
        const warlock = this.spec.garment === 'warlock';
        hand =
          arm.side === 1
            ? grip
            : this.bodyPoint(
                {
                  x: -0.1 + cast * (warlock ? 0.48 : 0.93),
                  y: -0.77 - (sorcerer ? cast * 0.52 : 0),
                },
                R,
              );
        if (arm.side === -1) hand.y -= R * (0.29 + cast * (sorcerer ? 1.03 : 0.64));
      }
      if (arm.side === -1 && this.druidGesture && !downed) {
        const beat = this.rangedRelease;
        if (this.druidGesture === 'plant') {
          hand.x += this.cos * R * beat * 0.92;
          hand.y += R * beat * (1.24 + this.sin * 0.92);
        } else if (this.druidGesture === 'mend') {
          hand.x += (this.cos * 1.2 + this.sin * 0.7) * R * beat;
          hand.y += (this.sin * 1.2 - this.cos * 0.7 - 1.15) * R * beat;
        } else {
          const side = Math.cos(this.attackAge * 12);
          hand.x -= this.sin * R * beat * side * 1.8;
          hand.y += (this.cos * side * 1.8 - 0.72) * R * beat;
        }
      }
      if (arm.side === -1 && !downed && this.rangedSlot === 'basic') {
        const beat = this.rangedRelease;
        switch (this.spec.garment) {
          case 'cleric':
            hand.x += this.cos * R * 1.7 * beat;
            hand.y += (this.sin * 1.7 - 1.1) * R * beat;
            break;
          case 'druid':
            hand.x += (this.cos * 1.05 + this.sin * 1.45) * R * beat;
            hand.y += (this.sin * 1.05 - this.cos * 1.45 + 0.75) * R * beat;
            break;
          case 'sorcerer':
            hand.x += (this.cos * 0.68 - this.sin * 1.55) * R * beat;
            hand.y += (this.sin * 0.68 + this.cos * 1.55 - 0.75) * R * beat;
            break;
          case 'warlock':
            {
              const curl = 1.48 - Math.min(1, this.attackAge / 0.23) * 2.32;
              hand.x += this.cos * R * curl * beat;
              hand.y += (this.sin * curl - 1.48) * R * beat;
            }
            break;
        }
      }
      if (
        ctx.cheer &&
        !downed &&
        (this.spec.garment === 'monk' || (arm.side === -1 && this.casterCarry))
      )
        hand.y -= R * (arm.side === -1 ? ctx.cheer.left : ctx.cheer.right);
      const extension =
        this.rangedSlot === 'basic' || this.bowDraw > 0 || this.druidGesture ? 0.3 : 0;
      const reachScale = this.spec.garment && !downed ? 1.14 + extension : 1;
      if (this.spec.garment && !downed) {
        hand = clampToReach(hand, shoulder, (arm.l1 + arm.l2) * R * reachScale * 0.98);
      }
      if (arm.side === -1 && this.rangedSlot === 'basic' && !downed)
        this.drawRangedHandAccent(hand, R);
      const bendRef = arm.bendOutward
        ? center
        : { x: center.x + this.cos * 6 * R, y: center.y + this.sin * 6 * R };
      const elbow = solveTwoBone(
        shoulder,
        hand,
        arm.l1 * R * reachScale,
        arm.l2 * R * reachScale,
        bendRef,
      );
      const wRoot = arm.width * R * (mage ? 1.6 : 1);
      const wTip = arm.width * R * 0.8;
      if (this.lit) {
        const m = this.armMeshes[i];
        m.setStrip([shoulder, elbow, hand], [wRoot * 0.5, (wRoot + wTip) * 0.25, wTip * 0.5]);
        m.setMaterial(color, 0, ctx.flash);
      } else {
        drawLimb(this.gFront, shoulder, elbow, hand, wRoot, wTip, color);
      }
      if (this.spec.garment === 'monk' && !downed) {
        const wrapX = hand.x + (elbow.x - hand.x) * 0.3;
        const wrapY = hand.y + (elbow.y - hand.y) * 0.3;
        this.gFront
          .moveTo(wrapX, wrapY)
          .lineTo(hand.x, hand.y)
          .stroke({ color: 0x735b68, width: 0.4 * R, cap: 'round' });
        this.gFront
          .moveTo(wrapX, wrapY)
          .lineTo(hand.x, hand.y)
          .stroke({ color: 0xd7c5a6, width: 0.3 * R, cap: 'round' });
        this.gFront.circle(hand.x, hand.y, 0.19 * R).fill({ color: 0xe8d9ba });
      }
      if (mage) {
        this.gFront.circle(hand.x, hand.y, 0.13 * R).fill({ color: 0xe0b994 });
        this.gFront.circle(elbow.x, elbow.y, 0.095 * R).fill({ color: 0x8b719b });
      }
    }
  }

  private drawRangedHandAccent(hand: Vec2, radius: number): void {
    const fade = this.rangedRelease;
    if (fade < 0.12) return;
    const r = Math.max(9, radius) * (1.08 - 0.17 * fade);
    const g = this.gDecor;
    const width = Math.max(1.4, r * 0.12);
    const { x, y } = hand;
    switch (this.spec.garment) {
      case 'cleric':
        g.moveTo(x - r * 0.65, y)
          .lineTo(x + r * 0.65, y)
          .moveTo(x, y - r * 0.62)
          .lineTo(x, y + r * 0.48)
          .stroke({ color: 0xffe6b1, width, alpha: fade * 0.94 });
        break;
      case 'druid':
        for (const side of [-1, 1]) {
          g.moveTo(x, y)
            .quadraticCurveTo(x + side * r * 0.83, y - r * 0.07, x + side * r * 0.75, y - r * 0.69)
            .quadraticCurveTo(x + side * r * 0.25, y - r * 0.65, x, y)
            .fill({ color: 0xb8e0a0, alpha: fade * 0.9 });
        }
        break;
      case 'sorcerer':
        g.moveTo(x - r * 0.66, y + r * 0.62)
          .lineTo(x + r * 0.04, y)
          .lineTo(x - r * 0.18, y - r * 0.3)
          .lineTo(x + r * 0.65, y - r * 0.56)
          .stroke({ color: 0xffb1f2, width, alpha: fade * 0.94 });
        break;
      case 'warlock':
        g.moveTo(x + r * 0.58, y - r * 0.56)
          .lineTo(x - r * 0.52, y - r * 0.25)
          .lineTo(x - r * 0.15, y + r * 0.72)
          .lineTo(x + r * 0.45, y + r * 0.31)
          .stroke({ color: 0xb5e3cc, width: width * 1.15, alpha: fade * 0.88 });
        break;
    }
  }

  private drawWeapon(R: number, ctx: RigDriveCtx, timeSec: number): void {
    const w = this.spec.weapon!;
    const garment = this.spec.garment;
    if (garment === 'bard') return;
    const grip = garment === 'ranger' ? this.rangerHand(1, R) : this.gripPoint(R, ctx, false);
    // A low carry can cross the projected chest during a turn. Let the
    // outfit occlude the resting staff until the casting hand brings it clear.
    const staffDepth = this.cos * 1.11 + this.sin * 0.18;
    const g =
      garment === 'sorcerer' && this.carryBlend < 0.2 && staffDepth < 0
        ? this.gBehind
        : this.gFront;
    const activeStaff = Math.max(
      releasePose(this.lightningAge),
      releasePose(this.elementalAge),
      ctx.castT ?? 0,
      this.attackAge >= 0 ? Math.max(0, 1 - this.attackAge / 0.23) : 0,
    );
    const staffAngle =
      this.spec.garment === 'mage'
        ? -Math.PI * 0.57 +
          Math.atan2(
            Math.sin(this.aimFacing + Math.PI * 0.57),
            Math.cos(this.aimFacing + Math.PI * 0.57),
          ) *
            activeStaff
        : this.blade
          ? this.blade.daggerHand === 1 && !this.fullTurn
            ? this.facing + 0.64
            : this.bladeAngle()
          : this.spec.garment === 'knight'
            ? this.attackAge >= 0
              ? this.aimFacing
              : this.facing + 1.05
            : this.spec.garment === 'rogue' && this.attackAge < 0
              ? this.facing + 0.64
              : this.facing;
    const turningWeapon =
      garment === 'barbarian' ||
      garment === 'paladin' ||
      garment === 'cleric' ||
      garment === 'druid' ||
      garment === 'sorcerer' ||
      garment === 'warlock';
    const active = this.casterCarry
      ? this.carryBlend
      : this.attackAge >= 0
        ? Math.max(0, 1 - this.attackAge / ATTACK_DUR)
        : 0;
    const lowered = garment === 'barbarian' || garment === 'paladin';
    const rest = lowered
      ? this.facing + 1.36
      : garment === 'sorcerer'
        ? -Math.PI / 2 - this.sin * 0.24
        : -Math.PI * 0.43;
    const beat = this.rangedSlot === 'basic' ? this.rangedRelease : 0;
    const flourish =
      garment === 'druid' ? 0.7 : garment === 'sorcerer' ? -0.62 : garment === 'warlock' ? 0.24 : 0;
    const nature =
      this.druidGesture === 'plant'
        ? 1.34
        : this.druidGesture === 'mend'
          ? -0.95
          : this.druidGesture === 'wind'
            ? Math.cos(this.attackAge * 12)
            : 0;
    const delta = staffAngle - rest + beat * flourish + nature * this.rangedRelease;
    const rainLift = garment === 'ranger' && this.rangedSlot === 'a2' ? this.rangedRelease : 0;
    const angle =
      turningWeapon && !this.blade
        ? rest + Math.atan2(Math.sin(delta), Math.cos(delta)) * active
        : staffAngle - rainLift * 1.42;
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);
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
        if (garment === 'barbarian') {
          drawGreatAxe(g, at, R);
          break;
        }
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
        // Optional gold band on the haft (cleric).
        if (w.accent !== undefined) {
          const band = at(w.length * 0.55);
          g.circle(band.x, band.y, 0.13 * R).stroke({ width: 0.07 * R, color: w.accent });
        }
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
          const ob =
            this.spec.garment === 'rogue' || this.blade?.style === 'daggerSlash'
              ? this.daggerOffhand(R)
              : at(0, -0.5);
          const offAngle = this.daggerOffhandAngle();
          const o =
            this.spec.garment === 'rogue' || this.blade?.style === 'daggerSlash'
              ? {
                  x: ob.x + Math.cos(offAngle) * w.length * R,
                  y: ob.y + Math.sin(offAngle) * w.length * R,
                }
              : at(w.length * 0.85, -0.5);
          g.moveTo(ob.x, ob.y)
            .lineTo(o.x, o.y)
            .stroke({ width: 0.11 * R, color: metal, cap: 'round' });
        }
        break;
      }
      case 'bow': {
        const top = at(-0.61, 1.15);
        const bot = at(-0.61, -1.15);
        const belly = at(0.61);
        g.moveTo(top.x, top.y)
          .quadraticCurveTo(belly.x, belly.y, bot.x, bot.y)
          .stroke({ width: 0.17 * R, color: 0x5a382d, cap: 'round' });
        g.moveTo(top.x, top.y)
          .quadraticCurveTo(belly.x, belly.y, bot.x, bot.y)
          .stroke({ width: 0.075 * R, color: 0xd1a067, cap: 'round' });
        const nock =
          garment === 'ranger'
            ? this.bowDraw > 0
              ? this.rangerHand(-1, R)
              : at(-0.61 - this.rangedRelease * 0.12)
            : at(-0.15 - swing * 0.35);
        g.moveTo(top.x, top.y)
          .lineTo(nock.x, nock.y)
          .lineTo(bot.x, bot.y)
          .stroke({ width: Math.max(0.8, 0.045 * R), color: metal });
        if (this.bowDraw > 0) {
          const count = Math.min(5, ctx.drawProjectileCount ?? 1);
          for (let i = 0; i < count; i++) {
            const spread = (i - (count - 1) / 2) / Math.max(1, (count - 1) / 2);
            const tip = at(0.83, spread * 0.56);
            g.moveTo(nock.x, nock.y)
              .lineTo(tip.x, tip.y)
              .stroke({ color: 0xf3e0ad, width: Math.max(1.4, 0.1 * R) });
            g.circle(tip.x, tip.y, Math.max(1.3, R * 0.12)).fill({ color: 0xfff0cd });
          }
        }
        break;
      }
      case 'staff': {
        const tip = at(w.length);
        g.moveTo(grip.x, grip.y)
          .lineTo(tip.x, tip.y)
          .stroke({ width: 0.11 * R, color: 0x6b4a2a, cap: 'round' });
        if (this.spec.garment === 'mage') {
          const base = at(w.length - 0.3);
          const edgeA = at(w.length, -0.22);
          const edgeB = at(w.length, 0.22);
          const crown = at(w.length + 0.35);
          g.poly([base.x, base.y, edgeA.x, edgeA.y, crown.x, crown.y, edgeB.x, edgeB.y])
            .fill({ color: 0x7855b6 })
            .stroke({ width: Math.max(1, 0.06 * R), color: 0xf1d69b });
          g.moveTo(base.x, base.y)
            .lineTo(crown.x, crown.y)
            .stroke({ width: Math.max(1, 0.08 * R), color: 0xd9f5ff });
          break;
        }
        if (garment === 'druid' || garment === 'sorcerer' || garment === 'warlock') {
          drawStaffCrown(g, at, w.length, R, garment);
          break;
        }
        // Arcane orb: a soft additive glow pulsing ~2.2s, swelling as a cast charges.
        const pulse = 1 + 0.16 * Math.sin(timeSec * ((2 * Math.PI) / 2.2));
        const glow = 0.22 * R * (1 + 0.4 * swing) * pulse;
        g.circle(tip.x, tip.y, glow * 1.8).fill({ color: w.color, alpha: 0.22 });
        g.circle(tip.x, tip.y, glow * 1.2).fill({ color: w.color, alpha: 0.4 });
        g.circle(tip.x, tip.y, glow).fill({ color: lighten(w.color, 0.45) });
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

    // Off-hand shield (paladin / knight): a small rounded kite plate to the side/back.
    if (w.offhand === 'shield') {
      const c = this.paladinShieldAnchor(R);
      if (this.spec.garment === 'paladin') {
        drawSunShield(g, c, R);
        return;
      }
      if (this.spec.garment === 'knight') {
        drawKnightShield(g, this.knightShieldAnchor(R), R, this.shieldBrace);
        return;
      }
      g.roundRect(c.x - 0.34 * R, c.y - 0.44 * R, 0.68 * R, 0.88 * R, 0.18 * R).fill({
        color: w.color,
      });
      g.roundRect(c.x - 0.34 * R, c.y - 0.44 * R, 0.68 * R, 0.88 * R, 0.18 * R).stroke({
        width: 0.06 * R,
        color: darken(w.color, 0.3),
      });
      // Optional gold boss stud at the shield centre (knight).
      if (w.accent !== undefined) {
        g.circle(c.x, c.y, 0.12 * R).fill({ color: w.accent });
      }
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
        case 'ring': {
          // Unfilled ring (halo, pauldron rim, robe / vestment trim), optionally glowing.
          const rr = d.scale * R;
          const rw = Math.max(1, (d.ringWidth ?? 0.1) * R);
          if (d.glow) {
            g.circle(at.x, at.y, rr).stroke({ width: rw * 2.6, color, alpha: 0.28 });
          }
          g.circle(at.x, at.y, rr).stroke({ width: rw, color });
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

  private get fullTurn(): boolean {
    return !!this.blade && this.blade.halfAngle >= Math.PI;
  }

  private bladePhase(): number {
    if (!this.blade) return 0;
    return clamp(
      (this.attackAge - this.weaponPreparation) /
        (this.blade.duration ?? bladeSweepSeconds(this.blade.style, this.blade.halfAngle)),
      0,
      1,
    );
  }

  private bladeAngle(): number {
    if (!this.blade) return this.facing;
    const { angle, halfAngle } = this.blade;
    const phase = this.bladePhase();
    const slash = this.fullTurn ? angle + Math.PI * 2 * phase : angle + halfAngle * (2 * phase - 1);
    if (this.fullTurn && this.weaponPreparation === 0) return slash;
    const recovery = clamp(
      (this.attackAge - this.weaponPreparation - bladeSweepSeconds(this.blade.style, halfAngle)) /
        this.weaponRecovery,
      0,
      1,
    );
    const rest =
      this.facing +
      (this.blade.style === 'cleave'
        ? 1.05
        : this.blade.style === 'holyStrike' || this.blade.style === 'axeSwing'
          ? 1.36
          : 0);
    const delta = rest - slash;
    return (
      slash +
      Math.atan2(Math.sin(delta), Math.cos(delta)) * Math.max(1 - this.weaponSetup, recovery)
    );
  }

  private paladinShieldAnchor(R: number): Vec2 {
    const brace = this.blade?.style === 'holyStrike' ? Math.sin(Math.PI * this.bladePhase()) : 0;
    const point = this.bodyPoint({ x: -0.1 + brace * 0.75, y: -0.85 }, R);
    if (this.spec.garment === 'paladin') {
      point.y -= R * 0.66;
      return this.fitRaisedHand(point, -1, R);
    }
    return point;
  }

  private daggerOffhandAngle(): number {
    if (!this.blade) return this.facing - 0.82;
    if (this.fullTurn) return this.bladeAngle() - Math.PI;
    if (this.blade.daggerHand === 1) return this.bladeAngle();
    return this.facing - 0.82;
  }

  private daggerOffhand(R: number): Vec2 {
    const angle = this.daggerOffhandAngle();
    const spread = 0.9 + Math.sin(Math.PI * this.bladePhase()) * 0.48;
    const point = {
      x: this.origin.x + Math.cos(angle) * spread * R,
      y: this.origin.y + Math.sin(angle) * spread * R,
    };
    if (this.spec.garment !== 'rogue') return point;
    point.y -= R * 0.5;
    return this.fitRaisedHand(point, -1, R);
  }

  private get casterCarry(): boolean {
    const garment = this.spec.garment;
    return (
      garment === 'mage' ||
      garment === 'cleric' ||
      garment === 'druid' ||
      garment === 'sorcerer' ||
      garment === 'warlock'
    );
  }

  private get rangedRelease(): number {
    if (this.attackAge < 0) return 0;
    const t = clamp((this.attackAge - 0.06) / (RANGED_RELEASE_DURATION - 0.06), 0, 1);
    return 1 - t * t * (3 - 2 * t);
  }

  private rangerHand(side: -1 | 1, r: number): Vec2 {
    const shot = this.rangedSlot === 'basic' || this.rangedSlot === 'a1';
    const release = shot ? this.rangedRelease : 0;
    const rain = this.rangedSlot === 'a2' ? this.rangedRelease : 0;
    const pull = this.bowDraw * 1.32 + release * 0.55;
    const reach = this.carryBlend;
    const point = this.bodyPoint(
      side === 1
        ? { x: 0.88 + pull * 0.55 + release * 0.3, y: 0.7 - pull * 0.38 }
        : { x: -0.18 + reach * 0.42 - pull * 1.38, y: -0.91 + reach * 0.39 + pull * 0.58 },
      r,
    );
    point.y -=
      r *
      (side === 1
        ? 0.52 + pull * 0.36 + rain * 1.35
        : 0.18 + reach * 0.34 + pull * 0.46 + rain * 0.62);
    return this.fitRaisedHand(point, side, r);
  }

  private drawFlourishBlade(r: number): void {
    const sheath = this.bardSheath(r);
    const sheathAngle = this.facing + 2.4;
    const active = this.blade?.style === 'bardFlourish';
    const draw = active ? this.bardBladeDraw() : 0;
    const hand = active ? this.bardHand(1, r) : sheath;
    const angle = active ? this.bladeAngle() : sheathAngle;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    this.gDecor
      .moveTo(sheath.x, sheath.y)
      .lineTo(
        sheath.x + Math.cos(sheathAngle) * r * 1.31,
        sheath.y + Math.sin(sheathAngle) * r * 1.31,
      )
      .stroke({ color: 0x493852, width: r * 0.3, cap: 'round' });
    const length = 0.17 + draw * 1.45;
    this.gFront
      .moveTo(hand.x, hand.y)
      .lineTo(hand.x + x * length, hand.y + y * length)
      .stroke({ color: draw > 0.1 ? 0xffe3ad : 0xb67740, width: r * 0.19, cap: 'round' });
    this.gFront
      .moveTo(hand.x - y * 0.24, hand.y + x * 0.24)
      .lineTo(hand.x + y * 0.24, hand.y - x * 0.24)
      .stroke({ color: 0xb67740, width: r * 0.14, cap: 'round' });
  }

  private bardSheath(r: number): Vec2 {
    const at = this.bodyPoint({ x: -0.05, y: 0.91 }, r);
    at.y -= r * 0.44;
    return at;
  }

  private bardBladeDraw(): number {
    if (this.preparingWeapon) return clamp((this.weaponSetup - 0.28) / 0.72, 0, 1);
    const recovery = (this.attackAge - this.weaponPreparation - 0.18) / this.weaponRecovery;
    const t = clamp(recovery, 0, 1);
    return 1 - t * t * (3 - 2 * t);
  }

  private bardHand(side: -1 | 1, r: number, lute = false): Vec2 {
    const point = this.bodyPoint({ x: side === -1 ? 0.76 : 0.5, y: side * 0.52 }, r);
    point.y -= r * (side === -1 ? 1.18 : 0.58);
    if (side === 1 && !lute && this.blade?.style === 'bardFlourish') {
      const angle = this.bladeAngle();
      const draw = this.bardBladeDraw();
      const sheath = this.bardSheath(r);
      const approach = this.preparingWeapon ? this.weaponSetup : Math.min(1, draw * 5);
      const grip = this.fitRaisedHand(
        {
          x: sheath.x + (point.x + Math.cos(angle) * r - sheath.x) * draw,
          y: sheath.y + (point.y + Math.sin(angle) * r - r * 0.28 - sheath.y) * draw,
        },
        side,
        r,
      );
      point.x += (grip.x - point.x) * approach;
      point.y += (grip.y - point.y) * approach;
    }
    if (side === 1 && !lute && this.rangedSlot === 'basic' && this.attackAge >= 0) {
      const travel = clamp(this.attackAge / 0.225, 0, 1);
      const sweep = Math.sin((0.22 + travel * 0.78) * Math.PI);
      point.x += r * (this.cos * 0.77 + this.sin * 0.83) * sweep;
      point.y += r * (this.sin * 0.77 - this.cos * 0.83 + 0.85) * sweep;
    }
    if (side === 1 && !lute && this.cheerPose) {
      point.x += this.cos * r * this.cheerPose.right * 3;
      point.y += this.sin * r * this.cheerPose.right * 3;
    }
    return this.fitRaisedHand(point, side, r, !lute);
  }

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
    if (!downed) dist += 0.85 * releasePose(this.lightningAge);
    const forward =
      this.blade && !downed
        ? this.blade.daggerHand === 1 && !this.fullTurn
          ? this.facing + 0.64
          : this.bladeAngle()
        : this.spec.garment === 'knight' && !downed
          ? this.attackAge >= 0
            ? this.aimFacing
            : this.facing + 1.05
          : !downed && this.spec.garment === 'rogue' && this.attackAge < 0
            ? this.facing + 0.64
            : this.spec.garment &&
                (this.attackAge >= 0 || activeRelease(this.lightningAge, this.elementalAge))
              ? this.aimFacing
              : this.facing;
    const point = {
      x: this.origin.x + Math.cos(forward) * dist * R,
      y: this.origin.y + Math.sin(forward) * dist * R,
    };
    if (
      !downed &&
      !this.blade &&
      this.attackAge < 0 &&
      (this.spec.garment === 'paladin' || this.spec.garment === 'barbarian')
    ) {
      const carry = this.bodyPoint({ x: 0.06, y: 1.08 }, R);
      point.x = carry.x;
      point.y = carry.y;
    }
    if (!downed && this.spec.garment === 'paladin')
      point.y -= R * (this.blade ? 0.64 + 0.8 * (1 - this.bladePhase()) : 0.94);
    if (!downed && this.spec.garment === 'rogue') point.y -= R * 0.48;
    if (!downed && this.spec.garment === 'barbarian') point.y -= R * 0.72;
    if (!downed && this.blade?.style === 'daggerSlash') point.y += R * 0.15;
    if (this.spec.garment === 'knight' && !downed) point.y -= R * 0.65;
    if (this.spec.garment === 'mage' && !downed) {
      const beat = releasePose(this.elementalAge);
      const nova = this.elementalPose === 'frostNova';
      const bolt = this.rangedSlot === 'basic' ? this.rangedRelease : 0;
      point.x += R * (beat * (nova ? -this.sin * 1.25 : this.cos * 0.6) + this.cos * bolt * 0.42);
      point.y += R * beat * (nova ? this.cos * 0.55 : this.sin * 0.32);
      const fold = releasePose(this.blinkAge);
      point.x -= this.cos * R * fold * 0.57;
      point.y -= R * (0.82 + (ctx.castT ?? 0) * 0.22 + fold * 0.28);
    }
    if (!downed && this.blade && this.weaponPreparation > 0) {
      const t = clamp(
        (this.attackAge -
          this.weaponPreparation -
          bladeSweepSeconds(this.blade.style, this.blade.halfAngle)) /
          this.weaponRecovery,
        0,
        1,
      );
      const ease = Math.max(1 - this.weaponSetup, t * t * (3 - 2 * t));
      const rest =
        this.spec.garment === 'knight'
          ? {
              x: this.origin.x + Math.cos(this.facing + 1.05) * 1.5 * R,
              y: this.origin.y + Math.sin(this.facing + 1.05) * 1.5 * R,
            }
          : this.bodyPoint({ x: 0.06, y: 1.08 }, R);
      rest.y -=
        R * (this.spec.garment === 'paladin' ? 0.94 : this.spec.garment === 'knight' ? 0.65 : 0.72);
      point.x += (rest.x - point.x) * ease;
      point.y += (rest.y - point.y) * ease;
    }
    if (!downed && this.casterCarry) {
      const carry = this.bodyPoint(
        this.spec.garment === 'sorcerer' ? { x: 0.18, y: 1.11 } : { x: -0.03, y: 0.94 },
        R,
      );
      carry.y -= R * 0.56;
      if (this.spec.garment === 'sorcerer') {
        carry.y += R * 0.13;
      }
      if (this.spec.garment !== 'mage') point.y -= R * 0.78;
      point.x = carry.x + (point.x - carry.x) * this.carryBlend;
      point.y = carry.y + (point.y - carry.y) * this.carryBlend;
    }
    return this.spec.garment && !downed ? this.fitRaisedHand(point, 1, R) : point;
  }

  private fitRaisedHand(point: Vec2, side: 1 | -1, radius: number, animate = true): Vec2 {
    const arm = this.spec.arms!.find((arm) => arm.side === side)!;
    const shoulder = this.bodyPoint(arm.shoulderLocal, radius);
    shoulder.y -= 0.78 * radius;
    const lift =
      animate && this.cheerPose ? (side === -1 ? this.cheerPose.left : this.cheerPose.right) : 0;
    return clampToReach(
      { x: point.x, y: point.y - radius * lift },
      shoulder,
      (arm.l1 + arm.l2) *
        radius *
        (this.rangedSlot === 'basic' || this.bowDraw > 0 ? 1.44 : 1.14) *
        0.98,
    );
  }

  private knightShieldAnchor(r: number): Vec2 {
    const side = this.bodyPoint({ x: 0.17, y: -1.15 }, r);
    const x = this.origin.x + Math.cos(this.aimFacing) * r * 0.88;
    const y = this.origin.y + Math.sin(this.aimFacing) * r * 0.88;
    return this.fitRaisedHand(
      {
        x: side.x + (x - side.x) * this.shieldBrace,
        y: side.y + (y - side.y) * this.shieldBrace - r * 0.57,
      },
      -1,
      r,
    );
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
    return p ? this.effLocal(p) : { x: 0, y: 0 };
  }

  /** A part's rig-origin-relative local, resolving an optional `parent` anchor so a
   *  dress part (hood/hat/plume/pauldron) rides the head or torso it's pinned to. */
  private effLocal(part: BodyPartSpec): Vec2 {
    if (!part.parent) return part.local;
    const base = this.rawLocal(part.parent);
    return { x: base.x + part.local.x, y: base.y + part.local.y };
  }

  /** A part's OWN local by id, without resolving its parent (anchors are base parts). */
  private rawLocal(id: string): Vec2 {
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

function releasePose(age: number): number {
  const fade = clamp((age - 0.1) / 0.43, 0, 1);
  return 1 - fade * fade * (3 - 2 * fade);
}

function activeRelease(lightning: number, elemental: number): boolean {
  return Math.min(lightning, elemental) < 0.625;
}
