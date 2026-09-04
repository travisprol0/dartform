import { describe, expect, it } from 'vitest';
import { mapLandmarkToCanvas } from './poseDrawing';
import type { PoseLandmark } from './throwingArm';

function landmark(x: number, y: number): PoseLandmark {
  return { x, y, z: 0 };
}

function videoSize(width: number, height: number): HTMLVideoElement {
  return { videoWidth: width, videoHeight: height } as HTMLVideoElement;
}

describe('mapLandmarkToCanvas', () => {
  it('returns the origin when the video has no dimensions yet', () => {
    expect(
      mapLandmarkToCanvas(landmark(0.25, 0.5), videoSize(0, 0), 400, 300),
    ).toEqual({ x: 0, y: 0 });
  });

  it('maps normalized landmarks with object-fit cover, without flipping x', () => {
    const video = videoSize(1280, 720);
    const canvasWidth = 800;
    const canvasHeight = 800;
    const scale = Math.max(canvasWidth / 1280, canvasHeight / 720);
    const offsetX = (canvasWidth - 1280 * scale) / 2;
    const offsetY = (canvasHeight - 720 * scale) / 2;

    expect(
      mapLandmarkToCanvas(landmark(0, 0.5), video, canvasWidth, canvasHeight),
    ).toEqual({
      x: offsetX,
      y: 0.5 * 720 * scale + offsetY,
    });
    expect(
      mapLandmarkToCanvas(landmark(1, 0.5), video, canvasWidth, canvasHeight).x,
    ).toBeGreaterThan(canvasWidth / 2);
  });
});
