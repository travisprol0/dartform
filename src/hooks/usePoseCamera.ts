import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  MIN_READY_BUFFER_MS,
  ThrowDetector,
} from '../analysis/detectThrow';
import {
  computeDartMetrics,
  computeRoundSummary,
} from '../analysis/roundMetrics';
import { getTrackedPoseLandmarks } from '../analysis/throwingArm';
import type { PoseLandmark } from '../analysis/throwingArm';
import type {
  CameraFacingMode,
  DartMetrics,
  RoundSummary,
  ThrowingHand,
} from '../types/round';

const DARTS_PER_ROUND = 3;
const FRAME_INTERVAL_MS = 33;
export const STABLE_FRAMES_REQUIRED = 8;
export const REACQUIRE_STABLE_FRAMES = 4;
const ARM_LOST_FRAMES_BEFORE_RESET = 4;
const ROUND_ACTIVE_ARM_LOST_FRAMES = 30;
const ROUND_ACTIVE_MIN_VISIBILITY = 0.5;

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

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
  const [poseLandmarks, setPoseLandmarks] = useState<PoseLandmark[] | null>(null);
  const [armTracked, setArmTracked] = useState(false);
  const [facingMode, setFacingMode] =
    useState<CameraFacingMode>('environment');

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

  onRoundCompleteRef.current = onRoundComplete;

  const flipCamera = useCallback(() => {
    setFacingMode((mode) => (mode === 'environment' ? 'user' : 'environment'));
  }, []);

  useEffect(() => {
    throwDetectorRef.current.reset();
    dartMetricsRef.current = [];
    roundCompleteRef.current = false;
    stableFrameCountRef.current = 0;
    lostFrameCountRef.current = 0;
    armWasStableRef.current = false;
    setStableFrameCount(0);
    setWristSpeed(0);
    setLastDart(null);
    setPoseLandmarks(null);
    setArmTracked(false);
    setDartCount(0);
    setArmVisible(false);
    setStatus('finding_arm');
  }, [throwingHand]);

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
        const video = videoRef.current;
        if (!video) {
          return;
        }

        video.srcObject = stream;
        await video.play();

        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (cancelled) {
          landmarker.close();
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        poseLandmarkerRef.current = landmarker;
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

    const detect = () => {
      rafRef.current = requestAnimationFrame(detect);

      if (roundCompleteRef.current) {
        return;
      }

      const video = videoRef.current;
      const landmarker = poseLandmarkerRef.current;
      if (!video || video.readyState < 2 || !landmarker) {
        return;
      }

      const now = performance.now();
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
        lostFrameCountRef.current += 1;
        const lostResetThreshold = roundInProgress
          ? ROUND_ACTIVE_ARM_LOST_FRAMES
          : ARM_LOST_FRAMES_BEFORE_RESET;
        if (lostFrameCountRef.current >= lostResetThreshold) {
          stableFrameCountRef.current = 0;
          if (!roundInProgress) {
            armWasStableRef.current = false;
            throwDetectorRef.current.reset();
          }
        }
        setStableFrameCount(stableFrameCountRef.current);
        setArmVisible(
          roundInProgress
            ? armWasStableRef.current
            : armWasStableRef.current
              ? stableFrameCountRef.current >= REACQUIRE_STABLE_FRAMES
              : stableFrameCountRef.current >= STABLE_FRAMES_REQUIRED,
        );
        setWristSpeed(0);
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
        lostFrameCountRef.current += 1;
        const lostResetThreshold = roundInProgress
          ? ROUND_ACTIVE_ARM_LOST_FRAMES
          : ARM_LOST_FRAMES_BEFORE_RESET;
        if (lostFrameCountRef.current >= lostResetThreshold) {
          stableFrameCountRef.current = 0;
          if (!roundInProgress) {
            armWasStableRef.current = false;
            throwDetectorRef.current.reset();
          }
        }
        setStableFrameCount(stableFrameCountRef.current);
        setArmVisible(
          roundInProgress
            ? armWasStableRef.current
            : armWasStableRef.current
              ? stableFrameCountRef.current >= REACQUIRE_STABLE_FRAMES
              : stableFrameCountRef.current >= STABLE_FRAMES_REQUIRED,
        );
        setWristSpeed(0);
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
      const worldPose = result.worldLandmarks[0] as
        | PoseLandmark[]
        | undefined;
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
        detector.getBufferedDurationMs() >= MIN_READY_BUFFER_MS;
      const canDetectThrow =
        roundInProgress || (isArmStable && hasPreRoll);
      const throwEvent = detector.addSample(sample, canDetectThrow);
      const isReady =
        roundInProgress ||
        (isArmStable &&
          detector.getBufferedDurationMs() >= MIN_READY_BUFFER_MS);
      setArmVisible(isReady);
      setWristSpeed(throwDetectorRef.current.getCurrentWristSpeed());

      if (!throwEvent) {
        return;
      }

      const buffer = throwDetectorRef.current.getBuffer();
      const dartNumber = dartMetricsRef.current.length + 1;
      const metrics = computeDartMetrics(
        buffer,
        throwEvent.peakIndex,
        dartNumber,
      );
      dartMetricsRef.current.push(metrics);
      setDartCount(dartNumber);
      setLastDart(metrics);

      if (dartNumber >= DARTS_PER_ROUND) {
        roundCompleteRef.current = true;
        setStatus('round_complete');
        onRoundCompleteRef.current(
          computeRoundSummary(
            throwingHand,
            dartMetricsRef.current,
            facingMode,
          ),
        );
        return;
      }

      setStatus('dart_recorded');
      window.setTimeout(() => {
        if (!roundCompleteRef.current) {
          setStatus('ready');
        }
      }, 1200);
    };

    rafRef.current = requestAnimationFrame(detect);

    return () => {
      cancelAnimationFrame(rafRef.current);
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
    stableFrameCount,
    stableFramesRequired: STABLE_FRAMES_REQUIRED,
    wristSpeed,
    lastDart,
    flipCamera,
    facingMode,
    dartsPerRound: DARTS_PER_ROUND,
  };
}
