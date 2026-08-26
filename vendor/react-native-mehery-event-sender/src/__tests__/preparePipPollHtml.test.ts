import { preparePipPollHtml } from '../helpers/preparePipPollHtml';

describe('preparePipPollHtml', () => {
  it('injects full-bleed video layout overrides', () => {
    const html = `<!DOCTYPE html><html><head></head><body><video src="x.mp4"></video></body></html>`;
    const result = preparePipPollHtml(html, 'transparent');

    expect(result).toContain('pip-poll-video-fix');
    expect(result).toContain('object-fit: cover !important');
    expect(result).toContain('padding: 0 !important');
    expect(result).toContain('height: 100% !important');
  });
});
