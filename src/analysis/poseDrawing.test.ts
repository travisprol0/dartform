import { describe, expect, it, vi } from 'vitest';
import {
  drawPoseSkeleton,
  mapLandmarkToCanvas,
  paintPoseOverlay,
  sizePoseCanvas,
} from './poseDrawing';
import { PoseLandmarks } from './poseLandmarks';
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

function mockCtx() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
  };
}

function poseLandmarks(): PoseLandmark[] {
  const points = Array.from({ length: 17 }, () => landmark(0.4, 0.4));
  points[PoseLandmarks.leftShoulder] = landmark(0.3, 0.3);
  points[PoseLandmarks.rightShoulder] = landmark(0.7, 0.3);
  points[PoseLandmarks.leftElbow] = landmark(0.25, 0.45);
  points[PoseLandmarks.rightElbow] = landmark(0.75, 0.45);
  points[PoseLandmarks.leftWrist] = landmark(0.2, 0.6);
  points[PoseLandmarks.rightWrist] = landmark(0.8, 0.6);
  return points;
}

describe('sizePoseCanvas', () => {
  it('sets backing store size once and leaves it unchanged on the next call', () => {
    const canvas = {
      width: 0,
      height: 0,
      style: { width: '', height: '' },
    } as HTMLCanvasElement;

    expect(sizePoseCanvas(canvas, 200, 100, 2)).toBe(true);
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(200);
    expect(canvas.style.width).toBe('200px');
    expect(canvas.style.height).toBe('100px');
    expect(sizePoseCanvas(canvas, 200, 100, 2)).toBe(false);
  });
});

describe('drawPoseSkeleton', () => {
  it('clears the canvas when there are no landmarks', () => {
    const ctx = mockCtx();
    drawPoseSkeleton(
      ctx as unknown as CanvasRenderingContext2D,
      videoSize(1280, 720),
      null,
      400,
      300,
      { throwingHand: 'right', armTracked: false, armStable: false },
    );
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('skips missing joints and draws teal when the throwing arm is stable', () => {
    const ctx = mockCtx();
    const landmarks = poseLandmarks();
    delete (landmarks as PoseLandmark[])[PoseLandmarks.leftElbow];
    drawPoseSkeleton(
      ctx as unknown as CanvasRenderingContext2D,
      videoSize(1280, 720),
      landmarks,
      400,
      300,
      { throwingHand: 'right', armTracked: true, armStable: true },
    );
    expect(ctx.strokeStyle).toBe('#5eead4');
    expect(ctx.fillStyle).toBe('#ecfeff');
  });

  it('draws amber when the arm is tracked but not stable', () => {
    const ctx = mockCtx();
    drawPoseSkeleton(
      ctx as unknown as CanvasRenderingContext2D,
      videoSize(1280, 720),
      poseLandmarks(),
      400,
      300,
      { throwingHand: 'left', armTracked: true, armStable: false },
    );
    expect(ctx.fillStyle).toBe('#fbbf24');
  });

  it('draws grey joints when the throwing arm is not tracked', () => {
    const ctx = mockCtx();
    const landmarks = poseLandmarks();
    delete (landmarks as PoseLandmark[])[PoseLandmarks.rightWrist];
    drawPoseSkeleton(
      ctx as unknown as CanvasRenderingContext2D,
      videoSize(1280, 720),
      landmarks,
      400,
      300,
      { throwingHand: 'right', armTracked: false, armStable: false },
    );
    expect(ctx.fillStyle).toBe('rgba(148, 163, 184, 0.6)');
  });
});

describe('paintPoseOverlay', () => {
  it('returns when the canvas has no 2d context', () => {
    const canvas = {
      width: 0,
      height: 0,
      style: { width: '', height: '' },
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
    const video = {
      videoWidth: 1280,
      videoHeight: 720,
      getBoundingClientRect: () => ({ width: 320, height: 180 }),
    } as HTMLVideoElement;

    paintPoseOverlay(canvas, video, poseLandmarks(), {
      throwingHand: 'right',
      armTracked: true,
      armStable: true,
    });
    expect(canvas.width).toBe(320);
  });

  it('paints through a 2d context', () => {
    const ctx = mockCtx();
    const canvas = {
      width: 0,
      height: 0,
      style: { width: '', height: '' },
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;
    const video = {
      videoWidth: 1280,
      videoHeight: 720,
      getBoundingClientRect: () => ({ width: 320, height: 180 }),
    } as HTMLVideoElement;

    paintPoseOverlay(
      canvas,
      video,
      poseLandmarks(),
      { throwingHand: 'right', armTracked: true, armStable: true },
      1,
    );
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});
