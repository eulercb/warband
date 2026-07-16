/**
 * Warband — pure animation state-machine tests (brief §11 acceptance item).
 *
 * `entityAnim.ts` is Pixi-free, so we can pin the player priority order and the
 * boss action→clip mapping exactly, in the style of tests/fx.test.ts /
 * tests/zones.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  playerAnim,
  bossAnim,
  addAnim,
  projectileAnim,
  type PlayerAnimCtx,
} from '../src/render/sprites/entityAnim';
import type { PlayerView, BossView, Telegraph } from '../src/engine/core/types';

function player(over: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 1,
    peerId: 'p',
    name: 'P',
    classId: 'knight',
    pos: { x: 0, y: 0 },
    aim: { x: 1, y: 0 }, // east
    hp: 100,
    maxHp: 100,
    moveSpeed: 190,
    state: 'alive',
    cooldowns: { basic: 0, a1: 0, a2: 0, a3: 0 },
    buffs: [],
    downedTimer: 0,
    reviveProgress: 0,
    castSlot: null,
    castTimer: 0,
    castTimerMax: 0,
    score: 0,
    ...over,
  };
}

function ctx(over: Partial<PlayerAnimCtx> = {}): PlayerAnimCtx {
  return {
    dirMode: '8dir',
    moving: false,
    attack: null,
    attackClipMs: 320,
    castTotalMs: null,
    ...over,
  };
}

function boss(over: Partial<BossView> = {}): BossView {
  return {
    id: 9,
    monsterId: 'dragon',
    pos: { x: 0, y: 0 },
    facing: 0,
    hp: 100,
    maxHp: 100,
    phase: 'normal',
    telegraph: null,
    buffs: [],
    action: 'idle',
    abilityId: null,
    ...over,
  };
}

function tel(remainingWindup: number, totalWindup: number): Telegraph {
  return {
    kind: 'circle',
    origin: { x: 0, y: 0 },
    angle: 0,
    range: 0,
    radius: 0,
    halfAngle: 0,
    width: 0,
    target: { x: 0, y: 0 },
    remainingWindup,
    totalWindup,
  };
}

describe('playerAnim: priority order (dead > downed > rooted-cast > attack > walk > idle)', () => {
  it('dead wins over everything, one-shot', () => {
    const sel = playerAnim(
      player({ state: 'dead', castTimer: 1 }),
      ctx({ moving: true, attack: { slot: 'a1', ageMs: 0 } }),
    );
    expect(sel.clip).toBe('death');
    expect(sel.loop).toBe(false);
  });

  it('downed wins over cast/attack/move, loops', () => {
    const sel = playerAnim(
      player({ state: 'downed', castTimer: 1 }),
      ctx({ moving: true, attack: { slot: 'a1', ageMs: 0 } }),
    );
    expect(sel.clip).toBe('downed');
    expect(sel.loop).toBe(true);
  });

  it('rooted cast wins over attack/move and uses the cast slot', () => {
    const sel = playerAnim(
      player({ castTimer: 0.35, castSlot: 'a1' }),
      ctx({ moving: true, attack: { slot: 'basic', ageMs: 0 }, castTotalMs: 700 }),
    );
    expect(sel.clip).toBe('cast_a1');
    // progress = 1 - (0.35s * 1000) / 700ms = 0.5
    expect(sel.progress).toBeCloseTo(0.5);
    expect(sel.loop).toBe(false); // progress-driven → not free-looping
  });

  it('rooted cast without a known total free-runs the loop (progress null)', () => {
    const sel = playerAnim(player({ castTimer: 0.35, castSlot: 'a1' }), ctx({ castTotalMs: null }));
    expect(sel.clip).toBe('cast_a1');
    expect(sel.progress).toBeNull();
    expect(sel.loop).toBe(true);
  });

  it('rooted cast falls back to a1 when castSlot is null', () => {
    const sel = playerAnim(player({ castTimer: 0.2, castSlot: null }), ctx());
    expect(sel.clip).toBe('cast_a1');
  });

  it('a rooted subclass-skill cast falls back to the a1 cast pose (no cast_sub clip)', () => {
    const sel = playerAnim(player({ castTimer: 0.4, castSlot: 'sub1' }), ctx({ castTotalMs: 900 }));
    expect(sel.clip).toBe('cast_a1'); // charged sub nukes reuse the generic cast pose
    expect(sel.progress).toBeCloseTo(1 - (0.4 * 1000) / 900, 5);
  });

  it('instant attack plays while young, one-shot', () => {
    const sel = playerAnim(
      player(),
      ctx({ attack: { slot: 'a2', ageMs: 100 }, attackClipMs: 320 }),
    );
    expect(sel.clip).toBe('attack_a2');
    expect(sel.loop).toBe(false);
  });

  it('attack older than its clip falls through to locomotion', () => {
    const walk = playerAnim(
      player(),
      ctx({ moving: true, attack: { slot: 'a2', ageMs: 999 }, attackClipMs: 320 }),
    );
    expect(walk.clip).toBe('walk');
    const idle = playerAnim(
      player(),
      ctx({ moving: false, attack: { slot: 'a2', ageMs: 999 }, attackClipMs: 320 }),
    );
    expect(idle.clip).toBe('idle');
  });

  it('walk vs idle from the derived moving flag; both loop', () => {
    expect(playerAnim(player(), ctx({ moving: true })).clip).toBe('walk');
    expect(playerAnim(player(), ctx({ moving: false })).clip).toBe('idle');
    expect(playerAnim(player(), ctx({ moving: true })).loop).toBe(true);
  });

  it('facing maps aim east→e (8dir), west→w (own art, no flip)', () => {
    expect(playerAnim(player({ aim: { x: 1, y: 0 } }), ctx()).dir).toBe('e');
    const west = playerAnim(player({ aim: { x: -1, y: 0 } }), ctx());
    expect(west.dir).toBe('w');
    expect(west.flipX).toBe(false);
  });

  it('4dir mirrors west from the east sheet', () => {
    const west = playerAnim(player({ aim: { x: -1, y: 0 } }), ctx({ dirMode: '4dir' }));
    expect(west.dir).toBe('e');
    expect(west.flipX).toBe(true);
  });
});

describe('bossAnim: action → clip mapping', () => {
  it('windup is telegraph-progress-driven, one-shot, per-ability clip', () => {
    const sel = bossAnim(
      boss({ action: 'windup', abilityId: 'groundSlam', telegraph: tel(0.5, 1) }),
      '4dir',
    );
    expect(sel.clip).toBe('windup_groundSlam');
    expect(sel.progress).toBeCloseTo(0.5); // 1 - 0.5/1
    expect(sel.loop).toBe(false);
  });

  it('windup progress reaches 1 exactly as the telegraph fills', () => {
    const sel = bossAnim(
      boss({ action: 'windup', abilityId: 'smash', telegraph: tel(0, 1) }),
      '4dir',
    );
    expect(sel.progress).toBeCloseTo(1);
  });

  it('windup without a telegraph degrades to idle (no progress clip)', () => {
    const sel = bossAnim(boss({ action: 'windup', abilityId: 'smash', telegraph: null }), '4dir');
    expect(sel.clip).toBe('idle');
    expect(sel.progress).toBeNull();
  });

  it('clamps windup progress to 0 when more windup remains than the telegraph total', () => {
    // 1 - 2/1 = -1 → clamp01 floors it at 0 (progress never runs backwards).
    const sel = bossAnim(
      boss({ action: 'windup', abilityId: 'smash', telegraph: tel(2, 1) }),
      '4dir',
    );
    expect(sel.progress).toBe(0);
  });

  it('clamps windup progress to 1 when the telegraph over-fills (negative remaining)', () => {
    // 1 - (-1)/1 = 2 → clamp01 caps it at 1 (progress never overshoots the clip end).
    const sel = bossAnim(
      boss({ action: 'windup', abilityId: 'smash', telegraph: tel(-1, 1) }),
      '4dir',
    );
    expect(sel.progress).toBe(1);
  });

  it('channel loops on a per-ability clip', () => {
    const sel = bossAnim(boss({ action: 'channel', abilityId: 'lifeDrain' }), 'flip');
    expect(sel.clip).toBe('channel_lifeDrain');
    expect(sel.loop).toBe(true);
    expect(sel.progress).toBeNull();
  });

  it('recover is a short one-shot', () => {
    const sel = bossAnim(boss({ action: 'recover' }), '4dir');
    expect(sel.clip).toBe('recover');
    expect(sel.loop).toBe(false);
  });

  it('idle picks the enrage variant when enraged', () => {
    expect(bossAnim(boss({ action: 'idle', phase: 'normal' }), '4dir').clip).toBe('idle');
    expect(bossAnim(boss({ action: 'idle', phase: 'enraged' }), '4dir').clip).toBe('idle_enraged');
  });

  it('flip-mode lich faces left when facing west', () => {
    const sel = bossAnim(boss({ monsterId: 'lich', facing: Math.PI }), 'flip');
    expect(sel.dir).toBe('side');
    expect(sel.flipX).toBe(true);
  });
});

describe('addAnim / projectileAnim', () => {
  it('add walks vs idles on the derived moving flag, side-facing', () => {
    const a = { id: 3, pos: { x: 0, y: 0 }, hp: 10, maxHp: 60, buffs: [] };
    expect(addAnim(a, true).clip).toBe('walk');
    expect(addAnim(a, false).clip).toBe('idle');
    expect(addAnim(a, true).dir).toBe('side');
  });

  it('projectile just spins (rotation is applied by SpriteLayer)', () => {
    const pr = {
      id: 4,
      kind: 'arrow' as const,
      side: 'player' as const,
      pos: { x: 0, y: 0 },
      vel: { x: 1, y: 0 },
    };
    const sel = projectileAnim(pr);
    expect(sel.clip).toBe('spin');
    expect(sel.dir).toBeNull();
    expect(sel.loop).toBe(true);
  });
});
