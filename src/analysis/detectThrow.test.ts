import { describe, expect, it } from 'vitest';
import {
  BUFFER_SIZE,
  MIN_READY_BUFFER_MS,
  TRACE_AFTER_MS,
  TRACE_BEFORE_MS,
  ThrowDetector,
  evaluateDecelerationThrow,
  evaluateThrowCandidate,
  extractThrowTrace,
  findNearestTracePeakIndex,
  resolvePendingThrow,
  resolveThrowPeakIndex,
  sampleAtOrBefore,
  sampleElbowAngle,
  type PendingThrow,
  type ThrowEvent,
} from './detectThrow';
import { poseSample } from '../test/fixtures';
import {
  FRAME_MS,
  THROW_END_X,
  acceleratingThrow,
  decelerateToRest,
  degenerateElbowSample,
  floodBufferBeforeFinalize,
  longPrime,
  shortPrime,
  tinyDisplacementThrow,
  validThrowWithLookback,
} from '../test/detectThrowFixtures';

function settleAt(
  detector: ThrowDetector,
  timestamp: number,
  wristX: number,
  frames = 10,
): number {
  for (let frame = 0; frame < frames; frame++) {
    detector.addSample(poseSample(timestamp, wristX, 0.35));
    timestamp += FRAME_MS;
  }
  return timestamp;
}

function emitThrow(
  detector: ThrowDetector,
  timestamp: number,
): { timestamp: number; event: ThrowEvent } {
  let emitted: ThrowEvent | null = null;
  let ts = timestamp;
  for (let frame = 0; frame < 40 && emitted === null; frame++) {
    emitted = detector.addSample(poseSample(ts, THROW_END_X, 0.35));
    ts += FRAME_MS;
  }
  if (!emitted) {
    throw new Error('Expected throw event to finalize.');
  }
  return { timestamp: ts, event: emitted };
}

describe('sampleElbowAngle', () => {
  it('returns 0 for degenerate arm geometry', () => {
    expect(sampleElbowAngle(degenerateElbowSample(10_000))).toBe(0);
  });
});

describe('sampleAtOrBefore', () => {
  it('returns the latest sample at or before the target time', () => {
    const buffer = [
      poseSample(100, 0.5, 0.35),
      poseSample(200, 0.55, 0.35),
      poseSample(300, 0.6, 0.35),
    ];
    expect(sampleAtOrBefore(buffer, 250)?.timestamp).toBe(200);
    expect(sampleAtOrBefore(buffer, 50)).toBeNull();
  });
});

describe('resolveThrowPeakIndex', () => {
  it('finds exact peak timestamp in buffer', () => {
    const buffer = [
      poseSample(100, 0.5, 0.35),
      poseSample(200, 0.55, 0.35),
      poseSample(300, 0.6, 0.35),
    ];
    expect(resolveThrowPeakIndex(buffer, 200)).toBe(1);
  });

  it('falls back to nearest timestamp when exact peak was evicted', () => {
    const buffer = [
      poseSample(100, 0.5, 0.35),
      poseSample(300, 0.6, 0.35),
    ];
    expect(resolveThrowPeakIndex(buffer, 200)).toBe(0);
  });

  it('returns -1 for an empty buffer', () => {
    expect(resolveThrowPeakIndex([], 200)).toBe(-1);
  });
});

describe('resolvePendingThrow', () => {
  const pending: PendingThrow = { peakTimestamp: 10_000, peakSpeed: 0.5 };

  it('returns null when pending is missing or post-roll window has not elapsed', () => {
    const buffer = [poseSample(10_000, 0.6, 0.35)];
    expect(resolvePendingThrow(buffer, null, 11_000)).toBeNull();
    expect(resolvePendingThrow(buffer, pending, 10_500)).toBeNull();
  });

  it('returns null when buffer is empty', () => {
    expect(resolvePendingThrow([], pending, 11_000)).toBeNull();
  });

  it('emits throw event with nearest peak index after eviction', () => {
    const buffer = [
      poseSample(9_900, 0.5, 0.35),
      poseSample(10_050, 0.6, 0.35),
    ];
    const event = resolvePendingThrow(buffer, pending, 11_000);
    expect(event).toEqual({
      peakIndex: 1,
      peakSpeed: 0.5,
      timestamp: 10_000,
    });
  });
});

describe('evaluateThrowCandidate', () => {
  it('rejects each failure reason independently', () => {
    expect(
      evaluateThrowCandidate({
        peakSpeed: 0.34,
        displacement: 1,
        elbowExtension: 20,
      }),
    ).toBe('peak_speed');
    expect(
      evaluateThrowCandidate({
        peakSpeed: 2.5,
        displacement: 0.04,
        elbowExtension: 20,
      }),
    ).toBe('displacement');
    expect(
      evaluateThrowCandidate({
        peakSpeed: 2.5,
        displacement: 0.04,
        elbowExtension: 20,
        worldDisplacement: 0.2,
      }),
    ).toBeNull();
    expect(
      evaluateThrowCandidate({
        peakSpeed: 2.5,
        displacement: 0.2,
        elbowExtension: -25,
      }),
    ).toBe('cocking_flexion');
    expect(
      evaluateThrowCandidate({
        peakSpeed: 2.5,
        displacement: 0.2,
        elbowExtension: 2,
      }),
    ).toBe('elbow_extension');
    expect(
      evaluateThrowCandidate({
        peakSpeed: 2.5,
        displacement: 0.2,
        elbowExtension: 20,
        wristDx: 0.05,
        wristDy: -0.2,
      }),
    ).toBe('arm_raise');
    expect(
      evaluateThrowCandidate({
        peakSpeed: 2.5,
        displacement: 0.2,
        elbowExtension: 20,
      }),
    ).toBeNull();
  });
});

describe('evaluateDecelerationThrow', () => {
  const pendingPeak = {
    speed: 2.5,
    timestamp: 10_000,
    wrist: { x: 0.9, y: 0.35 },
  };

  it('returns missing_peak when the buffer is empty', () => {
    expect(
      evaluateDecelerationThrow({
        buffer: [],
        pendingPeak,
        throwBaselineWrist: { x: 0.5, y: 0.35 },
        throwBaselineElbowAngle: 90,
      }),
    ).toEqual({ type: 'missing_peak' });
  });

  it('uses lookback baseline when enough history is present', () => {
    const buffer = [
      poseSample(9_600, 0.5, 0.35),
      poseSample(9_900, 0.52, 0.35),
      poseSample(10_000, 0.9, 0.35),
    ];
    expect(
      evaluateDecelerationThrow({
        buffer,
        pendingPeak,
        throwBaselineWrist: null,
        throwBaselineElbowAngle: null,
      }).type,
    ).toBe('accepted');
  });

  it('falls back to motion-start baselines without lookback history', () => {
    const baseline = poseSample(9_900, 0.52, 0.35);
    const peak = poseSample(10_000, 0.9, 0.35);
    expect(
      evaluateDecelerationThrow({
        buffer: [baseline, peak],
        pendingPeak,
        throwBaselineWrist: { x: 0.52, y: 0.35 },
        throwBaselineElbowAngle: sampleElbowAngle(baseline),
      }),
    ).toMatchObject({
      type: 'accepted',
      peakTimestamp: 10_000,
    });
  });

  it('treats missing baselines as zero displacement and extension', () => {
    const buffer = [poseSample(10_000, 0.9, 0.35)];
    expect(
      evaluateDecelerationThrow({
        buffer,
        pendingPeak,
        throwBaselineWrist: null,
        throwBaselineElbowAngle: null,
      }),
    ).toEqual({ type: 'rejected' });
  });

  it('rejects each failure reason', () => {
    const peak = poseSample(10_000, 0.9, 0.35);
    const baseline = poseSample(9_900, 0.5, 0.35);

    expect(
      evaluateDecelerationThrow({
        buffer: [baseline, peak],
        pendingPeak: { ...pendingPeak, speed: 0.34 },
        throwBaselineWrist: { x: 0.5, y: 0.35 },
        throwBaselineElbowAngle: 90,
      }).type,
    ).toBe('rejected');

    expect(
      evaluateDecelerationThrow({
        buffer: [baseline, poseSample(10_000, 0.52, 0.35)],
        pendingPeak: { ...pendingPeak, wrist: { x: 0.52, y: 0.35 } },
        throwBaselineWrist: { x: 0.5, y: 0.35 },
        throwBaselineElbowAngle: 90,
      }).type,
    ).toBe('rejected');
  });

  it('rejects cocking flexion at deceleration evaluation', () => {
    const extendedBaseline = poseSample(9_900, 0.75, 0.32, 0, 0.5, 0.35);
    const cockedPeak = poseSample(10_000, 0.52, 0.45, 0, 0.5, 0.5);

    expect(
      evaluateDecelerationThrow({
        buffer: [extendedBaseline, cockedPeak],
        pendingPeak: {
          speed: 2.5,
          timestamp: 10_000,
          wrist: { x: 0.52, y: 0.45 },
        },
        throwBaselineWrist: { x: 0.75, y: 0.32 },
        throwBaselineElbowAngle: sampleElbowAngle(extendedBaseline),
      }).type,
    ).toBe('rejected');
  });

  it('rejects insufficient elbow extension at deceleration evaluation', () => {
    const baseline = poseSample(9_900, 0.45, 0.35, 0, 0.5, 0.5);
    const peak = poseSample(10_000, 0.585, 0.265, 0, 0.5, 0.5);
    const baselineAngle = sampleElbowAngle(baseline);
    const extension = sampleElbowAngle(peak) - baselineAngle;

    expect(extension).toBeLessThan(3);
    expect(extension).toBeGreaterThan(-20);
    expect(
      evaluateDecelerationThrow({
        buffer: [baseline, peak],
        pendingPeak: {
          speed: 2.5,
          timestamp: 10_000,
          wrist: { x: 0.585, y: 0.265 },
        },
        throwBaselineWrist: { x: 0.45, y: 0.35 },
        throwBaselineElbowAngle: baselineAngle,
      }).type,
    ).toBe('rejected');
  });
});

describe('findNearestTracePeakIndex', () => {
  it('falls back to nearest timestamp when exact peak is absent', () => {
    const samples = [
      poseSample(10_000, 0.5, 0.35),
      poseSample(10_050, 0.6, 0.35),
    ];
    expect(findNearestTracePeakIndex(samples, 10_020)).toBe(0);
  });
});

describe('ThrowDetector', () => {
  it('buffers a full post-roll before emitting an accepted throw', () => {
    const detector = new ThrowDetector();
    let timestamp = longPrime(detector, 10_000);

    expect(detector.getBufferedDurationMs()).toBeGreaterThanOrEqual(
      MIN_READY_BUFFER_MS,
    );

    timestamp = acceleratingThrow(detector, timestamp);
    expect(detector.isCollectingPostRoll()).toBe(true);

    const { event: emitted, timestamp: afterEmit } = emitThrow(
      detector,
      timestamp,
    );
    const trace = extractThrowTrace(detector.getBuffer(), emitted.peakIndex);
    const peakTime = trace.samples[trace.peakIndex].timestamp;
    const postRoll =
      trace.samples[trace.samples.length - 1].timestamp - peakTime;
    expect(postRoll).toBeGreaterThanOrEqual(TRACE_AFTER_MS - FRAME_MS);
    expect(detector.isCollectingPostRoll()).toBe(false);
    expect(detector.isArmed()).toBe(false);

    timestamp = settleAt(detector, afterEmit, THROW_END_X, 10);
    expect(detector.isArmed()).toBe(true);
  });

  it('primes history without detecting motion while disabled', () => {
    const detector = new ThrowDetector();
    for (let frame = 0; frame < 60; frame++) {
      const event = detector.addSample(
        poseSample(10_000 + frame * FRAME_MS, 0.4 + frame * 0.01, 0.4),
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
      poseSample(10_000 + 60 * FRAME_MS + 500, 1.01, 0.4),
      false,
    );
    expect(detector.getRecentContinuousDurationMs()).toBe(0);

    detector.addSample(poseSample(10_000 + 60 * FRAME_MS, 0.5, 0.35), false);
    expect(detector.getRecentContinuousDurationMs()).toBe(0);
  });

  it('finalizes from a heartbeat when tracking disappears in post-roll', () => {
    const detector = new ThrowDetector();
    let timestamp = longPrime(detector, 10_000);
    timestamp = acceleratingThrow(detector, timestamp);

    expect(detector.isCollectingPostRoll()).toBe(true);
    const event = detector.advance(timestamp + 900);
    expect(event).not.toBeNull();
    expect(detector.isCollectingPostRoll()).toBe(false);
  });

  it('resets detector state and handles trace extraction edge cases', () => {
    const detector = new ThrowDetector();
    detector.addSample(poseSample(10_000, 0.5, 0.35), false);
    detector.reset();

    expect(detector.getBuffer()).toHaveLength(0);
    expect(detector.getBufferedDurationMs()).toBe(0);
    expect(detector.getRecentContinuousDurationMs()).toBe(0);
    expect(detector.isArmed()).toBe(true);
    expect(detector.isPrimed()).toBe(false);
    expect(detector.getCurrentWristSpeed()).toBe(0);

    expect(extractThrowTrace([], 0)).toEqual({ samples: [], peakIndex: 0 });
    expect(extractThrowTrace([poseSample(10_000, 0.5, 0.35)], 4)).toEqual({
      samples: [],
      peakIndex: 0,
    });

    const buffer = [
      poseSample(10_000, 0.5, 0.35),
      poseSample(10_050, 0.55, 0.35),
      poseSample(10_100, 0.6, 0.35),
    ];
    const trace = extractThrowTrace(buffer, 1);
    expect(trace.samples.length).toBeGreaterThan(0);
    expect(trace.peakIndex).toBeGreaterThanOrEqual(0);
  });

  it('exposes wrist speed and respects throw lockout', () => {
    const detector = new ThrowDetector();
    let timestamp = longPrime(detector, 10_000);
    for (let frame = 1; frame <= 5; frame++) {
      detector.addSample(
        poseSample(timestamp, 0.5 + 0.006 * frame ** 2, 0.35),
      );
      timestamp += FRAME_MS;
    }
    expect(detector.getCurrentWristSpeed()).toBeGreaterThan(0);

    timestamp = acceleratingThrow(detector, timestamp);
    while (!detector.isCollectingPostRoll()) {
      timestamp = acceleratingThrow(detector, timestamp, THROW_END_X);
    }

    const { timestamp: afterEmit } = emitThrow(detector, timestamp);
    const locked = detector.addSample(
      poseSample(afterEmit, THROW_END_X + 0.5, 0.35),
    );
    expect(locked).toBeNull();
  });

  it('trims the ring buffer once history exceeds the max size', () => {
    const detector = new ThrowDetector();
    let timestamp = 10_000;
    for (let frame = 0; frame < BUFFER_SIZE + 10; frame++) {
      detector.addSample(poseSample(timestamp, 0.5, 0.35), false);
      timestamp += FRAME_MS;
    }

    expect(detector.getBuffer().length).toBeLessThanOrEqual(BUFFER_SIZE);
    expect(detector.getBufferedDurationMs()).toBeGreaterThan(0);
  });

  it('resets motion tracking after a large tracking gap', () => {
    const detector = new ThrowDetector();
    let timestamp = longPrime(detector, 10_000);
    detector.addSample(poseSample(timestamp, 0.55, 0.35));
    timestamp += FRAME_MS;

    const afterGap = detector.addSample(
      poseSample(timestamp + 400, 0.7, 0.35),
    );
    expect(afterGap).toBeNull();
    expect(detector.isCollectingPostRoll()).toBe(false);
    expect(detector.isArmed()).toBe(true);
  });

  it('swallows motion while detection is disabled or post-roll is pending', () => {
    const disabled = new ThrowDetector();
    let timestamp = longPrime(disabled, 10_000);
    expect(
      disabled.addSample(poseSample(timestamp, 0.95, 0.35), false),
    ).toBeNull();

    const pending = new ThrowDetector();
    timestamp = longPrime(pending, 10_000);
    timestamp = acceleratingThrow(pending, timestamp);
    expect(pending.isCollectingPostRoll()).toBe(true);
    expect(
      pending.addSample(poseSample(timestamp, 0.98, 0.35)),
    ).toBeNull();
  });

  it('rearms after quiet frames and ignores fast motion while disarmed', () => {
    const detector = new ThrowDetector();
    let timestamp = longPrime(detector, 10_000);
    timestamp = acceleratingThrow(detector, timestamp);
    while (!detector.isCollectingPostRoll()) {
      timestamp = acceleratingThrow(detector, timestamp, THROW_END_X);
    }
    const { timestamp: afterEmit } = emitThrow(detector, timestamp);

    expect(detector.isArmed()).toBe(false);
    expect(
      detector.addSample(poseSample(afterEmit, 0.98, 0.35)),
    ).toBeNull();

    timestamp = settleAt(detector, afterEmit, THROW_END_X, 10);
    expect(detector.isArmed()).toBe(true);
  });

  it('rejects throws with insufficient wrist travel', () => {
    const detector = new ThrowDetector();
    shortPrime(detector, 10_000);
    tinyDisplacementThrow(detector, 10_000 + 5 * FRAME_MS);
    expect(detector.isCollectingPostRoll()).toBe(false);
  });

  it('tracks the highest-speed frame during an accepted throw', () => {
    const detector = new ThrowDetector();
    let timestamp = longPrime(detector, 10_000);
    timestamp = acceleratingThrow(detector, timestamp);
    while (!detector.isCollectingPostRoll()) {
      timestamp = acceleratingThrow(detector, timestamp, 0.98);
    }

    const { event } = emitThrow(detector, timestamp);
    expect(event.peakSpeed).toBeGreaterThan(0.35);
    const trace = extractThrowTrace(detector.getBuffer(), event.peakIndex);
    expect(trace.samples.length).toBeGreaterThan(0);
    expect(trace.samples[trace.peakIndex].timestamp).toBe(event.timestamp);
  });

  it('uses lookback baseline when enough history is present', () => {
    const detector = new ThrowDetector();
    validThrowWithLookback(detector, 10_000);
    expect(detector.isCollectingPostRoll()).toBe(true);
  });

  it('falls back to motion-start baseline with short prime history', () => {
    const detector = new ThrowDetector();
    let timestamp = shortPrime(detector, 10_000);
    timestamp = acceleratingThrow(detector, timestamp);
    expect(detector.isCollectingPostRoll()).toBe(true);
  });

  it('resets motion candidate when peak frame was evicted before deceleration', () => {
    const detector = new ThrowDetector();
    let timestamp = longPrime(detector, 10_000);

    for (let frame = 1; frame <= 8; frame++) {
      detector.addSample(
        poseSample(timestamp, 0.5 + 0.006 * frame ** 2, 0.35),
      );
      timestamp += FRAME_MS;
    }

    for (let frame = 0; frame < BUFFER_SIZE; frame++) {
      detector.addSample(
        poseSample(timestamp, 0.7 + (frame % 2) * 0.02, 0.35),
      );
      timestamp += FRAME_MS;
    }

    detector.addSample(poseSample(timestamp, 0.55, 0.35));
    expect(detector.isCollectingPostRoll()).toBe(false);
  });

  it('finalizes with nearest peak after exact peak frame is evicted', () => {
    const detector = new ThrowDetector();
    let timestamp = longPrime(detector, 10_000);
    timestamp = acceleratingThrow(detector, timestamp);
    expect(detector.isCollectingPostRoll()).toBe(true);

    const bufferBefore = detector.getBuffer();
    const peakSample = bufferBefore.reduce((best, sample) =>
      sample.wrist.x > best.wrist.x ? sample : best,
    );
    floodBufferBeforeFinalize(detector, peakSample.timestamp);
    expect(detector.isCollectingPostRoll()).toBe(true);
    expect(
      detector
        .getBuffer()
        .some((sample) => sample.timestamp === peakSample.timestamp),
    ).toBe(false);

    const event = detector.advance(peakSample.timestamp + TRACE_AFTER_MS + 1);
    expect(event).not.toBeNull();
    expect(event?.timestamp).toBe(peakSample.timestamp);
    expect(detector.getBuffer()[event!.peakIndex].timestamp).not.toBe(
      peakSample.timestamp,
    );
  });

  it('rejects motion when peak sample uses degenerate elbow geometry', () => {
    const detector = new ThrowDetector();
    let timestamp = shortPrime(detector, 10_000);

    for (let frame = 1; frame <= 8; frame++) {
      const sample =
        frame === 4
          ? degenerateElbowSample(timestamp)
          : poseSample(timestamp, 0.5 + frame * 0.05, 0.35);
      detector.addSample({
        ...sample,
        wrist: { ...sample.wrist, x: 0.5 + frame * 0.05 },
      });
      timestamp += FRAME_MS;
    }
    detector.addSample(poseSample(timestamp, 0.55, 0.35));
    timestamp += FRAME_MS;
    decelerateToRest(detector, timestamp, 0.55);
    expect(detector.isCollectingPostRoll()).toBe(false);
  });
});

describe('extractThrowTrace', () => {
  it('windows samples around the peak and falls back to the nearest frame', () => {
    const peakTime = 20_000;
    const buffer = [
      poseSample(peakTime - TRACE_BEFORE_MS - 100, 0.4, 0.35),
      poseSample(peakTime - 500, 0.45, 0.35),
      poseSample(peakTime + 2, 0.9, 0.35),
      poseSample(peakTime + 400, 0.88, 0.35),
      poseSample(peakTime + TRACE_AFTER_MS + 100, 0.86, 0.35),
    ];

    const trace = extractThrowTrace(buffer, 2);
    expect(trace.samples.length).toBeGreaterThan(1);
    expect(trace.samples[0].timestamp).toBeGreaterThanOrEqual(
      peakTime - TRACE_BEFORE_MS,
    );
    expect(trace.samples.at(-1)?.timestamp ?? 0).toBeLessThanOrEqual(
      peakTime + TRACE_AFTER_MS,
    );
    expect(trace.peakIndex).toBeGreaterThanOrEqual(0);
    expect(trace.peakIndex).toBeLessThan(trace.samples.length);
  });

  it('keeps the peak index inside the filtered trace window', () => {
    const peakTime = 30_000;
    const buffer = [
      poseSample(peakTime - 100, 0.5, 0.35),
      poseSample(peakTime + 5, 0.9, 0.35),
      poseSample(peakTime + 200, 0.85, 0.35),
    ];
    const trace = extractThrowTrace(buffer, 1);
    expect(trace.peakIndex).toBe(1);
    expect(trace.samples[trace.peakIndex].timestamp).toBe(peakTime + 5);
  });
});
