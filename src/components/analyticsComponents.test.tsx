import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { computeRoundSummary } from '../analysis/roundMetrics';
import { makeAnalyzedDart } from '../test/fixtures';
import { HomePage } from '../pages/HomePage';
import { ResultsPage } from '../pages/ResultsPage';
import { InstantThrowFeedback } from './InstantThrowFeedback';
import { PhaseTimeline } from './PhaseTimeline';
import { SpeedSparkline } from './SpeedSparkline';
import { ThrowCard } from './ThrowCard';
import { TrajectoryPlot } from './TrajectoryPlot';

describe('analytics result components', () => {
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
  });

  it('renders chart and timeline helpers for analyzed darts', () => {
    const dart = makeAnalyzedDart(1);
    const timelineMarkup = renderToStaticMarkup(<PhaseTimeline dart={dart} />);
    expect(timelineMarkup).toContain('Aim');

    const sparklineMarkup = renderToStaticMarkup(
      <SpeedSparkline profile={dart.speedProfile} />,
    );
    expect(sparklineMarkup).toContain('role="img"');

    const trajectoryMarkup = renderToStaticMarkup(
      <TrajectoryPlot
        series={[{ points: dart.trajectory, label: 'Dart 1', stroke: '#fff' }]}
      />,
    );
    expect(trajectoryMarkup).toContain('<svg');
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
  });
});
