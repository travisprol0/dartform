import type {
  DartMetrics,
  PhaseMetrics,
  PhaseName,
  SpeedPoint,
  ThrowMetricGroups,
  TrajectoryPoint,
} from '../types/round';
import { computeCaptureQuality } from './captureQuality';
import { collectCoachingInsights } from './coaching';
import type { PoseSample, ThrowTrace } from './detectThrow';
import {
  dist2d,
  dist3d,
  elbowAngle,
  elbowAngle3d,
} from './geometry';
import {
  nearestPeakIndex,
  pointVelocities,
  scalarDerivative,
  smoothPoseSamples,
} from './signalProcessing';

const MOTION_SPEED_THRESHOLD = 0.35;
const QUIET_SPEED_RATIO = 0.15;
const SETTLE_SPEED_RATIO = 0.25;
const MIN_PHASE_SAMPLES = 3;
const MOTION_BREAK_FRAMES = 5;

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return dist2d(a, b);
}

function forearmLength(sample: PoseSample): number {
  const length = dist(sample.elbow, sample.wrist);
  return length > 1e-6 ? length : 1e-6;
}

function imageSpeeds(trace: ThrowTrace): number[] {
  return pointVelocities(trace.samples, (sample) => sample.wrist).map(
    (velocity) => velocity.speed,
  );
}

function normalizedSpeeds(trace: ThrowTrace, forearm: number): number[] {
  return imageSpeeds(trace).map((speed) => speed / forearm);
}

function forearmElevation(sample: PoseSample, useWorld: boolean): number {
  if (useWorld && sample.world) {
    const dx = sample.world.wrist.x - sample.world.elbow.x;
    const dy = sample.world.wrist.y - sample.world.elbow.y;
    const dz = sample.world.wrist.z - sample.world.elbow.z;
    return (Math.atan2(-dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  }
  const dx = sample.wrist.x - sample.elbow.x;
  const dy = sample.wrist.y - sample.elbow.y;
  return (Math.atan2(-dy, dx) * 180) / Math.PI;
}

function upperArmElevation(sample: PoseSample, useWorld: boolean): number {
  if (useWorld && sample.world) {
    const dx = sample.world.elbow.x - sample.world.shoulder.x;
    const dy = sample.world.elbow.y - sample.world.shoulder.y;
    const dz = sample.world.elbow.z - sample.world.shoulder.z;
    return (Math.atan2(-dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  }
  const dx = sample.elbow.x - sample.shoulder.x;
  const dy = sample.elbow.y - sample.shoulder.y;
  return (Math.atan2(-dy, dx) * 180) / Math.PI;
}

function elbowAt(sample: PoseSample, useWorld: boolean): number {
  if (useWorld && sample.world) {
    return elbowAngle3d(
      sample.world.shoulder,
      sample.world.elbow,
      sample.world.wrist,
    );
  }
  return elbowAngle(sample.shoulder, sample.elbow, sample.wrist);
}

function findMotionStart(speeds: number[], peakIndex: number): number {
  let start = Math.max(0, Math.min(peakIndex, speeds.length - 1));
  let foundMotion = false;
  let quietFrames = 0;

  for (let index = start; index >= 0; index--) {
    if (speeds[index] >= MOTION_SPEED_THRESHOLD) {
      foundMotion = true;
      start = index;
      quietFrames = 0;
    } else if (foundMotion) {
      quietFrames += 1;
      if (quietFrames >= MOTION_BREAK_FRAMES) {
        return start;
      }
    }
  }
  return foundMotion ? start : 0;
}

function findAimStart(speeds: number[], motionStart: number): number {
  const quietThreshold = MOTION_SPEED_THRESHOLD * QUIET_SPEED_RATIO;
  let aimStart = motionStart;
  let foundQuietWindow = false;
  for (let i = motionStart - 1; i >= 1; i--) {
    if (speeds[i] < quietThreshold && speeds[i - 1] < quietThreshold) {
      aimStart = i - 1;
      foundQuietWindow = true;
    } else if (foundQuietWindow) {
      break;
    }
  }
  return aimStart;
}

function findRearIndex(
  trace: ThrowTrace,
  motionStart: number,
  peakIndex: number,
  useWorld: boolean,
): number {
  let rearIndex = motionStart;
  let minAngle = Infinity;
  for (let i = motionStart; i <= peakIndex; i++) {
    const angle = elbowAt(trace.samples[i], useWorld);
    if (angle < minAngle) {
      minAngle = angle;
      rearIndex = i;
    }
  }
  return rearIndex;
}

function findSettleIndex(
  speeds: number[],
  peakIndex: number,
  peakSpeed: number,
): number {
  const settleThreshold = Math.max(
    peakSpeed * SETTLE_SPEED_RATIO,
    MOTION_SPEED_THRESHOLD * 0.5,
  );
  for (let i = peakIndex + 1; i < speeds.length; i++) {
    if (speeds[i] < settleThreshold) {
      return i;
    }
  }
  return speeds.length - 1;
}

function wristSway(trace: ThrowTrace, start: number, end: number, forearm: number): number | null {
  if (end - start + 1 < MIN_PHASE_SAMPLES) {
    return null;
  }
  const slice = trace.samples.slice(start, end + 1);
  const cx =
    slice.reduce((sum, sample) => sum + sample.wrist.x, 0) / slice.length;
  const cy =
    slice.reduce((sum, sample) => sum + sample.wrist.y, 0) / slice.length;
  let maxDev = 0;
  for (const sample of slice) {
    maxDev = Math.max(maxDev, dist(sample.wrist, { x: cx, y: cy }));
  }
  return maxDev / forearm;
}

function pathLength(trace: ThrowTrace, start: number, end: number, forearm: number): number {
  let length = 0;
  for (let i = start + 1; i <= end; i++) {
    length += dist(trace.samples[i].wrist, trace.samples[i - 1].wrist);
  }
  return length / forearm;
}

function computeSmoothness(speeds: number[], start: number, end: number): number | null {
  if (end - start + 1 < MIN_PHASE_SAMPLES) {
    return null;
  }
  const deltas: number[] = [];
  for (let i = start + 1; i <= end; i++) {
    deltas.push(speeds[i] - speeds[i - 1]);
  }
  if (deltas.length < 2) {
    return null;
  }
  const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const variance =
    deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / deltas.length;
  const peak = Math.max(...speeds.slice(start, end + 1), 1e-6);
  return Math.sqrt(variance) / peak;
}

function followThroughContinuation(
  trace: ThrowTrace,
  peakIndex: number,
  settleIndex: number,
): number | null {
  if (settleIndex <= peakIndex + 1) {
    return null;
  }
  const peak = trace.samples[peakIndex].wrist;
  const next = trace.samples[peakIndex + 1].wrist;
  const strokeDx = next.x - peak.x;
  const strokeDy = next.y - peak.y;
  const strokeMag = Math.hypot(strokeDx, strokeDy);
  if (strokeMag < 1e-6) {
    return null;
  }
  const end = trace.samples[settleIndex].wrist;
  const ftDx = end.x - peak.x;
  const ftDy = end.y - peak.y;
  const dot = strokeDx * ftDx + strokeDy * ftDy;
  const ftMag = Math.hypot(ftDx, ftDy);
  if (ftMag < 1e-6) {
    return null;
  }
  return Math.max(0, Math.min(1, dot / (strokeMag * ftMag)));
}

function directness(
  trace: ThrowTrace,
  start: number,
  end: number,
  forearm: number,
): number | null {
  if (end <= start) {
    return null;
  }
  const traveled = pathLength(trace, start, end, forearm);
  if (traveled <= 1e-6) {
    return null;
  }
  const chord = dist(
    trace.samples[start].wrist,
    trace.samples[end].wrist,
  ) / forearm;
  return Math.max(0, Math.min(1, chord / traveled));
}

function maximumPathDeviation(
  trace: ThrowTrace,
  start: number,
  end: number,
  forearm: number,
): number | null {
  if (end - start < 2) {
    return null;
  }
  const first = trace.samples[start].wrist;
  const last = trace.samples[end].wrist;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-6) {
    return null;
  }

  let maxDistance = 0;
  for (let index = start + 1; index < end; index++) {
    const point = trace.samples[index].wrist;
    const distanceFromLine =
      Math.abs(dy * point.x - dx * point.y + last.x * first.y - last.y * first.x) /
      chord;
    maxDistance = Math.max(maxDistance, distanceFromLine);
  }
  return maxDistance / forearm;
}

function elbowAnchorDrift(
  trace: ThrowTrace,
  start: number,
  end: number,
  forearm: number,
): number | null {
  if (end <= start) {
    return null;
  }
  const baseline = {
    x: trace.samples[start].elbow.x - trace.samples[start].shoulder.x,
    y: trace.samples[start].elbow.y - trace.samples[start].shoulder.y,
  };
  let maxDrift = 0;
  for (let index = start + 1; index <= end; index++) {
    const relative = {
      x: trace.samples[index].elbow.x - trace.samples[index].shoulder.x,
      y: trace.samples[index].elbow.y - trace.samples[index].shoulder.y,
    };
    maxDrift = Math.max(maxDrift, dist(relative, baseline));
  }
  return maxDrift / forearm;
}

function normalizedPointDisplacement(
  start: { x: number; y: number } | undefined,
  end: { x: number; y: number } | undefined,
  forearm: number,
): number | null {
  return start && end ? dist(start, end) / forearm : null;
}

function midpoint(
  first: { x: number; y: number },
  second: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function hipMidpoint(sample: PoseSample): { x: number; y: number } | null {
  return sample.leftHip && sample.rightHip
    ? midpoint(sample.leftHip, sample.rightHip)
    : null;
}

function shoulderMidpoint(
  sample: PoseSample,
): { x: number; y: number } | null {
  return sample.oppositeShoulder
    ? midpoint(sample.shoulder, sample.oppositeShoulder)
    : null;
}

function torsoLean(sample: PoseSample): number | null {
  const hips = hipMidpoint(sample);
  const shoulders = shoulderMidpoint(sample);
  if (!hips || !shoulders) {
    return null;
  }
  return (
    (Math.atan2(shoulders.x - hips.x, hips.y - shoulders.y) * 180) /
    Math.PI
  );
}

function outOfPlaneMotion(
  trace: ThrowTrace,
  start: number,
  end: number,
): number | null {
  const samples = trace.samples
    .slice(start, end + 1)
    .filter((sample) => sample.world !== undefined);
  if (samples.length < (end - start + 1) * 0.7) {
    return null;
  }
  const baseline = samples[0].world;
  if (!baseline) {
    return null;
  }
  const scale = dist3d(baseline.elbow, baseline.wrist);
  if (scale < 1e-6) {
    return null;
  }
  const depths = samples
    .map((sample) => sample.world?.wrist.z)
    .filter((value): value is number => value !== undefined);
  return (Math.max(...depths) - Math.min(...depths)) / scale;
}

function handDirection(sample: PoseSample): number | null {
  if (!sample.index || !sample.pinky) {
    return null;
  }
  const center = midpoint(sample.index, sample.pinky);
  return (
    (Math.atan2(-(center.y - sample.wrist.y), center.x - sample.wrist.x) *
      180) /
    Math.PI
  );
}

function angleDelta(start: number, end: number): number {
  let delta = end - start;
  while (delta > 180) {
    delta -= 360;
  }
  while (delta < -180) {
    delta += 360;
  }
  return delta;
}

function handConfidence(sample: PoseSample): number | null {
  const landmarks = [sample.index, sample.pinky, sample.thumb];
  if (landmarks.some((landmark) => landmark === undefined)) {
    return null;
  }
  return (
    landmarks.reduce(
      (sum, landmark) =>
        sum + (landmark?.visibility ?? landmark?.presence ?? 0),
      0,
    ) / landmarks.length
  );
}

function hitchCount(
  speeds: number[],
  start: number,
  end: number,
): number | null {
  if (end - start < 3) {
    return null;
  }
  const peak = Math.max(...speeds.slice(start, end + 1));
  const threshold = peak * 0.35;
  let peaks = 1;
  for (let index = start + 1; index < end; index++) {
    if (
      speeds[index] >= threshold &&
      speeds[index] > speeds[index - 1] &&
      speeds[index] >= speeds[index + 1]
    ) {
      peaks += 1;
    }
  }
  return peaks;
}

function phaseAt(
  index: number,
  motionStart: number,
  rearIndex: number,
  peakIndex: number,
): PhaseName {
  if (index < motionStart) {
    return 'aim';
  }
  if (index <= rearIndex) {
    return 'backswing';
  }
  if (index <= peakIndex) {
    return 'forward';
  }
  return 'followThrough';
}

function buildTrajectory(
  trace: ThrowTrace,
  aimStart: number,
  motionStart: number,
  rearIndex: number,
  peakIndex: number,
  settleIndex: number,
  forearm: number,
): TrajectoryPoint[] {
  const origin = trace.samples[motionStart].shoulder;
  const pointCount = settleIndex - aimStart + 1;
  const step = Math.max(1, Math.ceil(pointCount / 60));
  const boundaryIndices = new Set([
    aimStart,
    motionStart,
    rearIndex,
    peakIndex,
    settleIndex,
  ]);
  const trajectory: TrajectoryPoint[] = [];

  for (let index = aimStart; index <= settleIndex; index++) {
    if ((index - aimStart) % step !== 0 && !boundaryIndices.has(index)) {
      continue;
    }
    const sample = trace.samples[index];
    trajectory.push({
      timeMs: sample.timestamp - trace.samples[motionStart].timestamp,
      x: (sample.wrist.x - origin.x) / forearm,
      y: (sample.wrist.y - origin.y) / forearm,
      phase: phaseAt(index, motionStart, rearIndex, peakIndex),
    });
  }
  return trajectory;
}

export function traceHasMeaningfulMotion(trace: ThrowTrace): boolean {
  if (trace.samples.length < MIN_PHASE_SAMPLES || trace.peakIndex < 1) {
    return false;
  }
  const speeds = imageSpeeds(trace);
  if (speeds.length === 0) {
    return false;
  }
  return Math.max(...speeds) >= MOTION_SPEED_THRESHOLD;
}

export function analyzeThrowTrace(
  trace: ThrowTrace,
  dartNumber: number,
): DartMetrics | null {
  if (trace.samples.length < MIN_PHASE_SAMPLES || trace.peakIndex < 1) {
    return null;
  }

  const captureQuality = computeCaptureQuality(trace);

  const smoothedTrace: ThrowTrace = {
    samples: smoothPoseSamples(trace.samples),
    peakIndex: trace.peakIndex,
  };
  const initialSpeeds = imageSpeeds(smoothedTrace);
  const peakIndex = nearestPeakIndex(
    smoothedTrace.samples,
    initialSpeeds,
    trace.peakIndex,
  );
  const analyzedTrace: ThrowTrace = {
    samples: smoothedTrace.samples,
    peakIndex,
  };
  const imageSpd = imageSpeeds(analyzedTrace);
  const motionStart = findMotionStart(imageSpd, peakIndex);
  const forearm = forearmLength(analyzedTrace.samples[motionStart]);
  const speeds = normalizedSpeeds(analyzedTrace, forearm);
  const useWorld = captureQuality.worldCoverage >= 0.7;
  const aimStart = findAimStart(imageSpd, motionStart);
  const rearIndex = findRearIndex(
    analyzedTrace,
    motionStart,
    peakIndex,
    useWorld,
  );
  const peakSpeed = speeds[peakIndex];
  const settleIndex = findSettleIndex(
    imageSpd,
    peakIndex,
    imageSpd[peakIndex],
  );

  const motionStartTime = analyzedTrace.samples[motionStart].timestamp;
  const aimStartTime = analyzedTrace.samples[aimStart].timestamp;
  const rearTime = analyzedTrace.samples[rearIndex].timestamp;
  const peakTime = analyzedTrace.samples[peakIndex].timestamp;
  const settleTime = analyzedTrace.samples[settleIndex].timestamp;

  const cockedElbow = elbowAt(analyzedTrace.samples[rearIndex], useWorld);
  const releaseElbow = elbowAt(analyzedTrace.samples[peakIndex], useWorld);
  const baselineElbow = elbowAt(
    analyzedTrace.samples[motionStart],
    useWorld,
  );

  let maxElbowLock = releaseElbow;
  for (let index = peakIndex; index <= settleIndex; index++) {
    maxElbowLock = Math.max(
      maxElbowLock,
      elbowAt(analyzedTrace.samples[index], useWorld),
    );
  }

  const shoulderStart = analyzedTrace.samples[motionStart].shoulder;
  const shoulderEnd = analyzedTrace.samples[settleIndex].shoulder;
  const shoulderDisp = dist(shoulderStart, shoulderEnd);
  const wristDisp = dist(
    analyzedTrace.samples[motionStart].wrist,
    analyzedTrace.samples[settleIndex].wrist,
  );
  const shoulderQuietRatio =
    wristDisp > 1e-6 ? shoulderDisp / wristDisp : null;

  const aimHoldMs =
    motionStart > aimStart ? motionStartTime - aimStartTime : null;
  const backswingMs =
    rearIndex > motionStart ? rearTime - motionStartTime : null;
  const forwardStrokeMs =
    rearIndex < peakIndex ? peakTime - rearTime : null;
  const meanAcceleration =
    forwardStrokeMs !== null && forwardStrokeMs > 0
      ? (peakSpeed - speeds[rearIndex]) / (forwardStrokeMs / 1000)
      : null;
  const accelerations = scalarDerivative(speeds, analyzedTrace.samples);
  const peakAcceleration =
    captureQuality.frameRate >= 20 && rearIndex < peakIndex
      ? Math.max(...accelerations.slice(rearIndex, peakIndex + 1))
      : null;
  const smoothness =
    captureQuality.frameRate >= 20
      ? computeSmoothness(speeds, rearIndex, peakIndex)
      : null;

  const backswingLength =
    rearIndex > motionStart
      ? pathLength(analyzedTrace, motionStart, rearIndex, forearm)
      : null;
  const forwardStrokeLength =
    rearIndex < peakIndex
      ? pathLength(analyzedTrace, rearIndex, peakIndex, forearm)
      : null;
  const followThroughLength =
    settleIndex > peakIndex
      ? pathLength(analyzedTrace, peakIndex, settleIndex, forearm)
      : null;
  const pathDirectness = directness(
    analyzedTrace,
    rearIndex,
    peakIndex,
    forearm,
  );
  const maxDeviation = maximumPathDeviation(
    analyzedTrace,
    rearIndex,
    peakIndex,
    forearm,
  );

  const releaseWorld = analyzedTrace.samples[peakIndex].world;
  const baselineWorld = analyzedTrace.samples[motionStart].world;
  const worldForearm =
    useWorld && baselineWorld
      ? dist3d(baselineWorld.elbow, baselineWorld.wrist)
      : 0;
  const releaseDepth =
    useWorld && releaseWorld && baselineWorld && worldForearm > 1e-6
      ? (releaseWorld.wrist.z - baselineWorld.shoulder.z) / worldForearm
      : undefined;
  const releasePoint = {
    x:
      (analyzedTrace.samples[peakIndex].wrist.x - shoulderStart.x) /
      forearm,
    y:
      (analyzedTrace.samples[peakIndex].wrist.y - shoulderStart.y) /
      forearm,
    z: releaseDepth,
  };

  const hipStart = hipMidpoint(analyzedTrace.samples[motionStart]);
  const hipEnd = hipMidpoint(analyzedTrace.samples[settleIndex]);
  const peakHandDirection = handDirection(analyzedTrace.samples[peakIndex]);
  const rearHandDirection = handDirection(analyzedTrace.samples[rearIndex]);
  const peakHandConfidence = handConfidence(
    analyzedTrace.samples[peakIndex],
  );
  const handMetricAvailable =
    captureQuality.handCoverage >= 0.65 &&
    captureQuality.grade !== 'low' &&
    peakHandDirection !== null &&
    peakHandConfidence !== null;

  const phases: PhaseMetrics = {
    aimHoldMs,
    aimWristSway: wristSway(
      analyzedTrace,
      aimStart,
      motionStart,
      forearm,
    ),
    backswingMs,
    backswingLength,
    cockedElbowDeg: cockedElbow,
    forwardStrokeMs,
    peakSpeed,
    timeToPeakMs: peakTime - motionStartTime,
    meanAcceleration,
    releaseElbowDeg: releaseElbow,
    forearmElevationDeg: forearmElevation(
      analyzedTrace.samples[peakIndex],
      useWorld,
    ),
    releaseHeightVsShoulder:
      (analyzedTrace.samples[peakIndex].wrist.y -
        analyzedTrace.samples[peakIndex].shoulder.y) /
      forearm,
    elbowExtensionDeg: releaseElbow - baselineElbow,
    followThroughLength,
    followThroughContinuation: followThroughContinuation(
      analyzedTrace,
      peakIndex,
      settleIndex,
    ),
    maxElbowLockDeg: maxElbowLock,
    settleTimeMs: settleTime - peakTime,
    smoothness,
    shoulderQuietRatio,
  };

  const groups: ThrowMetricGroups = {
    timing: {
      aimHoldMs,
      backswingMs,
      forwardStrokeMs,
      releaseProxyMs: peakTime - motionStartTime,
      settleTimeMs: settleTime - peakTime,
      totalMotionMs: settleTime - motionStartTime,
      backswingToForwardRatio:
        backswingMs !== null &&
        forwardStrokeMs !== null &&
        forwardStrokeMs > 0
          ? backswingMs / forwardStrokeMs
          : null,
    },
    delivery: {
      peakSpeed,
      timeToPeakMs: peakTime - motionStartTime,
      meanAcceleration:
        captureQuality.frameRate >= 20 ? meanAcceleration : null,
      peakAcceleration,
      peakLocationRatio:
        settleTime > rearTime
          ? (peakTime - rearTime) / (settleTime - rearTime)
          : null,
      smoothness,
      hitchCount:
        captureQuality.frameRate >= 20
          ? hitchCount(speeds, rearIndex, peakIndex)
          : null,
    },
    geometry: {
      cockedElbowDeg: cockedElbow,
      releaseElbowDeg: releaseElbow,
      maxElbowLockDeg: maxElbowLock,
      elbowExtensionDeg: releaseElbow - baselineElbow,
      forearmElevationDeg: phases.forearmElevationDeg,
      upperArmElevationDeg: upperArmElevation(
        analyzedTrace.samples[peakIndex],
        useWorld,
      ),
      elbowAnchorDrift: elbowAnchorDrift(
        analyzedTrace,
        motionStart,
        peakIndex,
        forearm,
      ),
      releasePoint,
    },
    path: {
      backswingLength,
      forwardStrokeLength,
      followThroughLength,
      directness: pathDirectness,
      maxDeviation,
      curvature:
        pathDirectness !== null && pathDirectness > 1e-6
          ? 1 / pathDirectness - 1
          : null,
      followThroughContinuation: phases.followThroughContinuation,
    },
    body: {
      aimWristSway: phases.aimWristSway,
      shoulderDrift: shoulderDisp / forearm,
      headDrift: normalizedPointDisplacement(
        analyzedTrace.samples[motionStart].nose,
        analyzedTrace.samples[settleIndex].nose,
        forearm,
      ),
      torsoSway: normalizedPointDisplacement(
        hipStart ?? undefined,
        hipEnd ?? undefined,
        forearm,
      ),
      torsoLeanDeg: torsoLean(analyzedTrace.samples[peakIndex]),
      outOfPlaneMotion: useWorld
        ? outOfPlaneMotion(analyzedTrace, motionStart, settleIndex)
        : null,
    },
    hand: {
      handAngleDeg: handMetricAvailable ? peakHandDirection : null,
      wristSnapDeg:
        handMetricAvailable && rearHandDirection !== null
          ? angleDelta(rearHandDirection, peakHandDirection)
          : null,
      confidence: handMetricAvailable ? peakHandConfidence : null,
    },
  };

  const insights = collectCoachingInsights(groups, captureQuality);
  const insight = insights[0];
  const speedProfile: SpeedPoint[] = analyzedTrace.samples.map(
    (sample, index) => ({
      timeMs: sample.timestamp - motionStartTime,
      speed: speeds[index],
    }),
  );

  return {
    dartNumber,
    analysisStatus: 'complete',
    peakTimestamp: peakTime,
    coachingTip: `${insight.headline}. ${insight.evidence}`,
    speedProfile,
    phases,
    releaseElbowAngle: releaseElbow,
    peakSpeed,
    followThrough: phases.followThroughLength ?? 0,
    groups,
    captureQuality,
    phaseMarkers: {
      aimStartMs: aimStart < motionStart ? aimStartTime - motionStartTime : null,
      motionStartMs: 0,
      rearMs: rearIndex > motionStart ? rearTime - motionStartTime : null,
      releaseProxyMs: peakTime - motionStartTime,
      settleMs: settleIndex > peakIndex ? settleTime - motionStartTime : null,
    },
    trajectory: buildTrajectory(
      analyzedTrace,
      aimStart,
      motionStart,
      rearIndex,
      peakIndex,
      settleIndex,
      forearm,
    ),
    insight,
    insights,
  };
}
