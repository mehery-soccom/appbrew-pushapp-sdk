import { prepareOverlayPollHtml } from '../helpers/prepareOverlayPollHtml';

describe('prepareOverlayPollHtml', () => {
  const sampleHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title></title>
    <style>
      .pop-up-dimensions { background-color: rgb(255, 255, 255); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    </style>
  </head>
  <body>
    <div class="preview-wrapper pop-up-dimensions">content</div>
  </body>
</html>`;

  it('injects base overlay styles before closing head', () => {
    const result = prepareOverlayPollHtml(sampleHtml, 'transparent');

    expect(result).toContain('overlay-poll-base-fix');
    expect(result).toContain('background: transparent !important');
    expect(result).toContain('box-shadow: none !important');
    expect(result).toContain('img:not(.media-item)');
  });

  it('uses resolved background color for non-transparent values', () => {
    const result = prepareOverlayPollHtml(sampleHtml, '#1A1A2E');

    expect(result).toContain('background: #1A1A2E !important');
  });

  it('prepends styles when head tag is missing', () => {
    const result = prepareOverlayPollHtml('<div>content</div>', 'transparent');

    expect(result).toContain('<meta');
    expect(result).toContain('overlay-poll-base-fix');
    expect(result).toContain('<div>content</div>');
  });
});
