import type { Graphics } from 'pixi.js';
import type { PlayerView, Vec2 } from '../../engine/core/types';
import {
  animalFoot,
  blendAnimalFacing,
  moonBasicPose,
  type AnimalMotion,
  type AnimalStrike,
} from './animalMotion';

export function drawMoonBear(
  g: Graphics,
  p: PlayerView,
  screen: Vec2,
  scale: number,
  time = 0,
  motion?: AnimalMotion,
  strike?: AnimalStrike,
  swipeStrike?: AnimalStrike,
): void {
  const r = Math.max(11, 24 * scale);
  const elapsed = (beat?: AnimalStrike) => (beat ? time * 1000 - beat.started : Infinity);
  const { cast, swing, sweep: swipe } = moonBasicPose(elapsed(strike), elapsed(swipeStrike));
  const beat = cast > 0 ? strike : swipeStrike;
  const aim = motion?.facing ?? Math.atan2(p.aim.y, p.aim.x);
  const facing = beat
    ? blendAnimalFacing(aim, beat.angle, Math.min(1, Math.max(cast, swipe) * 2.5))
    : aim;
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  const phase = motion?.phase ?? 0;
  const stride = (motion?.stride ?? 0) * (1 - swipe * 0.65);
  const bob = Math.cos(phase * 2) * stride * 0.095 + Math.sin(time * 3) * 0.025;
  const rock = Math.sin(phase) * stride * 0.11 - cast * 0.18;
  const at = (x: number, y: number, h = 0): [number, number] => [
    screen.x + (x * c - y * s) * r,
    screen.y + ((x * s + y * c) * 0.63 - h) * r,
  ];
  const outline = 0x27243e;
  const body = (x: number, y: number, h: number, rx: number, ry: number, color: number) =>
    g
      .ellipse(...at(x, y, h), rx * r, ry * r)
      .fill({ color })
      .stroke({ color: outline, width: Math.max(1, r * 0.065) });
  g.ellipse(screen.x, screen.y + r * 0.16, r * 1.16, r * 0.57).fill({
    color: 0x080917,
    alpha: 0.55,
  });
  const leg = (fore: number, side: number) => {
    const lead = fore > 0;
    const pawPhase = phase + (side > 0 ? Math.PI : 0) + (lead ? Math.PI * 0.66 : 0);
    const step = animalFoot(pawPhase, motion?.travel ?? facing, facing, stride * 0.34);
    const swings = lead && side === (c >= 0 ? 1 : -1);
    const reach = swings ? swipe : 0;
    const launch = lead && !swings ? cast : 0;
    const foot = at(
      fore + step.x + reach * (0.65 + Math.sin(swing * Math.PI) * 0.62) + launch * 0.93,
      side * (0.51 + reach * (0.89 - swing * 2.15) + launch * 0.36) + step.y,
      step.lift * stride * 0.24 + reach * 0.46 + launch * 0.72,
    );
    const shoulder = at(fore, side * 0.36 + rock, 0.54 + bob + reach * 0.22 + launch * 0.24);
    g.moveTo(...shoulder)
      .lineTo(...foot)
      .stroke({
        color: side * c < 0 ? 0x48405f : 0x78678e,
        width: r * 0.36,
        cap: 'round',
      });
    g.ellipse(...foot, r * (0.22 + reach * 0.08), r * 0.15)
      .fill({ color: 0xa799bb })
      .stroke({ color: outline, width: Math.max(1, r * 0.05) });
    if (launch > 0.06)
      g.circle(...foot, r * (0.14 + launch * 0.13)).fill({ color: 0xb7ea8d, alpha: launch * 0.6 });
  };
  const far = c >= 0 ? -1 : 1;
  leg(-0.65, far);
  leg(0.55, far);
  leg(-0.65, -far);
  leg(0.55, -far);
  const head = () => {
    const rise = bob + rock * 0.45 + swipe * 0.11;
    for (const side of [far, -far]) {
      body(0.79, side * 0.32, 1.13 + rise, 0.19, 0.19, 0x746484);
      body(0.8, side * 0.33, 1.14 + rise, 0.09, 0.09, 0xaca0be);
    }
    body(0.91 + swipe * 0.09, 0, 0.84 + rise, 0.42, 0.36, 0x9a8bad);
    // Only show the features on the side of the head that the camera can see.
    const front = Math.max(0, s);
    const profile = Math.abs(c);
    if (front + profile > 0.32) {
      body(1.19, 0, 0.67 + rise, 0.18 + front * 0.13, 0.15, 0xd3c5df);
      g.circle(...at(1.35, 0, 0.7 + rise), r * 0.085).fill({ color: 0x231b31 });
      g.circle(...at(1.02, -far * 0.23, 0.91 + rise), r * 0.059).fill({ color: 0xffe6a3 });
      if (front > 0.74)
        g.circle(...at(1.02, far * 0.23, 0.91 + rise), r * 0.059).fill({ color: 0xffe6a3 });
    }
  };
  if (s < -0.45) head();
  body(-0.53, -rock, 0.6 + bob - rock, 0.63, 0.49, 0x514965);
  body(0.09, rock * 0.4, 0.76 + bob, 0.77, 0.58, 0x79698c);
  body(0.42, rock, 0.82 + bob + rock, 0.62, 0.48, 0x9282a8);
  if (s >= -0.45) head();
  if (cast > 0.06) leg(0.55, far);
  if (swipe > 0.03) {
    leg(0.55, -far);
    // A short set of near-body claw ribbons follows the paw across the chest.
    for (let i = 0; i < 3; i++) {
      const reach = 1.3 + i * 0.13;
      const y = -far * (0.86 - swing * 1.68);
      g.moveTo(...at(reach - 0.12, y + far * 0.69, 0.83 - i * 0.08))
        .quadraticCurveTo(
          ...at(reach + 0.28, y + far * 0.31, 0.67 - i * 0.08),
          ...at(reach, y, 0.49 - i * 0.08),
        )
        .stroke({
          color: 0xe7d4ff,
          alpha: swipe * (0.92 - i * 0.16),
          width: r * 0.075,
          cap: 'round',
        });
    }
  }

  const [mx, my] = at(-0.27, 0, 1.0 + bob);
  g.moveTo(mx + Math.cos(0.45) * r * 0.28, my + Math.sin(0.45) * r * 0.28)
    .arc(mx, my, r * 0.28, 0.45, Math.PI * 1.65)
    .stroke({ color: 0xffdda0, width: Math.max(1.6, r * 0.1), cap: 'round' });
}
