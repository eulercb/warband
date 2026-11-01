import { describe, it, expect } from 'vitest';
import { Graphics } from 'pixi.js';
import {
  enemyDebuffs,
  drawEnemyDebuffs,
  drawEnemyDebuffSymbol,
  ENEMY_DEBUFF_COLORS,
} from '../src/render/pipeline/enemyDebuffs';
import { isBurstControl } from '../src/engine/core/control';
import { buffView } from '../src/engine/core/buffView';
import { controlledSpellMultiplier } from '../src/engine/combat/spellCombos';
import { World } from '../src/engine/world/world';
import { applyBuff, makeBuff } from '../src/engine/combat/combat';
import type { BuffView, BuffKind } from '../src/engine/core/types';
const b = (kind: BuffKind, mult = 1, remaining = 3, ownerId?: number): BuffView => ({
  kind,
  mult,
  remaining,
  ownerId,
});
const all = [
  b('moveSpeed', 0.5),
  b('castSlow', 1.5),
  b('silence'),
  b('curse', 1.15, 4, 1),
  b('damageDealt', 0.7),
  b('damageTaken', 1.2),
];
describe('enemy debuff semantics', () => {
  it('shows every live detrimental category, deduplicates refreshes and prioritizes control', () => {
    expect(
      enemyDebuffs([b('root'), b('stun'), ...all, b('moveSpeed', 0.2, 5)], 1).map((x) => x.kind),
    ).toEqual(['stun', 'root', 'slow', 'curse', 'castSlow', 'silence', 'weak', 'vulnerable']);
    expect(enemyDebuffs([b('root'), ...all], 1)[0].kind).toBe('root');
    expect(enemyDebuffs(all, 1)[0].kind).toBe('slow');
    expect(enemyDebuffs(all, 1).map((x) => x.kind)).toEqual([
      'slow',
      'curse',
      'castSlow',
      'silence',
      'weak',
      'vulnerable',
    ]);
    expect(enemyDebuffs(all, 2).map((x) => x.kind)).toEqual([
      'slow',
      'castSlow',
      'silence',
      'curse',
      'weak',
      'vulnerable',
    ]);
    expect(
      enemyDebuffs(
        [
          b('stun', 1, 0),
          b('root', 1, -1),
          b('moveSpeed', 1.2),
          b('damageDealt', 1.2),
          b('damageTaken', 0.5),
          b('castSlow', 1),
          b('invuln'),
        ],
        1,
      ),
    ).toEqual([]);
    expect(enemyDebuffs([b('moveSpeed', 0.7, 1), b('moveSpeed', 0.5, 4)], 1)[0].remaining).toBe(4);
  });
  it('keeps overlapping slow and root independently visible through either expiry order', () => {
    // Different skills/players can supply these; neither replaces the other category.
    for (const first of ['root', 'moveSpeed'] as const) {
      const buffs = [b('root'), b('moveSpeed', 0.5)];
      expect(enemyDebuffs(buffs, 1).map((s) => s.kind)).toEqual(['root', 'slow']);
      buffs.find((s) => s.kind === first)!.remaining = 0;
      expect(enemyDebuffs(buffs, 1).map((s) => s.kind)).toEqual([
        first === 'root' ? 'slow' : 'root',
      ]);
    }
  });
  it('draws all eight categories on bosses and adds rather than truncating the grid', () => {
    const buffs = [b('stun'), b('root'), ...all];
    for (const compact of [false, true]) {
      const g = new Graphics();
      drawEnemyDebuffs(g, buffs, 1, 100, 100, 40, compact);
      // One opaque backed plate per distinct category (not one per source).
      const plates = g.context.instructions.filter(
        (i) => i.action === 'fill' && i.data.style.color === 0x090d18,
      );
      expect(plates).toHaveLength(8);
    }
  });
  it('uses exactly Fireball control conditions, not curse, casting slow or other debuffs', () => {
    const w = new World({
      monsterId: 'dragon',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'mage' }],
    });
    for (const buff of [
      b('stun'),
      b('root'),
      b('moveSpeed', 0.5),
      ...all.slice(1),
      b('moveSpeed', 1),
      b('stun', 1, 0),
    ]) {
      w.boss!.buffs = [{ ...buff, source: 'test' }];
      expect(controlledSpellMultiplier(w.boss!, 0.35)).toBe(isBurstControl(buff) ? 1.35 : 1);
    }
    expect(controlledSpellMultiplier(w.boss!, undefined)).toBe(1);
  });
  it('tracks personal curse expiry independently of other casters and supports legacy snapshots', () => {
    const curses = [b('curse', 1.15, 1, 1), b('curse', 1.15, 7, 2)];
    expect(enemyDebuffs(curses, 1)).toEqual([{ kind: 'curse', remaining: 7, own: true }]);
    expect(enemyDebuffs([{ ...curses[0], remaining: 0 }, curses[1]], 1)).toEqual([
      { kind: 'curse', remaining: 7, own: false },
    ]);
    expect(enemyDebuffs([b('curse', 1.15)], 1)[0].own).toBe(false);
    expect(enemyDebuffs(curses, null)[0].own).toBe(false);
  });
  it('serializes only public ownership on enemy curses, for bosses and adds', () => {
    expect(buffView(makeBuff('curse', 1.15, 3, 'curse:9'))).toEqual({
      kind: 'curse',
      mult: 1.15,
      remaining: 3,
      ownerId: 9,
    });
    for (const source of ['private', 'curse:other', 'curse:-2'])
      expect(buffView(makeBuff('curse', 1.1, 3, source))).not.toHaveProperty('ownerId');
    expect(buffView(makeBuff('root', 0, 3, 'curse:9'))).not.toHaveProperty('ownerId');
    const w = new World({
      monsterId: 'dragon',
      seed: 5,
      players: [{ peerId: 'a', name: 'A', classId: 'warlock' }],
    });
    applyBuff(w.boss!, makeBuff('curse', 1.1, 3, `curse:${w.players[0].id}`));
    w.adds.push({
      id: w.allocId(),
      pos: { x: 600, y: 400 },
      hp: 100,
      maxHp: 100,
      radius: 12,
      moveSpeed: 0,
      targetId: null,
      attackCd: 0,
      buffs: [makeBuff('curse', 1.1, 3, `curse:${w.players[0].id}`)],
    });
    const snapshot = w.serialize();
    for (const target of [snapshot.bosses[0], snapshot.adds[0]]) {
      expect(target.buffs[0].ownerId).toBe(w.players[0].id);
      expect(target.buffs[0]).not.toHaveProperty('source');
    }
  });
});
describe('bounded enemy status geometry', () => {
  it('draws different silhouettes for all public enemy status categories', () => {
    const shapes = Object.keys(ENEMY_DEBUFF_COLORS).map((kind) => {
      const g = new Graphics();
      drawEnemyDebuffSymbol(g, kind as keyof typeof ENEMY_DEBUFF_COLORS, 100, 100, 6, 0xffffff);
      return JSON.stringify(
        g.context.instructions.map((i) => ({
          action: i.action,
          path: 'path' in i.data ? i.data.path.instructions : [],
        })),
      );
    });
    expect(new Set(shapes).size).toBe(Object.keys(ENEMY_DEBUFF_COLORS).length);
  });
  it('clears after expiry, retains all add badges, clamps at viewport edges and distinguishes ownership', () => {
    const g = new Graphics();
    drawEnemyDebuffs(g, [], 1, 100, 100, 40);
    expect(g.context.instructions).toHaveLength(0);
    drawEnemyDebuffs(g, all, 1, 100, 100, 40);
    const full = g.context.instructions.length;
    expect(full).toBeGreaterThan(12);
    g.clear();
    drawEnemyDebuffs(g, all, 1, 100, 100, 40, true);
    expect(g.context.instructions.length).toBe(full);
    for (const [x, y] of [
      [310, 560],
      [-30, -30],
    ]) {
      g.clear();
      drawEnemyDebuffs(g, all.slice(1), 1, x, y, 40, true, { x: 320, y: 568 });
      const bounds = g.getLocalBounds();
      expect(bounds.minX).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX).toBeLessThanOrEqual(320);
      expect(bounds.minY).toBeGreaterThanOrEqual(0);
      expect(bounds.maxY).toBeLessThanOrEqual(568);
    }
    for (const [x, y] of [
      [-500, 100],
      [900, 100],
      [100, -500],
      [100, 900],
    ]) {
      g.clear();
      drawEnemyDebuffs(g, all, 1, x, y, 40, false, { x: 320, y: 568 });
      expect(g.context.instructions).toHaveLength(0);
    }
    g.clear();
    drawEnemyDebuffs(g, [b('curse', 1.1, 0.2)], null, 100, 100, 20);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    g.clear();
    drawEnemyDebuffs(g, [b('stun', 0, 0)], 1, 100, 100, 20);
    expect(g.context.instructions).toHaveLength(0);
  });
});
