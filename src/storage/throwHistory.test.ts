import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { computeRoundSummary } from '../analysis/roundMetrics';
import { makeAnalyzedDart } from '../test/fixtures';
import {
  clearThrowHistory,
  compareWithPersonalBaseline,
  personalizedInsightForDart,
  recordRoundInHistory,
  storedThrowCount,
} from './throwHistory';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('throw history baseline', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: new MemoryStorage(),
    } as unknown as Window);
    clearThrowHistory();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits for nine valid throws, then compares against robust medians', () => {
    const currentDarts = [
      makeAnalyzedDart(1),
      makeAnalyzedDart(2, 0.002),
      makeAnalyzedDart(3, -0.002),
    ];

    expect(
      compareWithPersonalBaseline('right', 'environment', currentDarts),
    ).toBeNull();

    for (let roundIndex = 0; roundIndex < 3; roundIndex++) {
      const darts = [
        makeAnalyzedDart(1, roundIndex * 0.001),
        makeAnalyzedDart(2, roundIndex * 0.001 + 0.002),
        makeAnalyzedDart(3, roundIndex * 0.001 - 0.002),
      ];
      recordRoundInHistory(
        computeRoundSummary('right', darts, 'environment'),
      );
    }

    const comparison = compareWithPersonalBaseline(
      'right',
      'environment',
      currentDarts,
    );
    expect(storedThrowCount()).toBe(9);
    expect(comparison).not.toBeNull();
    expect(comparison?.sampleSize).toBe(9);
    expect(comparison?.signatureMatch ?? 0).toBeGreaterThan(80);
    expect(
      compareWithPersonalBaseline('left', 'environment', currentDarts),
    ).toBeNull();
    expect(
      compareWithPersonalBaseline('right', 'user', currentDarts),
    ).toBeNull();
    expect(
      personalizedInsightForDart(
        'right',
        'environment',
        makeAnalyzedDart(1, 0.35, 1.2),
      )?.category,
    ).toBe('repeatability');

    clearThrowHistory();
    expect(storedThrowCount()).toBe(0);
  });

  it('drops malformed stored rows instead of producing NaN baselines', () => {
    window.localStorage.setItem(
      'dartform.throw-history.v1',
      JSON.stringify([{}, { releaseAngle: 'bad' }]),
    );

    expect(storedThrowCount()).toBe(0);
    expect(
      compareWithPersonalBaseline(
        'right',
        'environment',
        [
          makeAnalyzedDart(1),
          makeAnalyzedDart(2),
          makeAnalyzedDart(3),
        ],
      ),
    ).toBeNull();
  });

  it('ignores history when browser storage is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(storedThrowCount()).toBe(0);
    clearThrowHistory();
    expect(
      compareWithPersonalBaseline(
        'right',
        'environment',
        [makeAnalyzedDart(1), makeAnalyzedDart(2), makeAnalyzedDart(3)],
      ),
    ).toBeNull();
  });
});
