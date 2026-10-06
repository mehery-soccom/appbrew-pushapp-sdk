import { withOptionalProfileId } from '../utils/withOptionalProfileId'
import { extractProfileIdFromRegisterResponse } from '../utils/registerResponse'

describe('withOptionalProfileId', () => {
  it('adds p_id when non-empty', () => {
    expect(withOptionalProfileId({ name: 'Jane' }, '  pid-1  ')).toEqual({
      name: 'Jane',
      p_id: 'pid-1',
    })
  })

  it('omits p_id when empty', () => {
    expect(withOptionalProfileId({ name: 'Jane' }, '')).toEqual({ name: 'Jane' })
    expect(withOptionalProfileId({ name: 'Jane' }, null)).toEqual({
      name: 'Jane',
    })
  })
})

describe('extractProfileIdFromRegisterResponse', () => {
  it('reads device.p_id from link response', () => {
    expect(
      extractProfileIdFromRegisterResponse({
        device: { p_id: '685a5e70fd7a33fd326b72c1' },
      })
    ).toBe('685a5e70fd7a33fd326b72c1')
  })

  it('falls back to profile._id', () => {
    expect(
      extractProfileIdFromRegisterResponse({
        profile: { _id: 'profile-doc' },
      })
    ).toBe('profile-doc')
  })
})
