import { describe, expect, it } from 'vitest';
import {
  captureVideoIdeal,
  DESKTOP_CAPTURE_IDEAL,
  MOBILE_CAPTURE_IDEAL,
  prefersCoarsePointer,
} from './cameraConstraints';

describe('captureVideoIdeal', () => {
  it('uses a lower ideal size for coarse pointers', () => {
    expect(captureVideoIdeal(true)).toEqual(MOBILE_CAPTURE_IDEAL);
    expect(captureVideoIdeal(false)).toEqual(DESKTOP_CAPTURE_IDEAL);
  });
});

describe('prefersCoarsePointer', () => {
  it('reads the pointer media query', () => {
    expect(
      prefersCoarsePointer(() => ({ matches: true })),
    ).toBe(true);
    expect(
      prefersCoarsePointer(() => ({ matches: false })),
    ).toBe(false);
  });

  it('uses window.matchMedia by default', () => {
    const previous = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        matchMedia: (query: string) => ({
          matches: query === '(pointer: coarse)',
        }),
      },
    });
    expect(prefersCoarsePointer()).toBe(true);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previous,
    });
  });
});
