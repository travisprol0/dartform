import { useMemo, useState } from 'react';
import { PoseOverlay } from '../components/PoseOverlay';
import { ThrowCard } from '../components/ThrowCard';
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
    poseLandmarks,
    armTracked,
    facingMode,
    flipCamera,
    dartsPerRound,
  } = usePoseCamera({ throwingHand, onRoundComplete });

  const armLabel = throwingHandLabel(throwingHand);

  const statusMessage = useMemo(() => {
    if (status === 'round_complete') {
      return 'All 3 darts recorded';
    }
    if (status === 'dart_recorded') {
      return `Dart ${dartCount} recorded`;
    }
    if (status === 'ready') {
      return 'Ready — throw';
    }
    return 'Find your throwing arm';
  }, [dartCount, status]);

  if (cameraError) {
    return (
      <main className="page page--centered">
        <h1 className="title title--small">Camera permission needed</h1>
        <p className="body">
          DartForm needs camera access to capture your throw for pose analysis.
          Use HTTPS and allow camera access when prompted.
        </p>
        <p className="body body--error">{cameraError}</p>
        <button type="button" className="secondary-button" onClick={onCancel}>
          Back
        </button>
      </main>
    );
  }

  return (
    <div className="capture">
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
          mirror={facingMode === 'user'}
        />
      ) : null}

      <div className="capture__top-bar">
        <button type="button" className="top-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="top-button" onClick={flipCamera}>
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
        <p className="overlay-title">
          Tracking {armLabel} arm · {dartCount} / {dartsPerRound}
        </p>
        <p className="status-line">{statusMessage}</p>
        {!armVisible && armTracked ? (
          <p className="overlay-hint">Throwing arm detected — hold steady…</p>
        ) : null}
        {armVisible ? (
          <p className="overlay-hint overlay-hint--ready">
            Teal lines = arm locked in
          </p>
        ) : null}

        {status === 'dart_recorded' && lastDart ? (
          <div className="capture__throw-card">
            <ThrowCard dart={lastDart} compact />
          </div>
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
              Wrist speed: {wristSpeed.toFixed(2)}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
