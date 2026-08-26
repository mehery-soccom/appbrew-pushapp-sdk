import { prepareBottomSheetHtml } from '../helpers/prepareBottomSheetHtml';

describe('prepareBottomSheetHtml', () => {
  const sampleHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title></title>
    <style>
      .pop-up-dimensions { background-color: rgb(255, 255, 255); }
      .media-preview .media-item { object-fit: cover; height: 100%; }
    </style>
  </head>
  <body>
    <div class="preview-wrapper pop-up-dimensions">
      <div class="bottomsheet-block">
        <div class="pop-up-vertical-content">
          <div class="media-preview">
            <img src="https://example.com/image.png" class="media-item" />
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;

  it('injects mobile layout overrides before closing head', () => {
    const result = prepareBottomSheetHtml(sampleHtml, 'transparent');

    expect(result).toContain('bottomsheet-mobile-layout-fix');
    expect(result).toContain('object-fit: cover !important');
    expect(result).toContain('aspect-ratio: 4 / 3 !important');
    expect(result).toContain('flex: none !important');
    expect(result).toContain('justify-content: center !important');
    expect(result).toContain('background: transparent !important');
    expect(result).toContain('transform: none !important');
    expect(result).toContain('img:not(.media-item)');
  });

  it('uses resolved background color for non-transparent values', () => {
    const result = prepareBottomSheetHtml(sampleHtml, '#EC520D');

    expect(result).toContain('background: #EC520D !important');
  });

  it('prepends styles when head tag is missing', () => {
    const result = prepareBottomSheetHtml('<div>content</div>', 'transparent');

    expect(result).toContain('<meta');
    expect(result).toContain('bottomsheet-mobile-layout-fix');
    expect(result).toContain('<div>content</div>');
  });
});
