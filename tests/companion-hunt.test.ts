import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import {
  commandCompanion,
  reserveCompanionCommand,
  updateCompanions,
  companionHuntView,
  PACK_BOND,
} from '../src/engine/combat/companions';
import { tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import { activeSubclassPassive } from '../src/engine/content/subclasses';
import { drawCompanion } from '../src/render/pipeline/companionVisuals';
import type { Add, InputCommand } from '../src/engine/core/types';
function setup() {
  const w = new World({
    seed: 31,
    monsterId: 'dragon',
    players: [
      {
        peerId: 'a',
        name: 'Beast',
        classId: 'ranger',
        subSkills: ['rg_beast_bite'],
        charUpgrades: ['rg_beastmaster_g_b'],
      },
    ],
  });
  w.scene = null;
  w.obstacles = [];
  w.terrain = [];
  const p = w.players[0],
    b = w.boss!;
  p.pos = { x: 500, y: 400 };
  p.aim = { x: 1, y: 0 };
  p.critChance = 0;
  b.pos = { x: 650, y: 400 };
  b.hp = b.maxHp = 10000;
  b.moveSpeed = 0;
  b.decisionTimer = 1000;
  const a: Add = {
    id: w.allocId(),
    pos: { x: 650, y: 500 },
    hp: 1000,
    maxHp: 1000,
    radius: 12,
    moveSpeed: 0,
    buffs: [],
    targetId: null,
    attackCd: 1000,
  };
  w.adds.push(a);
  const token = () => reserveCompanionCommand(p, p.abilities!.basic, 'basic', true)!;
  const command = (t = b as typeof b | Add, c = token()) => {
    commandCompanion(p, t, t === b ? 'boss' : 'add', 1, true, c);
    return c;
  };
  const advance = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 100); i++) {
      tickSubclassPassives(p, 0.01);
      updateCompanions(w, 0.01);
    }
  };
  return { w, p, b, a, token, command, advance };
}
function input(w: World, basic: boolean) {
  const command: InputCommand = {
    seq: w.tick,
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    buttons: { basic, a1: false, a2: false, a3: false, revive: false },
  };
  w.step(0.01, new Map([['a', command]]));
}
describe('Pack Tactics chosen quarry', () => {
  it('repeats ordinary bites while the hero stops attacking, then rests when the lease expires', () => {
    const { p, b, command, advance } = setup();
    command();
    advance(0.5);
    expect(b.hp).toBe(9984);
    advance(2.5);
    expect(b.hp).toBe(9968);
    advance(2.5);
    expect(b.hp).toBe(9952);
    advance(1);
    expect(p.spiritCompanion?.hunt).toBeUndefined();
    advance(4);
    expect(b.hp).toBe(9952);
  });
  it('renewing the same quarry preserves a pending bite rather than restarting its windup', () => {
    const { p, command, advance, b } = setup();
    command();
    advance(0.1);
    const order = p.spiritCompanion!.order!,
      windup = order.windup;
    command();
    expect(p.spiritCompanion!.order).toBe(order);
    expect(order.windup).toBe(windup);
    advance(0.25);
    expect(b.hp).toBe(9984);
  });
  it('can station beside a quarry standing on the owner without invalid coordinates', () => {
    const { w, p, b, command, advance } = setup();
    b.pos = { ...p.pos };
    command();
    advance(0.5);
    expect(b.hp).toBe(9984);
    expect(Number.isFinite(p.spiritCompanion!.pos.x)).toBe(true);
    expect(companionHuntView(w, p)?.targetId).toBe(b.id);
  });
  it('uses a real fresh basic; held/autofire damage cannot renew or redirect', () => {
    const { w, p, b } = setup();
    input(w, true);
    for (let i = 0; i < 50; i++) input(w, true);
    expect(p.spiritCompanion?.hunt?.targetId).toBe(b.id);
    const h = p.spiritCompanion!.hunt!;
    const lease = h.remaining;
    for (let i = 0; i < 100; i++) input(w, true);
    expect(p.spiritCompanion!.hunt).toBe(h);
    expect(h.remaining).toBeLessThan(lease - 0.9);
    input(w, false);
    p.cooldowns.basic = 0;
    input(w, true);
    for (let i = 0; i < 50; i++) input(w, true);
    expect(p.spiritCompanion!.hunt).not.toBe(h);
  });
  it('selects only the first eligible contact of a cast and cannot reset the bite gate when retargeting', () => {
    const { p, b, a, command, advance } = setup();
    const c = command();
    command(a, c);
    expect(p.spiritCompanion!.hunt!.targetId).toBe(b.id);
    advance(0.1);
    const gate = p.subclassPassiveCooldowns![PACK_BOND];
    command(a);
    expect(p.spiritCompanion!.order).toBeUndefined();
    expect(p.subclassPassiveCooldowns![PACK_BOND]).toBe(gate);
    advance(0.5);
    expect(a.hp).toBe(1000);
    advance(2.3);
    expect(a.hp).toBe(984);
    expect(b.hp).toBe(10000);
  });
  it.each(['miss', 'indirect', 'dead', 'range', 'charmed'] as const)(
    'does not spend a command on %s',
    (kind) => {
      const { p, a, token } = setup();
      const c = token();
      if (kind === 'dead') a.hp = 0;
      if (kind === 'range') a.pos = { x: 1300, y: 400 };
      if (kind === 'charmed') a.charm = { ownerId: p.id, remaining: 2 } as Add['charm'];
      commandCompanion(p, a, 'add', kind === 'miss' ? 0 : 1, kind !== 'indirect', c);
      expect(c.spent).toBe(false);
      expect(p.spiritCompanion?.hunt).toBeUndefined();
    },
  );
  it.each([
    'dead',
    'range',
    'charmed',
    'source',
    'class',
    'epoch',
    'passive',
    'scene',
    'finished',
    'down',
  ] as const)('cancels a hunt and pending bite on %s', (kind) => {
    const { w, p, a, command, advance } = setup();
    command(a);
    updateCompanions(w, 0.01);
    if (kind === 'dead') a.hp = 0;
    if (kind === 'range') a.pos = { x: 1300, y: 400 };
    if (kind === 'charmed') a.charm = { ownerId: p.id, remaining: 2 } as Add['charm'];
    if (kind === 'source') p.abilities!.basic = { ...p.abilities!.basic };
    if (kind === 'class') p.classId = 'mage';
    if (kind === 'epoch') p.companionEpoch = 1;
    if (kind === 'passive') p.subclassPassiveId = undefined;
    if (kind === 'scene') w.scene = 'reward';
    if (kind === 'finished') w.finished = true;
    if (kind === 'down') p.hp = 0;
    expect(companionHuntView(w, p)).toBeUndefined();
    advance(0.5);
    expect(p.spiritCompanion?.hunt).toBeUndefined();
    expect(a.hp).toBe(kind === 'dead' ? 0 : 1000);
  });
  it('rejects stale/foreign tokens and never reserves a command for held input or a copied passive', () => {
    const { p, b, token } = setup();
    expect(reserveCompanionCommand(p, p.abilities!.basic, 'basic', false)).toBeUndefined();
    const c = token();
    c.ownerId++;
    commandCompanion(p, b, 'boss', 1, true, c);
    expect(c.spent).toBe(false);
    p.subclassPassiveId = undefined;
    expect(token()).toBeUndefined();
  });
  it('replicates detached quarry geometry and renders a bounded lease at the target', () => {
    const { w, p, b, command } = setup();
    command();
    const q = companionHuntView(w, p)!;
    expect(q.remaining).toBe(6);
    expect(q.pos).not.toBe(b.pos);
    const v = w.serialize().players[0].spiritCompanion!;
    expect(v.quarry?.targetId).toBe(b.id);
    expect(JSON.stringify(v)).not.toContain('cast');
    const g = new Graphics();
    drawCompanion(g, v, { x: 100, y: 100 }, 1);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    g.destroy();
  });
  it('shows the active command rule in passive readouts without changing the base passive', () => {
    const base = activeSubclassPassive('ranger', ['rg_beast_bite'])!;
    const hunt = activeSubclassPassive('ranger', ['rg_beast_bite'], ['rg_beastmaster_g_b'])!;
    expect(base.desc).toContain('connecting direct hits');
    expect(hunt.desc).toContain('held attacks do not retarget');
    expect(hunt.id).toBe(base.id);
  });
});
