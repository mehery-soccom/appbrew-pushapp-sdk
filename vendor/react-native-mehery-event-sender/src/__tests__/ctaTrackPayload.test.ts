import {
  buildCtaData,
  buildSyntheticCtaData,
  normalizeInAppCtaFields,
  resolvePushCtaFields,
} from '../utils/ctaTrackPayload';

describe('ctaTrackPayload', () => {
  it('buildCtaData uses empty button_id when unknown', () => {
    expect(buildCtaData('Save')).toEqual({
      ctaId: 'Save',
      button_id: '',
    });
    expect(buildCtaData('Save', 'PUSHAPP_SAVE')).toEqual({
      ctaId: 'Save',
      button_id: 'PUSHAPP_SAVE',
    });
  });

  it('buildSyntheticCtaData sets both fields', () => {
    expect(buildSyntheticCtaData('MEDIA_CLICK')).toEqual({
      ctaId: 'MEDIA_CLICK',
      button_id: 'MEDIA_CLICK',
    });
  });

  it('normalizeInAppCtaFields reads ctaId and button_id from message', () => {
    expect(
      normalizeInAppCtaFields({
        type: 'buttonClick',
        ctaId: 'Save',
        button_id: 'PUSHAPP_SAVE',
      })
    ).toEqual({ ctaId: 'Save', button_id: 'PUSHAPP_SAVE' });
  });

  it('normalizeInAppCtaFields reads handleClick-style nested data', () => {
    expect(
      normalizeInAppCtaFields({
        type: 'INAPP_CTA',
        data: { label: 'Save', button_id: 'PUSHAPP_SAVE' },
      })
    ).toEqual({ ctaId: 'Save', button_id: 'PUSHAPP_SAVE' });
  });

  it('normalizeInAppCtaFields falls back button_id to empty', () => {
    expect(
      normalizeInAppCtaFields({ type: 'buttonClick', ctaId: 'Save' })
    ).toEqual({ ctaId: 'Save', button_id: '' });
  });

  it('normalizeInAppCtaFields uses eventType as button_id', () => {
    expect(
      normalizeInAppCtaFields({
        eventType: 'PUSHAPP_SAVE',
        ctaId: 'Save',
      })
    ).toEqual({ ctaId: 'Save', button_id: 'PUSHAPP_SAVE' });
  });

  it('resolvePushCtaFields maps action id to title via action1/title1', () => {
    const merged = {
      title1: 'Save',
      action1: 'PUSHAPP_SAVE',
    };
    expect(resolvePushCtaFields('PUSHAPP_SAVE', merged)).toEqual({
      ctaId: 'Save',
      button_id: 'PUSHAPP_SAVE',
    });
  });

  it('resolvePushCtaFields reverse-maps label to action id', () => {
    const merged = {
      title1: 'Save',
      action1: 'PUSHAPP_SAVE',
    };
    expect(resolvePushCtaFields('Save', merged)).toEqual({
      ctaId: 'Save',
      button_id: 'PUSHAPP_SAVE',
    });
  });

  it('resolvePushCtaFields reads button_text and button_id from cta_buttons', () => {
    const merged = {
      cta_buttons: JSON.stringify([
        {
          button_text: 'Save',
          button_id: 'PUSHAPP_SAVE',
          url: 'https://example.com',
        },
      ]),
    };
    expect(resolvePushCtaFields('PUSHAPP_SAVE', merged)).toEqual({
      ctaId: 'Save',
      button_id: 'PUSHAPP_SAVE',
    });
  });
});
