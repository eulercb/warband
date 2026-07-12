/**
 * Warband — end-to-end integration: a full bot-driven fight with BOTH boss
 * affixes AND mid-fight corruption live at once (a cycle-1 gauntlet slot, exactly
 * how the host builds it). Proves the whole pipeline — roll → apply → simulate →
 * serialize — holds together and that the wire snapshot carries what the renderer
 * + HUD read (BossView.affixes, world telegraphs).
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/engine/world/world';
import { rollAffixes } from '../src/engine/content/affixes';
import { modifierForCycle, getMonster } from '../src/engine/content/monsters';
import { computeBotInput, rollPersonality } from '../src/engine/ai/bot';
import { Rng } from '../src/engine/core/math';
import type { WorldPlayerInit } from '../src/engine/world/world';

const DT = 0.05;

function finite(v: { x: number; y: number }): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

describe('affixes + corruption integration', () => {
  it('runs a full 4-bot affixed, corrupted fight cleanly and streams it over the wire', () => {
    const seed = 20260711;
    const monsterId = 'orc';
    const cycle = 1;
    // Build the encounter's affixes exactly as host.rollBossAffixes does.
    const affRng = new Rng((seed ^ 0x5eeda11c) >>> 0 || 1);
    const bossAffixes = [rollAffixes(getMonster(monsterId).tier, cycle, 2, affRng)];
    expect(bossAffixes[0].length).toBeGreaterThan(0); // slot 2, cycle 1 → affixes

    const classes = ['knight', 'ranger', 'cleric', 'mage'] as const;
    const players: WorldPlayerInit[] = classes.map((classId, i) => ({
      peerId: `bot${i}`,
      name: `Bot ${i}`,
      classId,
    }));
    const personalities = players.map((_, i) => rollPersonality(i + 1));

    const w = new World({
      monsterId,
      seed,
      players,
      cycle,
      modifier: modifierForCycle(cycle),
      bossAffixes,
      corruption: true,
    });
    // Force corruption to start soon so a few beats fire during this window.
    w.corruptionTimer = 2;

    let sawCorruption = false;
    let sawWorldTelegraph = false;

    for (let tick = 0; tick < 700 && !w.finished; tick++) {
      const inputs = new Map(
        w.players.map((p, i) => [p.peerId, computeBotInput(w, p, w.tick, personalities[i])]),
      );
      w.step(DT, inputs);
      // Keep beats firing briskly so a telegraph-producing kind (rain / vents /
      // collapse) reliably surfaces within the window — the exact beat picked is
      // stochastic (shared world RNG), so this makes the pipeline assertion below
      // robust to any unrelated sim-timing change rather than seed-fragile.
      if (w.corruptionTimer > 3) w.corruptionTimer = 2;

      if (w.events.some((e) => e.t === 'corruption')) sawCorruption = true;

      const snap = w.serialize();
      // The lead boss always carries its affixes over the wire.
      expect(snap.bosses[0]?.affixes).toEqual(bossAffixes[0]);
      if (snap.telegraphs && snap.telegraphs.length > 0) {
        sawWorldTelegraph = true;
        for (const tg of snap.telegraphs) expect(finite(tg.origin)).toBe(true);
      }
      // The sim never produces NaN positions for any entity.
      for (const b of w.bosses) expect(finite(b.pos)).toBe(true);
      for (const p of w.players) expect(finite(p.pos)).toBe(true);
      for (const a of w.adds) expect(finite(a.pos)).toBe(true);
    }

    // Over ~35s of fighting, both new systems demonstrably engaged.
    expect(sawCorruption).toBe(true);
    expect(sawWorldTelegraph).toBe(true);
    // The boss took real damage from the band (a healthy, progressing fight).
    expect(w.bosses[0].hp).toBeLessThan(w.bosses[0].maxHp);
  });
});
