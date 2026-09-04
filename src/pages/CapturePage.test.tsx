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
} {
  const flipCamera = vi.fn();
  mockedUsePoseCamera.mockReturnValue({
    videoRef: { current: null },
    cameraError: null,
    loading: false,
    dartCount: 0,
    status: 'finding_arm',
    landmarkCount: 33,
    inferenceTimeMs: 12.5,
    armVisible: false,
    poseLandmarks: null,
    armTracked: false,
    collectingPostRoll: false,
    detectorArmed: true,
    stableFrameCount: 3,
    stableFramesRequired: 8,
    wristSpeed: 1.25,
    lastDart: null,
    previousDart: null,
    flipCamera,
    facingMode: 'user',
    canFlipCamera: true,
    dartsPerRound: 3,
    ...overrides,
  } as CameraState);
  return { flipCamera };
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
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.status-line')?.textContent).toBe(
      'Ready — throw',
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
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.overlay-hint')?.textContent).toContain(
      'hold steady',
    );

    act(() => {
      root.unmount();
      container.remove();
    });

    stubCamera({
      dartCount: 1,
      detectorArmed: false,
      collectingPostRoll: false,
      status: 'finding_arm',
    });
    ({ container, root } = renderPage(
      <CapturePage
        throwingHand="right"
        onRoundComplete={() => undefined}
        onCancel={() => undefined}
      />,
    ));
    expect(container.querySelector('.status-line')?.textContent).toBe(
      'Hold still to re-arm',
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
    expect(debug).toContain('Arm visible: yes');
    expect(debug).toContain('Stable frames: 8 / 8');
    expect(debug).toContain('Wrist speed: 2.50');

    act(() => {
      container
        .querySelector('.debug-toggle')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.debug-block')).toBeNull();
  });

  it('reports arm not visible in the debug block', () => {
    stubCamera({ armVisible: false });
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
      'Arm visible: no',
    );
  });
});
