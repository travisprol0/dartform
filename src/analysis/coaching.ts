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
  action: string,
): CandidateInsight {
  return { priority, category, metricKey, headline, evidence, action };
}

const CLEAN_MOTION: CoachingInsight = {
  category: 'delivery',
  metricKey: 'repeatMotion',
  headline: 'Clean motion captured',
  evidence: 'Acceleration and finish stayed inside the current guide bands.',
  action: 'Keep repeating this rhythm on the next dart.',
};

function captureInsight(quality: CaptureQuality): CoachingInsight {
  return {
    category: 'capture',
    metricKey: 'captureQuality',
    headline: 'Keep the full arm visible',
    evidence:
      quality.reasons[0] ??
      'More tracked frames are needed for dependable mechanics.',
    action:
      'Step back until your throwing shoulder, elbow, and wrist stay in the camera frame.',
  };
}

export function collectCoachingInsights(
  groups: ThrowMetricGroups,
  quality: CaptureQuality,
): CoachingInsight[] {
  if (quality.grade === 'low') {
    return [captureInsight(quality)];
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
        'Pause on the target until the picture feels still, then start the backswing.',
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
        'Take the dart back until you feel a loaded stop before going forward.',
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
        'Keep accelerating through the release instead of stopping at the dart.',
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
        'Let the hand continue toward the board after the dart leaves.',
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
        'Finish along the same line you threw on, not down or across the body.',
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
        'Use one continuous acceleration—no pause or second push.',
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
        'Use one continuous acceleration—no pause or second push.',
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
        'Plant the throwing shoulder and let only the forearm move.',
      ),
    );
  }

  candidates.sort((left, right) => right.priority - left.priority);
  if (candidates.length === 0) {
    return [CLEAN_MOTION];
  }

  return candidates.map((item) => ({
    category: item.category,
    metricKey: item.metricKey,
    headline: item.headline,
    evidence: item.evidence,
    action: item.action,
  }));
}

export function buildCoachingInsight(
  groups: ThrowMetricGroups,
  quality: CaptureQuality,
): CoachingInsight {
  return collectCoachingInsights(groups, quality)[0];
}
