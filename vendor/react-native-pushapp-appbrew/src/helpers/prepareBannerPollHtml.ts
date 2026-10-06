import {
  buildOverlayPollBaseStyles,
  injectPollHtmlBeforeHead,
  OVERLAY_POLL_VIEWPORT_META,
} from './prepareOverlayPollHtml';

function buildBannerLayoutStyles(): string {
  return `
<style id="banner-poll-layout-fix">
  html, body {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .preview-wrapper,
  .preview-wrapper.pop-up-dimensions,
  .pop-up-dimensions,
  .banner-wrapper {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
  }
  .banner-wrapper {
    height: auto !important;
    min-height: 100px !important;
  }
</style>`;
}

export function prepareBannerPollHtml(
  html: string,
  backgroundColor: string
): string {
  const injectedStyles = `${OVERLAY_POLL_VIEWPORT_META}${buildOverlayPollBaseStyles(backgroundColor)}${buildBannerLayoutStyles()}`;
  return injectPollHtmlBeforeHead(html, injectedStyles);
}
