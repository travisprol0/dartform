import { useMemo, useState } from 'react';
import { InstantThrowFeedback } from '../components/InstantThrowFeedback';
import { PoseOverlay } from '../components/PoseOverlay';
import { usePoseCamera } from '../hooks/usePoseCamera';
import { throwingHandLabel } from '../analysis/throwingArm';
import type { RoundSummary, ThrowingHand } from '../types/round';

type CapturePageProps = {
  throwingHand: ThrowingHand;
  onRoundComplete: (round: RoundSummary) => void;
  onCancel: () => void;
};

export function CapturePage({
  throwingHand,
  onRoundComplete,
  onCancel,
}: CapturePageProps) {
  const [showDebug, setShowDebug] = useState(false);
  const {
    videoRef,
    cameraError,
    loading,
    dartCount,
    status,
    landmarkCount,
    inferenceTimeMs,
    armVisible,
    stableFrameCount,
    stableFramesRequired,
    wristSpeed,
    lastDart,
    previousDart,
    poseLandmarks,
    armTracked,
    collectingPostRoll,
    detectorArmed,
    facingMode,
    poseDelegate,
    flipCamera,
    canFlipCamera,
    dartsPerRound,
  } = usePoseCamera({ throwingHand, onRoundComplete });

  const armLabel = throwingHandLabel(throwingHand);

  const statusMessage = useMemo(() => {
    if (status === 'round_complete') {
      return 'Dart 3 recorded · Building your round';
    }
    if (collectingPostRoll) {
      return 'Capturing follow-through…';
    }
    if (status === 'dart_recorded') {
      return `Dart ${dartCount} recorded`;
    }
    if (!detectorArmed && dartCount > 0) {
      return 'Hold still to re-arm';
    }
    if (status === 'ready') {
      return 'Ready — throw';
    }
    return 'Find your throwing arm';
  }, [collectingPostRoll, dartCount, detectorArmed, status]);

  if (cameraError) {
    return (
      <main className="page page--centered page--home">
        <div className="page-inner">
          <h1 className="title title--small">Camera permission needed</h1>
          <p className="body">
            DartForm needs camera access to capture your throw for pose
            analysis. Use HTTPS and allow camera access when prompted.
          </p>
          <p className="body body--error">{cameraError}</p>
          <button type="button" className="secondary-button" onClick={onCancel}>
            Back
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="capture">
      <div
        className={`capture__stage${facingMode === 'user' ? ' capture__stage--mirror' : ''}`}
      >
        <video
          ref={videoRef}
          className="capture__video"
          playsInline
          muted
          autoPlay
        />

        {!loading ? (
          <PoseOverlay
            videoRef={videoRef}
            landmarks={poseLandmarks}
            throwingHand={throwingHand}
            armTracked={armTracked}
            armStable={armVisible}
          />
        ) : null}
      </div>

      <div className="capture__rotate" role="dialog" aria-modal="true">
        <button
          type="button"
          className="top-button capture__rotate-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
        <div className="capture__rotate-card">
          <div className="phone-tilt" aria-hidden="true">
            <span className="phone-tilt__device" />
          </div>
          <h1 className="capture__rotate-title">Turn your phone sideways</h1>
          <p className="capture__rotate-body">
            Landscape is required so the camera can see your throwing arm in
            profile.
          </p>
        </div>
      </div>

      <div className="capture__top-bar">
        <button type="button" className="top-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="top-button"
          onClick={flipCamera}
          disabled={!canFlipCamera}
          title={
            canFlipCamera
              ? 'Switch camera'
              : 'Camera cannot be switched during a round'
          }
        >
          Flip
        </button>
      </div>

      {loading ? (
        <div className="capture__loading">
          <div className="spinner" />
          <p>Starting camera and pose model…</p>
        </div>
      ) : null}

      <div className="capture__overlay">
        <div className="capture__status">
          <p className="overlay-title">
            Tracking {armLabel} arm · {dartCount} / {dartsPerRound}
          </p>
          <p className="status-line" aria-live="polite">
            {statusMessage}
          </p>
          {!armVisible && armTracked && !collectingPostRoll ? (
            <p className="overlay-hint">Throwing arm detected — hold steady…</p>
          ) : null}
          {armVisible ? (
            <p className="overlay-hint overlay-hint--ready">
              Teal lines = arm locked in
            </p>
          ) : null}

          <button
            type="button"
            className="debug-toggle"
            onClick={() => setShowDebug((value) => !value)}
          >
            {showDebug ? 'Hide debug' : 'Show debug'}
          </button>

          {showDebug ? (
            <div className="debug-block">
              <p className="overlay-line">Landmarks: {landmarkCount}</p>
              <p className="overlay-line">
                Inference: {inferenceTimeMs.toFixed(1)} ms
              </p>
              <p className="overlay-line">
                Arm visible: {armVisible ? 'yes' : 'no'}
              </p>
              <p className="overlay-line">
                Stable frames: {stableFrameCount} / {stableFramesRequired}
              </p>
              <p className="overlay-line">
                Pose: {poseDelegate}
              </p>
              <p className="overlay-line">
                Wrist speed: {wristSpeed.toFixed(2)} m/s
              </p>
            </div>
          ) : null}
        </div>

        {(status === 'dart_recorded' || status === 'round_complete') &&
        lastDart ? (
          <div className="capture__throw-card">
            <InstantThrowFeedback
              dart={lastDart}
              previousDart={previousDart}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
