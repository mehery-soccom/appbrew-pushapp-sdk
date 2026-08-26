import {
  buildProfileApiPayload,
  canonicalizeProfileSnapshot,
  isProfileUpdatePayloadEmpty,
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

  it('buildProfileApiPayload maps identity to top-level profile fields', () => {
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

  it('prepareProfileUpdatePayload omits phones from legacy additionalInfo snapshots', () => {
    const last: ReturnType<typeof buildProfileApiPayload> = {
      additionalInfo: {
        name: 'Jane Doe',
        phones: ['+919876543210'],
        _h1_ajejik_h2_: 'static',
      },
    };
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
});
