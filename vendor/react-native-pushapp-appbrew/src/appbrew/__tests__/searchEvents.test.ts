jest.mock('@gauntlet/state', () => ({
  useAppStore: {
    subscribe: jest.fn(() => jest.fn()),
    getState: jest.fn(() => ({
      search: { searchParams: { searchKey: 'from-store' } },
      route: { gotoLink: jest.fn() },
      filter: { collections: {} },
    })),
  },
}))

jest.mock('../sendCustomEvent', () => ({
  sendMeheryCustomEvent: jest.fn(() => Promise.resolve(true)),
}))

import {
  __resetMeherySearchTrackingForTests,
  emitMeherySearchEvent,
  installMeherySearchTracking,
  termFromSearchLink,
} from '../searchEvents'

const { sendMeheryCustomEvent } = jest.requireMock('../sendCustomEvent') as {
  sendMeheryCustomEvent: jest.Mock
}

const { useAppStore } = jest.requireMock('@gauntlet/state') as {
  useAppStore: {
    subscribe: jest.Mock
    getState: jest.Mock
  }
}

describe('emitMeherySearchEvent', () => {
  beforeEach(() => {
    sendMeheryCustomEvent.mockClear()
    __resetMeherySearchTrackingForTests()
  })

  it('forwards search_term via LOG custom event', () => {
    emitMeherySearchEvent(`silk-robe-${Date.now()}`)
    expect(sendMeheryCustomEvent).toHaveBeenCalledWith(
      'search',
      expect.objectContaining({
        search_term: expect.stringContaining('silk-robe'),
      }),
      'LOG'
    )
  })

  it('ignores blank terms', () => {
    emitMeherySearchEvent('   ')
    expect(sendMeheryCustomEvent).not.toHaveBeenCalled()
  })

  it('dedupes identical term within a short window', () => {
    const term = `dedupe-${Date.now()}`
    emitMeherySearchEvent(term)
    emitMeherySearchEvent(term)
    expect(sendMeheryCustomEvent).toHaveBeenCalledTimes(1)
  })
})

describe('termFromSearchLink / search commit', () => {
  beforeEach(() => {
    sendMeheryCustomEvent.mockClear()
    __resetMeherySearchTrackingForTests()
  })

  it('extracts searchQuery from search screen link', () => {
    expect(
      termFromSearchLink({
        kind: 'screen',
        value: 'search',
        params: { searchQuery: 'linen pants' },
      })
    ).toBe('linen pants')
  })

  it('ignores suggestion-screen-only navigations (non-search)', () => {
    expect(
      termFromSearchLink({
        kind: 'screen',
        value: 'home',
        params: { searchQuery: 'x' },
      })
    ).toBe('')
  })

  it('gotoLink wrap emits on search commit', () => {
    const gotoLink = jest.fn()
    useAppStore.getState.mockReturnValue({
      search: { searchParams: { searchKey: '' } },
      route: { gotoLink },
      filter: { collections: {} },
    })

    installMeherySearchTracking()

    const route = useAppStore.getState().route
    route.gotoLink({
      kind: 'screen',
      value: 'search',
      params: { searchQuery: 'commit-term', collectionId: 'search_collection' },
    })

    expect(sendMeheryCustomEvent).toHaveBeenCalledWith(
      'search',
      { search_term: 'commit-term' },
      'LOG'
    )
    expect(gotoLink).toHaveBeenCalled()
  })
})
