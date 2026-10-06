const mockCancelOpen = jest.fn()
const mockOnPageOpen = jest.fn(() => mockCancelOpen)
const mockOnPageClose = jest.fn()

jest.mock('../sdk', () => ({
  loadMeherySdk: jest.fn(() =>
    Promise.resolve({
      OnPageOpen: mockOnPageOpen,
      OnPageClose: mockOnPageClose,
    })
  ),
}))

jest.mock('../sendCustomEvent', () => ({
  sendMeheryCustomEvent: jest.fn(() => Promise.resolve(true)),
}))

import { meheryOnPageClose, meheryOnPageOpen, __resetMeheryWidgetOpenDedupeForTests } from '../navigation'

const { sendMeheryCustomEvent } = jest.requireMock('../sendCustomEvent') as {
  sendMeheryCustomEvent: jest.Mock
}

describe('meheryOnPageOpen / meheryOnPageClose', () => {
  beforeEach(() => {
    mockCancelOpen.mockClear()
    mockOnPageOpen.mockClear()
    mockOnPageClose.mockClear()
    sendMeheryCustomEvent.mockClear()
    __resetMeheryWidgetOpenDedupeForTests()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('loads SDK and invokes OnPageOpen / OnPageClose', async () => {
    const cancel = meheryOnPageOpen('Home')
    meheryOnPageClose('Cart')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockOnPageOpen).toHaveBeenCalledWith('Home')
    expect(mockOnPageClose).toHaveBeenCalledWith('Cart')

    cancel()
    await Promise.resolve()
    await Promise.resolve()
    expect(mockCancelOpen).toHaveBeenCalled()
    expect(mockOnPageClose).toHaveBeenCalledWith('Home')
  })

  it('emits widget_open for placeholder compares after delay', async () => {
    const cancel = meheryOnPageOpen('account', {
      widgetOpenCompares: ['account_inline', 'account_tooltip'],
    })
    await Promise.resolve()
    jest.advanceTimersByTime(2000)
    await Promise.resolve()

    expect(sendMeheryCustomEvent).toHaveBeenCalledWith(
      'widget_open',
      { compare: 'account_inline' },
      'LOG'
    )
    expect(sendMeheryCustomEvent).toHaveBeenCalledWith(
      'widget_open',
      { compare: 'account_tooltip' },
      'LOG'
    )
    cancel()
  })

  it('dedupes widget_open for the same compare within 30s', async () => {
    const cancel1 = meheryOnPageOpen('account', {
      widgetOpenCompares: ['account_edit_profile_tooltip'],
    })
    await Promise.resolve()
    jest.advanceTimersByTime(2000)
    await Promise.resolve()
    cancel1()

    sendMeheryCustomEvent.mockClear()

    const cancel2 = meheryOnPageOpen('account', {
      widgetOpenCompares: ['account_edit_profile_tooltip'],
    })
    await Promise.resolve()
    jest.advanceTimersByTime(2000)
    await Promise.resolve()
    cancel2()

    expect(sendMeheryCustomEvent).not.toHaveBeenCalled()
  })

  it('cancels pending OnPageOpen when cleanup runs before SDK resolves', async () => {
    let resolveSdk!: (value: {
      OnPageOpen: typeof mockOnPageOpen
      OnPageClose: typeof mockOnPageClose
    }) => void
    const { loadMeherySdk } = jest.requireMock('../sdk') as {
      loadMeherySdk: jest.Mock
    }
    loadMeherySdk.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSdk = resolve
        })
    )

    const cancel = meheryOnPageOpen('profile')
    cancel()

    resolveSdk({
      OnPageOpen: mockOnPageOpen,
      OnPageClose: mockOnPageClose,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(mockOnPageOpen).toHaveBeenCalledWith('profile')
    expect(mockCancelOpen).toHaveBeenCalled()
    expect(mockOnPageClose).toHaveBeenCalledWith('profile')
  })
})
