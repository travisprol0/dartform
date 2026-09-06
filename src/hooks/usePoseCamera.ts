import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, type PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  MIN_READY_BUFFER_MS,
  ThrowDetector,
  type ThrowDetectorState,
  type PoseSample,
  type ThrowEvent,
} from '../analysis/detectThrow';
import {
  exportThrowRecording,
  ThrowTraceRecorder,
  type ThrowRecordingExportResult,
  type ThrowRecordingFrame,
  type ThrowRecordingScenario,
} from '../analysis/throwDetection/recording';
import type { ThrowCandidateDiagnostic } from '../analysis/throwDetection/classifyThrow';
import {
  computeDartMetrics,
  computeRoundSummary,
} from '../analysis/roundMetrics';
import { getTrackedPoseLandmarks } from '../analysis/throwingArm';
import type { PoseLandmark } from '../analysis/throwingArm';
import { paintPoseOverlay } from '../analysis/poseDrawing';
import {
  captureVideoIdeal,
  prefersCoarsePointer,
} from '../pose/cameraConstraints';
import {
  createPoseLandmarker,
  POSE_MODEL_URL,
  type PoseDelegate,
} from '../pose/createPoseLandmarker';
import type {
  CameraFacingMode,
  DartMetrics,
  RoundSummary,
  ThrowingHand,
} from '../types/round';
import {
  compareWithPersonalBaseline,
  personalizedInsightForDart,
  recordRoundInHistory,
} from '../storage/throwHistory';

const DARTS_PER_ROUND = 3;
const FRAME_INTERVAL_MS = 33;
export const STABLE_FRAMES_REQUIRED = 8;
export const REACQUIRE_STABLE_FRAMES = 4;
const ARM_LOST_FRAMES_BEFORE_RESET = 4;
const ROUND_ACTIVE_MIN_VISIBILITY = 0.5;
const FEEDBACK_GLANCE_MS = 2600;
const ROUND_COMPLETE_GLANCE_MS = 2200;
const HUD_THROTTLE_MS = 100;

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';

function reportedCameraFacing(
  facingMode: string | undefined,
): CameraFacingMode | null {
  if (facingMode === 'user' || facingMode === 'environment') {
    return facingMode;
  }
  return null;
}

export type CaptureStatus =
  | 'finding_arm'
  | 'ready'
  | 'dart_recorded'
  | 'round_complete';

type UsePoseCameraOptions = {
  throwingHand: ThrowingHand;
  onRoundComplete: (round: RoundSummary) => void;
};

export function usePoseCamera({
  throwingHand,
  onRoundComplete,
}: UsePoseCameraOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dartCount, setDartCount] = useState(0);
  const [status, setStatus] = useState<CaptureStatus>('finding_arm');
  const [landmarkCount, setLandmarkCount] = useState(0);
  const [inferenceTimeMs, setInferenceTimeMs] = useState(0);
  const [armVisible, setArmVisible] = useState(false);
  const [stableFrameCount, setStableFrameCount] = useState(0);
  const [wristSpeed, setWristSpeed] = useState(0);
  const [lastDart, setLastDart] = useState<DartMetrics | null>(null);
  const [previousDart, setPreviousDart] = useState<DartMetrics | null>(null);
  const [armTracked, setArmTracked] = useState(false);
  const [collectingPostRoll, setCollectingPostRoll] = useState(false);
  const [detectorArmed, setDetectorArmed] = useState(false);
  const [detectorState, setDetectorState] =
    useState<ThrowDetectorState>('seekingAim');
  const [facingMode, setFacingMode] =
    useState<CameraFacingMode>('user');
  const [poseDelegate, setPoseDelegate] = useState<PoseDelegate>('CPU');
  const [traceRecordingActive, setTraceRecordingActive] = useState(false);
  const [traceRecordingFrameCount, setTraceRecordingFrameCount] = useState(0);
  const [traceRecordingExportResult, setTraceRecordingExportResult] =
    useState<ThrowRecordingExportResult | null>(null);
  const [lastDetectionDiagnostic, setLastDetectionDiagnostic] =
    useState<ThrowCandidateDiagnostic | null>(null);

  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const throwDetectorRef = useRef(new ThrowDetector());
  const traceRecorderRef = useRef(new ThrowTraceRecorder());
  const dartMetricsRef = useRef<DartMetrics[]>([]);
  const roundCompleteRef = useRef(false);
  const onRoundCompleteRef = useRef(onRoundComplete);
  const stableFrameCountRef = useRef(0);
  const lostFrameCountRef = useRef(0);
  const armWasStableRef = useRef(false);
  const lastFrameTimeRef = useRef(0);
  const rafRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const lastDebugHudAtRef = useRef(0);
  const lastTraceCountAtRef = useRef(0);
  const lastDiagnosticAtRef = useRef(Number.NEGATIVE_INFINITY);
  const overlayPaintRef = useRef<{
    landmarks: PoseLandmark[] | null;
    armTracked: boolean;
    armStable: boolean;
  }>({ landmarks: null, armTracked: false, armStable: false });
  const hudRefs = useRef({
    landmarkCount: 0,
    inferenceTimeMs: 0,
    armVisible: false,
    armTracked: false,
    collectingPostRoll: false,
    detectorArmed: false,
    detectorState: 'seekingAim' as ThrowDetectorState,
    stableFrameCount: 0,
    wristSpeed: 0,
  });

  onRoundCompleteRef.current = onRoundComplete;

  const startTraceRecording = useCallback(
    (scenario: ThrowRecordingScenario) => {
      const recorder = traceRecorderRef.current;
      recorder.cancel();
      recorder.start({
        scenario,
        throwingHand,
        cameraFacing: facingMode,
        poseDelegate,
        poseModelUrl: POSE_MODEL_URL,
        startedAt: performance.now(),
      });
      lastTraceCountAtRef.current = 0;
      setTraceRecordingFrameCount(0);
      setTraceRecordingExportResult(null);
      setTraceRecordingActive(true);
    },
    [facingMode, poseDelegate, throwingHand],
  );

  const stopAndDownloadTraceRecording = useCallback(async () => {
    const recording = traceRecorderRef.current.stop(performance.now());
    setTraceRecordingActive(false);
    if (!recording) {
      return;
    }
    setTraceRecordingFrameCount(recording.frames.length);
    const result = await exportThrowRecording(recording);
    setTraceRecordingExportResult(result);
  }, []);

  const cancelTraceRecording = useCallback(() => {
    traceRecorderRef.current.cancel();
    setTraceRecordingActive(false);
    setTraceRecordingFrameCount(0);
    setTraceRecordingExportResult(null);
  }, []);

  const flipCamera = useCallback(() => {
    if (dartMetricsRef.current.length > 0) {
      return;
    }
    setFacingMode((mode) => (mode === 'environment' ? 'user' : 'environment'));
  }, []);

  useEffect(() => {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
    throwDetectorRef.current.reset();
    traceRecorderRef.current.cancel();
    dartMetricsRef.current = [];
    roundCompleteRef.current = false;
    stableFrameCountRef.current = 0;
    lostFrameCountRef.current = 0;
    armWasStableRef.current = false;
    overlayPaintRef.current = {
      landmarks: null,
      armTracked: false,
      armStable: false,
    };
    lastDebugHudAtRef.current = 0;
    lastTraceCountAtRef.current = 0;
    lastDiagnosticAtRef.current = Number.NEGATIVE_INFINITY;
    hudRefs.current = {
      landmarkCount: 0,
      inferenceTimeMs: 0,
      armVisible: false,
      armTracked: false,
      collectingPostRoll: false,
      detectorArmed: false,
      detectorState: 'seekingAim',
      stableFrameCount: 0,
      wristSpeed: 0,
    };
    setStableFrameCount(0);
    setWristSpeed(0);
    setLastDart(null);
    setPreviousDart(null);
    setArmTracked(false);
    setCollectingPostRoll(false);
    setDetectorArmed(false);
    setDetectorState('seekingAim');
    setTraceRecordingActive(false);
    setTraceRecordingFrameCount(0);
    setTraceRecordingExportResult(null);
    setLastDetectionDiagnostic(null);
    setDartCount(0);
    setArmVisible(false);
    setStatus('finding_arm');
  }, [throwingHand, facingMode]);

  useEffect(() => {
    if (armVisible && status === 'finding_arm') {
      setStatus('ready');
    } else if (!armVisible && status === 'ready') {
      setStatus('finding_arm');
    }
  }, [armVisible, status]);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      setLoading(true);
      setCameraError(null);
      roundCompleteRef.current = false;

      streamRef.current?.getTracks().forEach((track) => track.stop());
      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not available in this browser.');
        setLoading(false);
        return;
      }

      try {
        const ideal = captureVideoIdeal(prefersCoarsePointer());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: ideal.width },
            height: { ideal: ideal.height },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const reportedFacing = reportedCameraFacing(
          stream.getVideoTracks()[0]?.getSettings().facingMode,
        );
        if (reportedFacing && reportedFacing !== facingMode) {
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setFacingMode(reportedFacing);
          return;
        }
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setCameraError('Camera preview is not available.');
          setLoading(false);
          return;
        }

        video.srcObject = stream;
        await video.play();

        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        const { landmarker, delegate } = await createPoseLandmarker(vision);

        if (cancelled) {
          landmarker.close();
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        poseLandmarkerRef.current = landmarker;
        setPoseDelegate(delegate);
        setLoading(false);
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : 'Camera access failed';
          setCameraError(message);
          setLoading(false);
        }
      }
    }

    void setup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;
    };
  }, [facingMode]);

  useEffect(() => {
    if (loading || cameraError) {
      return;
    }

    const paintOverlay = (
      landmarks: PoseLandmark[] | null,
      armTrackedFlag: boolean,
      armStableFlag: boolean,
    ) => {
      overlayPaintRef.current = {
        landmarks,
        armTracked: armTrackedFlag,
        armStable: armStableFlag,
      };
      const canvas = overlayCanvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) {
        return;
      }
      paintPoseOverlay(canvas, video, landmarks, {
        throwingHand,
        armTracked: armTrackedFlag,
        armStable: armStableFlag,
      }, window.devicePixelRatio || 1);
    };

    const publishHud = (
      now: number,
      snapshot: {
        landmarkCount: number;
        inferenceTimeMs: number;
        armVisible: boolean;
        armTracked: boolean;
        collectingPostRoll: boolean;
        detectorArmed: boolean;
        detectorState: ThrowDetectorState;
        stableFrameCount: number;
        wristSpeed: number;
      },
    ) => {
      const previous = hudRefs.current;
      if (previous.armVisible !== snapshot.armVisible) {
        previous.armVisible = snapshot.armVisible;
        setArmVisible(snapshot.armVisible);
      }
      if (previous.armTracked !== snapshot.armTracked) {
        previous.armTracked = snapshot.armTracked;
        setArmTracked(snapshot.armTracked);
      }
      if (previous.collectingPostRoll !== snapshot.collectingPostRoll) {
        previous.collectingPostRoll = snapshot.collectingPostRoll;
        setCollectingPostRoll(snapshot.collectingPostRoll);
      }
      if (previous.detectorArmed !== snapshot.detectorArmed) {
        previous.detectorArmed = snapshot.detectorArmed;
        setDetectorArmed(snapshot.detectorArmed);
      }
      if (previous.detectorState !== snapshot.detectorState) {
        previous.detectorState = snapshot.detectorState;
        setDetectorState(snapshot.detectorState);
      }

      if (now - lastDebugHudAtRef.current < HUD_THROTTLE_MS) {
        return;
      }
      lastDebugHudAtRef.current = now;
      if (previous.landmarkCount !== snapshot.landmarkCount) {
        previous.landmarkCount = snapshot.landmarkCount;
        setLandmarkCount(snapshot.landmarkCount);
      }
      if (previous.inferenceTimeMs !== snapshot.inferenceTimeMs) {
        previous.inferenceTimeMs = snapshot.inferenceTimeMs;
        setInferenceTimeMs(snapshot.inferenceTimeMs);
      }
      if (previous.stableFrameCount !== snapshot.stableFrameCount) {
        previous.stableFrameCount = snapshot.stableFrameCount;
        setStableFrameCount(snapshot.stableFrameCount);
      }
      if (previous.wristSpeed !== snapshot.wristSpeed) {
        previous.wristSpeed = snapshot.wristSpeed;
        setWristSpeed(snapshot.wristSpeed);
      }
    };

    const recordTraceFrame = (
      timestamp: number,
      inferenceTimeMs: number,
      tracking: ThrowRecordingFrame['tracking'],
      detectionEnabled: boolean,
      sample: PoseSample | null,
      event: ThrowEvent | null,
    ) => {
      const recorder = traceRecorderRef.current;
      if (!recorder.isRecording()) {
        return;
      }
      const detector = throwDetectorRef.current;
      const diagnostic = detector.getLastDiagnostic();
      recorder.recordFrame({
        timestamp,
        inferenceTimeMs,
        tracking,
        detectionEnabled,
        sample,
        detector: {
          armed: detector.isArmed(),
          collectingPostRoll: detector.isCollectingPostRoll(),
          state: detector.getState(),
          wristSpeed: detector.getCurrentWristSpeed(),
          event,
          diagnostic: diagnostic
            ? {
                accepted: diagnostic.accepted,
                reason: diagnostic.reason,
                score: diagnostic.score,
                scores: { ...diagnostic.scores },
                measurements: { ...diagnostic.measurements },
                timestamp: diagnostic.motionEndAt,
              }
            : null,
        },
      });
      if (timestamp - lastTraceCountAtRef.current >= 250) {
        lastTraceCountAtRef.current = timestamp;
        setTraceRecordingFrameCount(recorder.getFrameCount());
      }
    };

    const recordThrow = (throwEvent: ThrowEvent) => {
      const buffer = throwDetectorRef.current.getBuffer();
      const dartNumber = dartMetricsRef.current.length + 1;
      setPreviousDart(
        dartMetricsRef.current[dartMetricsRef.current.length - 1] ?? null,
      );
      const capturedMetrics = computeDartMetrics(
        buffer,
        throwEvent.peakIndex,
        dartNumber,
      );
      const personalizedInsight = personalizedInsightForDart(
        throwingHand,
        facingMode,
        capturedMetrics,
      );
      const metrics: DartMetrics = personalizedInsight
        ? {
            ...capturedMetrics,
            insight: personalizedInsight,
            coachingTip: `${personalizedInsight.headline}. ${personalizedInsight.evidence}`,
            insights: [
              personalizedInsight,
              ...capturedMetrics.insights.filter(
                (item) => item.metricKey !== 'repeatMotion',
              ),
            ],
          }
        : capturedMetrics;
      dartMetricsRef.current.push(metrics);
      setDartCount(dartNumber);
      setLastDart(metrics);
      publishHud(performance.now(), {
        landmarkCount: hudRefs.current.landmarkCount,
        inferenceTimeMs: hudRefs.current.inferenceTimeMs,
        armVisible: hudRefs.current.armVisible,
        armTracked: hudRefs.current.armTracked,
        collectingPostRoll: false,
        detectorArmed: throwDetectorRef.current.isArmed(),
        detectorState: throwDetectorRef.current.getState(),
        stableFrameCount: hudRefs.current.stableFrameCount,
        wristSpeed: hudRefs.current.wristSpeed,
      });

      if (dartNumber >= DARTS_PER_ROUND) {
        roundCompleteRef.current = true;
        setStatus('round_complete');
        const summary = computeRoundSummary(
          throwingHand,
          dartMetricsRef.current,
          facingMode,
        );
        const completedRound: RoundSummary = {
          ...summary,
          personalBaseline: compareWithPersonalBaseline(
            throwingHand,
            facingMode,
            dartMetricsRef.current,
          ),
        };
        recordRoundInHistory(completedRound);
        if (feedbackTimeoutRef.current !== null) {
          window.clearTimeout(feedbackTimeoutRef.current);
        }
        feedbackTimeoutRef.current = window.setTimeout(
          () => onRoundCompleteRef.current(completedRound),
          ROUND_COMPLETE_GLANCE_MS,
        );
        return;
      }

      setStatus('dart_recorded');
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = null;
      }
      feedbackTimeoutRef.current = window.setTimeout(() => {
        if (!roundCompleteRef.current) {
          setStatus(
            throwDetectorRef.current.isArmed() ? 'ready' : 'finding_arm',
          );
        }
      }, FEEDBACK_GLANCE_MS);
    };

    const handleMissingArm = (
      now: number,
      roundInProgress: boolean,
    ): ThrowEvent | null => {
      const detector = throwDetectorRef.current;
      const finalizedThrow = detector.noteMissingTracking(now);
      if (finalizedThrow) {
        recordThrow(finalizedThrow);
        return finalizedThrow;
      }
      const diagnostic = detector.getLastDiagnostic();
      if (
        diagnostic &&
        diagnostic.motionEndAt !== lastDiagnosticAtRef.current
      ) {
        lastDiagnosticAtRef.current = diagnostic.motionEndAt;
        setLastDetectionDiagnostic(diagnostic);
      }

      const collecting = detector.isCollectingPostRoll();
      lostFrameCountRef.current += 1;
      if (
        lostFrameCountRef.current === ARM_LOST_FRAMES_BEFORE_RESET
      ) {
        stableFrameCountRef.current = 0;
        if (!roundInProgress && !collecting) {
          armWasStableRef.current = false;
          detector.reset();
        }
      } else if (
        lostFrameCountRef.current > ARM_LOST_FRAMES_BEFORE_RESET
      ) {
        stableFrameCountRef.current = 0;
      }
      publishHud(now, {
        landmarkCount: hudRefs.current.landmarkCount,
        inferenceTimeMs: hudRefs.current.inferenceTimeMs,
        armVisible: false,
        armTracked: false,
        collectingPostRoll: collecting,
        detectorArmed: detector.isArmed(),
        detectorState: detector.getState(),
        stableFrameCount: stableFrameCountRef.current,
        wristSpeed: 0,
      });
      return null;
    };

    const detect = () => {
      rafRef.current = requestAnimationFrame(detect);

      if (roundCompleteRef.current) {
        return;
      }

      const now = performance.now();
      const heartbeatDetector = throwDetectorRef.current;
      if (heartbeatDetector.isCollectingPostRoll()) {
        const finalizedThrow = heartbeatDetector.advance(now);
        if (finalizedThrow) {
          recordThrow(finalizedThrow);
          return;
        }
        publishHud(now, {
          landmarkCount: hudRefs.current.landmarkCount,
          inferenceTimeMs: hudRefs.current.inferenceTimeMs,
          armVisible: hudRefs.current.armVisible,
          armTracked: hudRefs.current.armTracked,
          collectingPostRoll: heartbeatDetector.isCollectingPostRoll(),
          detectorArmed: heartbeatDetector.isArmed(),
          detectorState: heartbeatDetector.getState(),
          stableFrameCount: hudRefs.current.stableFrameCount,
          wristSpeed: hudRefs.current.wristSpeed,
        });
      }

      const video = videoRef.current;
      const landmarker = poseLandmarkerRef.current;
      if (!video || video.readyState < 2 || !landmarker) {
        return;
      }

      if (now - lastFrameTimeRef.current < FRAME_INTERVAL_MS) {
        return;
      }
      lastFrameTimeRef.current = now;

      const start = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const inferenceTimeMs = performance.now() - start;

      const pose = result.landmarks[0];
      const dartsRecorded = dartMetricsRef.current.length;
      const roundInProgress =
        dartsRecorded > 0 && !roundCompleteRef.current;

      if (!pose?.length) {
        paintOverlay(null, false, false);
        const missingEvent = handleMissingArm(now, roundInProgress);
        recordTraceFrame(
          now,
          inferenceTimeMs,
          'missing_pose',
          false,
          null,
          missingEvent,
        );
        publishHud(now, {
          landmarkCount: 0,
          inferenceTimeMs,
          armVisible: false,
          armTracked: false,
          collectingPostRoll: hudRefs.current.collectingPostRoll,
          detectorArmed: hudRefs.current.detectorArmed,
          detectorState: hudRefs.current.detectorState,
          stableFrameCount: stableFrameCountRef.current,
          wristSpeed: 0,
        });
        return;
      }

      const trackedPose = getTrackedPoseLandmarks(
        pose,
        throwingHand,
        roundInProgress ? { minVisibility: ROUND_ACTIVE_MIN_VISIBILITY } : undefined,
      );

      if (!trackedPose) {
        paintOverlay(pose, false, false);
        const missingEvent = handleMissingArm(now, roundInProgress);
        recordTraceFrame(
          now,
          inferenceTimeMs,
          'missing_arm',
          false,
          null,
          missingEvent,
        );
        publishHud(now, {
          landmarkCount: pose.length,
          inferenceTimeMs,
          armVisible: false,
          armTracked: false,
          collectingPostRoll: hudRefs.current.collectingPostRoll,
          detectorArmed: hudRefs.current.detectorArmed,
          detectorState: hudRefs.current.detectorState,
          stableFrameCount: stableFrameCountRef.current,
          wristSpeed: 0,
        });
        return;
      }

      lostFrameCountRef.current = 0;
      stableFrameCountRef.current += 1;
      const stableCount = stableFrameCountRef.current;

      const stableThreshold = armWasStableRef.current
        ? REACQUIRE_STABLE_FRAMES
        : STABLE_FRAMES_REQUIRED;
      const isArmStable = stableCount >= stableThreshold;
      if (isArmStable) {
        armWasStableRef.current = true;
      }
      const worldPose: PoseLandmark[] | undefined =
        result.worldLandmarks[0];
      const worldTrackedPose = worldPose
        ? getTrackedPoseLandmarks(worldPose, throwingHand, {
            minVisibility: 0.3,
            optionalMinVisibility: 0.25,
          })
        : null;

      const coreVisibility = [
        trackedPose.shoulder,
        trackedPose.elbow,
        trackedPose.wrist,
      ].reduce(
        (sum, landmark) =>
          sum + (landmark.visibility ?? landmark.presence ?? 1),
        0,
      ) / 3;

      const sample: PoseSample = {
        timestamp: now,
        ...trackedPose,
        world: worldTrackedPose ?? undefined,
        visibility: coreVisibility,
      };

      const detector = throwDetectorRef.current;
      const hasPreRoll =
        detector.getRecentContinuousDurationMs() >= MIN_READY_BUFFER_MS;
      const canDetectThrow =
        isArmStable && (hasPreRoll || detector.isPrimed());
      const throwEvent = detector.addSample(sample, canDetectThrow);
      const diagnostic = detector.getLastDiagnostic();
      if (
        diagnostic &&
        diagnostic.motionEndAt !== lastDiagnosticAtRef.current
      ) {
        lastDiagnosticAtRef.current = diagnostic.motionEndAt;
        setLastDetectionDiagnostic(diagnostic);
      }
      recordTraceFrame(
        now,
        inferenceTimeMs,
        'tracked',
        canDetectThrow,
        sample,
        throwEvent,
      );
      const collecting = detector.isCollectingPostRoll();
      const armed = detector.isArmed();
      const isReady =
        isArmStable &&
        (detector.getRecentContinuousDurationMs() >= MIN_READY_BUFFER_MS ||
          detector.isPrimed()) &&
        armed &&
        !collecting;
      paintOverlay(pose, true, isReady);
      publishHud(now, {
        landmarkCount: pose.length,
        inferenceTimeMs,
        armVisible: isReady,
        armTracked: true,
        collectingPostRoll: collecting,
        detectorArmed: armed,
        detectorState: detector.getState(),
        stableFrameCount: stableCount,
        wristSpeed: detector.getCurrentWristSpeed(),
      });

      if (throwEvent) {
        recordThrow(throwEvent);
      }
    };

    rafRef.current = requestAnimationFrame(detect);

    const video = videoRef.current;
    const resizeObserver =
      video && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            const last = overlayPaintRef.current;
            paintOverlay(last.landmarks, last.armTracked, last.armStable);
          })
        : null;
    if (video && resizeObserver) {
      resizeObserver.observe(video);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver?.disconnect();
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = null;
      }
    };
  }, [loading, cameraError, throwingHand, facingMode]);

  return {
    videoRef,
    overlayCanvasRef,
    cameraError,
    loading,
    dartCount,
    status,
    landmarkCount,
    inferenceTimeMs,
    armVisible,
    armTracked,
    collectingPostRoll,
    detectorArmed,
    detectorState,
    stableFrameCount,
    stableFramesRequired: STABLE_FRAMES_REQUIRED,
    wristSpeed,
    lastDart,
    previousDart,
    flipCamera,
    facingMode,
    poseDelegate,
    traceRecordingActive,
    traceRecordingFrameCount,
    traceRecordingExportResult,
    lastDetectionDiagnostic,
    startTraceRecording,
    stopAndDownloadTraceRecording,
    cancelTraceRecording,
    canFlipCamera: dartCount === 0,
    dartsPerRound: DARTS_PER_ROUND,
  };
}
