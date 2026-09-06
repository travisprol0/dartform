import { describe, expect, it } from 'vitest';
import {
  BUFFER_SIZE,
  MIN_READY_BUFFER_MS,
  ThrowDetector,
  extractThrowTrace,
  type PoseSample,
} from './detectThrow';
import { replayThrowRecording } from './throwDetection/recording';
import { REAL_THROW_RECORDINGS } from '../test/throwRecordings/recordings';

const FRAME_MS = 1000 / 30;

function aimedPose(timestamp: number): PoseSample {
  return {
    timestamp,
    shoulder: { x: 0.62, y: 0.38, z: 0, visibility: 1 },
    elbow: { x: 0.5, y: 0.58, z: 0, visibility: 1 },
    wrist: { x: 0.46, y: 0.34, z: 0, visibility: 1 },
    oppositeShoulder: {
      x: 0.38,
      y: 0.39,
      z: 0,
      visibility: 1,
    },
    leftHip: { x: 0.56, y: 0.8, z: 0, visibility: 1 },
    rightHip: { x: 0.44, y: 0.8, z: 0, visibility: 1 },
    visibility: 1,
  };
}

describe('ThrowDetector stable aim', () => {
  it('requires a brief stable aiming pose before arming', () => {
    const detector = new ThrowDetector();
    for (let frame = 0; frame < 10; frame += 1) {
      const sample = aimedPose(frame * FRAME_MS);
      sample.wrist.y += frame % 2 === 0 ? 0.12 : -0.12;
      detector.addSample(sample);
    }
    expect(detector.isArmed()).toBe(false);

    for (let frame = 10; frame < 25; frame += 1) {
      detector.addSample(aimedPose(frame * FRAME_MS));
    }
    expect(detector.isArmed()).toBe(true);
    expect(detector.hasStableAim()).toBe(true);
  });

  it('does not acquire aim while detection is disabled', () => {
    const detector = new ThrowDetector();
    for (let frame = 0; frame < 30; frame += 1) {
      detector.addSample(aimedPose(frame * FRAME_MS), false);
    }
    expect(detector.isArmed()).toBe(false);
  });
});

describe('real profile-view replay corpus', () => {
  for (const recording of REAL_THROW_RECORDINGS) {
    it(`${recording.scenario} emits exactly ${recording.expectedThrowCount}`, () => {
      const detector = new ThrowDetector();
      const events = replayThrowRecording(recording, detector);
      expect(events).toHaveLength(recording.expectedThrowCount);
      if (recording.expectedThrowCount > 0) {
        const capturedLegacyEvents = recording.frames.filter(
          (frame) => frame.detector.event !== null,
        );
        expect(capturedLegacyEvents).toHaveLength(0);
      }
    });
  }
});

describe('detector buffer and trace', () => {
  it('primes from continuous history and keeps a bounded buffer', () => {
    const detector = new ThrowDetector();
    for (let frame = 0; frame < BUFFER_SIZE + 12; frame += 1) {
      detector.addSample(aimedPose(frame * FRAME_MS), false);
    }
    expect(detector.getRecentContinuousDurationMs()).toBeGreaterThan(
      MIN_READY_BUFFER_MS,
    );
    expect(detector.isPrimed()).toBe(true);
    expect(detector.getBuffer()).toHaveLength(BUFFER_SIZE);
  });

  it('extracts the configured time window around a peak', () => {
    const samples = Array.from({ length: 100 }, (_, frame) =>
      aimedPose(frame * FRAME_MS),
    );
    const trace = extractThrowTrace(samples, 60);
    expect(trace.samples[trace.peakIndex].timestamp).toBe(
      samples[60].timestamp,
    );
    expect(trace.peakIndex).toBeGreaterThan(0);
    expect(trace.peakIndex).toBeLessThan(trace.samples.length - 1);
  });
});
