import { describe, expect, it } from 'vitest';
import {
  MIN_READY_BUFFER_MS,
  ThrowDetector,
  extractThrowTrace,
  type ThrowEvent,
} from './detectThrow';
import { poseSample } from '../test/fixtures';

describe('ThrowDetector', () => {
  it('buffers a full post-roll before emitting an accepted throw', () => {
    const detector = new ThrowDetector();
    const frameMs = 1000 / 30;
    let timestamp = 10_000;

    for (let frame = 0; frame < 55; frame++) {
      detector.addSample(
        poseSample(timestamp, 0.5, 0.35),
        false,
      );
      timestamp += frameMs;
    }

    expect(detector.getBufferedDurationMs()).toBeGreaterThanOrEqual(
      MIN_READY_BUFFER_MS,
    );

    for (let frame = 1; frame <= 8; frame++) {
      const event = detector.addSample(
        poseSample(timestamp, 0.5 + frame * 0.04, 0.35),
      );
      expect(event).toBeNull();
      timestamp += frameMs;
    }

    for (let frame = 0; frame < 3; frame++) {
      const event = detector.addSample(
        poseSample(timestamp, 0.82, 0.35),
      );
      expect(event).toBeNull();
      timestamp += frameMs;
    }

    expect(detector.isCollectingPostRoll()).toBe(true);

    let emitted: ThrowEvent | null = null;
    for (let frame = 0; frame < 35 && emitted === null; frame++) {
      emitted = detector.addSample(
        poseSample(timestamp, 0.82, 0.35),
      );
      timestamp += frameMs;
    }

    expect(emitted).not.toBeNull();
    if (!emitted) {
      return;
    }
    const trace = extractThrowTrace(
      detector.getBuffer(),
      emitted.peakIndex,
    );
    const peakTime = trace.samples[trace.peakIndex].timestamp;
    const postRoll =
      trace.samples[trace.samples.length - 1].timestamp - peakTime;
    expect(postRoll).toBeGreaterThanOrEqual(800);
    expect(detector.isCollectingPostRoll()).toBe(false);
    expect(detector.isArmed()).toBe(false);

    for (let frame = 0; frame < 7; frame++) {
      detector.addSample(poseSample(timestamp, 0.82, 0.35));
      timestamp += frameMs;
    }
    expect(detector.isArmed()).toBe(true);
  });

  it('primes history without detecting motion while disabled', () => {
    const detector = new ThrowDetector();
    const frameMs = 1000 / 30;
    for (let frame = 0; frame < 60; frame++) {
      const event = detector.addSample(
        poseSample(10_000 + frame * frameMs, 0.4 + frame * 0.01, 0.4),
        false,
      );
      expect(event).toBeNull();
    }

    expect(detector.getBufferedDurationMs()).toBeGreaterThan(
      MIN_READY_BUFFER_MS,
    );
    expect(detector.getRecentContinuousDurationMs()).toBeGreaterThan(
      MIN_READY_BUFFER_MS,
    );
    expect(detector.isCollectingPostRoll()).toBe(false);

    detector.addSample(
      poseSample(10_000 + 60 * frameMs + 500, 1.01, 0.4),
      false,
    );
    expect(detector.getRecentContinuousDurationMs()).toBe(0);
  });

  it('finalizes from a heartbeat when tracking disappears in post-roll', () => {
    const detector = new ThrowDetector();
    const frameMs = 1000 / 30;
    let timestamp = 10_000;

    for (let frame = 0; frame < 55; frame++) {
      detector.addSample(poseSample(timestamp, 0.5, 0.35), false);
      timestamp += frameMs;
    }
    for (let frame = 1; frame <= 8; frame++) {
      detector.addSample(
        poseSample(timestamp, 0.5 + frame * 0.04, 0.35),
      );
      timestamp += frameMs;
    }
    for (let frame = 0; frame < 3; frame++) {
      detector.addSample(poseSample(timestamp, 0.82, 0.35));
      timestamp += frameMs;
    }

    expect(detector.isCollectingPostRoll()).toBe(true);
    const event = detector.advance(timestamp + 900);
    expect(event).not.toBeNull();
    expect(detector.isCollectingPostRoll()).toBe(false);
  });
});
