import { resolvePollBackgroundColor } from '../helpers/resolvePollBackgroundColor';

describe('resolvePollBackgroundColor', () => {
  it('returns transparent for undefined', () => {
    expect(resolvePollBackgroundColor(undefined)).toBe('transparent');
  });

  it('returns transparent for null', () => {
    expect(resolvePollBackgroundColor(null)).toBe('transparent');
  });

  it('returns transparent for empty string', () => {
    expect(resolvePollBackgroundColor('')).toBe('transparent');
    expect(resolvePollBackgroundColor('   ')).toBe('transparent');
  });

  it('returns transparent for transparent keyword', () => {
    expect(resolvePollBackgroundColor('transparent')).toBe('transparent');
    expect(resolvePollBackgroundColor('TRANSPARENT')).toBe('transparent');
  });

  it('returns transparent for none keyword', () => {
    expect(resolvePollBackgroundColor('none')).toBe('transparent');
  });

  it('returns transparent for fully transparent rgba/hex', () => {
    expect(resolvePollBackgroundColor('rgba(0,0,0,0)')).toBe('transparent');
    expect(resolvePollBackgroundColor('#00000000')).toBe('transparent');
    expect(resolvePollBackgroundColor('#00000100')).toBe('transparent');
    expect(resolvePollBackgroundColor('#fff0')).toBe('transparent');
    expect(resolvePollBackgroundColor('rgba(0, 0, 1, 0)')).toBe('transparent');
    expect(resolvePollBackgroundColor('hsla(0, 0%, 0%, 0)')).toBe(
      'transparent'
    );
  });

  it('preserves valid color values', () => {
    expect(resolvePollBackgroundColor('#FF5733')).toBe('#FF5733');
    expect(resolvePollBackgroundColor('  #1A1A2E  ')).toBe('#1A1A2E');
    expect(resolvePollBackgroundColor('rgba(26, 26, 46, 1)')).toBe(
      'rgba(26, 26, 46, 1)'
    );
  });
});
