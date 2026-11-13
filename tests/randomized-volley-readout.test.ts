import { afterEach, expect, it } from 'vitest';
import { World } from '../src/engine/world/world';
import { resolvePlayerAbility } from '../src/engine/combat/abilities';
import {
  describeCharOffer,
  previewAbilityTable,
  CHAR_UPGRADES,
} from '../src/engine/content/charUpgrades';
import { describeAbility } from '../src/engine/content/classes';
import { setProceduralSeed } from '../src/engine/content/procgen';
import { setForgeSeed } from '../src/engine/content/forge';
afterEach(() => {
  setProceduralSeed(null);
  setForgeSeed(null);
});
it('Volley adds two arrows and eight degrees per native rank across rolled starting counts', () => {
  const counts = new Set<number>();
  for (let seed = 0; seed < 32; seed++) {
    setProceduralSeed(seed);
    const base = previewAbilityTable('ranger', []).a1;
    counts.add(base.projCount!);
    for (let rank = 0; rank < 5; rank++) {
      const owned = Array<string>(rank).fill('rg_volley'),
        next = previewAbilityTable('ranger', [...owned, 'rg_volley']).a1;
      expect(next.projCount).toBe(base.projCount! + 2 * (rank + 1));
      expect(next.spreadDeg).toBe(base.spreadDeg! + 8 * (rank + 1));
      const offer = describeCharOffer('ranger', owned, 'rg_volley')!;
      expect(offer.desc).toContain('+2 arrows and +8°');
      expect(offer.desc).toContain(describeAbility(next));
      expect(offer.desc).not.toContain('looses 5 arrows');
    }
    const w = new World({
      seed: 31,
      monsterId: 'dragon',
      players: [{ peerId: 'a', name: 'Ranger', classId: 'ranger', charUpgrades: ['rg_volley'] }],
    });
    w.scene = null;
    resolvePlayerAbility(w, w.players[0], 'a1', { x: 0, y: 0 });
    expect(w.projectiles).toHaveLength(base.projCount! + 2);
  }
  expect(counts.size).toBeGreaterThan(1);
});
it.each([7, 31])(
  'Forge offer uses the actual receiver result at repeated ranks (seed %s)',
  (seed) => {
    setForgeSeed(seed);
    for (let rank = 0; rank < 5; rank++) {
      const owned = Array<string>(rank).fill('rg_volley');
      const next = previewAbilityTable('ranger', [...owned, 'rg_volley']).a1;
      expect(describeCharOffer('ranger', owned, 'rg_volley')!.desc).toContain(
        describeAbility(next),
      );
    }
  },
);
it('other projectile-count boons state additions rather than an assumed final fan', () => {
  expect(CHAR_UPGRADES.dr_thorns.desc).toContain('+1 thorn');
  expect(CHAR_UPGRADES.so_twin.desc).toContain('+1 bolt');
});
