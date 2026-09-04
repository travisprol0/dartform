import { describe, expect, it } from 'vitest';
import { PoseLandmarks } from './poseLandmarks';
import {
  getThrowingArmLandmarks,
  getTrackedPoseLandmarks,
} from './throwingArm';
import type { PoseLandmark } from './throwingArm';

function pose(landmarks: Partial<Record<number, PoseLandmark>>): PoseLandmark[] {
  const full: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }));
  for (const [index, landmark] of Object.entries(landmarks)) {
    if (landmark) {
      full[Number(index)] = landmark;
    }
  }
  return full;
}

function visibleArm(hand: 'left' | 'right') {
  const isLeft = hand === 'left';
  return pose({
    [isLeft ? PoseLandmarks.leftShoulder : PoseLandmarks.rightShoulder]: {
      x: 0.5,
      y: 0.2,
      z: 0,
      visibility: 0.95,
    },
    [isLeft ? PoseLandmarks.leftElbow : PoseLandmarks.rightElbow]: {
      x: 0.5,
      y: 0.5,
      z: 0,
      presence: 0.95,
    },
    [isLeft ? PoseLandmarks.leftWrist : PoseLandmarks.rightWrist]: {
      x: 0.5,
      y: 0.8,
      z: 0,
      visibility: 0.95,
    },
    [isLeft ? PoseLandmarks.rightShoulder : PoseLandmarks.leftShoulder]: {
      x: 0.3,
      y: 0.2,
      z: 0,
      visibility: 0.4,
    },
    [PoseLandmarks.nose]: { x: 0.4, y: 0.08, z: 0, visibility: 0.5 },
    [PoseLandmarks.leftHip]: { x: 0.42, y: 0.8, z: 0, visibility: 0.5 },
    [PoseLandmarks.rightHip]: { x: 0.58, y: 0.8, z: 0, visibility: 0.5 },
    [isLeft ? PoseLandmarks.leftIndex : PoseLandmarks.rightIndex]: {
      x: 0.54,
      y: 0.79,
      z: 0,
      visibility: 0.5,
    },
    [isLeft ? PoseLandmarks.leftPinky : PoseLandmarks.rightPinky]: {
      x: 0.53,
      y: 0.82,
      z: 0,
      visibility: 0.5,
    },
    [isLeft ? PoseLandmarks.leftThumb : PoseLandmarks.rightThumb]: {
      x: 0.52,
      y: 0.77,
      z: 0,
      visibility: 0.5,
    },
  });
}

describe('throwingArm landmarks', () => {
  it.each(['right', 'left'] as const)(
    'extracts tracked landmarks for the %s arm',
    (hand) => {
      const tracked = getTrackedPoseLandmarks(visibleArm(hand), hand);
      expect(tracked?.wrist.y).toBe(0.8);
      expect(tracked?.index).toBeDefined();
      expect(tracked?.oppositeShoulder).toBeDefined();
    },
  );

  it('returns null when required joints are missing', () => {
    const missingWrist = pose({
      [PoseLandmarks.rightShoulder]: { x: 0.5, y: 0.2, z: 0, visibility: 0.95 },
      [PoseLandmarks.rightElbow]: { x: 0.5, y: 0.5, z: 0, visibility: 0.95 },
    });

    expect(getThrowingArmLandmarks(missingWrist, 'right')).toBeNull();
    expect(getTrackedPoseLandmarks(missingWrist, 'right')).toBeNull();
  });

  it('drops optional landmarks that fall below the optional visibility floor', () => {
    const tracked = getTrackedPoseLandmarks(visibleArm('right'), 'right', {
      optionalMinVisibility: 0.9,
    });

    expect(tracked?.wrist.y).toBe(0.8);
    expect(tracked?.nose).toBeUndefined();
    expect(tracked?.index).toBeUndefined();
  });
});
