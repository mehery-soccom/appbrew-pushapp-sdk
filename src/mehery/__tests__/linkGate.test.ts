jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
}))

jest.mock('../sdk', () => {
  const ensureDeviceRegistered = jest.fn(async () => true)
  const flushPendingCustomEvents = jest.fn(async () => undefined)
  return {
    loadMeherySdk: jest.fn(async () => ({
      ensureDeviceRegistered,
      flushPendingCustomEvents,
    })),
    __ensureDeviceRegisteredMock: ensureDeviceRegistered,
    __flushPendingCustomEventsMock: flushPendingCustomEvents,
  }
})

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as sdkModule from '../sdk'
import {
  clearLoginStateIfSwitchingUser,
  DEVICE_REREGISTER_DELAY_MS,
  ensureGuestRegisteredBeforeLogin,
  isSameUserAlreadyLinked,
  reregisterDeviceAfterIdentityChange,
  resetGuestRegistrationState,
  waitForUserLoggedIn,
} from '../linkGate'

const ensureDeviceRegistered = (sdkModule as {
  __ensureDeviceRegisteredMock: jest.Mock
}).__ensureDeviceRegisteredMock

const storage = new Map<string, string>()

function mockStorage(initial: Record<string, string> = {}) {
  storage.clear()
  Object.entries(initial).forEach(([key, value]) => storage.set(key, value))
  ;(AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    storage.has(key) ? storage.get(key)! : null
  )
  ;(AsyncStorage.setItem as jest.Mock).mockImplementation(
    async (key: string, value: string) => {
      storage.set(key, value)
    }
  )
  ;(AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    storage.delete(key)
  })
  ;(AsyncStorage.multiRemove as jest.Mock).mockImplementation(
    async (keys: string[]) => {
      keys.forEach((key) => storage.delete(key))
    }
  )
}

describe('linkGate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    storage.clear()
    mockStorage()
    ensureDeviceRegistered.mockResolvedValue(true)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('ensureGuestRegisteredBeforeLogin', () => {
    it('clears user_id before polling', async () => {
      mockStorage({
        user_id: 'stale-login',
        isRegistered: 'true',
        registered_user_id: 'guest-1',
      })

      const promise = ensureGuestRegisteredBeforeLogin()
      await jest.runAllTimersAsync()
      const result = await promise

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user_id')
      expect(result).toBe(true)
      expect(ensureDeviceRegistered).not.toHaveBeenCalled()
    })

    it('waits before first register nudge and returns false when never ready', async () => {
      mockStorage({ isRegistered: 'false' })

      const promise = ensureGuestRegisteredBeforeLogin()
      await jest.advanceTimersByTimeAsync(DEVICE_REREGISTER_DELAY_MS)
      expect(ensureDeviceRegistered).toHaveBeenCalled()
      await jest.advanceTimersByTimeAsync(20_000)
      const result = await promise

      expect(result).toBe(false)
      expect(ensureDeviceRegistered.mock.calls.length).toBeGreaterThan(1)
    })

    it('returns true once isRegistered and registered_user_id are set', async () => {
      mockStorage({})
      ensureDeviceRegistered.mockImplementation(async () => {
        storage.set('isRegistered', 'true')
        storage.set('registered_user_id', 'guest-42')
        return true
      })

      const promise = ensureGuestRegisteredBeforeLogin()
      await jest.runAllTimersAsync()
      const result = await promise

      expect(result).toBe(true)
      expect(ensureDeviceRegistered).toHaveBeenCalled()
    })
  })

  describe('reregisterDeviceAfterIdentityChange', () => {
    it('waits 2s then retries register until guest flags are set', async () => {
      mockStorage({})
      let calls = 0
      ensureDeviceRegistered.mockImplementation(async () => {
        calls += 1
        if (calls >= 2) {
          storage.set('isRegistered', 'true')
          storage.set('registered_user_id', 'guest-99')
        }
        return calls >= 2
      })

      const promise = reregisterDeviceAfterIdentityChange('logout')
      await jest.advanceTimersByTimeAsync(DEVICE_REREGISTER_DELAY_MS)
      expect(ensureDeviceRegistered).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(DEVICE_REREGISTER_DELAY_MS)
      const result = await promise

      expect(result).toBe(true)
      expect(ensureDeviceRegistered.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
        'lastRegisteredState',
      ])
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user_id')
    })

    it('returns false after max attempts', async () => {
      mockStorage({ isRegistered: 'false' })
      ensureDeviceRegistered.mockResolvedValue(false)

      const promise = reregisterDeviceAfterIdentityChange('login')
      await jest.runAllTimersAsync()
      await expect(promise).resolves.toBe(false)
      expect(ensureDeviceRegistered).toHaveBeenCalledTimes(3)
    })
  })

  describe('waitForUserLoggedIn', () => {
    it('returns true when UserLoggedIn is already true', async () => {
      mockStorage({ UserLoggedIn: 'true' })

      await expect(waitForUserLoggedIn(1000)).resolves.toBe(true)
    })

    it('returns false when login never completes within timeout', async () => {
      mockStorage({ UserLoggedIn: 'false' })

      const promise = waitForUserLoggedIn(800)
      await jest.advanceTimersByTimeAsync(1000)
      await expect(promise).resolves.toBe(false)
    })
  })

  describe('resetGuestRegistrationState', () => {
    it('removes guest/login keys and device_id', async () => {
      await resetGuestRegistrationState()

      const removed = (AsyncStorage.removeItem as jest.Mock).mock.calls.map(
        (call: [string]) => call[0]
      )
      expect(removed).toContain('user_id')
      expect(removed).toContain('UserLoggedIn')
      expect(removed).toContain('isRegistered')
      expect(removed).toContain('registered_user_id')
      expect(removed).toContain('device_id')
      expect(removed).toContain('fcmToken')
      expect(removed).toContain('APNStoken')
    })
  })

  describe('isSameUserAlreadyLinked / clearLoginStateIfSwitchingUser', () => {
    it('detects same user via user_id + UserLoggedIn', async () => {
      mockStorage({ UserLoggedIn: 'true', user_id: '123' })
      await expect(isSameUserAlreadyLinked('123')).resolves.toBe(true)
    })

    it('detects same user via contact_id prefix', async () => {
      mockStorage({
        UserLoggedIn: 'true',
        contact_id: '123_-mehery-device',
      })
      await expect(isSameUserAlreadyLinked('123')).resolves.toBe(true)
    })

    it('does not clear login state for same user cold start', async () => {
      mockStorage({
        UserLoggedIn: 'true',
        user_id: '123',
        contact_id: '123_device',
      })
      await clearLoginStateIfSwitchingUser('123')
      expect(AsyncStorage.removeItem).not.toHaveBeenCalled()
    })

    it('clears login state when switching to a different user', async () => {
      mockStorage({
        UserLoggedIn: 'true',
        user_id: '111',
        contact_id: '111_device',
      })
      await clearLoginStateIfSwitchingUser('222')
      const removed = (AsyncStorage.removeItem as jest.Mock).mock.calls.map(
        (call: [string]) => call[0]
      )
      expect(removed).toContain('UserLoggedIn')
      expect(removed).toContain('contact_id')
    })
  })
})
