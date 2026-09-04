import type {
  CaptureQuality,
  CoachingInsight,
  InsightCategory,
  ThrowMetricGroups,
} from '../types/round';

type CandidateInsight = CoachingInsight & {
  priority: number;
};

function candidate(
  priority: number,
  category: InsightCategory,
  metricKey: string,
  headline: string,
  evidence: string,
): CandidateInsight {
  return { priority, category, metricKey, headline, evidence };
}

export function buildCoachingInsight(
  groups: ThrowMetricGroups,
  quality: CaptureQuality,
): CoachingInsight {
  if (quality.grade === 'low') {
    return {
      category: 'capture',
      metricKey: 'captureQuality',
      headline: 'Keep the full arm visible',
      evidence:
        quality.reasons[0] ??
        'More tracked frames are needed for dependable mechanics.',
    };
  }

  const candidates: CandidateInsight[] = [];
  const { timing, delivery, geometry, path, body } = groups;

  if (timing.aimHoldMs !== null && timing.aimHoldMs < 200) {
    candidates.push(
      candidate(
        3,
        'timing',
        'aimHoldMs',
        'Give the aim one more beat',
        `The quiet hold lasted ${Math.round(timing.aimHoldMs)} ms.`,
      ),
    );
  }
  if (timing.backswingMs !== null && timing.backswingMs < 100) {
    candidates.push(
      candidate(
        2,
        'timing',
        'backswingMs',
        'Let the backswing load',
        `The backswing took ${Math.round(timing.backswingMs)} ms.`,
      ),
    );
  }
  if (
    geometry.elbowExtensionDeg !== null &&
    geometry.elbowExtensionDeg < 12
  ) {
    candidates.push(
      candidate(
        4,
        'geometry',
        'elbowExtensionDeg',
        'Extend through the release point',
        `Elbow extension was ${geometry.elbowExtensionDeg.toFixed(0)}°.`,
      ),
    );
  }
  if (
    path.followThroughLength !== null &&
    path.followThroughLength < 0.3
  ) {
    candidates.push(
      candidate(
        3,
        'path',
        'followThroughLength',
        'Let the arm finish',
        `Follow-through covered ${path.followThroughLength.toFixed(2)} forearms.`,
      ),
    );
  }
  if (
    path.followThroughContinuation !== null &&
    path.followThroughContinuation < 0.55
  ) {
    candidates.push(
      candidate(
        2,
        'path',
        'followThroughContinuation',
        'Continue along the delivery line',
        `Finish direction held ${Math.round(path.followThroughContinuation * 100)}% of the release path.`,
      ),
    );
  }
  if (
    delivery.hitchCount !== null &&
    delivery.hitchCount > 1
  ) {
    candidates.push(
      candidate(
        2,
        'delivery',
        'hitchCount',
        'Build speed in one motion',
        `${delivery.hitchCount} speed peaks appeared before release.`,
      ),
    );
  } else if (
    delivery.smoothness !== null &&
    delivery.smoothness > 0.5
  ) {
    candidates.push(
      candidate(
        2,
        'delivery',
        'smoothness',
        'Smooth the acceleration',
        `Speed variation measured ${delivery.smoothness.toFixed(2)}.`,
      ),
    );
  }
  if (body.shoulderDrift !== null && body.shoulderDrift > 0.25) {
    candidates.push(
      candidate(
        2,
        'body',
        'shoulderDrift',
        'Keep the throwing shoulder quiet',
        `Shoulder travel was ${body.shoulderDrift.toFixed(2)} forearms.`,
      ),
    );
  }

  candidates.sort((left, right) => right.priority - left.priority);
  const top = candidates[0];
  if (top) {
    return {
      category: top.category,
      metricKey: top.metricKey,
      headline: top.headline,
      evidence: top.evidence,
    };
  }

  return {
    category: 'delivery',
    metricKey: 'repeatMotion',
    headline: 'Clean motion captured',
    evidence: 'Acceleration and finish stayed inside the current guide bands.',
  };
}
