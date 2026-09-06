import { useMemo, useState } from 'react';
import { InstantThrowFeedback } from '../components/InstantThrowFeedback';
import { PoseOverlay } from '../components/PoseOverlay';
import { usePoseCamera } from '../hooks/usePoseCamera';
import { throwingHandLabel } from '../analysis/throwingArm';
import {
  THROW_RECORDING_SCENARIOS,
  type ThrowRecordingScenario,
} from '../analysis/throwDetection/recording';
import { throwRejectionLabel } from '../analysis/throwDetection/classifyThrow';
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
  const [traceScenario, setTraceScenario] =
    useState<ThrowRecordingScenario>('single_throw');
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
    overlayCanvasRef,
    armTracked,
    collectingPostRoll,
    detectorArmed,
    detectorState,
    facingMode,
    poseDelegate,
    traceRecordingActive,
    traceRecordingFrameCount,
    lastDetectionDiagnostic,
    startTraceRecording,
    stopAndDownloadTraceRecording,
    cancelTraceRecording,
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
    if (!armTracked) {
      return 'Find your throwing arm';
    }
    if (detectorState === 'active') {
      return 'Tracking your throw…';
    }
    if (detectorState === 'seekingAim') {
      if (
        lastDetectionDiagnostic &&
        !lastDetectionDiagnostic.accepted
      ) {
        return `${throwRejectionLabel(lastDetectionDiagnostic.reason)} — set aim again`;
      }
      return dartCount > 0
        ? 'Set your next aim and hold'
        : 'Set your aim and hold';
    }
    if (status === 'ready') {
      return 'Aim locked — throw';
    }
    return detectorArmed
      ? 'Aim locked — throw'
      : 'Hold your aim steady';
  }, [
    armTracked,
    collectingPostRoll,
    dartCount,
    detectorArmed,
    detectorState,
    lastDetectionDiagnostic,
    status,
  ]);

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

        {!loading ? <PoseOverlay ref={overlayCanvasRef} /> : null}
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
            <p className="overlay-hint">
              Keep your wrist above your elbow and pause at aim
            </p>
          ) : null}
          {armVisible ? (
            <p className="overlay-hint overlay-hint--ready">
              Teal lines = aim locked in
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
                Aim locked: {armVisible ? 'yes' : 'no'}
              </p>
              <p className="overlay-line">Detector: {detectorState}</p>
              {lastDetectionDiagnostic ? (
                <p className="overlay-line">
                  Last bout:{' '}
                  {throwRejectionLabel(lastDetectionDiagnostic.reason)}{' '}
                  · {lastDetectionDiagnostic.score.toFixed(2)}
                </p>
              ) : null}
              <p className="overlay-line">
                Stable frames: {stableFrameCount} / {stableFramesRequired}
              </p>
              <p className="overlay-line">
                Pose: {poseDelegate}
              </p>
              <p className="overlay-line">
                Wrist speed: {wristSpeed.toFixed(2)} m/s
              </p>
              {import.meta.env.DEV ? (
                <div className="trace-recorder">
                  <p className="trace-recorder__title">
                    Landmark trace recorder
                  </p>
                  <p className="trace-recorder__privacy">
                    Coordinates only—no image, video, or upload.
                  </p>
                  <label className="trace-recorder__label">
                    Scenario
                    <select
                      value={traceScenario}
                      disabled={traceRecordingActive}
                      onChange={(event) =>
                        setTraceScenario(
                          event.target.value as ThrowRecordingScenario,
                        )
                      }
                    >
                      {THROW_RECORDING_SCENARIOS.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>
                          {scenario.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="trace-recorder__actions">
                    {traceRecordingActive ? (
                      <>
                        <button
                          type="button"
                          onClick={stopAndDownloadTraceRecording}
                        >
                          Stop &amp; download
                        </button>
                        <button
                          type="button"
                          onClick={cancelTraceRecording}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startTraceRecording(traceScenario)}
                      >
                        Start recording
                      </button>
                    )}
                  </div>
                  <p
                    className="trace-recorder__status"
                    aria-live="polite"
                  >
                    {traceRecordingActive
                      ? `Recording… ${traceRecordingFrameCount} frames`
                      : traceRecordingFrameCount > 0
                        ? `Downloaded ${traceRecordingFrameCount} frames`
                        : 'Choose a scenario, start, perform it, then stop.'}
                  </p>
                </div>
              ) : null}
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
