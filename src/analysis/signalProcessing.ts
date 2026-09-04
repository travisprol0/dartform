import type { PoseSample } from './detectThrow';
import type {
  PoseLandmark,
  TrackedPoseLandmarks,
} from './throwingArm';

export type MotionPoint = {
  x: number;
  y: number;
  z?: number;
};

export type VelocityPoint = {
  x: number;
  y: number;
  z: number;
  speed: number;
};

const IMAGE_POINT_KEYS = [
  'wrist',
  'elbow',
  'shoulder',
  'oppositeShoulder',
  'nose',
  'leftHip',
  'rightHip',
  'index',
  'pinky',
  'thumb',
] as const;

type ImagePointKey = (typeof IMAGE_POINT_KEYS)[number];
type WorldPointKey = keyof TrackedPoseLandmarks;

function confidenceOf(point: PoseLandmark): number {
  return Math.max(0.15, point.visibility ?? point.presence ?? 1);
}

function weightedPoint(
  samples: PoseSample[],
  index: number,
  windowMs: number,
  select: (sample: PoseSample) => PoseLandmark | undefined,
): PoseLandmark | undefined {
  const centerTime = samples[index].timestamp;
  let totalWeight = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  let visibility = 0;
  let presence = 0;

  for (const sample of samples) {
    const distanceMs = Math.abs(sample.timestamp - centerTime);
    if (distanceMs > windowMs) {
      continue;
    }
    const point = select(sample);
    if (!point) {
      continue;
    }
    const timeWeight = 1 - distanceMs / Math.max(windowMs, 1);
    const weight = Math.max(0.05, timeWeight) * confidenceOf(point);
    totalWeight += weight;
    x += point.x * weight;
    y += point.y * weight;
    z += point.z * weight;
    visibility += (point.visibility ?? 1) * weight;
    presence += (point.presence ?? 1) * weight;
  }

  if (totalWeight === 0) {
    return undefined;
  }

  return {
    x: x / totalWeight,
    y: y / totalWeight,
    z: z / totalWeight,
    visibility: visibility / totalWeight,
    presence: presence / totalWeight,
  };
}

function smoothWorldPose(
  samples: PoseSample[],
  index: number,
  windowMs: number,
): TrackedPoseLandmarks | undefined {
  const point = (key: WorldPointKey) =>
    weightedPoint(
      samples,
      index,
      windowMs,
      (sample) => sample.world?.[key],
    );

  const shoulder = point('shoulder');
  const elbow = point('elbow');
  const wrist = point('wrist');
  if (!shoulder || !elbow || !wrist) {
    return undefined;
  }

  return {
    shoulder,
    elbow,
    wrist,
    oppositeShoulder: point('oppositeShoulder'),
    nose: point('nose'),
    leftHip: point('leftHip'),
    rightHip: point('rightHip'),
    index: point('index'),
    pinky: point('pinky'),
    thumb: point('thumb'),
  };
}

/**
 * Applies a centered temporal filter after a throw has completed. Unlike the
 * detector's causal moving average, this does not shift the reported peak.
 */
export function smoothPoseSamples(
  samples: PoseSample[],
  windowMs = 80,
): PoseSample[] {
  if (samples.length < 3) {
    return samples.map((sample) => ({ ...sample }));
  }

  return samples.map((sample, index) => {
    const points = Object.fromEntries(
      IMAGE_POINT_KEYS.map((key) => [
        key,
        weightedPoint(
          samples,
          index,
          windowMs,
          (candidate) => candidate[key],
        ),
      ]),
    ) as Partial<Record<ImagePointKey, PoseLandmark>>;

    return {
      ...sample,
      wrist: points.wrist ?? sample.wrist,
      elbow: points.elbow ?? sample.elbow,
      shoulder: points.shoulder ?? sample.shoulder,
      oppositeShoulder: points.oppositeShoulder,
      nose: points.nose,
      leftHip: points.leftHip,
      rightHip: points.rightHip,
      index: points.index,
      pinky: points.pinky,
      thumb: points.thumb,
      world: smoothWorldPose(samples, index, windowMs),
    };
  });
}

function derivativeWindow(
  samples: PoseSample[],
  index: number,
): [number, number] {
  if (samples.length < 2) {
    return [index, index];
  }
  if (index === 0) {
    return [0, 1];
  }
  if (index === samples.length - 1) {
    return [samples.length - 2, samples.length - 1];
  }
  return [index - 1, index + 1];
}

export function pointVelocities(
  samples: PoseSample[],
  select: (sample: PoseSample) => MotionPoint | undefined,
  dimensions: '2d' | '3d' = '2d',
): VelocityPoint[] {
  return samples.map((_, index) => {
    const [startIndex, endIndex] = derivativeWindow(samples, index);
    const start = select(samples[startIndex]);
    const end = select(samples[endIndex]);
    const dt =
      (samples[endIndex].timestamp - samples[startIndex].timestamp) / 1000;

    if (!start || !end || dt <= 0) {
      return { x: 0, y: 0, z: 0, speed: 0 };
    }

    const x = (end.x - start.x) / dt;
    const y = (end.y - start.y) / dt;
    const z =
      dimensions === '3d' ? ((end.z ?? 0) - (start.z ?? 0)) / dt : 0;
    return {
      x,
      y,
      z,
      speed: Math.hypot(x, y, z),
    };
  });
}

export function scalarDerivative(
  values: number[],
  samples: PoseSample[],
): number[] {
  return values.map((_, index) => {
    const [startIndex, endIndex] = derivativeWindow(samples, index);
    const dt =
      (samples[endIndex].timestamp - samples[startIndex].timestamp) / 1000;
    return dt > 0 ? (values[endIndex] - values[startIndex]) / dt : 0;
  });
}

export function nearestPeakIndex(
  samples: PoseSample[],
  values: number[],
  candidateIndex: number,
  radiusMs = 180,
): number {
  const candidateTime = samples[candidateIndex]?.timestamp;
  if (candidateTime === undefined) {
    return Math.max(0, Math.min(candidateIndex, samples.length - 1));
  }

  const firstSearchIndex = samples.length > 2 ? 1 : 0;
  const lastSearchIndex =
    samples.length > 2 ? samples.length - 2 : samples.length - 1;
  let peakIndex = Math.max(
    firstSearchIndex,
    Math.min(candidateIndex, lastSearchIndex),
  );
  let peakValue = values[peakIndex] ?? 0;
  for (
    let index = firstSearchIndex;
    index <= lastSearchIndex;
    index++
  ) {
    if (Math.abs(samples[index].timestamp - candidateTime) > radiusMs) {
      continue;
    }
    const value = values[index] ?? 0;
    const isHigher = value > peakValue + 1e-9;
    const isEquallyHighAndCloser =
      Math.abs(value - peakValue) <= 1e-9 &&
      Math.abs(index - candidateIndex) < Math.abs(peakIndex - candidateIndex);
    if (isHigher || isEquallyHighAndCloser) {
      peakIndex = index;
      peakValue = value;
    }
  }
  return peakIndex;
}
