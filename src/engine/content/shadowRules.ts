/** Fixed commitment replaces body windup; resources do not accelerate the shadow. */
export const SHADOW_COMMIT_DELAY = 0.6;
export function shadowCommitKind(kind: string): boolean {
  return kind === 'meleeCone' || kind === 'pbaoe';
}
export function shadowCommitDescription(kind: string): string {
  return `leave a shadow to deliver this ${kind === 'meleeCone' ? 'aimed strike' : 'burst'} after ${SHADOW_COMMIT_DELAY}s at the cast position${kind === 'meleeCone' ? ' and facing' : ''}; you can move and act meanwhile`;
}
