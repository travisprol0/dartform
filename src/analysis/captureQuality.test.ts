import { describe, expect, it } from 'vitest';
import {
  computeCaptureQuality,
  emptyCaptureQuality,
} from './captureQuality';
import { makeThrowTrace } from '../test/fixtures';

describe('capture quality', () => {
  it('grades a complete synthetic trace as high quality', () => {
    const quality = computeCaptureQuality(makeThrowTrace());

    expect(quality.grade).toBe('high');
    expect(quality.traceCoverage).toBeGreaterThan(0.9);
    expect(quality.reasons).toHaveLength(0);
  });

  it('returns a low grade with reasons for sparse traces', () => {
    const trace = makeThrowTrace();
    trace.samples = trace.samples.slice(0, 2);

    const quality = computeCaptureQuality(trace);
    expect(quality.grade).toBe('low');
    expect(quality.reasons[0]).toContain('Not enough tracked frames');
  });

  it('exposes empty capture quality with a caller reason', () => {
    const quality = emptyCaptureQuality('Camera unavailable.');
    expect(quality.score).toBe(0);
    expect(quality.reasons).toEqual(['Camera unavailable.']);
  });

  it('flags visibility, frame-rate, gap, and scale issues', () => {
    const trace = makeThrowTrace();
    trace.samples = trace.samples.map((sample, index) => ({
      ...sample,
      timestamp: 10_000 + index * 200,
      visibility: 0.2,
      world: undefined,
      index: undefined,
      pinky: undefined,
      thumb: undefined,
      elbow: {
        ...sample.elbow,
        x: sample.elbow.x + index * 0.03,
      },
      wrist: {
        ...sample.wrist,
        x: sample.wrist.x + index * 0.06,
      },
    }));

    const quality = computeCaptureQuality(trace);
    expect(quality.grade).toBe('low');
    expect(quality.reasons).toContain(
      'The throwing arm was partly obscured.',
    );
    expect(quality.reasons).toContain(
      'Camera tracking was slower than recommended.',
    );
    expect(quality.reasons).toContain(
      'Tracking dropped frames during the throw.',
    );
    expect(quality.reasons).toContain(
      'Camera angle or depth changed during the throw.',
    );
  });

  it('uses 2D forearm lengths when world landmarks are unavailable', () => {
    const trace = makeThrowTrace();
    trace.samples = trace.samples.map((sample) => ({
      ...sample,
      world: undefined,
    }));

    const quality = computeCaptureQuality(trace);
    expect(quality.worldCoverage).toBe(0);
    expect(quality.grade).toBe('high');
  });

  it('can land in the medium confidence band', () => {
    const trace = makeThrowTrace();
    const peak = trace.peakIndex;
    trace.samples = trace.samples.slice(peak - 10, peak + 18);
    trace.peakIndex = 10;
    trace.samples = trace.samples.map((sample) => ({
      ...sample,
      visibility: 0.72,
    }));

    const quality = computeCaptureQuality(trace);
    expect(quality.score).toBeGreaterThanOrEqual(55);
    expect(quality.score).toBeLessThan(80);
    expect(quality.grade).toBe('medium');
  });
});
