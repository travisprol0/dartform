import type { DartMetrics } from '../types/round';

type InstantThrowFeedbackProps = {
  dart: DartMetrics;
  previousDart: DartMetrics | null;
};

function comparisonLine(
  dart: DartMetrics,
  previousDart: DartMetrics | null,
): string {
  if (dart.insight.category === 'repeatability') {
    return dart.insight.evidence;
  }
  if (!previousDart) {
    return 'First throw sets this round’s reference.';
  }

  const angleDelta =
    dart.releaseElbowAngle - previousDart.releaseElbowAngle;
  const speedDelta = dart.peakSpeed - previousDart.peakSpeed;
  const previousStroke = previousDart.groups.timing.forwardStrokeMs;
  const stroke = dart.groups.timing.forwardStrokeMs;
  const strokeDelta =
    stroke !== null && previousStroke !== null
      ? stroke - previousStroke
      : null;

  const comparisons = [
    {
      weight: Math.abs(angleDelta) / 4,
      text: `Release angle ${Math.abs(angleDelta).toFixed(1)}° ${angleDelta >= 0 ? 'higher' : 'lower'} than Dart ${previousDart.dartNumber}.`,
    },
    {
      weight:
        Math.abs(speedDelta) / Math.max(previousDart.peakSpeed * 0.1, 0.1),
      text: `Wrist speed ${Math.abs(speedDelta).toFixed(1)} forearms/s ${speedDelta >= 0 ? 'faster' : 'slower'} than Dart ${previousDart.dartNumber}.`,
    },
    ...(strokeDelta !== null
      ? [
          {
            weight: Math.abs(strokeDelta) / 40,
            text: `Forward stroke ${Math.abs(Math.round(strokeDelta))} ms ${strokeDelta >= 0 ? 'longer' : 'shorter'} than Dart ${previousDart.dartNumber}.`,
          },
        ]
      : []),
  ];
  comparisons.sort((left, right) => right.weight - left.weight);
  return comparisons[0].text;
}

export function InstantThrowFeedback({
  dart,
  previousDart,
}: InstantThrowFeedbackProps) {
  const strokeTime = dart.groups.timing.forwardStrokeMs;

  return (
    <section
      className="instant-feedback"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="instant-feedback__topline">
        <p className="instant-feedback__dart">Dart {dart.dartNumber}</p>
        <span
          className={`quality-badge quality-badge--${dart.captureQuality.grade}`}
        >
          {dart.captureQuality.grade} confidence
        </span>
      </div>

      <p className="instant-feedback__headline">{dart.insight.headline}</p>

      <div className="instant-feedback__metrics">
        <div>
          <span>Elbow at speed peak</span>
          <strong>{dart.releaseElbowAngle.toFixed(0)}°</strong>
        </div>
        <div>
          <span>Relative wrist speed</span>
          <strong>{dart.peakSpeed.toFixed(1)} forearms/s</strong>
        </div>
        {strokeTime !== null ? (
          <div>
            <span>Forward stroke</span>
            <strong>{Math.round(strokeTime)} ms</strong>
          </div>
        ) : null}
      </div>

      <p className="instant-feedback__delta">
        {comparisonLine(dart, previousDart)}
      </p>
      <p className="instant-feedback__evidence">
        {dart.insight.category === 'repeatability'
          ? 'Personal cue based on valid throws stored on this device.'
          : dart.insight.evidence}
      </p>
      <p className="instant-feedback__action">{dart.insight.action}</p>
      {dart.insights.length > 1 ? (
        <p className="instant-feedback__more">
          {dart.insights.length - 1} other{' '}
          {dart.insights.length === 2 ? 'note' : 'notes'} on the results screen.
        </p>
      ) : null}
    </section>
  );
}
