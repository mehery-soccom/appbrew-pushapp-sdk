import {
  buildPushTrackBody,
  extractClickTrackToken,
  getPushTrackBaseFromMerged,
  mergeIosNotificationPayload,
  normalizeTargetUrl,
  resolveIosSemanticCtaId,
  resolveNotificationUrl,
} from '../utils/pushTrackPayload';
import { resolvePushCtaFields } from '../utils/ctaTrackPayload';

describe('pushTrackPayload', () => {
  it('mergeIosNotificationPayload flattens string data JSON over top-level', () => {
    const merged = mergeIosNotificationPayload({
      message_id: 'top',
      data: '{"message_id":"nested","t":"jwt1"}',
    });
    expect(merged.message_id).toBe('nested');
    expect(merged.t).toBe('jwt1');
  });

  it('mergeIosNotificationPayload exposes api_base_url from nested data JSON', () => {
    const merged = mergeIosNotificationPayload({
      title: 'Hi',
      data: '{"api_base_url":"https://api.example/pushapp/api","cta_buttons":"[]"}',
    });
    expect(merged.api_base_url).toBe('https://api.example/pushapp/api');
    expect(merged.title).toBe('Hi');
  });

  it('mergeIosNotificationPayload merges payload / extras JSON blobs', () => {
    const merged = mergeIosNotificationPayload({
      payload: '{"click_token":"jwt2","title":"x"}',
      extras: '{"url1":"https://one.example"}',
    });
    expect(merged.click_token).toBe('jwt2');
    expect(merged.url1).toBe('https://one.example');
  });

  it('getPushTrackBaseFromMerged reads api_base_url', () => {
    expect(
      getPushTrackBaseFromMerged({
        track_base_url: ' https://t.example/ ',
      })
    ).toBe('https://t.example/');
  });

  it('extractClickTrackToken prefers t', () => {
    expect(extractClickTrackToken({ t: '  abc  ', click_token: 'other' })).toBe(
      'abc'
    );
    expect(extractClickTrackToken({ clickToken: 'x' })).toBe('x');
  });

  it('resolveIosSemanticCtaId uses cta_buttons index for PUSHAPP_ACTION_1', () => {
    const merged = {
      cta_buttons: JSON.stringify([
        { title: 'Buy', url: 'https://a.com', id: 'buy_now' },
        { title: 'Later', url: 'https://b.com', ctaId: 'later' },
      ]),
    };
    expect(resolveIosSemanticCtaId('PUSHAPP_ACTION_1', merged)).toBe('buy_now');
    expect(resolveIosSemanticCtaId('PUSHAPP_ACTION_2', merged)).toBe('later');
  });

  it('resolveIosSemanticCtaId matches button id to actionIdentifier', () => {
    const merged = {
      cta_buttons: [{ title: 'X', url: 'https://x.com', id: 'custom_action' }],
    };
    expect(resolveIosSemanticCtaId('custom_action', merged)).toBe(
      'custom_action'
    );
  });

  it('normalizeTargetUrl adds https when scheme missing', () => {
    expect(normalizeTargetUrl('example.com/promo')).toBe(
      'https://example.com/promo'
    );
    expect(normalizeTargetUrl('https://ok.example')).toBe('https://ok.example');
  });

  it('resolveNotificationUrl reads notification_url and notificationUrl', () => {
    expect(
      resolveNotificationUrl({ notification_url: 'https://a.example' })
    ).toBe('https://a.example');
    expect(resolveNotificationUrl({ notificationUrl: 'b.example' })).toBe(
      'https://b.example'
    );
    expect(resolveNotificationUrl({ title: 'x' })).toBe('');
  });

  it('resolveNotificationUrl reads notification_url nested in style (Mehery template API)', () => {
    expect(
      resolveNotificationUrl({
        style: { notification_url: 'https://www.google.com' },
      })
    ).toBe('https://www.google.com');
    expect(
      resolveNotificationUrl({
        style: JSON.stringify({ notification_url: 'https://example.com/x' }),
      })
    ).toBe('https://example.com/x');
    expect(
      resolveNotificationUrl({
        templateData: JSON.stringify({
          style: { notification_url: 'https://nested.example' },
        }),
      })
    ).toBe('https://nested.example');
  });

  it('resolveIosSemanticCtaId maps PUSHAPP_* to title via action1..3', () => {
    const merged = {
      title1: 'Buy',
      title2: 'Sell',
      title3: 'Later',
      action1: 'PUSHAPP_BUY',
      action2: 'PUSHAPP_SELL',
      action3: 'PUSHAPP_LATER',
    };
    expect(resolveIosSemanticCtaId('PUSHAPP_SELL', merged)).toBe('Sell');
    expect(resolveIosSemanticCtaId('PUSHAPP_LATER', merged)).toBe('Later');
  });

  it('extractClickTrackToken returns undefined when token missing', () => {
    expect(extractClickTrackToken({})).toBeUndefined();
    expect(extractClickTrackToken({ t: '  ' })).toBeUndefined();
  });

  it('buildPushTrackBody builds opened and cta payloads', () => {
    const merged = {
      message_id: 'msg-1',
      filter_id: 'flt-1',
      notification_id: 'notif-1',
      t: 'jwt',
    };

    const opened = buildPushTrackBody('opened', merged);
    expect(opened).toEqual({
      event: 'opened',
      t: 'jwt',
      messageId: 'msg-1',
      filterId: 'flt-1',
      notificationId: 'notif-1',
    });
    expect(opened).not.toHaveProperty('receivedAt');

    const cta = buildPushTrackBody('cta', merged, {
      cta: { ctaId: 'buy_now', button_id: 'PUSHAPP_BUY' },
    });
    expect(cta).toEqual({
      event: 'cta',
      t: 'jwt',
      messageId: 'msg-1',
      filterId: 'flt-1',
      notificationId: 'notif-1',
      data: { ctaId: 'buy_now', button_id: 'PUSHAPP_BUY' },
    });
    expect(cta).not.toHaveProperty('receivedAt');
  });

  it('resolvePushCtaFields maps PUSHAPP_SAVE to Save via title1/action1', () => {
    const merged = {
      title1: 'Save',
      action1: 'PUSHAPP_SAVE',
    };
    expect(resolvePushCtaFields('PUSHAPP_SAVE', merged)).toEqual({
      ctaId: 'Save',
      button_id: 'PUSHAPP_SAVE',
    });
  });

  it('resolvePushCtaFields reverse-maps Save label to PUSHAPP_SAVE', () => {
    const merged = {
      title1: 'Save',
      action1: 'PUSHAPP_SAVE',
    };
    expect(resolvePushCtaFields('Save', merged)).toEqual({
      ctaId: 'Save',
      button_id: 'PUSHAPP_SAVE',
    });
  });
});
