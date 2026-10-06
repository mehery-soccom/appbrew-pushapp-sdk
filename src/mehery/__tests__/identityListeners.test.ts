const signOutHandlers: Array<() => void> = []
const mockSetUserDetails = jest.fn(() => Promise.resolve())
let mockLinkedUserId: string | null = 'linked_cust'

jest.mock('@gauntlet/event-emitter', () => ({
  EVENTS: { SIGNIN_SUCCESS: 'SIGNIN_SUCCESS', SIGNOUT_SUCCESS: 'SIGNOUT_SUCCESS' },
  EventEmitter: {
    getInstance: () => ({
      subscribe: (event: string, handler: () => void) => {
        if (event === 'SIGNOUT_SUCCESS') {
          signOutHandlers.push(handler)
        }
        return () => undefined
      },
    }),
  },
}))

jest.mock('../sendCustomEvent', () => ({
  sendMeheryCustomEvent: jest.fn(() => Promise.resolve(true)),
}))

jest.mock('../MeheryTracker', () => ({
  getMeheryTracker: () => ({
    setUserDetails: mockSetUserDetails,
    getLinkedUserId: () => mockLinkedUserId,
  }),
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
}))

jest.mock('@gauntlet/state', () => ({
  useAppStore: Object.assign(
    {
      subscribe: jest.fn(() => jest.fn()),
    },
    {
      getState: () => ({
        user: { data: { userDetails: { data: undefined } } },
      }),
    }
  ),
}))

import { wireMeheryIdentityListeners } from '../identityListeners'

const { sendMeheryCustomEvent } = jest.requireMock('../sendCustomEvent') as {
  sendMeheryCustomEvent: jest.Mock
}

describe('wireMeheryIdentityListeners logout', () => {
  beforeEach(() => {
    signOutHandlers.length = 0
    sendMeheryCustomEvent.mockClear()
    mockSetUserDetails.mockClear()
    mockLinkedUserId = 'linked_cust'
  })

  it('uses linkedUserId when Zustand store was already cleared', async () => {
    wireMeheryIdentityListeners()
    expect(signOutHandlers.length).toBeGreaterThan(0)
    signOutHandlers[0]()

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(sendMeheryCustomEvent).toHaveBeenCalledWith(
      'logout',
      { user_id: 'linked_cust' },
      'LOG'
    )
    expect(sendMeheryCustomEvent).toHaveBeenCalledWith(
      'OnUserLogOut',
      { user_id: 'linked_cust' },
      'LOG'
    )
    expect(mockSetUserDetails).toHaveBeenCalledWith(undefined)
  })

  it('does not call setUserDetails(undefined) on idle-empty store subscribe', () => {
    const subscribe = require('@gauntlet/state').useAppStore.subscribe as jest.Mock
    wireMeheryIdentityListeners()
    const userDetailsHandler = subscribe.mock.calls.find(
      (c: unknown[]) => typeof c[1] === 'function'
    )?.[1] as ((v: unknown) => void) | undefined
    expect(userDetailsHandler).toBeDefined()
    userDetailsHandler?.({ status: 'idle', data: undefined })
    expect(mockSetUserDetails).not.toHaveBeenCalled()
  })

  it('does not send empty OnUserLogOut when no user_id can be resolved', async () => {
    mockLinkedUserId = null
    wireMeheryIdentityListeners()
    signOutHandlers[0]()

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(sendMeheryCustomEvent).toHaveBeenCalledWith('logout', {}, 'LOG')
    expect(sendMeheryCustomEvent).not.toHaveBeenCalledWith(
      'OnUserLogOut',
      expect.anything(),
      expect.anything()
    )
    expect(mockSetUserDetails).toHaveBeenCalledWith(undefined)
  })
})
