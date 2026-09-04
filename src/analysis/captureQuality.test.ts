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
});
