export const DESKTOP_CAPTURE_IDEAL = {
  width: 1280,
  height: 720,
} as const;

export const MOBILE_CAPTURE_IDEAL = {
  width: 960,
  height: 540,
} as const;

export function captureVideoIdeal(coarsePointer: boolean): {
  width: number;
  height: number;
} {
  return coarsePointer ? MOBILE_CAPTURE_IDEAL : DESKTOP_CAPTURE_IDEAL;
}

export function prefersCoarsePointer(
  matchMedia: (query: string) => { matches: boolean } = (query) =>
    window.matchMedia(query),
): boolean {
  return matchMedia('(pointer: coarse)').matches;
}
