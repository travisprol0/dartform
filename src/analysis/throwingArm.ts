import { PoseLandmarks } from './poseLandmarks';
import type { ThrowingHand } from '../types/round';

export const MIN_LANDMARK_VISIBILITY = 0.7;

export type PoseLandmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
};

export type ArmLandmarks = {
  shoulder: PoseLandmark;
  elbow: PoseLandmark;
  wrist: PoseLandmark;
};

export type TrackedPoseLandmarks = ArmLandmarks & {
  oppositeShoulder?: PoseLandmark;
  nose?: PoseLandmark;
  leftHip?: PoseLandmark;
  rightHip?: PoseLandmark;
  index?: PoseLandmark;
  pinky?: PoseLandmark;
  thumb?: PoseLandmark;
};

type LandmarkOptions = {
  minVisibility?: number;
  optionalMinVisibility?: number;
};

function isJointVisible(
  landmark: PoseLandmark | undefined,
  minVisibility: number,
): landmark is PoseLandmark {
  if (!landmark) {
    return false;
  }
  const score = landmark.visibility ?? landmark.presence ?? 1;
  return score >= minVisibility;
}

function copyLandmark(landmark: PoseLandmark): PoseLandmark {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: landmark.visibility,
    presence: landmark.presence,
  };
}

function optionalLandmark(
  pose: PoseLandmark[],
  index: number,
  minVisibility: number,
): PoseLandmark | undefined {
  const landmark = pose[index];
  return isJointVisible(landmark, minVisibility)
    ? copyLandmark(landmark)
    : undefined;
}

export function getThrowingArmLandmarks(
  pose: PoseLandmark[],
  throwingHand: ThrowingHand,
  options?: LandmarkOptions,
): ArmLandmarks | null {
  const minVisibility = options?.minVisibility ?? MIN_LANDMARK_VISIBILITY;
  const indices =
    throwingHand === 'right'
      ? {
          shoulder: PoseLandmarks.rightShoulder,
          elbow: PoseLandmarks.rightElbow,
          wrist: PoseLandmarks.rightWrist,
        }
      : {
          shoulder: PoseLandmarks.leftShoulder,
          elbow: PoseLandmarks.leftElbow,
          wrist: PoseLandmarks.leftWrist,
        };

  const shoulder = pose[indices.shoulder];
  const elbow = pose[indices.elbow];
  const wrist = pose[indices.wrist];

  if (
    !isJointVisible(shoulder, minVisibility) ||
    !isJointVisible(elbow, minVisibility) ||
    !isJointVisible(wrist, minVisibility)
  ) {
    return null;
  }

  return {
    shoulder: copyLandmark(shoulder),
    elbow: copyLandmark(elbow),
    wrist: copyLandmark(wrist),
  };
}

export function getTrackedPoseLandmarks(
  pose: PoseLandmark[],
  throwingHand: ThrowingHand,
  options?: LandmarkOptions,
): TrackedPoseLandmarks | null {
  const arm = getThrowingArmLandmarks(pose, throwingHand, options);
  if (!arm) {
    return null;
  }

  const optionalMinVisibility = options?.optionalMinVisibility ?? 0.35;
  const isRight = throwingHand === 'right';

  return {
    ...arm,
    oppositeShoulder: optionalLandmark(
      pose,
      isRight ? PoseLandmarks.leftShoulder : PoseLandmarks.rightShoulder,
      optionalMinVisibility,
    ),
    nose: optionalLandmark(
      pose,
      PoseLandmarks.nose,
      optionalMinVisibility,
    ),
    leftHip: optionalLandmark(
      pose,
      PoseLandmarks.leftHip,
      optionalMinVisibility,
    ),
    rightHip: optionalLandmark(
      pose,
      PoseLandmarks.rightHip,
      optionalMinVisibility,
    ),
    index: optionalLandmark(
      pose,
      isRight ? PoseLandmarks.rightIndex : PoseLandmarks.leftIndex,
      optionalMinVisibility,
    ),
    pinky: optionalLandmark(
      pose,
      isRight ? PoseLandmarks.rightPinky : PoseLandmarks.leftPinky,
      optionalMinVisibility,
    ),
    thumb: optionalLandmark(
      pose,
      isRight ? PoseLandmarks.rightThumb : PoseLandmarks.leftThumb,
      optionalMinVisibility,
    ),
  };
}

export function throwingHandLabel(hand: ThrowingHand): string {
  return hand === 'right' ? 'right' : 'left';
}
