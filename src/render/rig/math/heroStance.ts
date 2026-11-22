/** The raised hero's torso can glance toward aim while the hips commit to travel. */
export function heroStance(
  previous: number,
  aim: number,
  travel: number,
  moving: boolean,
  dt: number,
): number {
  const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const look = Math.max(-0.64, Math.min(0.64, wrap(aim - travel)));
  const target = moving ? travel + look : aim;
  const turn = wrap(target - previous);
  const limit = (moving ? 14 : 10) * dt;
  return previous + Math.max(-limit, Math.min(limit, turn));
}
