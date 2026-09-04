import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeRoundSummary } from '../analysis/roundMetrics';
import { makeAnalyzedDart, makeSparseDart } from '../test/fixtures';
import { HomePage } from '../pages/HomePage';
import { ResultsPage } from '../pages/ResultsPage';
import {
  clearThrowHistory,
  recordRoundInHistory,
} from '../storage/throwHistory';
import { InstantThrowFeedback } from './InstantThrowFeedback';
import { PhaseTimeline } from './PhaseTimeline';
import { ReleasePointPlot } from './ReleasePointPlot';
import { SpeedSparkline } from './SpeedSparkline';
import { ThrowCard } from './ThrowCard';
import { TrajectoryPlot } from './TrajectoryPlot';

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

describe('analytics result components', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: new MemoryStorage(),
      } as unknown as Window,
    });
    clearThrowHistory();
  });
  it('renders first-dart and previous-dart glance states accessibly', () => {
    const first = makeAnalyzedDart(1);
    const second = makeAnalyzedDart(2, 0.02, 1.05);

    const firstMarkup = renderToStaticMarkup(
      <InstantThrowFeedback dart={first} previousDart={null} />,
    );
    expect(firstMarkup).toContain('aria-live="polite"');
    expect(firstMarkup).toContain('First throw sets this round');

    const secondMarkup = renderToStaticMarkup(
      <InstantThrowFeedback dart={second} previousDart={first} />,
    );
    expect(secondMarkup).toContain('than Dart 1');
    expect(secondMarkup).toContain('confidence');

    const repeatabilityDart = {
      ...second,
      insight: {
        category: 'repeatability' as const,
        metricKey: 'signature',
        headline: 'Closer to your usual stroke',
        evidence: 'Stroke time matched your recent throws.',
        action:
          'Make a small correction toward your usual number instead of a big change.',
      },
      insights: [
        {
          category: 'repeatability' as const,
          metricKey: 'signature',
          headline: 'Closer to your usual stroke',
          evidence: 'Stroke time matched your recent throws.',
          action:
            'Make a small correction toward your usual number instead of a big change.',
        },
        second.insight,
      ],
    };
    const repeatabilityMarkup = renderToStaticMarkup(
      <InstantThrowFeedback
        dart={repeatabilityDart}
        previousDart={first}
      />,
    );
    expect(repeatabilityMarkup).toContain('Personal cue based on valid throws');
    expect(repeatabilityMarkup).toContain('Stroke time matched');
    expect(repeatabilityMarkup).toContain('1 other note on the results screen');
  });

  it('highlights the dominant comparison dimension between darts', () => {
    const first = {
      ...makeAnalyzedDart(1),
      releaseElbowAngle: 40,
      peakSpeed: 10,
      groups: {
        ...makeAnalyzedDart(1).groups,
        timing: {
          ...makeAnalyzedDart(1).groups.timing,
          forwardStrokeMs: 300,
        },
      },
    };
    const slower = {
      ...makeAnalyzedDart(2),
      releaseElbowAngle: 40.2,
      peakSpeed: 4,
      groups: {
        ...makeAnalyzedDart(2).groups,
        timing: {
          ...makeAnalyzedDart(2).groups.timing,
          forwardStrokeMs: 120,
        },
      },
    };
    const withoutStroke = {
      ...makeAnalyzedDart(3),
      releaseElbowAngle: 50,
      peakSpeed: 4,
      groups: {
        ...makeAnalyzedDart(3).groups,
        timing: {
          ...makeAnalyzedDart(3).groups.timing,
          forwardStrokeMs: null,
        },
      },
    };

    expect(
      renderToStaticMarkup(
        <InstantThrowFeedback dart={slower} previousDart={first} />,
      ),
    ).toContain('slower than Dart 1');

    expect(
      renderToStaticMarkup(
        <InstantThrowFeedback dart={withoutStroke} previousDart={first} />,
      ),
    ).not.toContain('Forward stroke');
  });

  it('omits unavailable experimental metrics instead of showing false data', () => {
    const dart = makeAnalyzedDart(1);
    const withoutHand = {
      ...dart,
      groups: {
        ...dart.groups,
        hand: {
          handAngleDeg: null,
          wristSnapDeg: null,
          confidence: null,
        },
      },
    };
    const markup = renderToStaticMarkup(<ThrowCard dart={withoutHand} />);

    expect(markup).not.toContain('Experimental hand estimate');
    expect(markup).toContain('Capture quality');
  });

  it('renders advanced mechanics, hand estimates, and capture reasons', () => {
    const dart = makeAnalyzedDart(1);
    const richDart = {
      ...dart,
      captureQuality: {
        ...dart.captureQuality,
        reasons: ['Tracking dropped frames during the throw.'],
      },
      groups: {
        ...dart.groups,
        hand: {
          handAngleDeg: 12,
          wristSnapDeg: 4,
          confidence: 0.82,
        },
      },
    };
    const markup = renderToStaticMarkup(<ThrowCard dart={richDart} />);

    expect(markup).toContain('Experimental hand estimate');
    expect(markup).toContain('Hand direction');
    expect(markup).toContain('Tracking dropped frames');
    expect(markup).toContain('Relative wrist speed');
    expect(markup).toContain('Form guide');
    expect(markup).toContain('You');
    expect(markup).toContain(richDart.insight.action);
  });

  it('renders sparse metric cards without optional visuals', () => {
    const markup = renderToStaticMarkup(<ThrowCard dart={makeSparseDart()} />);

    expect(markup).not.toContain('Relative wrist speed; dashed lines');
    expect(markup).not.toContain('Wrist path');
    expect(markup).toContain('Experimental hand estimate');
    expect(markup).not.toContain('Aim hold');
  });

  it('renders a full three-dart comparison and release-proxy disclosure', () => {
    const round = computeRoundSummary(
      'right',
      [
        makeAnalyzedDart(1),
        makeAnalyzedDart(2, 0.003),
        makeAnalyzedDart(3, -0.003),
      ],
      'environment',
    );
    const markup = renderToStaticMarkup(
      <ResultsPage
        round={round}
        onThrowAgain={() => undefined}
        onDone={() => undefined}
      />,
    );

    expect(markup).toContain('Round signature');
    expect(markup).toContain('Compare darts');
    expect(markup).toContain('Release-angle spread');
    expect(markup).toContain('Release-proxy point scatter');
    expect(markup).toContain('estimated at peak wrist speed');
    expect(markup).toContain('Form guide');
    expect(markup).toContain('stroke-dasharray');
  });

  it('renders baseline progress, exclusions, and stored-history controls', () => {
    for (let roundIndex = 0; roundIndex < 3; roundIndex++) {
      recordRoundInHistory(
        computeRoundSummary(
          'right',
          [
            makeAnalyzedDart(1, roundIndex * 0.001),
            makeAnalyzedDart(2, roundIndex * 0.001 + 0.002),
            makeAnalyzedDart(3, roundIndex * 0.001 - 0.002),
          ],
          'environment',
        ),
      );
    }

    const darts = [
      makeAnalyzedDart(1),
      makeAnalyzedDart(2, 0.005),
      {
        ...makeAnalyzedDart(3),
        analysisStatus: 'degraded' as const,
      },
    ];
    const round = {
      ...computeRoundSummary('right', darts, 'environment'),
      personalBaseline: {
        sampleSize: 12,
        signatureMatch: 72,
        releaseAngleDelta: 2,
        peakSpeedDelta: -0.1,
        strokeTimeDeltaMs: 18,
        headline: 'Stroke time was 18 ms higher than usual.',
      },
    };
    const markup = renderToStaticMarkup(
      <ResultsPage
        round={round}
        onThrowAgain={() => undefined}
        onDone={() => undefined}
      />,
    );

    expect(markup).toContain('Compared with your recent throws');
    expect(markup).toContain('72% signature match');
    expect(markup).toContain('Excluded Dart 3');
    expect(markup).toContain('Clear 9 locally stored throw signatures');
  });

  it('renders mixed-band summaries, null spreads, and outlier dimming', () => {
    const darts = [
      makeAnalyzedDart(1),
      {
        ...makeAnalyzedDart(2, 0.02),
        groups: {
          ...makeAnalyzedDart(2).groups,
          geometry: {
            ...makeAnalyzedDart(2).groups.geometry,
            releasePoint: null,
          },
        },
      },
      makeAnalyzedDart(3, 0.03),
    ];
    const round = {
      ...computeRoundSummary('right', darts, 'environment'),
      comparison: {
        ...computeRoundSummary('right', darts, 'environment').comparison,
        band: 'mixed' as const,
        releasePointSpread: null,
        timingSpreadMs: null,
        speedSimilarity: null,
        pathSimilarity: null,
        closestPair: null,
        outlierDart: 2,
        comparedDartCount: 1,
        excludedDartNumbers: [2, 3],
        headline: 'Some timing repeated while other parts drifted.',
      },
      tempoMs: [],
      darts: darts.map((dart, index) => ({
        ...dart,
        captureQuality: {
          ...dart.captureQuality,
          score: index === 0 ? 90 : 60,
        },
      })),
    };
    const markup = renderToStaticMarkup(
      <ResultsPage
        round={round}
        onThrowAgain={() => undefined}
        onDone={() => undefined}
      />,
    );

    expect(markup).toContain('Keep throwing: after 9 valid darts');
    expect(markup).toContain('Compared 1 high-confidence dart.');
    expect(markup).toContain('Excluded Dart 2, Dart 3');
    expect(markup).toContain('—');
  });

  it('renders chart and timeline helpers for analyzed darts', () => {
    const dart = makeAnalyzedDart(1);
    const timelineMarkup = renderToStaticMarkup(<PhaseTimeline dart={dart} />);
    expect(timelineMarkup).toContain('Aim');

    const sparklineMarkup = renderToStaticMarkup(
      <SpeedSparkline profile={dart.speedProfile} />,
    );
    expect(sparklineMarkup).toContain('role="img"');

    const emptySparkline = renderToStaticMarkup(
      <SpeedSparkline profile={[{ timeMs: 0, speed: 0 }]} />,
    );
    expect(emptySparkline).toContain('unavailable for this throw');

    const emptyTimeline = renderToStaticMarkup(
      <PhaseTimeline
        dart={{
          ...dart,
          groups: {
            ...dart.groups,
            timing: {
              ...dart.groups.timing,
              aimHoldMs: null,
              backswingMs: null,
              forwardStrokeMs: null,
              settleTimeMs: null,
            },
          },
        }}
      />,
    );
    expect(emptyTimeline).toBe('');

    const trajectoryMarkup = renderToStaticMarkup(
      <TrajectoryPlot
        series={[{ points: dart.trajectory, label: 'Dart 1', stroke: '#fff' }]}
      />,
    );
    expect(trajectoryMarkup).toContain('<svg');

    const releaseMarkup = renderToStaticMarkup(
      <ReleasePointPlot
        darts={[makeAnalyzedDart(1), makeAnalyzedDart(2)]}
        colors={['#fff', '#000']}
        outlierDart={2}
      />,
    );
    expect(releaseMarkup).toContain('release-point-plot');
    expect(
      renderToStaticMarkup(
        <ReleasePointPlot
          darts={[makeAnalyzedDart(1)]}
          colors={['#fff']}
          outlierDart={null}
        />,
      ),
    ).toBe('');

    const overlayMarkup = renderToStaticMarkup(
      <SpeedSparkline
        profiles={[
          {
            points: dart.speedProfile,
            stroke: '#fff',
            opacity: 0.35,
          },
          {
            points: makeAnalyzedDart(2).speedProfile,
            stroke: '#000',
            dashed: true,
          },
        ]}
        markers={[{ timeMs: -5000, label: 'Outside window' }]}
      />,
    );
    expect(overlayMarkup).toContain('<polyline');
    expect(overlayMarkup).toContain('stroke-dasharray');
  });

  it('renders the home screen with the selected throwing hand', () => {
    const markup = renderToStaticMarkup(
      <HomePage
        throwingHand="left"
        onThrowingHandChange={() => undefined}
        onStartRound={() => undefined}
      />,
    );

    expect(markup).toContain('DartForm');
    expect(markup).toContain('toggle-button--active');
    expect(markup).toContain('left arm');
    expect(markup).toContain('setup-body--phone');
    expect(markup).toContain('Place the phone');
    expect(markup).toContain('Rotate to landscape when the camera opens');
    expect(markup).toContain('setup-body--desktop');
    expect(markup).toContain('Stand so the camera sees your left arm');
    expect(markup).toContain('setup-diagram__scene--left');
    expect(markup).toContain('Camera at your side');
    expect(markup).toContain('face the camera');

    const rightMarkup = renderToStaticMarkup(
      <HomePage
        throwingHand="right"
        onThrowingHandChange={() => undefined}
        onStartRound={() => undefined}
      />,
    );
    expect(rightMarkup).toContain('right arm');
    expect(rightMarkup).toContain(
      'Stand so the camera sees your right arm',
    );
    expect(rightMarkup).toContain('setup-diagram__scene--right');
    expect(rightMarkup).not.toContain('setup-diagram__scene--left');
  });
});
