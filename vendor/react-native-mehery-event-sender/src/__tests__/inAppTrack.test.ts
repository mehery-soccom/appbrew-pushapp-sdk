import { buildInAppTrackData } from '../utils/inAppTrack';
import { buildCtaData, buildSyntheticCtaData } from '../utils/ctaTrackPayload';

describe('inAppTrack', () => {
  it('buildInAppTrackData includes ctaId and button_id for cta events', () => {
    expect(
      buildInAppTrackData('cta', buildCtaData('Save', 'PUSHAPP_SAVE'))
    ).toEqual({
      ctaId: 'Save',
      button_id: 'PUSHAPP_SAVE',
    });
  });

  it('buildInAppTrackData omits fields for non-cta events', () => {
    expect(buildInAppTrackData('dismissed')).toEqual({});
    expect(buildInAppTrackData('openUrl')).toEqual({});
  });

  it('buildInAppTrackData supports synthetic CTA ids', () => {
    expect(
      buildInAppTrackData('cta', buildSyntheticCtaData('MEDIA_CLICK'))
    ).toEqual({
      ctaId: 'MEDIA_CLICK',
      button_id: 'MEDIA_CLICK',
    });
  });
});
