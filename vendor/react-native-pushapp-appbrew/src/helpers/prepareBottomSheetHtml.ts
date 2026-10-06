import {
  buildOverlayPollBaseStyles,
  getOverlayPollBodyBackground,
  injectPollHtmlBeforeHead,
  OVERLAY_POLL_VIEWPORT_META,
} from './prepareOverlayPollHtml';

function buildBottomSheetLayoutStyles(backgroundColor: string): string {
  const bodyBackground = getOverlayPollBodyBackground(backgroundColor);

  return `
<style id="bottomsheet-mobile-layout-fix">
  html, body {
    height: 100% !important;
  }
  .preview-wrapper,
  .preview-wrapper.pop-up-dimensions,
  .pop-up-dimensions {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    padding: 0 !important;
    overflow: hidden !important;
  }
  .bottomsheet-block {
    width: 100% !important;
    height: 100% !important;
    background: ${bodyBackground} !important;
  }
  .pop-up-vertical-content {
    justify-content: center !important;
    align-items: center !important;
    height: 100% !important;
  }
  .text-block-road {
    justify-content: center !important;
    height: 100% !important;
    width: 100% !important;
  }
  .media-preview {
    width: 100% !important;
    max-height: 100% !important;
    aspect-ratio: 4 / 3 !important;
    flex: none !important;
  }
  .media-preview .media-item {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    object-fit: cover !important;
  }
  .cta-button-group {
    flex-shrink: 0 !important;
    width: 100% !important;
  }
</style>`;
}

export function prepareBottomSheetHtml(
  html: string,
  backgroundColor: string
): string {
  const injectedStyles = `${OVERLAY_POLL_VIEWPORT_META}${buildOverlayPollBaseStyles(backgroundColor)}${buildBottomSheetLayoutStyles(backgroundColor)}`;
  return injectPollHtmlBeforeHead(html, injectedStyles);
}
