import { describe, it, expect } from 'vitest';
import {
  MusterScene,
  MUSTER_DWELL_S,
  START_DWELL_S,
  REMOVEBOT_DWELL_S,
} from '../src/ui/state/musterScene';
import { CLASS_IDS } from '../src/engine/content/classes';
import { ARENA_W, ARENA_H } from '../src/engine/core/constants';
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

describe('MusterScene: add-bot effigies (item 1)', () => {
  it('lays one class effigy per class for the host (none for a client)', () => {
    const client = new MusterScene('Aria', 'knight', false);
    expect((client.frame(1000).stations ?? []).filter((s) => s.kind === 'addbot')).toHaveLength(0);

    const host = new MusterScene('Aria', 'knight', true);
    const effigies = (host.frame(1000).stations ?? []).filter((s) => s.kind === 'addbot');
    expect(effigies).toHaveLength(CLASS_IDS.length);
    expect(new Set(effigies.map((e) => e.refId))).toEqual(new Set(CLASS_IDS));
    for (const e of effigies) {
      expect(e.portal).toBe(false); // pedestals, not walk-into portals
      // On the same torus tile as the y=780 / x=800 spawn (no nearest-copy flip).
      expect(Math.abs(780 - e.pos.y)).toBeLessThan(ARENA_H / 2);
      expect(Math.abs(800 - e.pos.x)).toBeLessThan(ARENA_W / 2);
    }
  });

  it('fires an addbot trigger carrying the class when the host walks onto an effigy', () => {
    const scene = new MusterScene('Aria', 'knight', true);
    const first = scene.frame(1000);
    const mage = (first.stations ?? []).find((s) => s.kind === 'addbot' && s.refId === 'mage')!;
    walkOnto(scene, mage.pos, 1000);
    const trigs = scene.takeTriggers().filter((t) => t.kind === 'addbot');
    expect(trigs).toHaveLength(1);
    expect(trigs[0].refId).toBe('mage');
  });

  it('greys out and refuses the effigies once the band is full', () => {
    const scene = new MusterScene('Aria', 'knight', true);
    scene.setPartyFull(true);
    const first = scene.frame(1000);
    const eff = (first.stations ?? []).find((s) => s.kind === 'addbot')!;
    expect(eff.disabled).toBe(true);
    expect(eff.label).toBe('BAND FULL');
    walkOnto(scene, eff.pos, 1000);
    expect(scene.takeTriggers().some((t) => t.kind === 'addbot')).toBe(false);
  });
});

describe('MusterScene: your-band removal markers', () => {
  const BAND = [
    { peerId: 'bot1', classId: 'mage' as const },
    { peerId: 'bot2', classId: 'mage' as const },
    { peerId: 'bot3', classId: 'ranger' as const },
  ];

  it('projects one removal marker per bot for the host (labelled by class)', () => {
    const scene = new MusterScene('Aria', 'knight', true);
    scene.setBots(BAND);
    const markers = (scene.frame(1000).stations ?? []).filter((s) => s.kind === 'removebot');
    expect(markers).toHaveLength(3);
    expect(markers.map((m) => m.refId)).toEqual(['bot1', 'bot2', 'bot3']);
    expect(new Set(markers.map((m) => m.label))).toEqual(
      new Set(['✕ Mage bot', '✕ Mage bot', '✕ Ranger bot']),
    );
    for (const m of markers) {
      expect(m.portal).toBe(false); // pedestals, not walk-into portals
      expect(m.disabled).toBeFalsy(); // always removable
      // Torus-safe: on the same tile as the y=780 spawn (no nearest-copy flip).
      expect(Math.abs(780 - m.pos.y)).toBeLessThan(ARENA_H / 2);
      expect(Math.abs(800 - m.pos.x)).toBeLessThan(ARENA_W / 2);
    }
  });

  it('adds no removal markers for a client (only the host removes bots)', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    scene.setBots(BAND);
    expect((scene.frame(1000).stations ?? []).filter((s) => s.kind === 'removebot')).toHaveLength(0);
  });

  it('keeps every marker trigger ring clear of the hall stations and each other', () => {
    const scene = new MusterScene('Aria', 'knight', true);
    scene.setBots(BAND);
    const st = scene.frame(1000).stations ?? [];
    const markers = st.filter((s) => s.kind === 'removebot');
    for (const m of markers) {
      for (const other of st) {
        if (other.id === m.id) continue;
        const d = Math.hypot(m.pos.x - other.pos.x, m.pos.y - other.pos.y);
        expect(d).toBeGreaterThan(m.triggerRadius + other.triggerRadius);
      }
    }
  });

  it('removes the specific bot the host walks onto (emits its peerId)', () => {
    // The task's worked example: 2 Mage bots + 1 Ranger → three markers; walk onto
    // one to cull just that bot.
    const scene = new MusterScene('Aria', 'knight', true);
    scene.setBots(BAND);
    const ranger = (scene.frame(1000).stations ?? []).find(
      (s) => s.kind === 'removebot' && s.refId === 'bot3',
    )!;
    walkOnto(scene, ranger.pos, 1000, REMOVEBOT_DWELL_S + 0.2);
    const trigs = scene.takeTriggers().filter((t) => t.kind === 'removebot');
    expect(trigs).toHaveLength(1);
    expect(trigs[0].refId).toBe('bot3');
  });

  it('fires a removal only ONCE per visit (armed latch)', () => {
    const scene = new MusterScene('Aria', 'knight', true);
    scene.setBots([{ peerId: 'bot1', classId: 'mage' }]);
    const marker = (scene.frame(1000).stations ?? []).find((s) => s.kind === 'removebot')!;
    walkOnto(scene, marker.pos, 1000, REMOVEBOT_DWELL_S * 4); // hold past several dwells
    expect(scene.takeTriggers().filter((t) => t.kind === 'removebot')).toHaveLength(1);
  });

  it('re-lays the markers when the band changes (removed bot drops out)', () => {
    const scene = new MusterScene('Aria', 'knight', true);
    scene.setBots(BAND);
    expect((scene.frame(1000).stations ?? []).filter((s) => s.kind === 'removebot')).toHaveLength(3);
    // The host removed bot2 → the store feeds the shorter roster next frame.
    scene.setBots([BAND[0], BAND[2]]);
    const markers = (scene.frame(1100).stations ?? []).filter((s) => s.kind === 'removebot');
    expect(markers.map((m) => m.refId)).toEqual(['bot1', 'bot3']);
  });

  it('does not duplicate markers when fed the same band repeatedly', () => {
    const scene = new MusterScene('Aria', 'knight', true);
    scene.setBots(BAND);
    scene.setBots(BAND);
    scene.setBots(BAND);
    expect((scene.frame(1000).stations ?? []).filter((s) => s.kind === 'removebot')).toHaveLength(3);
  });

  it('re-centres a shrinking band without sliding a marker onto the standing hero', () => {
    // Removing one bot shifts the rest by only half the spacing — comfortably past a
    // trigger radius — so the hero standing where a bot was is never caught by another.
    const scene = new MusterScene('Aria', 'knight', true);
    scene.setBots(BAND);
    const before = (scene.frame(1000).stations ?? []).filter((s) => s.kind === 'removebot');
    const removed = before.find((m) => m.refId === 'bot2')!; // the middle marker
    scene.setBots([BAND[0], BAND[2]]);
    const after = (scene.frame(1100).stations ?? []).filter((s) => s.kind === 'removebot');
    for (const m of after) {
      const d = Math.hypot(m.pos.x - removed.pos.x, m.pos.y - removed.pos.y);
      expect(d).toBeGreaterThan(m.triggerRadius);
    }
  });

  it('labels the add-bot effigies as bot-adders', () => {
    const scene = new MusterScene('Aria', 'knight', true);
    const eff = (scene.frame(1000).stations ?? []).find(
      (s) => s.kind === 'addbot' && s.refId === 'mage',
    )!;
    expect(eff.label).toBe('+ Mage bot');
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

describe('MusterScene: construction fallbacks', () => {
  it('falls back to the name "Hero" when built with an empty name', () => {
    const scene = new MusterScene('', 'knight', false);
    const s = scene.frame(1000);
    expect(s.players[0].name).toBe('Hero');
  });
});

describe('MusterScene: class sync edge cases', () => {
  it('is a no-op when the class is unchanged (keeps the same world/tick)', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    scene.frame(1000); // baseline
    const before = scene.frame(2000); // +1s clamped to 0.25s => tick 5
    expect(before.tick).toBe(5);
    scene.setClass('knight'); // same class → early return, world not rebuilt
    const s = scene.frame(3000); // world kept counting
    expect(s.tick).toBe(10);
    expect(s.players[0].classId).toBe('knight');
  });

  it('rebuilds from a fresh spawn when there is no hero to carry over', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    scene.frame(1000);
    (scene as unknown as { world: { players: unknown[] } }).world.players = [];
    scene.setClass('mage'); // prev is undefined → build(null), no kept position
    const s = scene.frame(1050);
    expect(s.players[0].classId).toBe('mage');
    expect(s.players[0].pos.x).toBeCloseTo(800, 3); // default spawn, nothing carried over
    expect(s.players[0].pos.y).toBeCloseTo(780, 3);
  });
});

describe('MusterScene: station selection internals', () => {
  it('reports null / stays inert when the world has no hero', () => {
    const scene = new MusterScene('Aria', 'knight', true);
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
    expect(raw.stationUnder()).toBeNull(); // stationUnder: !hp guard
    raw.clearArmedLatch(); // clearArmedLatch: !hp guard returns before clearing
    expect(raw.armedId).toBe(1);
  });

  it('picks the nearest of two overlapping stations under the hero', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    const state = scene.frame(1000);
    const hp = heroPos(state);
    // Two runes the hero stands within: the loop keeps the nearer and rejects the
    // farther (frac > bestFrac), so `best` settles on station 501.
    (scene as unknown as { stations: unknown[] }).stations.push(
      {
        id: 501,
        kind: 'muster',
        pos: { x: hp.x, y: hp.y },
        radius: 46,
        triggerRadius: 88,
        label: 'a',
        color: 0,
        dwell: 0.4,
      },
      {
        id: 502,
        kind: 'muster',
        pos: { x: hp.x, y: hp.y + 40 },
        radius: 46,
        triggerRadius: 88,
        label: 'b',
        color: 0,
        dwell: 0.4,
      },
    );
    const under = (scene as unknown as { stationUnder(): { id: number } | null }).stationUnder();
    expect(under?.id).toBe(501);
  });

  it('leaves a station label untouched when its kind is neither rune nor horn', () => {
    const scene = new MusterScene('Aria', 'knight', false);
    (scene as unknown as { stations: unknown[] }).stations.push({
      id: 99,
      kind: 'host',
      pos: { x: 0, y: 0 },
      radius: 46,
      triggerRadius: 88,
      label: 'CUSTOM LABEL',
      color: 0x123456,
      dwell: 0.5,
    });
    const s = scene.frame(1000);
    const view = (s.stations ?? []).find((x) => x.id === 99);
    expect(view?.label).toBe('CUSTOM LABEL'); // neither muster nor start → label kept
  });
});
