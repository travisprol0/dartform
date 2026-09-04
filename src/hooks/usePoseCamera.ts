import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, type PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  MIN_READY_BUFFER_MS,
  ThrowDetector,
  type ThrowEvent,
} from '../analysis/detectThrow';
import {
  computeDartMetrics,
  computeRoundSummary,
} from '../analysis/roundMetrics';
import { getTrackedPoseLandmarks } from '../analysis/throwingArm';
import type { PoseLandmark } from '../analysis/throwingArm';
import {
  createPoseLandmarker,
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
  const [poseLandmarks, setPoseLandmarks] = useState<PoseLandmark[] | null>(null);
  const [armTracked, setArmTracked] = useState(false);
  const [collectingPostRoll, setCollectingPostRoll] = useState(false);
  const [detectorArmed, setDetectorArmed] = useState(true);
  const [facingMode, setFacingMode] =
    useState<CameraFacingMode>('user');
  const [poseDelegate, setPoseDelegate] = useState<PoseDelegate>('CPU');

  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const throwDetectorRef = useRef(new ThrowDetector());
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

  onRoundCompleteRef.current = onRoundComplete;

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
    dartMetricsRef.current = [];
    roundCompleteRef.current = false;
    stableFrameCountRef.current = 0;
    lostFrameCountRef.current = 0;
    armWasStableRef.current = false;
    setStableFrameCount(0);
    setWristSpeed(0);
    setLastDart(null);
    setPreviousDart(null);
    setPoseLandmarks(null);
    setArmTracked(false);
    setCollectingPostRoll(false);
    setDetectorArmed(true);
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
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
      setCollectingPostRoll(false);
      setDetectorArmed(throwDetectorRef.current.isArmed());

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
    ) => {
      const detector = throwDetectorRef.current;
      const finalizedThrow = detector.advance(now);
      if (finalizedThrow) {
        recordThrow(finalizedThrow);
        return;
      }

      const collecting = detector.isCollectingPostRoll();
      setCollectingPostRoll(collecting);
      setDetectorArmed(detector.isArmed());
      lostFrameCountRef.current += 1;
      if (
        lostFrameCountRef.current === ARM_LOST_FRAMES_BEFORE_RESET
      ) {
        stableFrameCountRef.current = 0;
        if (!roundInProgress && !collecting) {
          armWasStableRef.current = false;
          detector.reset();
          setDetectorArmed(true);
        }
      } else if (
        lostFrameCountRef.current > ARM_LOST_FRAMES_BEFORE_RESET
      ) {
        stableFrameCountRef.current = 0;
      }
      setStableFrameCount(stableFrameCountRef.current);
      setArmVisible(false);
      setWristSpeed(0);
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
        setCollectingPostRoll(
          heartbeatDetector.isCollectingPostRoll(),
        );
        if (finalizedThrow) {
          recordThrow(finalizedThrow);
          return;
        }
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
      setInferenceTimeMs(performance.now() - start);

      const pose = result.landmarks[0];
      const dartsRecorded = dartMetricsRef.current.length;
      const roundInProgress =
        dartsRecorded > 0 && !roundCompleteRef.current;

      if (!pose?.length) {
        setLandmarkCount(0);
        setPoseLandmarks(null);
        setArmTracked(false);
        handleMissingArm(now, roundInProgress);
        return;
      }

      setLandmarkCount(pose.length);
      setPoseLandmarks(pose);

      const trackedPose = getTrackedPoseLandmarks(
        pose,
        throwingHand,
        roundInProgress ? { minVisibility: ROUND_ACTIVE_MIN_VISIBILITY } : undefined,
      );
      setArmTracked(trackedPose !== null);

      if (!trackedPose) {
        handleMissingArm(now, roundInProgress);
        return;
      }

      lostFrameCountRef.current = 0;
      stableFrameCountRef.current += 1;
      const stableCount = stableFrameCountRef.current;
      setStableFrameCount(stableCount);

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

      const sample = {
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
      const collecting = detector.isCollectingPostRoll();
      const armed = detector.isArmed();
      setCollectingPostRoll(collecting);
      setDetectorArmed(armed);
      const isReady =
        isArmStable &&
        (detector.getRecentContinuousDurationMs() >= MIN_READY_BUFFER_MS ||
          detector.isPrimed()) &&
        armed &&
        !collecting;
      setArmVisible(isReady);
      setWristSpeed(throwDetectorRef.current.getCurrentWristSpeed());

      if (throwEvent) {
        recordThrow(throwEvent);
      }
    };

    rafRef.current = requestAnimationFrame(detect);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = null;
      }
    };
  }, [loading, cameraError, throwingHand, facingMode]);

  return {
    videoRef,
    cameraError,
    loading,
    dartCount,
    status,
    landmarkCount,
    inferenceTimeMs,
    armVisible,
    poseLandmarks,
    armTracked,
    collectingPostRoll,
    detectorArmed,
    stableFrameCount,
    stableFramesRequired: STABLE_FRAMES_REQUIRED,
    wristSpeed,
    lastDart,
    previousDart,
    flipCamera,
    facingMode,
    poseDelegate,
    canFlipCamera: dartCount === 0,
    dartsPerRound: DARTS_PER_ROUND,
  };
}
