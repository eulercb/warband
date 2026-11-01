import type { Graphics } from 'pixi.js';
import type { BuffView, Vec2 } from '../../engine/core/types';
import { isBurstControl } from '../../engine/core/control';
export type EnemyDebuffKind =
  | 'thoughtBreakRecovery'
  | 'stun'
  | 'root'
  | 'slow'
  | 'castSlow'
  | 'silence'
  | 'curse'
  | 'weak'
  | 'vulnerable'
  | 'venom';
export interface EnemyDebuff {
  kind: EnemyDebuffKind;
  remaining: number;
  own: boolean;
}
export const ENEMY_DEBUFF_COLORS: Record<EnemyDebuffKind, number> = {
  thoughtBreakRecovery: 0xa7bacd,
  stun: 0xffe274,
  root: 0x98e6ba,
  slow: 0x8de4ff,
  castSlow: 0xffbe75,
  silence: 0xe7b5ff,
  curse: 0xce95ff,
  weak: 0xffb18b,
  vulnerable: 0xff8299,
  venom: 0x85c75a,
};
/** One badge per active harmful category, across all sources. Never hide weaker control. */
export function enemyDebuffs(buffs: readonly BuffView[], localId: number | null): EnemyDebuff[] {
  const active = buffs.filter((b) => b.remaining > 0);
  const result: EnemyDebuff[] = [];
  for (const kind of [
    'stun',
    'root',
    'slow',
    'castSlow',
    'silence',
    'curse',
    'weak',
    'vulnerable',
    'venom',
    'thoughtBreakRecovery',
  ] as const) {
    const matching = active.filter((b) => {
      switch (kind) {
        case 'slow':
          return b.kind === 'moveSpeed' && b.mult < 1;
        case 'castSlow':
          return b.kind === 'castSlow' && b.mult > 1;
        case 'weak':
          return b.kind === 'damageDealt' && b.mult < 1;
        case 'vulnerable':
          return (b.kind === 'damageTaken' || b.kind === 'luckExposure') && b.mult > 1;
        default:
          return b.kind === kind;
      }
    });
    if (!matching.length) continue;
    const personal =
      kind === 'curse' || kind === 'venom' || kind === 'vulnerable'
        ? matching.filter((b) => localId !== null && b.ownerId === localId)
        : [];
    result.push({
      kind,
      remaining: Math.max(...matching.map((b) => b.remaining)),
      own: personal.length > 0,
    });
  }
  // Control windows first, then personal curse access, then the remaining team state.
  // Stable ordering within each group; priority affects position, never membership.
  const priority = (s: EnemyDebuff) =>
    ['stun', 'root', 'slow'].includes(s.kind) ? 0 : s.own ? 1 : 2;
  return result.sort((a, b) => priority(a) - priority(b));
}
export function drawEnemyDebuffSymbol(
  g: Graphics,
  kind: EnemyDebuffKind,
  x: number,
  y: number,
  r: number,
  color: number,
): void {
  if (kind === 'thoughtBreakRecovery') {
    g.circle(x, y, r)
      .moveTo(x - r, y + r)
      .lineTo(x + r, y - r)
      .moveTo(x, y - r)
      .lineTo(x, y);
  } else if (kind === 'slow') {
    g.moveTo(x - r, y - r * 0.6)
      .lineTo(x, y + r * 0.6)
      .lineTo(x + r, y - r * 0.6)
      .moveTo(x - r, y + r)
      .lineTo(x + r, y + r);
  } else if (kind === 'root') {
    g.moveTo(x, y - r)
      .lineTo(x, y + r * 0.5)
      .lineTo(x - r, y + r)
      .moveTo(x, y + r * 0.5)
      .lineTo(x + r, y + r)
      .moveTo(x - r, y - r * 0.3)
      .lineTo(x + r, y - r * 0.3);
  } else if (kind === 'stun') {
    g.poly([
      x,
      y - r,
      x + r * 0.3,
      y - r * 0.3,
      x + r,
      y,
      x + r * 0.3,
      y + r * 0.3,
      x,
      y + r,
      x - r * 0.3,
      y + r * 0.3,
      x - r,
      y,
      x - r * 0.3,
      y - r * 0.3,
    ]);
  } else if (kind === 'castSlow') {
    g.poly([x - r, y - r, x + r, y - r, x - r, y + r, x + r, y + r, x - r, y - r]);
  } else if (kind === 'silence') {
    g.circle(x, y, r)
      .moveTo(x - r, y + r)
      .lineTo(x + r, y - r);
  } else if (kind === 'curse') {
    g.poly([x, y - r, x + r, y, x, y + r, x - r, y])
      .moveTo(x, y + r)
      .lineTo(x, y + r * 1.5);
  } else if (kind === 'venom') {
    g.poly([x, y - r, x + r * 0.7, y + r * 0.4, x, y + r, x - r * 0.7, y + r * 0.4, x, y - r]);
  } else if (kind === 'weak') {
    g.moveTo(x, y - r)
      .lineTo(x, y + r)
      .moveTo(x - r * 0.6, y)
      .lineTo(x + r * 0.6, y)
      .moveTo(x - r * 0.5, y + r * 0.4)
      .lineTo(x, y + r)
      .lineTo(x + r * 0.5, y + r * 0.4);
  } else {
    g.poly([x - r, y - r, x + r, y - r, x + r, y + r * 0.3, x, y + r, x - r, y + r * 0.3])
      .moveTo(x, y - r)
      .lineTo(x - r * 0.3, y)
      .lineTo(x + r * 0.3, y)
      .lineTo(x, y + r * 0.5);
  }
  g.stroke({ color, width: 2, alpha: 1 });
}
/** Foreground feedback; below/right of damage-number lanes, never a filled AoE. */
export function drawEnemyDebuffs(
  g: Graphics,
  buffs: readonly BuffView[],
  localId: number | null,
  x: number,
  y: number,
  r: number,
  compact = false,
  viewport?: Vec2,
): void {
  if (viewport && (x + r < 0 || x - r > viewport.x || y + r < 0 || y - r > viewport.y)) return;
  const states = enemyDebuffs(buffs, localId);
  if (!states.length) return;
  if (buffs.some(isBurstControl)) {
    const q = r + 7;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const cx = x + sx * q * 0.78,
        cy = y + sy * q * 0.78;
      g.moveTo(cx - sx * 9, cy)
        .lineTo(cx, cy)
        .lineTo(cx, cy - sy * 9)
        .stroke({ color: 0x090d18, width: 5, alpha: 0.95 });
      g.moveTo(cx - sx * 9, cy)
        .lineTo(cx, cy)
        .lineTo(cx, cy - sy * 9)
        .stroke({ color: 0x8de4ff, width: 2.5, alpha: 1 });
    }
  }
  const shown = states;
  const columnLimit = compact ? 4 : 3;
  const columns = Math.min(columnLimit, shown.length),
    rows = Math.ceil(shown.length / columnLimit);
  const anchorX = viewport
    ? Math.max(11, Math.min(x + Math.min(r * 0.5, 30), viewport.x - 11 - (columns - 1) * 21))
    : x + Math.min(r * 0.5, 30);
  const anchorY = viewport
    ? Math.max(11, Math.min(y + r * 0.7 + 17, viewport.y - 11 - (rows - 1) * 22))
    : y + r * 0.7 + 17;
  shown.forEach((s, i) => {
    const bx = anchorX + (i % columnLimit) * 21,
      by = anchorY + Math.floor(i / columnLimit) * 22;
    const alpha = 0.55 + 0.45 * Math.min(1, s.remaining);
    g.roundRect(bx - 10, by - 10, 20, 20, 4)
      .fill({ color: 0x090d18, alpha: 0.95 })
      .stroke({ color: ENEMY_DEBUFF_COLORS[s.kind], width: 1, alpha });
    drawEnemyDebuffSymbol(g, s.kind, bx, by - 1, 5.5, ENEMY_DEBUFF_COLORS[s.kind]);
    if (s.own) g.circle(bx + 6, by - 6, 2).fill({ color: 0xffffff, alpha: 1 });
  });
}
