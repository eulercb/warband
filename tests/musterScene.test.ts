import { describe, it, expect } from 'vitest';
import { MusterScene, MUSTER_DWELL_S, START_DWELL_S } from '../src/ui/state/musterScene';
import type { InputCommand, RenderState, Vec2 } from '../src/engine/core/types';

function inp(over: Partial<InputCommand> = {}): InputCommand {
  return {
    seq: 0,
    move: { x: 0, y: 0 },
    aim: { x: 0, y: -1 },
    buttons: { basic: false, a1: false, a2: false, a3: false, revive: false },
    ...over,
  };
}

function heroPos(state: RenderState): Vec2 {
  const id = state.localPlayerId;
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error('no local hero');
  return p.pos;
}

/** Walk the hero onto `target` and hold there past `holdS`. */
function walkOnto(
  scene: MusterScene,
  target: Vec2,
  startMs: number,
  holdS = MUSTER_DWELL_S + 0.2,
  frozen = false,
): number {
  let now = startMs;
  let state = scene.frame(now, frozen);
  let held = 0;
  for (let i = 0; i < 500; i++) {
    const hp = heroPos(state);
    const dx = target.x - hp.x;
    const dy = target.y - hp.y;
    const d = Math.hypot(dx, dy);
    if (d <= 14) {
      scene.setInput(inp({ move: { x: 0, y: 0 } }));
      held += 0.05;
    } else {
      scene.setInput(inp({ move: { x: dx / d, y: dy / d } }));
      held = 0;
    }
    now += 50;
    state = scene.frame(now, frozen);
    if (held >= holdS) break;
  }
  return now;
}

describe('MusterScene: construction', () => {
  it('builds a heroes-only hall with a muster rune (and a war-horn for the host)', () => {
    const client = new MusterScene('Aria', 'knight', false);
    const cs = client.frame(1000);
    expect(cs.players).toHaveLength(1);
    expect(cs.bosses).toHaveLength(0);
    expect((cs.stations ?? []).filter((s) => s.kind === 'muster')).toHaveLength(1);
    expect((cs.stations ?? []).filter((s) => s.kind === 'start')).toHaveLength(0);

    const host = new MusterScene('Aria', 'knight', true);
    const hs = host.frame(1000);
    expect((hs.stations ?? []).filter((s) => s.kind === 'start')).toHaveLength(1);
  });

  it('lights the rune while the store says ready', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    scene.setReady(true);
    const s = scene.frame(1000);
    expect((s.stations ?? []).find((x) => x.kind === 'muster')?.selected).toBe(true);
    scene.setReady(false);
    const s2 = scene.frame(1100);
    expect((s2.stations ?? []).find((x) => x.kind === 'muster')?.selected).toBe(false);
  });
});

describe('MusterScene: ready rune', () => {
  it('fires a muster trigger when the hero dwells on the rune', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    const first = scene.frame(1000);
    const rune = (first.stations ?? []).find((s) => s.kind === 'muster')!;
    walkOnto(scene, rune.pos, 1000);
    expect(scene.takeTriggers().some((t) => t.kind === 'muster')).toBe(true);
  });

  it('stays armed while the hero stands on it (no ready flip-flop)', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    const first = scene.frame(1000);
    const rune = (first.stations ?? []).find((s) => s.kind === 'muster')!;
    // Hold well past several dwell windows.
    walkOnto(scene, rune.pos, 1000, MUSTER_DWELL_S * 4);
    const trigs = scene.takeTriggers();
    expect(trigs.filter((t) => t.kind === 'muster')).toHaveLength(1);
  });

  it('re-arms after the hero steps off the rune', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    const first = scene.frame(1000);
    const rune = (first.stations ?? []).find((s) => s.kind === 'muster')!;
    let now = walkOnto(scene, rune.pos, 1000);
    expect(scene.takeTriggers().filter((t) => t.kind === 'muster')).toHaveLength(1);
    // Walk far away (the hero spawn area), then back onto the rune.
    now = walkOnto(scene, { x: 800, y: 800 }, now + 50);
    scene.takeTriggers();
    walkOnto(scene, rune.pos, now + 50);
    expect(scene.takeTriggers().filter((t) => t.kind === 'muster')).toHaveLength(1);
  });
});

describe('MusterScene: war-horn (host)', () => {
  it('seals the war-horn until the host can start', () => {
    const scene = new MusterScene('Aria', 'knight', true);
    const first = scene.frame(1000);
    const horn = (first.stations ?? []).find((s) => s.kind === 'start')!;
    // canStart defaults false → the horn is disabled and ignores dwell.
    walkOnto(scene, horn.pos, 1000, START_DWELL_S + 0.3);
    expect(scene.takeTriggers().some((t) => t.kind === 'start')).toBe(false);
    const s = scene.frame(9000);
    expect((s.stations ?? []).find((x) => x.kind === 'start')?.disabled).toBe(true);
  });

  it('fires start once the band is ready and the host holds the horn', () => {
    const scene = new MusterScene('Aria', 'knight', true);
    scene.setCanStart(true);
    const first = scene.frame(1000);
    const horn = (first.stations ?? []).find((s) => s.kind === 'start')!;
    walkOnto(scene, horn.pos, 1000, START_DWELL_S + 0.3);
    expect(scene.takeTriggers().some((t) => t.kind === 'start')).toBe(true);
  });
});

describe('MusterScene: class sync', () => {
  it('swaps the walking avatar when setClass is called (keeps position)', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    const first = scene.frame(1000);
    expect(first.players[0].classId).toBe('knight');
    // Nudge the hero so "keeps position" is a real assertion.
    scene.setInput(inp({ move: { x: 1, y: 0 } }));
    const moved = scene.frame(1250);
    const keptX = moved.players[0].pos.x;
    expect(keptX).toBeGreaterThan(800);

    scene.setInput(inp());
    scene.setClass('mage');
    const s = scene.frame(1500);
    expect(s.players[0].classId).toBe('mage');
    expect(s.players[0].pos.x).toBeCloseTo(keptX, 3);
  });
});

describe('MusterScene: overlay freeze', () => {
  it('holds the rune dwell frozen while an overlay is up', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    const first = scene.frame(1000);
    const rune = (first.stations ?? []).find((s) => s.kind === 'muster')!;
    walkOnto(scene, rune.pos, 1000, MUSTER_DWELL_S * 3, true); // frozen
    expect(scene.takeTriggers()).toHaveLength(0);
  });
});
