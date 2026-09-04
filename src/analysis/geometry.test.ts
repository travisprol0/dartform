import { describe, expect, it } from 'vitest';
import {
  dist2d,
  dist3d,
  elbowAngle,
  elbowAngle3d,
} from './geometry';

describe('geometry helpers', () => {
  it('computes 2D elbow angle at a right angle', () => {
    const angle = elbowAngle(
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    );
    expect(angle).toBeCloseTo(90, 1);
  });

  it('returns zero for degenerate 2D segments', () => {
    expect(
      elbowAngle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }),
    ).toBe(0);
  });

  it('computes 3D elbow angle and distances', () => {
    const angle = elbowAngle3d(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    );
    expect(angle).toBeCloseTo(90, 1);
    expect(dist2d({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(dist3d({ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 2 })).toBe(3);
  });
});
