import { PoseLandmarks } from './poseLandmarks';
import type { PoseLandmark } from './throwingArm';
import type { ThrowingHand } from '../types/round';

/** Pairs of BlazePose landmark indices to draw as segments. */
export const POSE_CONNECTIONS: [number, number][] = [
  [PoseLandmarks.leftShoulder, PoseLandmarks.rightShoulder],
  [PoseLandmarks.leftShoulder, PoseLandmarks.leftElbow],
  [PoseLandmarks.leftElbow, PoseLandmarks.leftWrist],
  [PoseLandmarks.rightShoulder, PoseLandmarks.rightElbow],
  [PoseLandmarks.rightElbow, PoseLandmarks.rightWrist],
];

export function getThrowingArmIndices(
  throwingHand: ThrowingHand,
): [number, number, number] {
  return throwingHand === 'right'
    ? [
        PoseLandmarks.rightShoulder,
        PoseLandmarks.rightElbow,
        PoseLandmarks.rightWrist,
      ]
    : [
        PoseLandmarks.leftShoulder,
        PoseLandmarks.leftElbow,
        PoseLandmarks.leftWrist,
      ];
}

export function isThrowingArmConnection(
  a: number,
  b: number,
  throwingHand: ThrowingHand,
): boolean {
  const [shoulder, elbow, wrist] = getThrowingArmIndices(throwingHand);
  const arm = new Set([shoulder, elbow, wrist]);
  return arm.has(a) && arm.has(b);
}

export function mapLandmarkToCanvas(
  landmark: PoseLandmark,
  video: HTMLVideoElement,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) {
    return { x: 0, y: 0 };
  }

  const scale = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
  const displayWidth = videoWidth * scale;
  const displayHeight = videoHeight * scale;
  const offsetX = (canvasWidth - displayWidth) / 2;
  const offsetY = (canvasHeight - displayHeight) / 2;

  return {
    x: landmark.x * videoWidth * scale + offsetX,
    y: landmark.y * videoHeight * scale + offsetY,
  };
}
