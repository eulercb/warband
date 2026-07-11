import { describe, it, expect } from 'vitest';
import {
  WarScene,
  WAR_SELECT_DWELL_S,
  WAR_HOST_DWELL_S,
  type WarTrigger,
} from '../src/ui/state/warScene';
import { MONSTERS, MONSTER_IDS } from '../src/engine/content/monsters';
import type { InputCommand, RenderState, Vec2, MonsterId } from '../src/engine/core/types';

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
  scene: WarScene,
  target: Vec2,
  startMs: number,
  holdS = WAR_SELECT_DWELL_S + 0.2,
): number {
  let now = startMs;
  let state = scene.frame(now);
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
    state = scene.frame(now);
    if (held >= holdS) break;
  }
  return now;
}

const EASY = MONSTER_IDS.find((id) => MONSTERS[id].tier === 'easy')!;

describe('WarScene: construction', () => {
  it('builds a heroes-only war world with tier gates, effigies + portals', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const s = scene.frame(1000);
    expect(s.players).toHaveLength(1);
    expect(s.bosses).toHaveLength(0);
    const st = s.stations ?? [];
    expect(st.filter((x) => x.kind === 'tier')).toHaveLength(3);
    expect(st.filter((x) => x.kind === 'single')).toHaveLength(1);
    expect(st.filter((x) => x.kind === 'gauntlet')).toHaveLength(1);
    expect(st.filter((x) => x.kind === 'host')).toHaveLength(1);
    // The gallery shows the opener's tier (easy), one effigy per easy boss.
    const easyCount = MONSTER_IDS.filter((id) => MONSTERS[id].tier === 'easy').length;
    expect(st.filter((x) => x.kind === 'boss')).toHaveLength(easyCount);
  });

  it('marks the current opener + run mode as selected', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const s = scene.frame(1000);
    const st = s.stations ?? [];
    const selBoss = st.filter((x) => x.kind === 'boss' && x.selected);
    expect(selBoss).toHaveLength(1);
    expect(selBoss[0].refId).toBe(EASY);
    expect(st.find((x) => x.kind === 'single')?.selected).toBe(true);
    expect(st.find((x) => x.kind === 'gauntlet')?.selected).toBe(false);
    expect(st.find((x) => x.kind === 'tier' && x.refId === 'easy')?.selected).toBe(true);
  });
});

describe('WarScene: selection', () => {
  it('picks a boss the hero walks onto (emits a boss trigger, lights the effigy)', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    const other = (first.stations ?? []).find((x) => x.kind === 'boss' && x.refId !== EASY)!;
    expect(other).toBeDefined();
    walkOnto(scene, other.pos, 1000);
    const trigs = scene.takeTriggers();
    expect(trigs.some((t: WarTrigger) => t.kind === 'boss' && t.refId === other.refId)).toBe(true);
    const s = scene.frame(9000);
    const sel = (s.stations ?? []).filter((x) => x.kind === 'boss' && x.selected);
    expect(sel).toHaveLength(1);
    expect(sel[0].refId).toBe(other.refId);
  });

  it('switches the gallery tier when the hero walks onto a tier gate (no trigger)', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    const hardGate = (first.stations ?? []).find((x) => x.kind === 'tier' && x.refId === 'hard')!;
    walkOnto(scene, hardGate.pos, 1000);
    // Tier switch is internal — no external trigger.
    expect(scene.takeTriggers()).toHaveLength(0);
    const s = scene.frame(9000);
    const bosses = (s.stations ?? []).filter((x) => x.kind === 'boss');
    expect(bosses.length).toBeGreaterThan(0);
    expect(bosses.every((b) => MONSTERS[b.refId as MonsterId].tier === 'hard')).toBe(true);
    expect((s.stations ?? []).find((x) => x.kind === 'tier' && x.refId === 'hard')?.selected).toBe(
      true,
    );
  });

  it('toggles run mode when the hero steps into the gauntlet portal', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    const gauntlet = (first.stations ?? []).find((x) => x.kind === 'gauntlet')!;
    walkOnto(scene, gauntlet.pos, 1000);
    expect(scene.takeTriggers().some((t) => t.kind === 'gauntlet')).toBe(true);
    const s = scene.frame(9000);
    expect((s.stations ?? []).find((x) => x.kind === 'gauntlet')?.selected).toBe(true);
    expect((s.stations ?? []).find((x) => x.kind === 'single')?.selected).toBe(false);
  });

  it('fires the host trigger only after the longer commit dwell', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    const host = (first.stations ?? []).find((x) => x.kind === 'host')!;
    // A brief brush (under the host dwell, but over the select dwell) must NOT host.
    walkOnto(scene, host.pos, 1000, WAR_SELECT_DWELL_S + 0.15);
    expect(scene.takeTriggers().some((t) => t.kind === 'host')).toBe(false);
    // Hold the full commit dwell → host fires.
    walkOnto(scene, host.pos, 40000, WAR_HOST_DWELL_S + 0.3);
    expect(scene.takeTriggers().some((t) => t.kind === 'host')).toBe(true);
  });

  it('fires host only ONCE per visit — standing on it does not re-fire', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    const host = (first.stations ?? []).find((x) => x.kind === 'host')!;
    // Hold far past several host-dwell windows.
    walkOnto(scene, host.pos, 1000, WAR_HOST_DWELL_S * 3);
    expect(scene.takeTriggers().filter((t) => t.kind === 'host')).toHaveLength(1);
  });
});

describe('WarScene: inspector + freeze', () => {
  it('focusBoss surfaces the effigy the hero stands near', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    expect(scene.focusBoss()).toBeNull();
    const other = (first.stations ?? []).find((x) => x.kind === 'boss' && x.refId !== EASY)!;
    walkOnto(scene, other.pos, 1000);
    expect(scene.focusBoss()).toBe(other.refId);
  });

  it('holds selection frozen while an overlay is up', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    const other = (first.stations ?? []).find((x) => x.kind === 'boss' && x.refId !== EASY)!;
    // Drive the hero onto the effigy with frozen frames — moves but never picks.
    let now = 1000;
    let state = first;
    for (let i = 0; i < 300; i++) {
      const hp = heroPos(state);
      const dx = other.pos.x - hp.x;
      const dy = other.pos.y - hp.y;
      const d = Math.hypot(dx, dy);
      scene.setInput(inp({ move: d <= 14 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d } }));
      now += 50;
      state = scene.frame(now, true); // frozen
    }
    expect(scene.takeTriggers()).toHaveLength(0);
  });
});
