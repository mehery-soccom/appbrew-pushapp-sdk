import {
  getPollWebViewProps,
  getTransparentContainerStyle,
  isTransparentPollBackground,
} from '../helpers/pollTransparency';

describe('pollTransparency', () => {
  it('detects transparent backgrounds', () => {
    expect(isTransparentPollBackground('transparent')).toBe(true);
    expect(isTransparentPollBackground('TRANSPARENT')).toBe(true);
    expect(isTransparentPollBackground('#FF5733')).toBe(false);
  });

  it('returns software layer and opaque false for transparent backgrounds', () => {
    expect(getPollWebViewProps('transparent')).toEqual({
      opaque: false,
      androidLayerType: 'software',
    });
  });

  it('returns hardware layer and opaque true for solid backgrounds', () => {
    expect(getPollWebViewProps('#EC520D')).toEqual({
      opaque: true,
      androidLayerType: 'hardware',
    });
  });

  it('returns null container style for solid backgrounds', () => {
    expect(getTransparentContainerStyle('#EC520D')).toBeNull();
  });

  it('strips shadow and elevation for transparent backgrounds', () => {
    expect(getTransparentContainerStyle('transparent')).toEqual({
      elevation: 0,
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
    });
  });
});
