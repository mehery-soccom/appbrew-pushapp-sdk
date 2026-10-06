import {
  __resetTooltipPollRegistryForTests,
  getCachedTooltipPoll,
  registerTooltipPlaceholder,
  renderTooltipPoll,
  unregisterTooltipPlaceholder,
} from '../components/TooltipPollManager';
import tooltipEmitter from '../components/TooltipEmitter';

describe('TooltipPollManager placeholder matching', () => {
  beforeEach(() => {
    __resetTooltipPollRegistryForTests();
  });

  it('stores under a real string id when compare was an empty array', () => {
    registerTooltipPlaceholder('account_tooltip');
    const received: string[] = [];
    const handler = ({ placeholderId }: { placeholderId: string }) => {
      received.push(placeholderId);
    };
    tooltipEmitter.on('showTooltip', handler);

    renderTooltipPoll([], {
      line1: 'Domain Name',
      tooltipKey: 1,
    });

    expect(received).toEqual(['account_tooltip']);
    expect(getCachedTooltipPoll('account_tooltip')?.line1).toBe('Domain Name');

    tooltipEmitter.off('showTooltip', handler);
    unregisterTooltipPlaceholder('account_tooltip');
  });

  it('fans out to every registered container when id is empty', () => {
    registerTooltipPlaceholder('account_tooltip');
    const received: string[] = [];
    const handler = ({ placeholderId }: { placeholderId: string }) => {
      received.push(placeholderId);
    };
    tooltipEmitter.on('showTooltip', handler);

    renderTooltipPoll('', { line1: 'Hello', tooltipKey: 2 });

    expect(received).toEqual(['account_tooltip']);
    tooltipEmitter.off('showTooltip', handler);
  });

  it('keeps an orphan cache under empty key when nothing is registered', () => {
    renderTooltipPoll([], { line1: 'Orphan', tooltipKey: 3 });
    expect(getCachedTooltipPoll('')?.line1).toBe('Orphan');
  });

  it('does not re-emit when the same campaign is delivered again', () => {
    registerTooltipPlaceholder('account_edit_profile_tooltip');
    const received: string[] = [];
    const handler = ({ placeholderId }: { placeholderId: string }) => {
      received.push(placeholderId);
    };
    tooltipEmitter.on('showTooltip', handler);

    const payload = {
      line1: 'Edit profile',
      line2: 'Tap here',
      messageId: 'msg-1',
      filterId: 'flt-1',
      notificationUrl: '',
      tooltipKey: 1,
    };
    renderTooltipPoll('account_edit_profile_tooltip', payload);
    renderTooltipPoll('account_edit_profile_tooltip', {
      ...payload,
      tooltipKey: 999,
    });

    expect(received).toEqual(['account_edit_profile_tooltip']);
    tooltipEmitter.off('showTooltip', handler);
  });
});
