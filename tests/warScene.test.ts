import { describe, it, expect } from 'vitest';
import {
  WarScene,
  WAR_SELECT_DWELL_S,
  WAR_HOST_DWELL_S,
  type WarTrigger,
} from '../src/ui/state/warScene';
import { MONSTERS, MONSTER_IDS } from '../src/engine/content/monsters';
import { ARENA_W } from '../src/engine/core/constants';
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

describe('WarScene: constructor fallbacks', () => {
  it('falls back to the "easy" tier when the opener id is not a known monster', () => {
    // MONSTERS[bogus] is undefined, so `?.tier` short-circuits and `?? 'easy'`
    // supplies the tier — the gallery must open on the easy band.
    const scene = new WarScene('Aria', 'knight', 'not-a-real-boss' as MonsterId, false);
    const s = scene.frame(1000);
    const easyGate = (s.stations ?? []).find((x) => x.kind === 'tier' && x.refId === 'easy');
    expect(easyGate?.selected).toBe(true);
    const bosses = (s.stations ?? []).filter((x) => x.kind === 'boss');
    expect(bosses.length).toBeGreaterThan(0);
    expect(bosses.every((b) => MONSTERS[b.refId as MonsterId].tier === 'easy')).toBe(true);
  });

  it('falls back to the name "Hero" when constructed with an empty name', () => {
    const scene = new WarScene('', 'knight', EASY, false);
    const s = scene.frame(1000);
    expect(s.players[0].name).toBe('Hero');
  });

  it('centres a lone effigy when the active tier holds exactly one boss', () => {
    // Every real tier ships many bosses, so shrink the pool to hit the n === 1
    // layout path (effigy pinned to arena centre, flat arc offset).
    const saved = MONSTER_IDS.slice();
    try {
      const easyOne = saved.find((id) => MONSTERS[id].tier === 'easy')!;
      MONSTER_IDS.length = 0;
      MONSTER_IDS.push(easyOne);
      const scene = new WarScene('Aria', 'knight', easyOne, false);
      const s = scene.frame(1000);
      const bosses = (s.stations ?? []).filter((x) => x.kind === 'boss');
      expect(bosses).toHaveLength(1);
      expect(bosses[0].refId).toBe(easyOne);
      expect(bosses[0].pos.x).toBeCloseTo(ARENA_W / 2, 3); // n === 1 → x = ARENA_W / 2
    } finally {
      MONSTER_IDS.length = 0;
      MONSTER_IDS.push(...saved);
    }
  });
});

describe('WarScene: commit edge cases', () => {
  it('commits the single-fight portal when the hero switches back from gauntlet', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    const single = (first.stations ?? []).find((x) => x.kind === 'single')!;
    // With gauntlet armed, stepping onto SINGLE is a real (non-no-op) selection.
    scene.setGauntlet(true);
    walkOnto(scene, single.pos, 1000);
    expect(scene.takeTriggers().some((t: WarTrigger) => t.kind === 'single')).toBe(true);
    const s = scene.frame(9000);
    expect((s.stations ?? []).find((x) => x.kind === 'single')?.selected).toBe(true);
    expect((s.stations ?? []).find((x) => x.kind === 'gauntlet')?.selected).toBe(false);
  });

  it('ignores a malformed station kind on commit (no trigger, pick untouched)', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const before = scene.frame(1000);
    const selBefore = (before.stations ?? []).find((x) => x.kind === 'boss' && x.selected)?.refId;
    // A boss station missing its refId slips past every guard down to the final
    // `if (s.kind === 'host')` — whose false side must leave the room untouched.
    (scene as unknown as { commit(s: unknown): void }).commit({
      kind: 'boss',
      pos: { x: 0, y: 0 },
    });
    expect(scene.takeTriggers()).toHaveLength(0);
    const after = scene.frame(1050);
    const selAfter = (after.stations ?? []).find((x) => x.kind === 'boss' && x.selected)?.refId;
    expect(selAfter).toBe(selBefore);
  });

  it('does not re-fire the gauntlet portal when gauntlet mode is already active', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    const gauntlet = (first.stations ?? []).find((x) => x.kind === 'gauntlet')!;
    scene.setGauntlet(true); // already on → stepping back onto it is a no-op
    walkOnto(scene, gauntlet.pos, 1000);
    expect(scene.takeTriggers().filter((t) => t.kind === 'gauntlet')).toHaveLength(0);
    const s = scene.frame(9000);
    expect((s.stations ?? []).find((x) => x.kind === 'gauntlet')?.selected).toBe(true);
  });

  it('picks the nearest of two overlapping stations under the hero', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const state = scene.frame(1000);
    const hp = heroPos(state);
    // Two host portals the hero stands within: the loop must keep the nearer one
    // and reject the farther (frac > bestFrac), leaving `best` on station 701.
    (scene as unknown as { stations: unknown[] }).stations = [
      {
        id: 701,
        kind: 'host',
        pos: { x: hp.x, y: hp.y },
        radius: 46,
        triggerRadius: 84,
        dwell: 0.8,
        portal: true,
      },
      {
        id: 702,
        kind: 'host',
        pos: { x: hp.x, y: hp.y + 40 },
        radius: 46,
        triggerRadius: 84,
        dwell: 0.8,
        portal: true,
      },
    ];
    const under = (scene as unknown as { stationUnder(): { id: number } | null }).stationUnder();
    expect(under?.id).toBe(701);
  });
});

describe('WarScene: run-mode modifier toggles', () => {
  it('lays one pedestal per modifier toggle (hardcore / chaosforge / daily / chaosdraft)', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const st = scene.frame(1000).stations ?? [];
    for (const kind of ['hardcore', 'chaosforge', 'daily', 'chaosdraft'] as const) {
      const matches = st.filter((x) => x.kind === kind);
      expect(matches).toHaveLength(1);
      expect(matches[0].portal).toBeFalsy(); // pedestals, not walk-into portals
    }
  });

  it('keeps every toggle trigger ring clear of the other stations', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const st = scene.frame(1000).stations ?? [];
    const toggles = st.filter((x) =>
      ['hardcore', 'chaosforge', 'daily', 'chaosdraft'].includes(x.kind),
    );
    for (const t of toggles) {
      for (const other of st) {
        if (other.id === t.id) continue;
        const d = Math.hypot(t.pos.x - other.pos.x, t.pos.y - other.pos.y);
        // Rings must not touch, or one station would channel another.
        expect(d).toBeGreaterThan(t.triggerRadius + other.triggerRadius);
      }
    }
  });

  it('toggles an ungated modifier (Chaos Forge) on and back off across two visits', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    const forge = (first.stations ?? []).find((x) => x.kind === 'chaosforge')!;
    expect(forge.disabled).toBeFalsy(); // ungated — always active
    // First visit: turns it ON.
    let now = walkOnto(scene, forge.pos, 1000);
    expect(scene.takeTriggers().filter((t) => t.kind === 'chaosforge')).toHaveLength(1);
    expect((scene.frame(now).stations ?? []).find((x) => x.kind === 'chaosforge')?.selected).toBe(
      true,
    );
    // Step away to re-arm, then a second visit turns it OFF.
    now = walkOnto(scene, { x: 800, y: 780 }, now + 50);
    scene.takeTriggers();
    walkOnto(scene, forge.pos, now + 50);
    expect(scene.takeTriggers().filter((t) => t.kind === 'chaosforge')).toHaveLength(1);
    expect((scene.frame(60000).stations ?? []).find((x) => x.kind === 'chaosforge')?.selected).toBe(
      false,
    );
  });

  it('fires an ungated toggle only ONCE per visit (armed latch)', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    const first = scene.frame(1000);
    const draft = (first.stations ?? []).find((x) => x.kind === 'chaosdraft')!;
    walkOnto(scene, draft.pos, 1000, WAR_SELECT_DWELL_S * 4); // hold past several dwells
    expect(scene.takeTriggers().filter((t) => t.kind === 'chaosdraft')).toHaveLength(1);
  });

  it('seals the gauntlet-only toggles (Hardcore / Run of the Day) for a single fight', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false); // gauntlet off
    const first = scene.frame(1000);
    for (const kind of ['hardcore', 'daily'] as const) {
      const station = (first.stations ?? []).find((x) => x.kind === kind)!;
      expect(station.disabled).toBe(true);
      expect(station.selected).toBe(false);
      expect(station.label).toContain('gauntlet only');
      walkOnto(scene, station.pos, 1000 + 20000);
      expect(scene.takeTriggers().some((t) => t.kind === kind)).toBe(false); // inert
    }
  });

  it('unseals + toggles Hardcore once the run is a gauntlet', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    scene.setGauntlet(true); // as the gauntlet portal / List view would
    const first = scene.frame(1000);
    const hardcore = (first.stations ?? []).find((x) => x.kind === 'hardcore')!;
    expect(hardcore.disabled).toBe(false);
    walkOnto(scene, hardcore.pos, 1000);
    expect(scene.takeTriggers().filter((t) => t.kind === 'hardcore')).toHaveLength(1);
    expect((scene.frame(60000).stations ?? []).find((x) => x.kind === 'hardcore')?.selected).toBe(
      true,
    );
  });

  it('reflects the store setters on the pedestals (List view → scene sync)', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    scene.setGauntlet(true);
    scene.setHardcore(true);
    scene.setChaosForge(true);
    scene.setSeedDaily(true);
    scene.setRandomKits(true);
    const st = scene.frame(1000).stations ?? [];
    expect(st.find((x) => x.kind === 'hardcore')?.selected).toBe(true);
    expect(st.find((x) => x.kind === 'chaosforge')?.selected).toBe(true);
    expect(st.find((x) => x.kind === 'daily')?.selected).toBe(true);
    expect(st.find((x) => x.kind === 'chaosdraft')?.selected).toBe(true);
  });

  it('a gauntlet-only toggle set ON still reads greyed + unlit while single-fight is chosen', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false); // gauntlet off
    scene.setHardcore(true); // its store value persists, but it does not apply
    scene.setSeedDaily(true);
    const st = scene.frame(1000).stations ?? [];
    for (const kind of ['hardcore', 'daily'] as const) {
      const station = st.find((x) => x.kind === kind)!;
      expect(station.disabled).toBe(true);
      expect(station.selected).toBe(false); // ON underneath, but not lit while sealed
    }
    // Flip to a gauntlet and the preserved ON state lights up.
    scene.setGauntlet(true);
    const st2 = scene.frame(1100).stations ?? [];
    expect(st2.find((x) => x.kind === 'hardcore')?.selected).toBe(true);
    expect(st2.find((x) => x.kind === 'daily')?.selected).toBe(true);
  });

  it('toggles Run of the Day from any prior seed state (custom → daily)', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    scene.setGauntlet(true);
    scene.setSeedDaily(false); // e.g. seedMode was 'custom' or 'random' — not daily
    const first = scene.frame(1000);
    const daily = (first.stations ?? []).find((x) => x.kind === 'daily')!;
    expect(daily.selected).toBe(false);
    walkOnto(scene, daily.pos, 1000);
    expect(scene.takeTriggers().filter((t) => t.kind === 'daily')).toHaveLength(1);
    expect((scene.frame(60000).stations ?? []).find((x) => x.kind === 'daily')?.selected).toBe(
      true,
    );
  });

  it('survives a tier switch with the toggle states intact', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    scene.setChaosForge(true);
    const first = scene.frame(1000);
    const hardGate = (first.stations ?? []).find((x) => x.kind === 'tier' && x.refId === 'hard')!;
    walkOnto(scene, hardGate.pos, 1000); // rebuilds the station set
    const st = scene.frame(60000).stations ?? [];
    // The rebuilt Chaos Forge pedestal still reads its preserved ON state.
    expect(st.find((x) => x.kind === 'chaosforge')?.selected).toBe(true);
  });
});

describe('WarScene: hero-absent guards', () => {
  it('reports null / stays inert when the world has no hero', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    scene.frame(1000);
    const raw = scene as unknown as {
      world: { players: unknown[] };
      armedId: number | null;
      heroPos(): Vec2 | null;
      stationUnder(): unknown;
      clearArmedLatch(): void;
    };
    raw.armedId = 1;
    raw.world.players = [];
    expect(raw.heroPos()).toBeNull(); // heroPos: p ? p.pos : null
    expect(scene.focusBoss()).toBeNull(); // focusBoss: !hp guard
    expect(raw.stationUnder()).toBeNull(); // stationUnder: !hp guard
    raw.clearArmedLatch(); // clearArmedLatch: !hp guard returns before clearing
    expect(raw.armedId).toBe(1);
  });

  it('clears an armed latch that points at a station that no longer exists', () => {
    const scene = new WarScene('Aria', 'knight', EASY, false);
    scene.frame(1000); // hero present, position known
    const raw = scene as unknown as { armedId: number | null; clearArmedLatch(): void };
    raw.armedId = 99999; // no station has this id
    raw.clearArmedLatch(); // !armed → latch released
    expect(raw.armedId).toBeNull();
  });
});
