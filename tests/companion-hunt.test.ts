import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import { SnapshotInterpolator } from '../src/render/pipeline/interpolate';
import { dist } from '../src/engine/core/torus';
import { ARENA_W, INTERP_DELAY_MS } from '../src/engine/core/constants';
import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { World } from '../src/engine/world/world';
import {
  commandCompanion,
  reserveCompanionCommand,
  updateCompanions,
  companionHuntView,
  PACK_BOND,
  prepareCompanionWard,
} from '../src/engine/combat/companions';
import { tickSubclassPassives } from '../src/engine/combat/subclassPassives';
import { absorptionAmount } from '../src/engine/combat/absorption';
import { makeBuff } from '../src/engine/combat/combat';
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
function input(w: World, basic: boolean, autofire = true) {
  const command: InputCommand = {
    seq: w.tick,
    autofire,
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    buttons: { basic, a1: false, a2: false, a3: false, revive: false },
  };
  w.step(0.01, new Map([['a', command]]));
}
describe('Pack Tactics chosen quarry', () => {
  it('repeats full pack waves while the hero stops attacking, then rests when the lease expires', () => {
    const { p, b, command, advance } = setup();
    command();
    advance(0.7);
    expect(b.hp).toBe(9976);
    advance(2.5);
    expect(b.hp).toBe(9952);
    advance(2.5);
    expect(b.hp).toBe(9928);
    advance(1);
    expect(p.spiritCompanion?.hunt).toBeUndefined();
    advance(4);
    expect(b.hp).toBe(9928);
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
    expect(b.hp).toBe(9980);
    expect(Number.isFinite(p.spiritCompanion!.pos.x)).toBe(true);
    expect(companionHuntView(w, p)?.targetId).toBe(b.id);
  });
  it('idle input and an unbound subclass button cannot arm or launch a hunt', () => {
    const { w, p, b } = setup();
    input(w, false);
    const buttons = { basic: false, a1: false, a2: false, a3: false, sub2: true, revive: false };
    w.step(
      0.01,
      new Map([
        ['a', { seq: w.tick, move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, buttons, autofire: true }],
      ]),
    );
    expect(p.companionPresses).toBeUndefined();
    expect(p.spiritCompanion!.flankers).toHaveLength(2);
    expect(p.spiritCompanion!.hunt).toBeUndefined();
    expect(b.hp).toBe(10000);
  });
  it('keeps all three followers beside the owner while idle, without acquiring targets', () => {
    const { w, p, b, advance } = setup();
    updateCompanions(w, 0.01);
    expect(p.spiritCompanion!.flankers).toHaveLength(2);
    p.pos = { x: 700, y: 600 };
    advance(1);
    expect(b.hp).toBe(10000);
    for (const wolf of [p.spiritCompanion!, ...p.spiritCompanion!.flankers!]) {
      expect(dist(wolf.pos, p.pos)).toBeLessThan(90);
      expect(wolf.order).toBeUndefined();
    }
    expect(w.serialize().players[0].spiritCompanion!.flankers).toHaveLength(2);
    expect(companionHuntView(w, p)).toBeUndefined();
    p.charUpgradeIds = [];
    updateCompanions(w, 0.01);
    expect(p.spiritCompanion!.flankers).toBeUndefined();
  });
  it('keeps the entire six-second hunt beyond activation range, then returns the pack without extra bites', () => {
    const { w, p, b, command, advance } = setup();
    command();
    p.pos = { x: 1300, y: 850 };
    expect(dist(p.pos, b.pos)).toBeGreaterThan(600);
    advance(0.7);
    expect(b.hp).toBe(9976);
    advance(2.5);
    expect(b.hp).toBe(9952);
    advance(2.5);
    expect(b.hp).toBe(9928);
    expect(companionHuntView(w, p)?.remaining).toBeGreaterThan(0);
    advance(0.4);
    expect(companionHuntView(w, p)).toBeUndefined();
    expect(p.spiritCompanion!.flankers).toHaveLength(2);
    advance(3);
    expect(b.hp).toBe(9928);
    for (const wolf of [p.spiritCompanion!, ...p.spiritCompanion!.flankers!])
      expect(dist(wolf.pos, p.pos)).toBeLessThan(90);
  });
  it.each(['cooldown', 'casting', 'stun', 'gliding'] as const)(
    'preserves one held command through %s until the first accepted cast',
    (gate) => {
      const { w, p, b } = setup();
      if (gate === 'cooldown') p.cooldowns.basic = 0.3;
      if (gate === 'casting') p.castTimer = 0.3;
      if (gate === 'stun') p.buffs.push(makeBuff('stun', 0, 0.3, 'test'));
      if (gate === 'gliding') resolvePlayerAbility(w, p, 'a3', { x: 0, y: 1 });
      input(w, true);
      expect(p.spiritCompanion?.hunt).toBeUndefined();
      expect(p.companionPresses?.basic).toBeDefined();
      for (let i = 0; i < 90; i++) {
        if (gate === 'gliding') b.pos.y = p.pos.y;
        input(w, true);
      }
      expect(p.spiritCompanion?.hunt?.targetId).toBe(b.id);
      expect(p.companionPresses?.basic).toBeUndefined();
      const hunt = p.spiritCompanion!.hunt!,
        hp = b.hp;
      for (let i = 0; i < 150; i++) input(w, true);
      expect(b.hp).toBeLessThan(hp - 24);
      expect(p.spiritCompanion!.hunt).toBe(hunt);
      expect(hunt.remaining).toBeLessThan(4);
      for (let i = 0; i < 600; i++) input(w, true);
      expect(p.spiritCompanion!.hunt).toBeUndefined();
    },
  );
  it('rejects a pending command after its source is replaced without tagging a later auto-cast', () => {
    const { w, p, b } = setup();
    p.cooldowns.basic = 0.3;
    input(w, true);
    p.abilities!.basic = { ...p.abilities!.basic };
    for (let i = 0; i < 150; i++) input(w, true);
    expect(b.hp).toBeLessThan(10000);
    expect(p.spiritCompanion?.hunt).toBeUndefined();
    expect(p.companionPresses?.basic).toBeUndefined();
  });
  it('does not introduce automatic ability casting when autofire is disabled', () => {
    const { w, p, b } = setup();
    p.cooldowns.basic = 0.3;
    input(w, true, false);
    for (let i = 0; i < 100; i++) input(w, true, false);
    expect(b.hp).toBe(10000);
    expect(p.spiritCompanion?.hunt).toBeUndefined();
    input(w, false, false);
    expect(p.companionPresses?.basic).toBeUndefined();
  });
  it('an out-of-range retarget attempt leaves the current hunt intact', () => {
    const { p, a, command, advance } = setup();
    command();
    const hunt = p.spiritCompanion!.hunt;
    p.pos = { x: 1300, y: 850 };
    command(a);
    advance(0.1);
    expect(p.spiritCompanion!.hunt).toBe(hunt);
  });
  it('releasing a blocked press cancels its pending command', () => {
    const { w, p } = setup();
    p.cooldowns.basic = 0.3;
    input(w, true);
    input(w, false);
    expect(p.companionPresses?.basic).toBeUndefined();
    for (let i = 0; i < 80; i++) input(w, false);
    expect(p.spiritCompanion?.hunt).toBeUndefined();
  });
  it('a missed first accepted cast does not transfer its command to later held auto-casts', () => {
    const { w, p, b } = setup();
    b.pos = { x: 650, y: 700 };
    input(w, true);
    expect(p.companionPresses?.basic).toBeUndefined();
    for (let i = 0; i < 60; i++) input(w, true);
    b.pos = { x: 650, y: 400 };
    for (let i = 0; i < 180; i++) input(w, true);
    expect(b.hp).toBeLessThan(10000);
    expect(p.spiritCompanion?.hunt).toBeUndefined();
  });
  it('the complete pack also hits a chosen add without acquiring another target', () => {
    const { a, b, command, advance } = setup();
    command(a);
    advance(0.7);
    expect(a.hp).toBe(976);
    expect(b.hp).toBe(10000);
  });
  it('interpolates smaller wolves across the seam and preserves idle followers after the hunt', () => {
    const { w, p, command } = setup();
    command();
    updateCompanions(w, 0.01);
    let clock = 1000;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    try {
      const interp = new SnapshotInterpolator();
      p.spiritCompanion!.flankers![0].pos = { x: ARENA_W - 10, y: 100 };
      interp.push(w.serialize());
      clock = 1100;
      p.spiritCompanion!.flankers![0].pos = { x: 10, y: 200 };
      interp.push(w.serialize());
      const view = interp.sample(1050 + INTERP_DELAY_MS, { localPlayerId: null, arena: w.arena })!;
      expect(view.players[0].spiritCompanion!.flankers![0].pos.x % ARENA_W).toBeCloseTo(0);
      expect(view.players[0].spiritCompanion!.flankers![0].pos.y).toBeCloseTo(150);
      clock = 1200;
      p.spiritCompanion!.hunt!.remaining = 0;
      updateCompanions(w, 0.01);
      interp.push(w.serialize());
      expect(
        interp.sample(1200 + INTERP_DELAY_MS, { localPlayerId: null, arena: w.arena })!.players[0]
          .spiritCompanion!.flankers,
      ).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });
  it('lands a staggered 24-damage wave, or 30 against controlled quarry', () => {
    for (const controlled of [false, true]) {
      const { p, b, command, advance } = setup();
      if (controlled) b.buffs.push(makeBuff('root', 0, 6, 'test'));
      command();
      advance(0.35);
      expect(10000 - b.hp).toBe(controlled ? 20 : 16);
      advance(0.15);
      expect(10000 - b.hp).toBe(controlled ? 25 : 20);
      advance(0.2);
      expect(10000 - b.hp).toBe(controlled ? 30 : 24);
      expect(p.spiritCompanion!.flankers).toHaveLength(2);
      expect(p.spiritCompanion!.flankers![0].pos.y).not.toBe(p.spiritCompanion!.flankers![1].pos.y);
    }
  });
  it('helper bites cannot consume a ward prepared after the lead bite', () => {
    const { p, b, command, advance } = setup();
    command();
    advance(0.35);
    prepareCompanionWard(p, p, 1);
    const token = p.spiritCompanion!.hunt!.cast;
    advance(0.4);
    expect(10000 - b.hp).toBe(24);
    expect(absorptionAmount(p.buffs)).toBe(0);
    expect(p.spiritCompanion!.wardTargetId).toBe(p.id);
    expect(p.spiritCompanion!.hunt!.cast).toBe(token);
    advance(2.2);
    expect(absorptionAmount(p.buffs)).toBeGreaterThan(0);
  });
  it('retargeting after the lead bite cancels both pending helper strikes without refunding the wave', () => {
    const { p, b, a, command, advance } = setup();
    command();
    advance(0.35);
    const gate = p.subclassPassiveCooldowns![PACK_BOND];
    command(a);
    expect(p.subclassPassiveCooldowns![PACK_BOND]).toBe(gate);
    advance(0.4);
    expect(b.hp).toBe(9984);
    expect(a.hp).toBe(1000);
    expect(p.spiritCompanion!.flankers!.every((wolf) => !wolf.order)).toBe(true);
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
    updateCompanions(w, 0.01);
    const pack = w.serialize().players[0].spiritCompanion!.flankers!;
    expect(pack).toHaveLength(2);
    expect(pack[0].pos).not.toBe(p.spiritCompanion!.flankers![0].pos);
    expect(JSON.stringify(pack)).not.toContain('order');
    expect(JSON.stringify(v)).not.toContain('cast');
    const g = new Graphics();
    drawCompanion(g, w.serialize().players[0].spiritCompanion!, { x: 100, y: 100 }, 1);
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
