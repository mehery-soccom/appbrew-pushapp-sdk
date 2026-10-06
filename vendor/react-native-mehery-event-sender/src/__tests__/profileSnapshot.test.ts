import {
  buildProfileApiPayload,
  canonicalizeProfileSnapshot,
  isProfileUpdatePayloadEmpty,
  lastSnapshotStoresEmailInAdditionalInfo,
  lastSnapshotStoresPhoneInAdditionalInfo,
  prepareProfileUpdatePayload,
  profilePayloadsEqual,
  profileSnapshotStorageKey,
  stableStringify,
} from '../utils/profileSnapshotCompare';

describe('profileSnapshot', () => {
  it('profileSnapshotStorageKey scopes by user id', () => {
    expect(profileSnapshotStorageKey('user_123')).toBe(
      'mehery_last_profile_snapshot:user_123'
    );
  });

  it('stableStringify is independent of key order', () => {
    const a = { b: 2, a: { z: 1, y: 2 } };
    const b = { a: { y: 2, z: 1 }, b: 2 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('scalar email stays in additionalInfo (pushapp rejects top-level emails)', () => {
    expect(
      buildProfileApiPayload(
        {
          name: 'Jane Doe',
          phones: ['+919876543210'],
          email: 'jane@example.com',
          cart_value: 100,
        },
        {}
      )
    ).toEqual({
      name: 'Jane Doe',
      phones: [{ phone: '+919876543210' }],
      additionalInfo: {
        email: 'jane@example.com',
        cart_value: 100,
      },
    });
  });

  it('does not invent top-level emails from scalar email', () => {
    const payload = buildProfileApiPayload({ email: 'a@b.com' }, {});
    expect(payload.emails).toBeUndefined();
    expect(payload.additionalInfo).toEqual({ email: 'a@b.com' });
  });

  it('buildProfileApiPayload maps identity phones and scalar email', () => {
    expect(
      buildProfileApiPayload(
        {
          name: 'Jane Doe',
          email: 'jane@example.com',
          phones: ['+919876543210'],
          city: 'Mumbai',
        },
        {}
      )
    ).toEqual({
      name: 'Jane Doe',
      phones: [{ phone: '+919876543210' }],
      additionalInfo: {
        email: 'jane@example.com',
        city: 'Mumbai',
      },
    });
  });

  it('buildProfileApiPayload maps emails array of strings', () => {
    expect(
      buildProfileApiPayload({ emails: ['jane@example.com'] }, {})
    ).toEqual({
      emails: [{ email: 'jane@example.com' }],
    });
  });

  it('buildProfileApiPayload maps scalar phone to top-level phones', () => {
    expect(buildProfileApiPayload({ phone: '+919876543210' }, {})).toEqual({
      phones: [{ phone: '+919876543210' }],
    });
  });

  it('buildProfileApiPayload lifts phone to top-level and keeps scalar email', () => {
    const payload = buildProfileApiPayload(
      {
        email: 'jane@example.com',
        phone: '+919876543210',
        plan: 'premium',
      },
      {}
    );
    expect(payload).toEqual({
      phones: [{ phone: '+919876543210' }],
      additionalInfo: {
        email: 'jane@example.com',
        plan: 'premium',
      },
    });
    expect(payload.additionalInfo).not.toHaveProperty('phone');
    expect(payload).not.toHaveProperty('phone');
    expect(payload.emails).toBeUndefined();
  });

  it('first profile push (create) includes phones and additionalInfo.email', () => {
    const desired = buildProfileApiPayload(
      {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+919876543210',
        city: 'Mumbai',
      },
      {}
    );
    expect(prepareProfileUpdatePayload(desired, null)).toEqual({
      name: 'Jane Doe',
      phones: [{ phone: '+919876543210' }],
      additionalInfo: {
        email: 'jane@example.com',
        city: 'Mumbai',
      },
    });
  });

  it('canonicalizeProfileSnapshot keeps additionalInfo.email', () => {
    const legacy: ReturnType<typeof buildProfileApiPayload> = {
      additionalInfo: {
        email: 'jane@example.com',
        city: 'Mumbai',
      },
    };
    expect(canonicalizeProfileSnapshot(legacy)).toEqual({
      additionalInfo: {
        email: 'jane@example.com',
        city: 'Mumbai',
      },
    });
  });

  it('canonicalizeProfileSnapshot lifts additionalInfo.phone to phones', () => {
    const legacy: ReturnType<typeof buildProfileApiPayload> = {
      additionalInfo: {
        phone: '+919876543210',
        city: 'Mumbai',
      },
    };
    expect(canonicalizeProfileSnapshot(legacy)).toEqual({
      phones: [{ phone: '+919876543210' }],
      additionalInfo: { city: 'Mumbai' },
    });
  });

  it('prepareProfileUpdatePayload keeps additionalInfo.email when last snapshot stored it there', () => {
    const last: ReturnType<typeof buildProfileApiPayload> = {
      additionalInfo: {
        email: 'jane@example.com',
        city: 'Mumbai',
      },
    };
    const desired = buildProfileApiPayload(
      { email: 'jane@example.com', city: 'Mumbai' },
      {}
    );
    expect(lastSnapshotStoresEmailInAdditionalInfo(last)).toBe(true);
    expect(prepareProfileUpdatePayload(desired, last)).toEqual({
      additionalInfo: {
        email: 'jane@example.com',
        city: 'Mumbai',
      },
    });
  });

  it('prepareProfileUpdatePayload omits unchanged top-level emails on follow-up updates', () => {
    const last = buildProfileApiPayload(
      { emails: ['jane@example.com'], city: 'Mumbai' },
      {}
    );
    const desired = buildProfileApiPayload(
      { emails: ['jane@example.com'], city: 'Pune' },
      {}
    );
    expect(prepareProfileUpdatePayload(desired, last)).toEqual({
      additionalInfo: { city: 'Pune' },
    });
  });

  it('profilePayloadsEqual treats reordered additionalInfo as equal', () => {
    const left = buildProfileApiPayload(
      { name: 'Jane', city: 'Mumbai', _h1_ajejik_h2_: 'static' },
      { plan: 'free' }
    );
    const right = buildProfileApiPayload(
      { name: 'Jane', _h1_ajejik_h2_: 'static', city: 'Mumbai' },
      { plan: 'free' }
    );
    expect(profilePayloadsEqual(left, right)).toBe(true);
  });

  it('profilePayloadsEqual detects cohort changes', () => {
    const left = buildProfileApiPayload({ name: 'Jane' }, { plan: 'free' });
    const right = buildProfileApiPayload({ name: 'Jane' }, { plan: 'paid' });
    expect(profilePayloadsEqual(left, right)).toBe(false);
  });

  it('buildProfileApiPayload omits empty cohorts consistently', () => {
    const withEmpty = buildProfileApiPayload({ name: 'Jane' }, {});
    const withoutCohorts = buildProfileApiPayload({ name: 'Jane' }, {});
    expect(withEmpty).toEqual({ name: 'Jane' });
    expect(profilePayloadsEqual(withEmpty, withoutCohorts)).toBe(true);
    expect(stableStringify(withEmpty)).not.toContain('cohorts');
  });

  it('prepareProfileUpdatePayload never sends devices (name update must not replace linked devices)', () => {
    const last = buildProfileApiPayload({ name: 'Jane Doe' }, {});
    const desired = buildProfileApiPayload(
      {
        name: 'Jane Smith',
        devices: [{ id: 'only-this-phone' }],
      },
      {}
    );
    expect(prepareProfileUpdatePayload(desired, last)).toEqual({
      name: 'Jane Smith',
    });
    expect(prepareProfileUpdatePayload(desired, null).devices).toBeUndefined();
  });

  it('prepareProfileUpdatePayload omits unchanged phones on follow-up updates', () => {
    const last = buildProfileApiPayload(
      {
        name: 'Jane Doe',
        phones: ['+919876543210'],
        _h1_ajejik_h2_: 'static',
      },
      {}
    );
    const desired = buildProfileApiPayload(
      {
        name: 'Jane Smith',
        phones: ['+919876543210'],
        _h1_ajejik_h2_: 'static',
      },
      {}
    );

    expect(prepareProfileUpdatePayload(desired, last)).toEqual({
      name: 'Jane Smith',
      additionalInfo: { _h1_ajejik_h2_: 'static' },
    });
  });

  it('prepareProfileUpdatePayload keeps phones when last snapshot stored phone in additionalInfo', () => {
    const last: ReturnType<typeof buildProfileApiPayload> = {
      additionalInfo: {
        name: 'Jane Doe',
        phone: '+919876543210',
        _h1_ajejik_h2_: 'static',
      },
    };
    const desired = buildProfileApiPayload(
      {
        name: 'Jane Smith',
        phone: '+919876543210',
        _h1_ajejik_h2_: 'static',
      },
      {}
    );

    expect(lastSnapshotStoresPhoneInAdditionalInfo(last)).toBe(true);
    expect(prepareProfileUpdatePayload(desired, last)).toEqual({
      name: 'Jane Smith',
      phones: [{ phone: '+919876543210' }],
      additionalInfo: { _h1_ajejik_h2_: 'static' },
    });
  });

  it('buildProfileApiPayload accepts mobile alias for phones', () => {
    expect(buildProfileApiPayload({ mobile: '+919876543210' }, {})).toEqual({
      phones: [{ phone: '+919876543210' }],
    });
  });

  it('isProfileUpdatePayloadEmpty when unchanged phone was the only outbound field', () => {
    const last = buildProfileApiPayload(
      { phones: ['+919876543210'], city: 'Mumbai' },
      {}
    );
    const desired = buildProfileApiPayload({ phones: ['+919876543210'] }, {});
    expect(
      isProfileUpdatePayloadEmpty(prepareProfileUpdatePayload(desired, last))
    ).toBe(true);
  });

  it('profilePayloadsEqual detects additionalInfo changes', () => {
    const left = buildProfileApiPayload(
      { expiry_date: '2030-01-01T00:00:00.000Z' },
      {}
    );
    const right = buildProfileApiPayload(
      { expiry_date: '2031-01-01T00:00:00.000Z' },
      {}
    );
    expect(profilePayloadsEqual(left, right)).toBe(false);
  });

  it('canonicalizeProfileSnapshot lifts legacy identity fields', () => {
    const legacy: ReturnType<typeof buildProfileApiPayload> = {
      additionalInfo: {
        name: 'Jane Doe',
        phones: ['+919876543210'],
        city: 'Mumbai',
        _h1_ajejik_h2_: 'static',
      },
    };
    expect(canonicalizeProfileSnapshot(legacy)).toEqual({
      name: 'Jane Doe',
      phones: [{ phone: '+919876543210' }],
      additionalInfo: {
        city: 'Mumbai',
        _h1_ajejik_h2_: 'static',
      },
    });
  });

  it('profilePayloadsEqual treats legacy snapshot as equal to canonical desired', () => {
    const legacy: ReturnType<typeof buildProfileApiPayload> = {
      additionalInfo: {
        name: 'Jane',
        phones: ['+919876543210'],
        _h1_ajejik_h2_: 'static',
      },
    };
    const desired = buildProfileApiPayload(
      {
        name: 'Jane',
        phones: ['+919876543210'],
        _h1_ajejik_h2_: 'static',
      },
      {}
    );
    expect(profilePayloadsEqual(legacy, desired)).toBe(true);
  });

  it('canonicalizeProfileSnapshot is a no-op for canonical payloads', () => {
    const canonical = buildProfileApiPayload(
      { name: 'Jane', city: 'Mumbai' },
      { plan: 'free' }
    );
    expect(canonicalizeProfileSnapshot(canonical)).toBe(canonical);
  });

  it('buildProfileApiPayload uses string name and alt_emails (docs contract)', () => {
    expect(
      buildProfileApiPayload(
        {
          name: 'testttttttt',
          emails: ['tghiufdgu@gmail.com', 'sdfhgshb@gmail.com'],
          phones: [{ phone: '564874864687' }],
        },
        {}
      )
    ).toEqual({
      name: 'testttttttt',
      phones: [{ phone: '564874864687' }],
      emails: [{ email: 'tghiufdgu@gmail.com' }],
      additionalInfo: {
        alt_emails: [{ email: 'sdfhgshb@gmail.com' }],
      },
    });
  });

  it('buildProfileApiPayload maps scalar email and alt_emails under additionalInfo', () => {
    const payload = buildProfileApiPayload(
      {
        name: 'testttttttt',
        email: 'tghiufdgu@gmail.com',
        phone: '564874864687',
        alt_emails: [{ email: 'sdfhgshb@gmail.com' }],
      },
      {}
    );
    expect(payload).toEqual({
      name: 'testttttttt',
      phones: [{ phone: '564874864687' }],
      additionalInfo: {
        email: 'tghiufdgu@gmail.com',
        alt_emails: [{ email: 'sdfhgshb@gmail.com' }],
      },
    });
    expect(payload).not.toHaveProperty('source');
    expect(payload.emails).toBeUndefined();
    expect(payload.additionalInfo).not.toHaveProperty('phone');
  });

  it('buildProfileApiPayload passes through source only when the caller set it', () => {
    expect(
      buildProfileApiPayload(
        { name: 'Jane', source: 'ADMIN' },
        {}
      )
    ).toEqual({
      name: 'Jane',
      source: 'ADMIN',
    });
  });

  it('prepareProfileUpdatePayload still sends phones when last snapshot omitted them after strip', () => {
    // After duplicate-phone strip we save requestPayload without phones.
    // A later identity sync with phones must not be treated as unchanged.
    const last = buildProfileApiPayload(
      { name: 'Lion King', email: 'lion@example.com' },
      {}
    );
    const desired = buildProfileApiPayload(
      {
        name: 'Lion King',
        email: 'lion@example.com',
        phones: ['+919876543210'],
      },
      {}
    );
    expect(prepareProfileUpdatePayload(desired, last)).toEqual(
      expect.objectContaining({
        phones: [{ phone: '+919876543210' }],
      })
    );
  });

  it('canonicalizeProfileSnapshot lifts { formattedName } object to string name', () => {
    const stored = {
      name: { formattedName: 'Jane' },
      emails: [{ email: 'jane@example.com' }],
    } as unknown as Parameters<typeof canonicalizeProfileSnapshot>[0];
    expect(canonicalizeProfileSnapshot(stored)).toEqual({
      name: 'Jane',
      emails: [{ email: 'jane@example.com' }],
    });
  });
});
