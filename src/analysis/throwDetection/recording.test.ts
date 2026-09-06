import { describe, expect, it, vi } from 'vitest';
import { poseSample } from '../../test/fixtures';
import {
  THROW_RECORDING_SCENARIOS,
  ThrowTraceRecorder,
  exportThrowRecording,
  parseThrowRecording,
  recordingFilename,
  replayThrowRecording,
  serializeThrowRecording,
  type ThrowRecording,
} from './recording';

function makeRecording(): ThrowRecording {
  const recorder = new ThrowTraceRecorder();
  recorder.start({
    scenario: 'single_throw',
    throwingHand: 'right',
    cameraFacing: 'environment',
    poseDelegate: 'GPU',
    poseModelUrl: 'pose.task',
    startedAt: 100,
    capturedAt: '2026-09-06T12:00:00.000Z',
    id: 'trace-one',
  });
  recorder.recordFrame({
    timestamp: 100,
    inferenceTimeMs: 12,
    tracking: 'tracked',
    detectionEnabled: true,
    sample: poseSample(100, 0.5, 0.4),
    detector: {
      armed: true,
      collectingPostRoll: false,
      wristSpeed: 0,
      event: null,
    },
  });
  const recording = recorder.stop(150);
  if (!recording) {
    throw new Error('Expected a completed throw recording.');
  }
  return recording;
}

describe('ThrowTraceRecorder', () => {
  it('records a labeled trace without retaining mutable pose references', () => {
    const recorder = new ThrowTraceRecorder();
    const sample = poseSample(100, 0.5, 0.4);
    recorder.start({
      scenario: 'throw_then_take_next_dart',
      throwingHand: 'left',
      cameraFacing: 'user',
      poseDelegate: 'CPU',
      poseModelUrl: 'pose.task',
      startedAt: 100,
      capturedAt: '2026-09-06T12:00:00.000Z',
      id: 'trace-clone',
    });
    recorder.recordFrame({
      timestamp: 100,
      inferenceTimeMs: 20,
      tracking: 'tracked',
      detectionEnabled: true,
      sample,
      detector: {
        armed: true,
        collectingPostRoll: false,
        wristSpeed: 0.4,
        event: null,
      },
    });

    sample.wrist.x = 0.9;
    const recording = recorder.stop(200);

    expect(recording).toMatchObject({
      id: 'trace-clone',
      scenario: 'throw_then_take_next_dart',
      expectedThrowCount: 1,
      throwingHand: 'left',
      cameraFacing: 'user',
      startedAt: 100,
      finishedAt: 200,
    });
    expect(recording?.frames[0]?.sample?.wrist.x).toBe(0.5);
    expect(recorder.isRecording()).toBe(false);
  });

  it('rejects overlapping recordings and can cancel one', () => {
    const recorder = new ThrowTraceRecorder();
    const options = {
      scenario: 'arm_raise' as const,
      throwingHand: 'right' as const,
      cameraFacing: 'environment' as const,
      poseDelegate: 'GPU' as const,
      poseModelUrl: 'pose.task',
      startedAt: 100,
    };
    recorder.start(options);
    expect(() => recorder.start(options)).toThrow(
      'already active',
    );
    recorder.cancel();
    expect(recorder.isRecording()).toBe(false);
    expect(recorder.stop(200)).toBeNull();
  });
});

describe('throw recording serialization', () => {
  it('round-trips the versioned JSON schema and creates a useful filename', () => {
    const recording = makeRecording();
    expect(parseThrowRecording(serializeThrowRecording(recording))).toEqual(
      recording,
    );
    expect(recordingFilename(recording)).toBe(
      'trace-one-single_throw.json',
    );
  });

  it('rejects unknown schemas and exposes labels for positive and negative clips', () => {
    expect(() =>
      parseThrowRecording('{"schemaVersion":99,"frames":[]}'),
    ).toThrow('Unsupported');
    expect(
      THROW_RECORDING_SCENARIOS.find(
        (scenario) => scenario.id === 'three_throws',
      )?.expectedThrowCount,
    ).toBe(3);
    expect(
      THROW_RECORDING_SCENARIOS.find(
        (scenario) => scenario.id === 'aim_pumps',
      )?.expectedThrowCount,
    ).toBe(0);
  });

  it('opens the share sheet when the browser can send files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      share,
      canShare: () => true,
    });
    await expect(exportThrowRecording(makeRecording())).resolves.toBe(
      'shared',
    );
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'trace-one-single_throw.json',
      }),
    );
    vi.unstubAllGlobals();
  });
});

describe('replayThrowRecording', () => {
  it('replays tracked and missing frames and flushes a pending event', () => {
    const recording = makeRecording();
    recording.frames.push({
      timestamp: 133,
      inferenceTimeMs: 9,
      tracking: 'missing_pose',
      detectionEnabled: false,
      sample: null,
      detector: {
        armed: true,
        collectingPostRoll: false,
        wristSpeed: 0,
        event: null,
      },
    });
    recording.finishedAt = 133;

    const event = { peakIndex: 0, peakSpeed: 2, timestamp: 100 };
    const addSample = vi.fn().mockReturnValue(null);
    const advance = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(event);

    expect(
      replayThrowRecording(recording, { addSample, advance }),
    ).toEqual([event]);
    expect(addSample).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: 100 }),
      true,
    );
    expect(advance).toHaveBeenNthCalledWith(1, 133);
    expect(advance).toHaveBeenNthCalledWith(2, 1_133);
  });
});
