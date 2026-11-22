import type { Graphics } from 'pixi.js';
import type { Vec2 } from '../../engine/core/types';

export type BlinkVariant = 'shutter' | 'tiles';

export const BLINK_DEPART_TTL = 0.34;
export const BLINK_ARRIVE_TTL = 0.43;

function endpointFade(age: number, arrival: boolean): number {
  return Math.max(
    0,
    1 - Math.max(0, age - 0.07) / ((arrival ? BLINK_ARRIVE_TTL : BLINK_DEPART_TTL) - 0.07),
  );
}

/** Separate endpoint artwork. The actual relocation happens before either animation. */
export function drawBlinkEndpoint(
  g: Graphics,
  center: Vec2,
  scale: number,
  age: number,
  arrival: boolean,
  variant: BlinkVariant,
): void {
  if (variant === 'shutter') drawShutter(g, center, scale, age, arrival);
  else drawTiles(g, center, scale, age, arrival);
}

function drawShutter(g: Graphics, { x, y }: Vec2, s: number, age: number, arrival: boolean): void {
  const fade = endpointFade(age, arrival);
  const open = arrival ? Math.min(1, age / 0.065) : Math.max(0, 1 - age / 0.08);
  const breadth = (2 + open * 11) * s;
  g.moveTo(x, y + 4 * s)
    .lineTo(x, y - (22 + open * 5) * s)
    .stroke({ color: arrival ? 0xfff1cf : 0xdcd1ff, width: Math.max(1.2, s * 1.8), alpha: fade });
  for (const side of [-1, 1]) {
    const rim = x + side * breadth;
    const lid = x + side * breadth * 0.58;
    g.moveTo(x, y - 24 * s)
      .quadraticCurveTo(rim, y - 24 * s, rim, y - 9 * s)
      .lineTo(lid, y + 2 * s)
      .lineTo(x, y - 5 * s)
      .fill({ color: 0x43255f, alpha: fade * 0.76 })
      .stroke({ color: 0xb999f1, width: Math.max(0.9, s), alpha: fade * 0.85 });
    const px = x + side * (open * 7 + age * (arrival ? 72 : 41)) * s;
    const py = y - (arrival ? 10 - age * 30 : 15 + age * 26) * s;
    g.poly([px, py - 3 * s, px + 2 * s, py, px, py + 3 * s, px - 2 * s, py]).fill({
      color: 0xeee2ff,
      alpha: fade * 0.78,
    });
  }
}

function drawTiles(g: Graphics, { x, y }: Vec2, s: number, age: number, arrival: boolean): void {
  const fade = endpointFade(age, arrival);
  const spread = arrival ? Math.min(1, age / 0.1) : Math.max(0.05, 1 - age / 0.12);
  const anchorY = y - (9 + (arrival ? age * 25 : 0)) * s;
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI * i) / 2 + (arrival ? age * 1.8 : -age * 4);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const range = (3 + 15 * spread) * s;
    const width = (arrival ? 5 : 4.2) * s;
    const cx = x + dx * range;
    const cy = anchorY + dy * range * 0.8;
    g.poly([
      cx + dx * width,
      cy + dy * width,
      cx - dy * width * 0.7,
      cy + dx * width * 0.7,
      cx - dx * width * 0.6,
      cy - dy * width * 0.6,
      cx + dy * width * 0.7,
      cy - dx * width * 0.7,
    ])
      .fill({ color: i % 2 === 0 ? 0xffe2ad : 0xc4a4f1, alpha: fade * 0.82 })
      .stroke({ color: 0x4a365f, width: Math.max(0.8, s * 0.85), alpha: fade });
  }
  const core = (3 + (1 - spread) * 5) * s;
  g.poly([
    x,
    anchorY - core,
    x + core * 0.64,
    anchorY,
    x,
    anchorY + core,
    x - core * 0.64,
    anchorY,
  ]).fill({ color: arrival ? 0xfff0d2 : 0x9671be, alpha: fade * (1 - spread * 0.54) });
}
