import type {
  PoseSample,
  ThrowEvent,
} from '../detectThrow';
import type { PoseLandmark } from '../throwingArm';
import type { PoseDelegate } from '../../pose/createPoseLandmarker';
import type {
  CameraFacingMode,
  ThrowingHand,
} from '../../types/round';

export const THROW_RECORDING_SCHEMA_VERSION = 1;

export type ThrowRecordingScenario =
  | 'single_throw'
  | 'three_throws'
  | 'aim_pumps'
  | 'arm_raise'
  | 'throw_then_take_next_dart'
  | 'walking'
  | 'tracking_loss';

export type ThrowRecordingScenarioDefinition = {
  id: ThrowRecordingScenario;
  label: string;
  expectedThrowCount: number;
};

export const THROW_RECORDING_SCENARIOS: readonly ThrowRecordingScenarioDefinition[] =
  [
    {
      id: 'single_throw',
      label: 'One normal throw',
      expectedThrowCount: 1,
    },
    {
      id: 'three_throws',
      label: 'Three-dart round',
      expectedThrowCount: 3,
    },
    {
      id: 'aim_pumps',
      label: 'Aim pumps, no throw',
      expectedThrowCount: 0,
    },
    {
      id: 'arm_raise',
      label: 'Raise arm, no throw',
      expectedThrowCount: 0,
    },
    {
      id: 'throw_then_take_next_dart',
      label: 'One throw, then take next dart',
      expectedThrowCount: 1,
    },
    {
      id: 'walking',
      label: 'Walk/reposition, no throw',
      expectedThrowCount: 0,
    },
    {
      id: 'tracking_loss',
      label: 'Tracking loss, no throw',
      expectedThrowCount: 0,
    },
  ];

export type RecordedDetectorDiagnostic = {
  accepted: boolean;
  reason: string;
  score?: number;
  scores?: Record<string, number>;
  measurements?: Record<string, number>;
  timestamp: number;
};

export type RecordedDetectorSnapshot = {
  armed: boolean;
  collectingPostRoll: boolean;
  state?: string;
  wristSpeed: number;
  event: ThrowEvent | null;
  diagnostic?: RecordedDetectorDiagnostic | null;
};

export type ThrowRecordingFrame = {
  timestamp: number;
  inferenceTimeMs: number;
  tracking: 'tracked' | 'missing_pose' | 'missing_arm';
  detectionEnabled: boolean;
  sample: PoseSample | null;
  detector: RecordedDetectorSnapshot;
};

export type ThrowRecording = {
  schemaVersion: typeof THROW_RECORDING_SCHEMA_VERSION;
  id: string;
  capturedAt: string;
  scenario: ThrowRecordingScenario;
  expectedThrowCount: number;
  throwingHand: ThrowingHand;
  cameraFacing: CameraFacingMode;
  poseDelegate: PoseDelegate;
  poseModelUrl: string;
  startedAt: number;
  finishedAt: number;
  frames: ThrowRecordingFrame[];
};

export type StartThrowRecordingOptions = {
  scenario: ThrowRecordingScenario;
  throwingHand: ThrowingHand;
  cameraFacing: CameraFacingMode;
  poseDelegate: PoseDelegate;
  poseModelUrl: string;
  startedAt: number;
  capturedAt?: string;
  id?: string;
};

function copyLandmark(
  landmark: PoseLandmark | undefined,
): PoseLandmark | undefined {
  return landmark ? { ...landmark } : undefined;
}

export function clonePoseSample(sample: PoseSample): PoseSample {
  return {
    ...sample,
    shoulder: { ...sample.shoulder },
    elbow: { ...sample.elbow },
    wrist: { ...sample.wrist },
    oppositeShoulder: copyLandmark(sample.oppositeShoulder),
    nose: copyLandmark(sample.nose),
    leftHip: copyLandmark(sample.leftHip),
    rightHip: copyLandmark(sample.rightHip),
    index: copyLandmark(sample.index),
    pinky: copyLandmark(sample.pinky),
    thumb: copyLandmark(sample.thumb),
    world: sample.world
      ? {
          shoulder: { ...sample.world.shoulder },
          elbow: { ...sample.world.elbow },
          wrist: { ...sample.world.wrist },
          oppositeShoulder: copyLandmark(sample.world.oppositeShoulder),
          nose: copyLandmark(sample.world.nose),
          leftHip: copyLandmark(sample.world.leftHip),
          rightHip: copyLandmark(sample.world.rightHip),
          index: copyLandmark(sample.world.index),
          pinky: copyLandmark(sample.world.pinky),
          thumb: copyLandmark(sample.world.thumb),
        }
      : undefined,
  };
}

function scenarioDefinition(
  scenario: ThrowRecordingScenario,
): ThrowRecordingScenarioDefinition {
  const definition = THROW_RECORDING_SCENARIOS.find(
    (candidate) => candidate.id === scenario,
  );
  if (!definition) {
    throw new Error(`Unknown throw recording scenario: ${scenario}`);
  }
  return definition;
}

function safeRecordingId(capturedAt: string): string {
  return `throw-trace-${capturedAt.replace(/[^0-9A-Za-z]+/g, '-')}`;
}

function cloneDetectorSnapshot(
  snapshot: RecordedDetectorSnapshot,
): RecordedDetectorSnapshot {
  return {
    ...snapshot,
    event: snapshot.event ? { ...snapshot.event } : null,
    diagnostic: snapshot.diagnostic
      ? {
          ...snapshot.diagnostic,
          scores: snapshot.diagnostic.scores
            ? { ...snapshot.diagnostic.scores }
            : undefined,
          measurements: snapshot.diagnostic.measurements
            ? { ...snapshot.diagnostic.measurements }
            : undefined,
        }
      : snapshot.diagnostic,
  };
}

export class ThrowTraceRecorder {
  private active: ThrowRecording | null = null;

  start(options: StartThrowRecordingOptions): void {
    if (this.active) {
      throw new Error('A throw trace recording is already active.');
    }
    const capturedAt = options.capturedAt ?? new Date().toISOString();
    const definition = scenarioDefinition(options.scenario);
    this.active = {
      schemaVersion: THROW_RECORDING_SCHEMA_VERSION,
      id: options.id ?? safeRecordingId(capturedAt),
      capturedAt,
      scenario: options.scenario,
      expectedThrowCount: definition.expectedThrowCount,
      throwingHand: options.throwingHand,
      cameraFacing: options.cameraFacing,
      poseDelegate: options.poseDelegate,
      poseModelUrl: options.poseModelUrl,
      startedAt: options.startedAt,
      finishedAt: options.startedAt,
      frames: [],
    };
  }

  recordFrame(frame: ThrowRecordingFrame): void {
    if (!this.active) {
      return;
    }
    this.active.frames.push({
      ...frame,
      sample: frame.sample ? clonePoseSample(frame.sample) : null,
      detector: cloneDetectorSnapshot(frame.detector),
    });
    this.active.finishedAt = frame.timestamp;
  }

  stop(finishedAt: number): ThrowRecording | null {
    if (!this.active) {
      return null;
    }
    const recording = this.active;
    recording.finishedAt = Math.max(recording.finishedAt, finishedAt);
    this.active = null;
    return recording;
  }

  cancel(): void {
    this.active = null;
  }

  isRecording(): boolean {
    return this.active !== null;
  }

  getFrameCount(): number {
    return this.active?.frames.length ?? 0;
  }
}

export function serializeThrowRecording(recording: ThrowRecording): string {
  return JSON.stringify(recording, null, 2);
}

export function parseThrowRecording(json: string): ThrowRecording {
  const value: unknown = JSON.parse(json);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== THROW_RECORDING_SCHEMA_VERSION ||
    !('frames' in value) ||
    !Array.isArray(value.frames) ||
    !('scenario' in value) ||
    typeof value.scenario !== 'string' ||
    !THROW_RECORDING_SCENARIOS.some(
      (definition) => definition.id === value.scenario,
    )
  ) {
    throw new Error('Unsupported or invalid throw trace recording.');
  }
  return value as ThrowRecording;
}

export function recordingFilename(recording: ThrowRecording): string {
  return `${recording.id}-${recording.scenario}.json`;
}

export function downloadThrowRecording(recording: ThrowRecording): void {
  const blob = new Blob([serializeThrowRecording(recording)], {
    type: 'application/json',
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = recordingFilename(recording);
  anchor.click();
  URL.revokeObjectURL(href);
}

export type ThrowRecordingExportResult = 'shared' | 'downloaded';

function recordingFile(recording: ThrowRecording): File {
  return new File(
    [serializeThrowRecording(recording)],
    recordingFilename(recording),
    { type: 'application/json' },
  );
}

export async function exportThrowRecording(
  recording: ThrowRecording,
): Promise<ThrowRecordingExportResult> {
  const file = recordingFile(recording);
  const shareData: ShareData = {
    files: [file],
    title: file.name,
    text: 'DartForm landmark trace (coordinates only).',
  };
  if (
    typeof navigator.share === 'function' &&
    (typeof navigator.canShare !== 'function' ||
      navigator.canShare(shareData))
  ) {
    try {
      await navigator.share(shareData);
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        downloadThrowRecording(recording);
        return 'downloaded';
      }
    }
  }
  downloadThrowRecording(recording);
  return 'downloaded';
}

export type ThrowRecordingReplayTarget = {
  addSample: (
    sample: PoseSample,
    detectionEnabled?: boolean,
  ) => ThrowEvent | null;
  advance: (now: number) => ThrowEvent | null;
  noteMissingTracking?: (now: number) => ThrowEvent | null;
};

export function replayThrowRecording(
  recording: ThrowRecording,
  detector: ThrowRecordingReplayTarget,
  flushAfterMs = 1_000,
): ThrowEvent[] {
  const events: ThrowEvent[] = [];
  for (const frame of recording.frames) {
    const event = frame.sample
      ? detector.addSample(
          clonePoseSample(frame.sample),
          frame.detectionEnabled,
        )
      : detector.noteMissingTracking?.(frame.timestamp) ??
        detector.advance(frame.timestamp);
    if (event) {
      events.push(event);
    }
  }
  const finalEvent = detector.advance(recording.finishedAt + flushAfterMs);
  if (finalEvent) {
    events.push(finalEvent);
  }
  return events;
}
