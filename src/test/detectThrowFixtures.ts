import {
  sampleElbowAngle,
  TRACE_AFTER_MS,
  ThrowDetector,
  type PoseSample,
} from '../analysis/detectThrow';
import { poseSample, withoutWorld } from './fixtures';
import type { PoseLandmark } from '../analysis/throwingArm';

export const FRAME_MS = 1000 / 30;

const AIM_FOREARM_DEG = 25;
const COCK_FOREARM_DEG = -55;
const RELEASE_FOREARM_DEG = 60;
const FOREARM_LENGTH = 0.2;

export function forearmWrist(
  angleDeg: number,
  elbowX = 0.5,
  elbowY = 0.5,
): { x: number; y: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: elbowX + Math.cos(radians) * FOREARM_LENGTH,
    y: elbowY + Math.sin(radians) * FOREARM_LENGTH,
  };
}

export const THROW_PEAK_WRIST = forearmWrist(RELEASE_FOREARM_DEG);
export const THROW_END_X = THROW_PEAK_WRIST.x;

export function poseAtForearmAngle(
  timestamp: number,
  angleDeg: number,
  elbowX = 0.5,
  elbowY = 0.5,
): PoseSample {
  const wrist = forearmWrist(angleDeg, elbowX, elbowY);
  return poseSample(timestamp, wrist.x, wrist.y, 0, elbowX, elbowY);
}

export function acceptedThrowBuffer(peakTimestamp = 10_000): {
  buffer: PoseSample[];
  pendingPeak: {
    speed: number;
    timestamp: number;
    wrist: { x: number; y: number; z: number };
  };
  throwBaselineWrist: { x: number; y: number; z: number };
  throwBaselineElbowAngle: number;
} {
  const aim = poseAtForearmAngle(peakTimestamp - 400, AIM_FOREARM_DEG);
  const cock = poseAtForearmAngle(peakTimestamp - 200, COCK_FOREARM_DEG);
  const release = poseAtForearmAngle(peakTimestamp, RELEASE_FOREARM_DEG);
  return {
    buffer: [aim, cock, release],
    pendingPeak: {
      speed: 2.5,
      timestamp: peakTimestamp,
      wrist: {
        x: release.world?.wrist.x ?? release.wrist.x,
        y: release.world?.wrist.y ?? release.wrist.y,
        z: release.world?.wrist.z ?? 0,
      },
    },
    throwBaselineWrist: {
      x: aim.world?.wrist.x ?? aim.wrist.x,
      y: aim.world?.wrist.y ?? aim.wrist.y,
      z: aim.world?.wrist.z ?? 0,
    },
    throwBaselineElbowAngle: sampleElbowAngle(aim),
  };
}

export function degenerateElbowSample(timestamp: number) {
  return poseSample(timestamp, 0.5, 0.2, 0, 0.5, 0.2);
}

export function shortPrime(
  detector: ThrowDetector,
  timestamp: number,
  frames = 5,
): number {
  const wrist = forearmWrist(AIM_FOREARM_DEG);
  for (let frame = 0; frame < frames; frame++) {
    detector.addSample(
      poseSample(timestamp, wrist.x, wrist.y, 0, 0.5, 0.5),
      false,
    );
    timestamp += FRAME_MS;
  }
  return timestamp;
}

export function longPrime(
  detector: ThrowDetector,
  timestamp: number,
  frames = 55,
): number {
  const wrist = forearmWrist(AIM_FOREARM_DEG);
  for (let frame = 0; frame < frames; frame++) {
    detector.addSample(
      poseSample(timestamp, wrist.x, wrist.y, 0, 0.5, 0.5),
      false,
    );
    timestamp += FRAME_MS;
  }
  return timestamp;
}

export function acceleratingThrow(
  detector: ThrowDetector,
  timestamp: number,
  wristAtPeak = THROW_PEAK_WRIST,
  elbowX = 0.5,
  elbowY = 0.5,
  holdFrames = 10,
): number {
  for (let frame = 1; frame <= 4; frame++) {
    const progress = frame / 4;
    const angle =
      AIM_FOREARM_DEG + (COCK_FOREARM_DEG - AIM_FOREARM_DEG) * progress;
    const wrist = forearmWrist(angle, elbowX, elbowY);
    detector.addSample(
      poseSample(timestamp, wrist.x, wrist.y, 0, elbowX, elbowY),
    );
    timestamp += FRAME_MS;
  }
  for (let frame = 1; frame <= 8; frame++) {
    const progress = frame / 8;
    const angle =
      COCK_FOREARM_DEG +
      (RELEASE_FOREARM_DEG - COCK_FOREARM_DEG) * progress;
    const wrist = forearmWrist(angle, elbowX, elbowY);
    detector.addSample(
      poseSample(timestamp, wrist.x, wrist.y, 0, elbowX, elbowY),
    );
    timestamp += FRAME_MS;
  }
  for (let frame = 0; frame < holdFrames; frame++) {
    detector.addSample(
      poseSample(
        timestamp,
        wristAtPeak.x,
        wristAtPeak.y,
        0,
        elbowX,
        elbowY,
      ),
    );
    timestamp += FRAME_MS;
  }
  return timestamp;
}

export function decelerateToRest(
  detector: ThrowDetector,
  timestamp: number,
  wristX = THROW_PEAK_WRIST.x,
  wristY = THROW_PEAK_WRIST.y,
  frames = 10,
  elbowX = 0.5,
  elbowY = 0.5,
): number {
  for (let frame = 0; frame < frames; frame++) {
    detector.addSample(
      poseSample(timestamp, wristX, wristY, 0, elbowX, elbowY),
    );
    timestamp += FRAME_MS;
  }
  return timestamp;
}

export function tinyDisplacementThrow(
  detector: ThrowDetector,
  timestamp: number,
): number {
  const wrist = forearmWrist(AIM_FOREARM_DEG);
  for (let frame = 1; frame <= 6; frame++) {
    detector.addSample(
      poseSample(timestamp, wrist.x + frame * 0.01, wrist.y, 0, 0.5, 0.5),
    );
    timestamp += FRAME_MS;
  }
  return decelerateToRest(
    detector,
    timestamp,
    wrist.x + 0.06,
    wrist.y,
  );
}

export function validThrowWithLookback(
  detector: ThrowDetector,
  timestamp: number,
): number {
  timestamp = longPrime(detector, timestamp);
  return acceleratingThrow(detector, timestamp);
}

function landmark(
  x: number,
  y: number,
  z = 0,
): PoseLandmark {
  return { x, y, z, visibility: 0.95, presence: 0.95 };
}

export function worldSwingSample(
  timestamp: number,
  angleDeg: number,
): PoseSample {
  const sample = poseSample(timestamp, 0.5, 0.5);
  const elbow = { x: 0, y: 0.25, z: 0 };
  const radians = (angleDeg * Math.PI) / 180;
  const wrist = {
    x: elbow.x,
    y: elbow.y + Math.sin(radians) * 0.25,
    z: elbow.z + Math.cos(radians) * 0.25,
  };
  return {
    ...sample,
    world: {
      ...sample.world!,
      shoulder: landmark(0, 0, 0),
      elbow: landmark(elbow.x, elbow.y, elbow.z),
      wrist: landmark(wrist.x, wrist.y, wrist.z),
    },
  };
}

export function worldDriftSample(
  timestamp: number,
  extraDepth: number,
): PoseSample {
  const sample = poseAtForearmAngle(timestamp, AIM_FOREARM_DEG);
  return {
    ...sample,
    world: {
      ...sample.world!,
      wrist: landmark(
        sample.world!.wrist.x,
        sample.world!.wrist.y,
        sample.world!.wrist.z + extraDepth,
      ),
    },
  };
}

export function imageOnlyAcceleratingThrow(
  detector: ThrowDetector,
  timestamp: number,
): number {
  for (let frame = 1; frame <= 4; frame++) {
    const progress = frame / 4;
    const angle =
      AIM_FOREARM_DEG + (COCK_FOREARM_DEG - AIM_FOREARM_DEG) * progress;
    const wrist = forearmWrist(angle);
    detector.addSample(
      withoutWorld(poseSample(timestamp, wrist.x, wrist.y, 0, 0.5, 0.5)),
    );
    timestamp += FRAME_MS;
  }
  for (let frame = 1; frame <= 8; frame++) {
    const progress = frame / 8;
    const angle =
      COCK_FOREARM_DEG +
      (RELEASE_FOREARM_DEG - COCK_FOREARM_DEG) * progress;
    const wrist = forearmWrist(angle);
    detector.addSample(
      withoutWorld(poseSample(timestamp, wrist.x, wrist.y, 0, 0.5, 0.5)),
    );
    timestamp += FRAME_MS;
  }
  for (let frame = 0; frame < 10; frame++) {
    detector.addSample(
      withoutWorld(
        poseSample(
          timestamp,
          THROW_PEAK_WRIST.x,
          THROW_PEAK_WRIST.y,
          0,
          0.5,
          0.5,
        ),
      ),
    );
    timestamp += FRAME_MS;
  }
  return timestamp;
}

export function facingCameraThrow(
  detector: ThrowDetector,
  timestamp: number,
): number {
  for (let frame = 1; frame <= 4; frame++) {
    const progress = frame / 4;
    const angle =
      AIM_FOREARM_DEG + (COCK_FOREARM_DEG - AIM_FOREARM_DEG) * progress;
    detector.addSample(worldSwingSample(timestamp, angle));
    timestamp += FRAME_MS;
  }
  for (let frame = 1; frame <= 8; frame++) {
    const progress = frame / 8;
    const angle =
      COCK_FOREARM_DEG +
      (RELEASE_FOREARM_DEG - COCK_FOREARM_DEG) * progress;
    detector.addSample(worldSwingSample(timestamp, angle));
    timestamp += FRAME_MS;
  }
  for (let frame = 0; frame < 10; frame++) {
    detector.addSample(worldSwingSample(timestamp, RELEASE_FOREARM_DEG));
    timestamp += FRAME_MS;
  }
  return timestamp;
}

export function floodBufferBeforeFinalize(
  detector: ThrowDetector,
  peakTimestamp: number,
  wrist = THROW_PEAK_WRIST,
): number {
  const FLOOD_FRAME_MS = 4;
  let timestamp = peakTimestamp + 50;
  const finalizeCutoff = peakTimestamp + TRACE_AFTER_MS - 1;
  while (timestamp < finalizeCutoff) {
    detector.addSample(poseSample(timestamp, wrist.x, wrist.y));
    timestamp += FLOOD_FRAME_MS;
  }
  return timestamp;
}
