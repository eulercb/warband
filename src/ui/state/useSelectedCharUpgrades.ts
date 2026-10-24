import { useMemo } from 'react';
import type { ClassId } from '../../engine/core/types';
import { grandHistory } from '../../engine/content/grandSelections';
import { useStore } from './store';
/** Earned options are not live effects. Keep HUD/pause previews aligned with the host. */
export function useSelectedCharUpgrades(classId: ClassId | null | undefined): string[] {
  const history = useStore((s) => s.myCharUpgrades);
  const state = useStore((s) => s.myGrandLoadout);
  const subs = useStore((s) => s.mySubSkills);
  return useMemo(
    () => (classId ? grandHistory(classId, history, state, subs) : history),
    [classId, history, state, subs],
  );
}
