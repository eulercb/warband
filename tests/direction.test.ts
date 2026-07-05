/**
 * Warband — facing → sprite direction tests (brief §5 directionality policy).
 *
 * World y is down, so +angle rotates east→south→west→north. Pure, so we can pin
 * every sector and the mirror rules exactly.
 */
import { describe, it, expect } from 'vitest';
import { facingFor } from '../src/render/sprites/direction';

const E = 0;
const S = Math.PI / 2; // y down => +90° is south
const W = Math.PI;
const N = -Math.PI / 2;

describe('facingFor: single', () => {
  it('has no direction and never flips', () => {
    for (const a of [E, S, W, N, 1.2, -3]) {
      expect(facingFor(a, 'single')).toEqual({ dir: null, flipX: false });
    }
  });
});

describe('facingFor: flip (single side sheet, mirror when facing left)', () => {
  it('faces right for eastward angles', () => {
    expect(facingFor(E, 'flip')).toEqual({ dir: 'side', flipX: false });
    expect(facingFor(S, 'flip').flipX).toBe(false); // due south: cos 0 → not left
  });
  it('mirrors for westward angles', () => {
    expect(facingFor(W, 'flip')).toEqual({ dir: 'side', flipX: true });
    expect(facingFor(2.5, 'flip').flipX).toBe(true); // past 90° toward west
  });
});

describe('facingFor: 8dir (own art per octant, no mirroring)', () => {
  it('maps the cardinals and an intercardinal, never flipping', () => {
    expect(facingFor(E, '8dir')).toEqual({ dir: 'e', flipX: false });
    expect(facingFor(S, '8dir')).toEqual({ dir: 's', flipX: false });
    expect(facingFor(W, '8dir')).toEqual({ dir: 'w', flipX: false });
    expect(facingFor(N, '8dir')).toEqual({ dir: 'n', flipX: false });
    expect(facingFor(Math.PI / 4, '8dir')).toEqual({ dir: 'se', flipX: false }); // SE (y down)
    expect(facingFor(-Math.PI / 4, '8dir')).toEqual({ dir: 'ne', flipX: false });
  });
  it('wraps angles beyond ±2π', () => {
    expect(facingFor(E + 2 * Math.PI, '8dir').dir).toBe('e');
  });
});

describe('facingFor: 4dir (draw e/s/n, mirror w from e)', () => {
  it('keeps e/s/n as their own art', () => {
    expect(facingFor(E, '4dir')).toEqual({ dir: 'e', flipX: false });
    expect(facingFor(S, '4dir')).toEqual({ dir: 's', flipX: false });
    expect(facingFor(N, '4dir')).toEqual({ dir: 'n', flipX: false });
  });
  it('mirrors west from the east sheet', () => {
    expect(facingFor(W, '4dir')).toEqual({ dir: 'e', flipX: true });
  });
});
