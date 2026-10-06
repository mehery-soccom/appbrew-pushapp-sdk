export const INLINE_MIN_HEIGHT = 1;
export const INLINE_HEIGHT_AGREE_PX = 2;

export type InlineHeightState = {
  lastHeight: number;
  settled: boolean;
};

/**
 * Grow with late image loads until two image-ready measurements agree.
 * After that, ignore further growth (double-tap zoom).
 */
export function reduceInlineContentHeight(
  state: InlineHeightState,
  measured: number,
  imagesReady: boolean
): { state: InlineHeightState; height: number | null } {
  const newHeight = Math.max(INLINE_MIN_HEIGHT, Math.round(measured));

  if (state.settled) {
    return { state, height: null };
  }

  const agrees =
    state.lastHeight > 0 &&
    Math.abs(newHeight - state.lastHeight) <= INLINE_HEIGHT_AGREE_PX;

  if (!imagesReady) {
    if (agrees) {
      return { state, height: null };
    }
    return {
      state: { lastHeight: newHeight, settled: false },
      height: newHeight,
    };
  }

  if (agrees) {
    return {
      state: { lastHeight: state.lastHeight, settled: true },
      height: null,
    };
  }

  return {
    state: { lastHeight: newHeight, settled: false },
    height: newHeight,
  };
}
