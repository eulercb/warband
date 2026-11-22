import type { Graphics } from 'pixi.js';
import type { BladeAreaStyle, SkillArea, Vec2 } from '../../engine/core/types';

type MeleeStyle = BladeAreaStyle | 'moonClaw';

export function isBladeArea(style: SkillArea['style']): style is BladeAreaStyle {
  return style === 'cleave' || style === 'holyStrike' || style === 'daggerSlash';
}

export function bladeSweepSeconds(style: BladeAreaStyle, halfAngle: number): number {
  if (halfAngle >= Math.PI) return style === 'daggerSlash' ? 0.39 : 0.47;
  if (style === 'daggerSlash') return 0.21;
  return style === 'holyStrike' ? 0.28 : 0.32;
}

const MATERIAL = {
  cleave: { body: 0x7aabdb, light: 0xebf7ff, ribbons: [0.71] },
  holyStrike: { body: 0xdf963f, light: 0xffefad, ribbons: [0.42, 0.76] },
  daggerSlash: { body: 0x764e9a, light: 0xe9bdff, ribbons: [0.72, 0.87] },
  moonClaw: { body: 0xa985d7, light: 0xf0d7ff, ribbons: [0.57, 0.72, 0.85] },
};

export function drawMeleeReach(
  g: Graphics,
  origin: Vec2,
  r: number,
  area: SkillArea & { style: MeleeStyle },
  age: number,
  life: number,
): void {
  const { style, halfAngle } = area;
  const material = MATERIAL[style];
  const fullCircle = halfAngle >= Math.PI;
  const start = fullCircle ? area.angle : area.angle - halfAngle;
  const span = 2 * halfAngle;
  const end = start + span;
  const fade = Math.pow(Math.max(0, 1 - age / life), 1.2);
  const bladeAge = style === 'moonClaw' ? Math.max(0, age - 0.22) : age;
  const sweepTime = style === 'moonClaw' ? 0.19 : bladeSweepSeconds(style, halfAngle);
  const sweep = Math.min(1, bladeAge / sweepTime);

  const at = (angle: number, radius: number): [number, number] => [
    origin.x + Math.cos(angle) * radius,
    origin.y + Math.sin(angle) * radius,
  ];
  // The whole reach lights on contact. No radial edges or permanent stroke.
  for (const [size, alpha] of [
    [1, 0.065],
    [0.94, 0.04],
    [0.84, 0.035],
  ]) {
    g.moveTo(origin.x, origin.y)
      .arc(origin.x, origin.y, r * size, start, end)
      .closePath()
      .fill({ color: material.body, alpha: fade * alpha });
  }

  material.ribbons.forEach((lower, index) => {
    const to = Math.min(end, start + span * (sweep + 0.16 - index * 0.035));
    const from = Math.max(start, to - span * (fullCircle ? 0.23 : 0.48));
    const upper = index === material.ribbons.length - 1 ? 1 : lower + 0.13;
    const inner = r * lower;
    const outer = r * upper;
    const middle = (from + to) * 0.5;
    const crest = (to - from) * 0.17;
    // Pinch both ends into the band so the edge reads as a moving blade or claw.
    g.moveTo(...at(from, (inner + outer) * 0.5))
      .quadraticCurveTo(...at(from, outer), ...at(middle - crest, outer))
      .arc(origin.x, origin.y, outer, middle - crest, middle + crest)
      .quadraticCurveTo(...at(to, outer), ...at(to, (inner + outer) * 0.5))
      .quadraticCurveTo(...at(middle, inner * 0.94), ...at(from, (inner + outer) * 0.5))
      .closePath()
      .fill({ color: material.light, alpha: fade * (style === 'moonClaw' ? 0.53 : 0.84) });
  });
}
