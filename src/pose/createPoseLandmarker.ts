import {
  PoseLandmarker,
  type PoseLandmarkerOptions,
} from '@mediapipe/tasks-vision';

export type PoseDelegate = 'GPU' | 'CPU';

export const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

export type PoseWasmFileset = Parameters<
  typeof PoseLandmarker.createFromOptions
>[0];

export type CreatePoseLandmarker = typeof PoseLandmarker.createFromOptions;

function landmarkerOptions(delegate: PoseDelegate): PoseLandmarkerOptions {
  return {
    baseOptions: {
      modelAssetPath: POSE_MODEL_URL,
      delegate,
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
}

export async function createPoseLandmarker(
  vision: PoseWasmFileset,
  createFromOptions: CreatePoseLandmarker = PoseLandmarker.createFromOptions,
): Promise<{ landmarker: PoseLandmarker; delegate: PoseDelegate }> {
  try {
    const landmarker = await createFromOptions(
      vision,
      landmarkerOptions('GPU'),
    );
    return { landmarker, delegate: 'GPU' };
  } catch {
    const landmarker = await createFromOptions(
      vision,
      landmarkerOptions('CPU'),
    );
    return { landmarker, delegate: 'CPU' };
  }
}
