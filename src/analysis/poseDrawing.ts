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

export type PoseDrawFlags = {
  throwingHand: ThrowingHand;
  armTracked: boolean;
  armStable: boolean;
};

export function sizePoseCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): boolean {
  const dpr = Math.max(1, devicePixelRatio);
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  const sizeChanged =
    canvas.width !== pixelWidth || canvas.height !== pixelHeight;
  if (sizeChanged) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const cssWidthPx = `${cssWidth}px`;
  const cssHeightPx = `${cssHeight}px`;
  if (canvas.style.width !== cssWidthPx) {
    canvas.style.width = cssWidthPx;
  }
  if (canvas.style.height !== cssHeightPx) {
    canvas.style.height = cssHeightPx;
  }
  return sizeChanged;
}

export function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  landmarks: PoseLandmark[] | null,
  canvasWidth: number,
  canvasHeight: number,
  flags: PoseDrawFlags,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (!landmarks?.length) {
    return;
  }

  const throwingJoints = new Set(getThrowingArmIndices(flags.throwingHand));

  for (const [startIndex, endIndex] of POSE_CONNECTIONS) {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];
    if (!start || !end) {
      continue;
    }

    const isThrowingArm = isThrowingArmConnection(
      startIndex,
      endIndex,
      flags.throwingHand,
    );
    const startPoint = mapLandmarkToCanvas(
      start,
      video,
      canvasWidth,
      canvasHeight,
    );
    const endPoint = mapLandmarkToCanvas(end, video, canvasWidth, canvasHeight);

    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y);

    if (isThrowingArm && flags.armStable) {
      ctx.strokeStyle = '#5eead4';
      ctx.lineWidth = 5;
    } else if (isThrowingArm && flags.armTracked) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4;
    } else {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 2;
    }

    ctx.lineCap = 'round';
    ctx.stroke();
  }

  for (const index of throwingJoints) {
    const landmark = landmarks[index];
    if (!landmark) {
      continue;
    }

    const point = mapLandmarkToCanvas(
      landmark,
      video,
      canvasWidth,
      canvasHeight,
    );

    ctx.beginPath();
    if (flags.armStable) {
      ctx.fillStyle = '#ecfeff';
      ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    } else if (flags.armTracked) {
      ctx.fillStyle = '#fbbf24';
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

export function paintPoseOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: PoseLandmark[] | null,
  flags: PoseDrawFlags,
  devicePixelRatio = 1,
): void {
  const rect = video.getBoundingClientRect();
  sizePoseCanvas(canvas, rect.width, rect.height, devicePixelRatio);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  drawPoseSkeleton(
    ctx,
    video,
    landmarks,
    canvas.width,
    canvas.height,
    flags,
  );
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
