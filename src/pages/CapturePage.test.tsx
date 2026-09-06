// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePoseCamera } from '../hooks/usePoseCamera';
import { makeAnalyzedDart } from '../test/fixtures';
import { CapturePage } from './CapturePage';

vi.mock('../hooks/usePoseCamera', () => ({
  usePoseCamera: vi.fn(),
}));

vi.mock('../components/PoseOverlay', async () => {
  const { createElement } = await import('react');
  return {
    PoseOverlay: () =>
      createElement('div', {
        className: 'pose-overlay-stub',
      }),
  };
});

const mockedUsePoseCamera = vi.mocked(usePoseCamera);

type CameraState = ReturnType<typeof usePoseCamera>;

function renderPage(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function stubCamera(overrides: Partial<CameraState> = {}): {
  flipCamera: ReturnType<typeof vi.fn>;
  startTraceRecording: ReturnType<typeof vi.fn>;
  stopAndDownloadTraceRecording: ReturnType<typeof vi.fn>;
  cancelTraceRecording: ReturnType<typeof vi.fn>;
} {
  const flipCamera = vi.fn();
  const startTraceRecording = vi.fn();
  const stopAndDownloadTraceRecording = vi.fn();
  const cancelTraceRecording = vi.fn();
  mockedUsePoseCamera.mockReturnValue({
    videoRef: { current: null },
    cameraError: null,
    loading: false,
    dartCount: 0,
    status: 'finding_arm',
    landmarkCount: 33,
    inferenceTimeMs: 12.5,
    armVisible: false,
    overlayCanvasRef: { current: null },
    armTracked: false,
    collectingPostRoll: false,
    detectorArmed: false,
    detectorState: 'seekingAim',
    stableFrameCount: 3,
    stableFramesRequired: 8,
    wristSpeed: 1.25,
    lastDart: null,
    previousDart: null,
    flipCamera,
    facingMode: 'user',
    poseDelegate: 'GPU',
    traceRecordingActive: false,
    traceRecordingFrameCount: 0,
    lastDetectionDiagnostic: null,
    startTraceRecording,
    stopAndDownloadTraceRecording,
    cancelTraceRecording,
    canFlipCamera: true,
    dartsPerRound: 3,
    ...overrides,
  } as CameraState);
  return {
    flipCamera,
    startTraceRecording,
    stopAndDownloadTraceRecording,
    cancelTraceRecording,
  };
}

describe('CapturePage rotation and capture HUD', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    stubCamera();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    vi.clearAllMocks();
  });

  it('asks the thrower to rotate to landscape and can cancel from that dialog', () => {
    const onCancel = vi.fn();
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={onCancel}
      />,
    ));

    const rotate = container.querySelector('.capture__rotate');
    expect(rotate?.getAttribute('role')).toBe('dialog');
    expect(rotate?.getAttribute('aria-modal')).toBe('true');
    expect(container.querySelector('.capture__rotate-title')?.textContent).toBe(
      'Turn your phone sideways',
    );
    expect(container.querySelector('.capture__rotate-body')?.textContent).toContain(
      'Landscape is required',
    );
    expect(container.querySelector('.phone-tilt__device')).not.toBeNull();

    container
      .querySelector('.capture__rotate-cancel')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels from the live top bar as well', () => {
    const onCancel = vi.fn();
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="left"
        onRoundComplete={() => undefined}
        onCancel={onCancel}
      />,
    ));

    expect(container.querySelector('.overlay-title')?.textContent).toContain(
      'Tracking left arm',
    );
    container
      .querySelector('.capture__top-bar .top-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows a camera permission page when the camera fails', () => {
    stubCamera({ cameraError: 'Permission denied' });
    const onCancel = vi.fn();
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={onCancel}
      />,
    ));

    expect(container.textContent).toContain('Camera permission needed');
    expect(container.querySelector('.body--error')?.textContent).toBe(
      'Permission denied',
    );
    expect(container.querySelector('.capture__rotate')).toBeNull();
    container
      .querySelector('.secondary-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state until the pose overlay is ready', () => {
    stubCamera({ loading: true });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));

    expect(container.querySelector('.capture__loading')?.textContent).toContain(
      'Starting camera and pose model',
    );
    expect(container.querySelector('.pose-overlay-stub')).toBeNull();
    expect(container.querySelector('.status-line')?.textContent).toBe(
      'Find your throwing arm',
    );
  });

  it('mirrors the camera stage for the user-facing camera and flips when allowed', () => {
    const { flipCamera } = stubCamera({
      facingMode: 'user',
      canFlipCamera: true,
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));

    expect(container.querySelector('.capture__stage--mirror')).not.toBeNull();
    expect(container.querySelector('.pose-overlay-stub')).not.toBeNull();
    const flip = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Flip',
    );
    expect(flip?.hasAttribute('disabled')).toBe(false);
    expect(flip?.getAttribute('title')).toBe('Switch camera');
    flip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(flipCamera).toHaveBeenCalledTimes(1);
  });

  it('disables camera flip once a dart has been recorded', () => {
    stubCamera({
      dartCount: 1,
      canFlipCamera: false,
      facingMode: 'environment',
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));

    const flip = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Flip',
    );
    expect(flip?.hasAttribute('disabled')).toBe(true);
    expect(flip?.getAttribute('title')).toBe(
      'Camera cannot be switched during a round',
    );
    expect(container.querySelector('.capture__stage--mirror')).toBeNull();
    expect(container.querySelector('.capture__stage')).not.toBeNull();
  });

  it('walks through arm-lock and throw status copy', () => {
    stubCamera({
      status: 'ready',
      armVisible: true,
      armTracked: true,
      detectorArmed: true,
      detectorState: 'armed',
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.status-line')?.textContent).toBe(
      'Aim locked — throw',
    );
    expect(container.querySelector('.overlay-hint--ready')?.textContent).toContain(
      'Teal lines',
    );

    act(() => {
      root.unmount();
      container.remove();
    });

    stubCamera({
      status: 'finding_arm',
      armVisible: false,
      armTracked: true,
      collectingPostRoll: false,
      detectorState: 'seekingAim',
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.overlay-hint')?.textContent).toContain(
      'pause at aim',
    );

    act(() => {
      root.unmount();
      container.remove();
    });

    stubCamera({
      dartCount: 1,
      detectorArmed: false,
      detectorState: 'seekingAim',
      collectingPostRoll: false,
      status: 'finding_arm',
      armTracked: true,
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.status-line')?.textContent).toBe(
      'Set your next aim and hold',
    );

    act(() => {
      root.unmount();
      container.remove();
    });

    stubCamera({
      dartCount: 0,
      detectorArmed: false,
      detectorState: 'seekingAim',
      collectingPostRoll: false,
      status: 'finding_arm',
      armTracked: true,
      lastDetectionDiagnostic: {
        accepted: false,
        reason: 'insufficient_release_speed',
        score: 0.4,
        scores: {
          outwardReach: 0,
          outwardSpeed: 0,
          elbowExtension: 0,
          extensionSpeed: 0,
          releaseSpeed: 0,
          elbowStability: 1,
          bodyStability: 1,
          worldDepthEvidence: 0,
        },
        measurements: {
          reachGain: 0,
          peakOutwardSpeed: 0,
          elbowExtensionDeg: 0,
          peakExtensionVelocityDeg: 0,
          peakNormalizedWristSpeed: 2,
          elbowAnchorTravel: 0,
          bodyMotion: 0,
          peakWorldDepthSpeed: 0,
          worldDepthCoverage: 0,
          validCoverage: 1,
        },
        peakIndex: 0,
        peakTimestamp: 0,
        peakSpeedMetersPerSecond: 0.5,
        motionStartAt: 0,
        motionEndAt: 100,
      },
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.status-line')?.textContent).toBe(
      'Looked like an aim pump — set aim again',
    );

    act(() => {
      root.unmount();
      container.remove();
    });

    stubCamera({
      collectingPostRoll: true,
      status: 'ready',
      dartCount: 1,
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.status-line')?.textContent).toBe(
      'Capturing follow-through…',
    );
    expect(container.querySelector('.overlay-hint')).toBeNull();
  });

  it('shows dart glance feedback after a throw and when the round completes', () => {
    const first = makeAnalyzedDart(1);
    stubCamera({
      status: 'dart_recorded',
      dartCount: 1,
      lastDart: first,
      previousDart: null,
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.status-line')?.textContent).toBe(
      'Dart 1 recorded',
    );
    expect(container.querySelector('.instant-feedback')).not.toBeNull();

    act(() => {
      root.unmount();
      container.remove();
    });

    stubCamera({
      status: 'dart_recorded',
      dartCount: 1,
      lastDart: null,
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.instant-feedback')).toBeNull();

    act(() => {
      root.unmount();
      container.remove();
    });

    stubCamera({
      status: 'round_complete',
      dartCount: 3,
      lastDart: makeAnalyzedDart(3),
      previousDart: makeAnalyzedDart(2),
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.status-line')?.textContent).toBe(
      'Dart 3 recorded · Building your round',
    );
    expect(container.querySelector('.instant-feedback__dart')?.textContent).toContain(
      'Dart 3',
    );
  });

  it('toggles the debug readout', () => {
    stubCamera({
      armVisible: true,
      landmarkCount: 33,
      inferenceTimeMs: 9.4,
      stableFrameCount: 8,
      stableFramesRequired: 8,
      wristSpeed: 2.5,
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));

    const toggle = container.querySelector('.debug-toggle');
    expect(toggle?.textContent).toBe('Show debug');
    expect(container.querySelector('.debug-block')).toBeNull();

    act(() => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.debug-toggle')?.textContent).toBe(
      'Hide debug',
    );
    const debug = container.querySelector('.debug-block')?.textContent ?? '';
    expect(debug).toContain('Landmarks: 33');
    expect(debug).toContain('Inference: 9.4 ms');
    expect(debug).toContain('Aim locked: yes');
    expect(debug).toContain('Stable frames: 8 / 8');
    expect(debug).toContain('Wrist speed: 2.50 m/s');
    expect(debug).toContain('Pose: GPU');

    act(() => {
      container
        .querySelector('.debug-toggle')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.debug-block')).toBeNull();
  });

  it('reports arm not visible in the debug block', () => {
    stubCamera({ armVisible: false, poseDelegate: 'CPU' });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));

    act(() => {
      container
        .querySelector('.debug-toggle')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.debug-block')?.textContent).toContain(
      'Aim locked: no',
    );
    expect(container.querySelector('.debug-block')?.textContent).toContain(
      'Pose: CPU',
    );
  });

  it('records labeled landmark traces from development debug controls', () => {
    const { startTraceRecording } = stubCamera();
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));

    act(() => {
      container
        .querySelector('.debug-toggle')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const select = container.querySelector(
      '.trace-recorder select',
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    act(() => {
      if (select) {
        select.value = 'arm_raise';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    act(() => {
      Array.from(
        container.querySelectorAll<HTMLButtonElement>(
          '.trace-recorder button',
        ),
      )
        .find((button) => button.textContent === 'Start recording')
        ?.click();
    });
    expect(startTraceRecording).toHaveBeenCalledWith('arm_raise');

    act(() => {
      root.unmount();
      container.remove();
    });

    const activeControls = stubCamera({
      traceRecordingActive: true,
      traceRecordingFrameCount: 24,
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    act(() => {
      container
        .querySelector('.debug-toggle')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.trace-recorder')?.textContent).toContain(
      '24 frames',
    );
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '.trace-recorder button',
      ),
    );
    act(() => {
      buttons
        .find((button) => button.textContent === 'Stop & download')
        ?.click();
      buttons.find((button) => button.textContent === 'Cancel')?.click();
    });
    expect(
      activeControls.stopAndDownloadTraceRecording,
    ).toHaveBeenCalledTimes(1);
    expect(activeControls.cancelTraceRecording).toHaveBeenCalledTimes(1);
  });
});
