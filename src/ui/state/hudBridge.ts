/**
 * Warband — RenderState → hudStore bridge, shared by the in-fight GameView and
 * the menu playground. Called at a throttled cadence from the hot render loop.
 */
import { hudSet } from './hudStore';
import { getMonster } from '../../engine/content/monsters';
import { REVIVE_TIME } from '../../engine/core/constants';
import type { RenderState } from '../../engine/core/types';
import type { InputSource } from '../../input/input';

export function pushHud(state: RenderState, source: InputSource): void {
  const localId = state.localPlayerId;
  const lp = localId != null ? (state.players.find((p) => p.id === localId) ?? null) : null;
  hudSet({
    active: true,
    classId: lp?.classId ?? null,
    hp: lp?.hp ?? 0,
    maxHp: lp?.maxHp ?? 1,
    state: lp?.state ?? 'dead',
    cooldowns: lp?.cooldowns ?? { basic: 0, a1: 0, a2: 0, a3: 0 },
    casting: (lp?.castTimer ?? 0) > 0,
    inputSource: source,
    buffs: lp?.buffs ?? [],
    score: lp?.score ?? 0,
    subSkills: lp?.subSkills ?? [],
    classes: lp?.classes ?? [],
    potions: lp?.potions ?? 0,
    bosses: state.bosses.map((b) => ({
      id: b.id,
      name: getMonster(b.monsterId).name,
      hp: b.hp,
      maxHp: b.maxHp,
      phase: b.phase,
      buffs: b.buffs,
      flying: getMonster(b.monsterId).flying === true, // item 1
      modName: b.modName ?? '',
      affixes: b.affixes ?? [],
    })),
    teammates: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      classId: p.classId,
      hp: p.hp,
      maxHp: p.maxHp,
      state: p.state,
      isLocal: p.id === localId,
      buffs: p.buffs,
      score: p.score,
    })),
    reviveProgress: lp && lp.state === 'downed' ? Math.min(1, lp.reviveProgress / REVIVE_TIME) : 0,
    downedTimer: lp?.downedTimer ?? 0,
  });
}
