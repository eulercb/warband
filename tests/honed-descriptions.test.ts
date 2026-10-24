import { afterEach, expect, it } from 'vitest';
import { SUB_SKILL_UPGRADES, getCharUpgrade } from '../src/engine/content/charUpgrades';
import { getSubSkill } from '../src/engine/content/subclasses';
import { setForgeSeed } from '../src/engine/content/forge';
afterEach(() => setForgeSeed(null));
it.each([null, 1, 31, 99])(
  'all Honed descriptions remain specific and Forge names resolve at seed %s',
  (seed) => {
    setForgeSeed(seed);
    for (const entry of SUB_SKILL_UPGRADES) {
      const view = getCharUpgrade(entry.id)!;
      expect(view.desc).not.toContain('strikes harder, reaches wider');
      expect(view.desc).not.toMatch(/NaN|undefined|Infinity/);
      if (seed !== null) expect(view.desc).toContain(getSubSkill(entry.subSkillId!)!.name);
      if (view.desc.includes('first rank:')) {
        expect(view.desc).toMatch(/recharge \d/);
        if (getSubSkill(entry.subSkillId!)!.ability.kind === 'groundZone')
          expect(view.desc).not.toContain('direct damage');
      }
    }
  },
);
