import {
  applyRememberedMeheryIdentity,
  buildMeheryProfileInfo,
  clearRememberedMeheryIdentity,
  formatOtpPhone,
  getRememberedMeheryIdentity,
  mergeMeheryIdentityEmail,
  mergeMeheryIdentityFields,
  mergeMeheryIdentityPhone,
  resolveMeheryEmail,
} from '../buildMeheryProfileInfo'

describe('buildMeheryProfileInfo', () => {
  beforeEach(() => {
    clearRememberedMeheryIdentity()
  })

  it('builds Starquik flat call shape (name string / phones[] / email)', () => {
    const result = buildMeheryProfileInfo({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '+9198',
    })

    expect(result).toEqual({
      name: 'Jane Doe',
      phones: ['+9198'],
      email: 'jane@example.com',
    })
    expect(result).not.toHaveProperty('emails')
    expect(result).not.toHaveProperty('source')
  })

  it('uses name string when parts are absent', () => {
    expect(buildMeheryProfileInfo({ name: 'Full Name' })).toEqual({
      name: 'Full Name',
    })
  })

  it('flattens name.formattedName to a string', () => {
    expect(
      buildMeheryProfileInfo({ name: { formattedName: 'Formatted' } })
    ).toEqual({ name: 'Formatted' })
  })

  it('uses displayName when name parts are absent', () => {
    expect(buildMeheryProfileInfo({ displayName: 'Lion King' })).toEqual({
      name: 'Lion King',
    })
  })

  it('resolves phone from phoneNumber or mobile', () => {
    expect(buildMeheryProfileInfo({ phoneNumber: '111' })).toEqual({
      phones: ['111'],
    })
    clearRememberedMeheryIdentity()
    expect(buildMeheryProfileInfo({ mobile: '222' })).toEqual({
      phones: ['222'],
    })
  })

  it('falls back to defaultAddress.phone when customer.phone is null', () => {
    expect(
      buildMeheryProfileInfo({
        phone: null,
        email: 'a@b.com',
        defaultAddress: { phone: '+919876543210' },
      })
    ).toEqual({
      phones: ['+919876543210'],
      email: 'a@b.com',
    })
  })

  it('falls back to addresses.edges[].node.phone', () => {
    expect(
      buildMeheryProfileInfo({
        addresses: {
          edges: [
            { node: { phone: null } },
            { node: { phone: '  +911122233344  ' } },
          ],
        },
      })
    ).toEqual({
      phones: ['+911122233344'],
    })
  })

  it('resolves email from emails[] / emailAddress', () => {
    expect(
      buildMeheryProfileInfo({ emails: [{ email: 'alt@ex.com' }] })
    ).toEqual({ email: 'alt@ex.com' })
    clearRememberedMeheryIdentity()
    expect(buildMeheryProfileInfo({ emailAddress: 'x@y.com' })).toEqual({
      email: 'x@y.com',
    })
  })

  it('maps emails[1+] and alt_emails to alt_emails', () => {
    expect(
      buildMeheryProfileInfo({
        emails: [
          { email: 'primary@ex.com' },
          { email: 'second@ex.com' },
        ],
        alt_emails: [{ email: 'alt@ex.com' }],
      })
    ).toEqual({
      email: 'primary@ex.com',
      alt_emails: [{ email: 'alt@ex.com' }, { email: 'second@ex.com' }],
    })
  })

  it('reapplies remembered email/phone on name-only follow-up', () => {
    buildMeheryProfileInfo({
      email: 'keep@ex.com',
      phoneNumber: '+911234567890',
    })
    expect(getRememberedMeheryIdentity()).toEqual({
      email: 'keep@ex.com',
      phone: '+911234567890',
    })

    expect(
      buildMeheryProfileInfo({ firstName: 'Only', lastName: 'Name' })
    ).toEqual({
      name: 'Only Name',
      email: 'keep@ex.com',
      phones: ['+911234567890'],
    })
  })

  it('omits empty email and does not add emails key', () => {
    const result = buildMeheryProfileInfo({
      firstName: 'A',
      email: '   ',
    })
    expect(result).toEqual({ name: 'A' })
    expect(result).not.toHaveProperty('email')
    expect(result).not.toHaveProperty('emails')
  })

  it('returns empty object for empty user', () => {
    expect(buildMeheryProfileInfo({})).toEqual({})
  })
})

describe('formatOtpPhone / mergeMeheryIdentity*', () => {
  beforeEach(() => {
    clearRememberedMeheryIdentity()
  })

  it('formats callingCode + national number', () => {
    expect(formatOtpPhone('91', '9876543210')).toBe('+919876543210')
    expect(formatOtpPhone('+91', '9876543210')).toBe('+919876543210')
    expect(formatOtpPhone(undefined, '+919876543210')).toBe('+919876543210')
    expect(formatOtpPhone('91', '  ')).toBeNull()
  })

  it('merges OTP phone only when customer has no phone', () => {
    const bare = { email: 'a@b.com', firstName: 'Lion' }
    expect(mergeMeheryIdentityPhone(bare, '+919876543210')).toEqual({
      email: 'a@b.com',
      firstName: 'Lion',
      phoneNumber: '+919876543210',
    })
    expect(
      mergeMeheryIdentityPhone(
        { ...bare, phone: '+911111111111' },
        '+919876543210'
      )
    ).toEqual({ ...bare, phone: '+911111111111' })
  })

  it('merges OTP email only when customer has no email', () => {
    expect(mergeMeheryIdentityEmail({ firstName: 'A' }, 'a@b.com')).toEqual({
      firstName: 'A',
      email: 'a@b.com',
    })
    expect(
      mergeMeheryIdentityEmail({ email: 'keep@b.com' }, 'a@b.com')
    ).toEqual({ email: 'keep@b.com' })
  })

  it('mergeMeheryIdentityFields applies phone + email', () => {
    expect(
      mergeMeheryIdentityFields(
        { firstName: 'A' },
        { phone: '+911', email: 'a@b.com' }
      )
    ).toEqual({
      firstName: 'A',
      phoneNumber: '+911',
      email: 'a@b.com',
    })
  })

  it('applyRememberedMeheryIdentity fills gaps only', () => {
    buildMeheryProfileInfo({
      email: 'remembered@ex.com',
      phone: '+910000000000',
    })
    expect(
      applyRememberedMeheryIdentity({ firstName: 'X', email: 'live@ex.com' })
    ).toEqual({
      firstName: 'X',
      email: 'live@ex.com',
      phoneNumber: '+910000000000',
    })
  })

  it('resolveMeheryEmail reads emails[].email', () => {
    expect(resolveMeheryEmail({ emails: [{ email: 'z@z.com' }] })).toBe(
      'z@z.com'
    )
  })
})
