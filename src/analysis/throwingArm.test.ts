import { describe, expect, it } from 'vitest';
import { PoseLandmarks } from './poseLandmarks';
import {
  getTrackedPoseLandmarks,
  type PoseLandmark,
} from './throwingArm';

function landmark(x: number, visibility = 0.95): PoseLandmark {
  return {
    x,
    y: 0.5,
    z: 0,
    visibility,
    presence: visibility,
  };
}

function fullPose(): PoseLandmark[] {
  const pose = Array.from({ length: 33 }, (_, index) =>
    landmark(index / 100, 0),
  );
  const visibleIndices = Object.values(PoseLandmarks);
  for (const index of visibleIndices) {
    pose[index] = landmark(index / 100);
  }
  return pose;
}

describe('getTrackedPoseLandmarks', () => {
  it('selects the matching arm and hand points for either throwing hand', () => {
    const pose = fullPose();
    const right = getTrackedPoseLandmarks(pose, 'right');
    const left = getTrackedPoseLandmarks(pose, 'left');

    expect(right?.wrist.x).toBe(PoseLandmarks.rightWrist / 100);
    expect(right?.index?.x).toBe(PoseLandmarks.rightIndex / 100);
    expect(right?.oppositeShoulder?.x).toBe(
      PoseLandmarks.leftShoulder / 100,
    );
    expect(left?.wrist.x).toBe(PoseLandmarks.leftWrist / 100);
    expect(left?.index?.x).toBe(PoseLandmarks.leftIndex / 100);
    expect(left?.oppositeShoulder?.x).toBe(
      PoseLandmarks.rightShoulder / 100,
    );
  });

  it('rejects a core joint below the required visibility', () => {
    const pose = fullPose();
    pose[PoseLandmarks.rightElbow] = landmark(0.14, 0.2);

    expect(getTrackedPoseLandmarks(pose, 'right')).toBeNull();
  });
});
