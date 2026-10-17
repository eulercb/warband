/** Public curse families; source labels remain host-only. Legacy marks are Hex. */
import type { Buff } from './types';
export type CurseStyle = 'hex' | 'searing' | 'dread';
export const DREAD_DAMAGE_MULT = 0.8;
export function curseOwner(source: string): number | undefined {
  const match = /^curse:(\d+)(?::(?:hex|searing|dread)(?::\d+)?)?$/.exec(source);
  return match ? Number(match[1]) : undefined;
}
export function personallyCursed(ownerId: number, target: { buffs: Buff[] }): boolean {
  return target.buffs.some(
    (b) => b.kind === 'curse' && b.remaining > 0 && curseOwner(b.source) === ownerId,
  );
}
export function curseDuration(style?: CurseStyle, linger = 0): number {
  return Math.max(style === 'searing' ? 4 : style === 'dread' ? 2 : 1.5, linger);
}
export function curseDescription(bonus: number, style: CurseStyle = 'hex'): string {
  return `${style} curse +${Math.round(bonus * 100)}% owner dmg (strongest personal mark only); ${curseDuration(style)}s minimum linger${style === 'dread' ? '; enemy attacks deal 20% less damage, strongest dread only' : ''}`;
}
