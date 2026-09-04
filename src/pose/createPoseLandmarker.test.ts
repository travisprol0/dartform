import { describe, expect, it, vi } from 'vitest';
import {
  createPoseLandmarker,
  type CreatePoseLandmarker,
  POSE_MODEL_URL,
} from './createPoseLandmarker';

const vision = {} as Parameters<typeof createPoseLandmarker>[0];

describe('createPoseLandmarker', () => {
  it('uses the GPU delegate when createFromOptions succeeds', async () => {
    const landmarker = { id: 'gpu' };
    const createFromOptions = vi.fn().mockResolvedValue(landmarker);

    await expect(
      createPoseLandmarker(
        vision,
        createFromOptions as CreatePoseLandmarker,
      ),
    ).resolves.toEqual({ landmarker, delegate: 'GPU' });

    expect(createFromOptions).toHaveBeenCalledTimes(1);
    expect(createFromOptions.mock.calls[0][1]).toMatchObject({
      baseOptions: {
        modelAssetPath: POSE_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  });

  it('falls back to the CPU delegate when GPU init throws', async () => {
    const landmarker = { id: 'cpu' };
    const createFromOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error('no webgl'))
      .mockResolvedValueOnce(landmarker);

    await expect(
      createPoseLandmarker(
        vision,
        createFromOptions as CreatePoseLandmarker,
      ),
    ).resolves.toEqual({ landmarker, delegate: 'CPU' });

    expect(createFromOptions).toHaveBeenCalledTimes(2);
    expect(createFromOptions.mock.calls[1][1].baseOptions.delegate).toBe(
      'CPU',
    );
  });

  it('propagates the CPU failure when both delegates throw', async () => {
    const createFromOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error('gpu failed'))
      .mockRejectedValueOnce(new Error('cpu failed'));

    await expect(
      createPoseLandmarker(
        vision,
        createFromOptions as CreatePoseLandmarker,
      ),
    ).rejects.toThrow('cpu failed');
  });
});
