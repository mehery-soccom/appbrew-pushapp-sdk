export function getOverlayPollBodyBackground(backgroundColor: string): string {
  return backgroundColor === 'transparent' ? 'transparent' : backgroundColor;
}

export const OVERLAY_POLL_VIEWPORT_META = `
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
/>
`;

export function buildOverlayPollBaseStyles(backgroundColor: string): string {
  const bodyBackground = getOverlayPollBodyBackground(backgroundColor);

  return `
<style id="overlay-poll-base-fix">
  strong, b { font-weight: 700 !important; }
  [style*="font-weight:bold"], [style*="font-weight: bold"] { font-weight: 700 !important; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
    -webkit-text-size-adjust: 100% !important;
    background: ${bodyBackground} !important;
  }
  * { box-sizing: border-box; }
  video, iframe, table, canvas, svg {
    max-width: 100% !important;
    height: auto !important;
  }
  img:not(.media-item) {
    max-width: 100% !important;
    height: auto !important;
  }
  .preview-wrapper,
  .preview-wrapper.pop-up-dimensions,
  .pop-up-dimensions {
    background: ${bodyBackground} !important;
    background-color: ${bodyBackground} !important;
    box-shadow: none !important;
  }
</style>`;
}

export function injectPollHtmlBeforeHead(
  html: string,
  injection: string
): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${injection}</head>`);
  }

  return `${injection}${html}`;
}

export function prepareOverlayPollHtml(
  html: string,
  backgroundColor: string
): string {
  const injectedStyles = `${OVERLAY_POLL_VIEWPORT_META}${buildOverlayPollBaseStyles(backgroundColor)}`;
  return injectPollHtmlBeforeHead(html, injectedStyles);
}
