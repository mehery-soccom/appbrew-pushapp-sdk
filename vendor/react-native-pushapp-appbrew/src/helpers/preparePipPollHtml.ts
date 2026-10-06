import {
  buildOverlayPollBaseStyles,
  injectPollHtmlBeforeHead,
  OVERLAY_POLL_VIEWPORT_META,
} from './prepareOverlayPollHtml';

function buildPipVideoLayoutStyles(): string {
  return `
<style id="pip-poll-video-fix">
  html, body {
    height: 100% !important;
    min-height: 100% !important;
    overflow: hidden !important;
  }
  .preview-wrapper,
  .preview-wrapper.pop-up-dimensions,
  .pop-up-dimensions,
  .bottomsheet-block,
  .pop-up-vertical-content,
  .text-block-road,
  .media-preview {
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    aspect-ratio: unset !important;
    flex: 1 !important;
  }
  video,
  iframe,
  .media-preview video,
  .media-item {
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    display: block !important;
    object-fit: cover !important;
    border: none !important;
    vertical-align: top !important;
  }
</style>`;
}

export function preparePipPollHtml(
  html: string,
  backgroundColor: string
): string {
  const injectedStyles = `${OVERLAY_POLL_VIEWPORT_META}${buildOverlayPollBaseStyles(backgroundColor)}${buildPipVideoLayoutStyles()}`;
  return injectPollHtmlBeforeHead(html, injectedStyles);
}
