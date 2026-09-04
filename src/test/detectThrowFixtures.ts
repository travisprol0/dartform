import {
  TRACE_AFTER_MS,
  ThrowDetector,
} from '../analysis/detectThrow';
import { poseSample } from './fixtures';

export const FRAME_MS = 1000 / 30;

export function acceleratingWristX(frame: number): number {
  return 0.5 + 0.006 * frame ** 2;
}

export const THROW_END_X = acceleratingWristX(8);

export function degenerateElbowSample(timestamp: number) {
  return poseSample(timestamp, 0.5, 0.2, 0, 0.5, 0.2);
}

export function shortPrime(
  detector: ThrowDetector,
  timestamp: number,
  frames = 5,
): number {
  for (let frame = 0; frame < frames; frame++) {
    detector.addSample(poseSample(timestamp, 0.5, 0.35), false);
    timestamp += FRAME_MS;
  }
  return timestamp;
}

export function longPrime(
  detector: ThrowDetector,
  timestamp: number,
  frames = 55,
): number {
  for (let frame = 0; frame < frames; frame++) {
    detector.addSample(poseSample(timestamp, 0.5, 0.35), false);
    timestamp += FRAME_MS;
  }
  return timestamp;
}

export function acceleratingThrow(
  detector: ThrowDetector,
  timestamp: number,
  wristAtPeak = THROW_END_X,
  elbowX = 0.5,
  elbowY = 0.5,
): number {
  for (let frame = 1; frame <= 4; frame++) {
    detector.addSample(
      poseSample(
        timestamp,
        0.5 - 0.03 * frame,
        0.35 + 0.025 * frame,
        0,
        elbowX,
        elbowY,
      ),
    );
    timestamp += FRAME_MS;
  }
  for (let frame = 1; frame <= 8; frame++) {
    detector.addSample(
      poseSample(timestamp, acceleratingWristX(frame), 0.35, 0, elbowX, elbowY),
    );
    timestamp += FRAME_MS;
  }
  for (let frame = 0; frame < 10; frame++) {
    detector.addSample(
      poseSample(timestamp, wristAtPeak, 0.35, 0, elbowX, elbowY),
    );
    timestamp += FRAME_MS;
  }
  return timestamp;
}

export function decelerateToRest(
  detector: ThrowDetector,
  timestamp: number,
  wristX: number,
  frames = 10,
  elbowX = 0.5,
  elbowY = 0.5,
): number {
  for (let frame = 0; frame < frames; frame++) {
    detector.addSample(
      poseSample(timestamp, wristX, 0.35, 0, elbowX, elbowY),
    );
    timestamp += FRAME_MS;
  }
  return timestamp;
}

export function tinyDisplacementThrow(
  detector: ThrowDetector,
  timestamp: number,
): number {
  for (let frame = 1; frame <= 6; frame++) {
    detector.addSample(
      poseSample(timestamp, 0.5 + frame * 0.02, 0.35),
    );
    timestamp += FRAME_MS;
  }
  return decelerateToRest(detector, timestamp, 0.62);
}

export function validThrowWithLookback(
  detector: ThrowDetector,
  timestamp: number,
): number {
  timestamp = longPrime(detector, timestamp);
  return acceleratingThrow(detector, timestamp);
}

export function floodBufferBeforeFinalize(
  detector: ThrowDetector,
  peakTimestamp: number,
  wristX = THROW_END_X,
): number {
  const FLOOD_FRAME_MS = 4;
  let timestamp = peakTimestamp + 50;
  const finalizeCutoff = peakTimestamp + TRACE_AFTER_MS - 1;
  while (timestamp < finalizeCutoff) {
    detector.addSample(poseSample(timestamp, wristX, 0.35));
    timestamp += FLOOD_FRAME_MS;
  }
  return timestamp;
}
