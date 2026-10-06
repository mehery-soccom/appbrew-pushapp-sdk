import inlinePollEmitter from '../components/InlinePollEmitter';
import {
  __getInlinePollForTests,
  __resetInlinePollRegistryForTests,
  renderInlinePoll,
} from '../components/inlinePollRegistry';
import { reduceInlineContentHeight } from '../components/inlinePollHeight';

describe('inline poll registry', () => {
  beforeEach(() => {
    __resetInlinePollRegistryForTests();
  });

  it('does not re-emit when html is unchanged even if message id changes', () => {
    const events: unknown[] = [];
    const handler = (payload: unknown) => {
      events.push(payload);
    };
    inlinePollEmitter.on('inlinePollUpdated', handler);

    const changed = renderInlinePoll(
      'account_inline',
      '<p>banner</p>',
      { bg_color: '#fff' },
      { messageId: 'm1', filterId: 'f1' }
    );
    const firstUpdated = __getInlinePollForTests('account_inline')?.updatedAt;

    const again = renderInlinePoll(
      'account_inline',
      '<p>banner</p>',
      { bg_color: '#fff' },
      { messageId: 'm2', filterId: 'f2' }
    );

    expect(changed).toBe(true);
    expect(again).toBe(false);
    expect(events).toHaveLength(1);
    expect(__getInlinePollForTests('account_inline')?.updatedAt).toBe(
      firstUpdated
    );
    expect(__getInlinePollForTests('account_inline')?.messageId).toBe('m2');

    inlinePollEmitter.off('inlinePollUpdated', handler);
  });

  it('emits when the html changes', () => {
    renderInlinePoll('account_inline', '<p>a</p>', {}, { messageId: 'm1' });
    const changed = renderInlinePoll(
      'account_inline',
      '<p>b</p>',
      {},
      { messageId: 'm2' }
    );
    expect(changed).toBe(true);
    expect(__getInlinePollForTests('account_inline')?.htmlContent).toBe(
      '<p>b</p>'
    );
  });
});

describe('inline poll height', () => {
  it('keeps growing until image-ready measurements agree, then ignores zoom', () => {
    let state = { lastHeight: 0, settled: false };

    const collapsed = reduceInlineContentHeight(state, 24, false);
    state = collapsed.state;
    expect(collapsed.height).toBe(24);
    expect(state.settled).toBe(false);

    const stillCollapsed = reduceInlineContentHeight(state, 24, false);
    state = stillCollapsed.state;
    expect(stillCollapsed.height).toBeNull();
    expect(state.settled).toBe(false);

    const image = reduceInlineContentHeight(state, 220, true);
    state = image.state;
    expect(image.height).toBe(220);
    expect(state.settled).toBe(false);

    const agreed = reduceInlineContentHeight(state, 221, true);
    state = agreed.state;
    expect(agreed.height).toBeNull();
    expect(state.settled).toBe(true);

    const zoom = reduceInlineContentHeight(state, 480, true);
    expect(zoom.height).toBeNull();
    expect(zoom.state.lastHeight).toBe(220);
  });
});
