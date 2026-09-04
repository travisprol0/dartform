// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeRoundSummary } from '../analysis/roundMetrics';
import { makeAnalyzedDart } from '../test/fixtures';
import { HomePage } from '../pages/HomePage';
import { ResultsPage } from '../pages/ResultsPage';
import {
  clearThrowHistory,
  recordRoundInHistory,
  storedThrowCount,
} from '../storage/throwHistory';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

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

describe('results and home interactions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('window', {
      ...window,
      localStorage: new MemoryStorage(),
      confirm: vi.fn(() => true),
    });
    clearThrowHistory();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    vi.unstubAllGlobals();
  });

  it('switches throwing hand and starts a round from the home page', () => {
    const onThrowingHandChange = vi.fn();
    const onStartRound = vi.fn();
    ({ container, root } = renderPage(
      <HomePage
        throwingHand="right"
        onThrowingHandChange={onThrowingHandChange}
        onStartRound={onStartRound}
      />,
    ));

    container.querySelectorAll('.toggle-button')[1]?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    container.querySelector('.primary-button')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onThrowingHandChange).toHaveBeenCalledWith('left');
    expect(onStartRound).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.setup-body--desktop')?.textContent).toContain(
      'Stand so the camera sees your right arm',
    );
    expect(container.querySelector('.setup-body--desktop')?.textContent).not.toContain(
      'phone',
    );
    expect(container.querySelector('.setup-body--phone')?.textContent).toContain(
      'Place the phone',
    );
    expect(container.querySelector('.setup-diagram')?.getAttribute('aria-label')).toBe(
      'Camera setup',
    );
    expect(container.querySelector('.setup-diagram__caption')?.textContent).toBe(
      'Camera at your side',
    );
    expect(
      [...container.querySelectorAll('.setup-diagram__caption')].at(-1)
        ?.textContent,
    ).toContain('face the camera');
    expect(container.querySelector('.setup-diagram__scene--left')).toBeNull();
    expect(container.querySelectorAll('.setup-diagram__scene--right').length).toBe(
      2,
    );
  });

  it('mirrors the setup diagram for a left-handed thrower', () => {
    ({ container, root } = renderPage(
      <HomePage
        throwingHand="left"
        onThrowingHandChange={() => undefined}
        onStartRound={() => undefined}
      />,
    ));

    expect(container.querySelectorAll('.setup-diagram__scene--left').length).toBe(
      2,
    );
  });

  it('clears stored throw history after confirmation', () => {
    for (let roundIndex = 0; roundIndex < 3; roundIndex++) {
      recordRoundInHistory(
        computeRoundSummary(
          'right',
          [
            makeAnalyzedDart(1, roundIndex * 0.001),
            makeAnalyzedDart(2, roundIndex * 0.001 + 0.002),
            makeAnalyzedDart(3, roundIndex * 0.001 - 0.002),
          ],
          'environment',
        ),
      );
    }
    expect(storedThrowCount()).toBe(9);

    const round = computeRoundSummary(
      'right',
      [makeAnalyzedDart(1), makeAnalyzedDart(2), makeAnalyzedDart(3)],
      'environment',
    );
    ({ container, root } = renderPage(
      <ResultsPage
        round={round}
        onThrowAgain={() => undefined}
        onDone={() => undefined}
      />,
    ));

    act(() => {
      container
        .querySelector('.history-clear-button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(storedThrowCount()).toBe(0);
    expect(container.querySelector('.history-clear-button')).toBeNull();
  });

  it('routes throw again and done actions from the results page', () => {
    const onThrowAgain = vi.fn();
    const onDone = vi.fn();
    const round = computeRoundSummary(
      'right',
      [makeAnalyzedDart(1), makeAnalyzedDart(2), makeAnalyzedDart(3)],
      'environment',
    );
    ({ container, root } = renderPage(
      <ResultsPage
        round={round}
        onThrowAgain={onThrowAgain}
        onDone={onDone}
      />,
    ));

    container.querySelector('.primary-button')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    container.querySelector('.secondary-button')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(onThrowAgain).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
