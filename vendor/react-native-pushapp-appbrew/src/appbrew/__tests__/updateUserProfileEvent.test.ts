import { buildUpdateUserProfileEventPayload } from '../updateUserProfileEvent'

describe('buildUpdateUserProfileEventPayload', () => {
  it('maps flat name, email, phones[0]', () => {
    expect(
      buildUpdateUserProfileEventPayload({
        name: 'Jane Doe',
        email: 'jane@example.com',
        phones: ['+919876543210'],
      })
    ).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+919876543210',
    })
  })

  it('reads phones[].phone objects, emails[].email, and formattedName', () => {
    expect(
      buildUpdateUserProfileEventPayload({
        name: { formattedName: 'Neils Carnac' },
        phones: [{ phone: '+911111111111' }],
        emails: [{ email: 'n@ex.com' }],
      })
    ).toEqual({
      name: 'Neils Carnac',
      phone: '+911111111111',
      email: 'n@ex.com',
    })
  })

  it('omits empty fields', () => {
    expect(buildUpdateUserProfileEventPayload({ name: '  ' })).toEqual({})
    expect(
      buildUpdateUserProfileEventPayload({ email: 'a@b.com' })
    ).toEqual({ email: 'a@b.com' })
  })
})
