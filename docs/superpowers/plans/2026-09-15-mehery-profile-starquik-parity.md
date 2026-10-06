# Mehery Profile + Link Starquik Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make APP Brew Mehery device linking and profile PUT behave like the working Starquik host, verify on iOS Simulator via Metro logs, then ship build **1.3.0 (13)** to TestFlight.

**Architecture:** Align host `buildMeheryProfileInfo` + vendor `buildProfileApiPayload` with Starquik’s contract (email in `additionalInfo`, never top-level `emails`; flat `name`/`phones`). Harden `MeheryTracker` login with Starquik’s guest-register wait → `OnUserLogin` → `UserLoggedIn` poll → one full guest reset retry before profile PUT. Keep existing call sites (`identityListeners`, OTP, `startMehery`). Then simulator smoke with log gates, then archive/upload.

**Tech Stack:** React Native (natori), vendored `react-native-mehery-event-sender`, AsyncStorage, xcodebuild + App Store Connect (`ExportOptions.plist`).

## Global Constraints

- Source of truth = Starquik host at `/Users/neil/Desktop/trent/STARQUIK/Starquik/src/services/mehery.ts` + its SDK `profileSnapshotCompare.ts` comment: *pushapp backend throws on top-level emails add*.
- Do **not** edit `Desktop/msdk/react-native-mehery-event-sender/**` (read-only). Edit only `vendor/react-native-mehery-event-sender/**` and `src/mehery/**`.
- Host must **omit** `source` on profile PUT.
- Prefer workspace path without spaces when running xcodebuild: `/Users/neil/Desktop/APP-Brew` symlink if present; else quote `/Users/neil/Desktop/APP Brew`.
- Next TestFlight build number: **13** (current `CURRENT_PROJECT_VERSION = 12`, marketing `1.3.0`).
- Do not commit `.env` or secrets.
- Only commit when the user explicitly asks (plan steps may stage locally; skip git commit unless user requests).

---

## Root cause (locked)

| Area | Starquik (working) | APP Brew (broken) |
|------|--------------------|-------------------|
| Profile email | scalar `email` → wire `additionalInfo.email` | `emails: [{ email }]` top-level (PushApp can 500 / reject) |
| Name / phones | flat `name: string`, `phones: [string]` | `{ formattedName }`, `phones: [{ phone }]` (SDK can normalize phones; email path is the bug) |
| Link gate | wait guest `isRegistered` + `registered_user_id`, clear `user_id`, then `OnUserLogin`, poll `UserLoggedIn`, reset+retry once | `OnUserLogin` immediately; profile skipped if login fails; weaker guest wait |
| When | Home focus after auth | login / OTP / startMehery / store idle — **keep these triggers**, harden the link path inside them |

Symptom confirmed by user: **both** stale/missing profile fields **and** device not linking.

```mermaid
sequenceDiagram
  participant Host as MeheryTracker
  participant AS as AsyncStorage
  participant SDK as Mehery SDK
  participant API as PushApp API

  Host->>AS: clear user_id; poll isRegistered + registered_user_id
  Host->>SDK: OnUserLogin(userId)
  SDK->>API: POST /device/link
  Host->>AS: poll UserLoggedIn == true
  alt link incomplete
    Host->>AS: reset guest + drop device_id
    Host->>SDK: OnUserLogin retry once
  end
  Host->>SDK: updateUserProfile flat payload
  Note over SDK,API: PUT body: name, phones[], additionalInfo.email (NO top-level emails)
```

---

### Task 1: Vendor — keep email in `additionalInfo` (Starquik SDK contract)

**Files:**
- Modify: `vendor/react-native-mehery-event-sender/src/utils/profileSnapshotCompare.ts`
- Modify: `vendor/react-native-mehery-event-sender/src/__tests__/profileSnapshot.test.ts`
- Modify: `vendor/react-native-mehery-event-sender/src/events/custom/ProfileUpdate.tsx` (comments only if they claim top-level emails are required)

**Interfaces:**
- Consumes: flat `updateUserProfile(info)` from host
- Produces: `buildProfileApiPayload(info, cohorts)` → PUT body with `additionalInfo.email`, **no** top-level `emails` unless caller explicitly passes `info.emails` array (host will not)

- [ ] **Step 1: Write / update failing tests**

In `profileSnapshot.test.ts`, replace/add cases so Starquik flat shape wins:

```ts
it('scalar email stays in additionalInfo (pushapp 500s on top-level emails)', () => {
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
    name: { formattedName: 'Jane Doe' }, // or string if normalizeName removed — match implementation choice below
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
```

Remove or invert existing tests that assert scalar `email` → top-level `emails` and that forbid `additionalInfo.email`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd "/Users/neil/Desktop/APP Brew/vendor/react-native-mehery-event-sender"
pnpm test -- src/__tests__/profileSnapshot.test.ts
```

Expected: FAIL on new assertions (current code lifts email to top-level).

- [ ] **Step 3: Implement Starquik-aligned `buildProfileApiPayload`**

In `profileSnapshotCompare.ts`:

1. Remove `'email'` from `RESERVED_INFO_KEYS` (keep `'emails'` reserved so an explicit array still maps top-level if ever passed — host will not pass it).
2. Stop calling `splitPrimaryAndAltEmails(normalizeEmails(info.emails ?? info.email), …)` for the scalar path. Only set `payload.emails` when `Array.isArray(info.emails) && info.emails.length`.
3. Let scalar `email` fall through the non-reserved loop into `additionalInfo`.
4. Keep `normalizeName` → `{ formattedName }` (Starquik sends string; object name is fine on the wire).
5. Keep phone normalization to `[{ phone }]`.
6. Update `canonicalizeProfileSnapshot` / `stripIdentityKeysFromAdditionalInfo` so they **do not** lift `additionalInfo.email` to top-level `emails` (Starquik leaves email in additionalInfo). Prefer: stop migrating email out of additionalInfo; phone may stay top-level.

Minimal `buildProfileApiPayload` email section:

```ts
// Only explicit emails[] becomes top-level. Scalar email → additionalInfo
// (pushapp throws on top-level emails add — Starquik SDK contract).
if (Array.isArray(info.emails) && info.emails.length) {
  payload.emails = info.emails as ProfileEmail[];
}

for (const [key, value] of Object.entries(info)) {
  if (RESERVED_INFO_KEYS.has(key)) continue;
  additionalInfo[key] = value;
}
```

- [ ] **Step 4: Re-run tests — expect PASS**

```bash
cd "/Users/neil/Desktop/APP Brew/vendor/react-native-mehery-event-sender"
pnpm test -- src/__tests__/profileSnapshot.test.ts
```

Expected: PASS.

---

### Task 2: Host — Starquik flat profile builder + phone-omit retry

**Files:**
- Modify: `src/mehery/MeheryTracker.ts` (`buildMeheryProfileInfo`, `pushUserProfile`)
- Modify: `.cursor/rules/mehery-pushapp-profile.mdc` (align docs with Starquik truth)
- Modify: `.cursor/skills/mehery-pushapp-integration/SKILL.md` + `reference.md` profile bullet (same)

**Interfaces:**
- Consumes: Shopify/customer `user` object (`firstName`, `lastName`, `email`, `phone` / `phoneNumber` / `mobile`)
- Produces: flat info for SDK:

```ts
{
  name?: string
  phones?: string[]
  email?: string
}
```

- [ ] **Step 1: Change `buildMeheryProfileInfo` to Starquik flat shape**

Replace current emails/`formattedName` builder with:

```ts
export function buildMeheryProfileInfo(user: any): Record<string, unknown> {
  const info: Record<string, unknown> = {}

  const fromParts = [user?.firstName, user?.lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ')
    .trim()
  const fromString = typeof user?.name === 'string' ? user.name.trim() : ''
  const fromObject =
    user?.name &&
    typeof user.name === 'object' &&
    typeof user.name.formattedName === 'string'
      ? user.name.formattedName.trim()
      : ''
  const name = fromParts || fromString || fromObject
  if (name) info.name = name

  const phone = user?.phone ?? user?.phoneNumber ?? user?.mobile
  if (phone) info.phones = [String(phone)]

  const email =
    typeof user?.email === 'string' && user.email.trim()
      ? user.email.trim()
      : null
  if (email) info.email = email

  return info
}
```

Do **not** set `info.emails` or `info.alt_emails`.

- [ ] **Step 2: In `pushUserProfile`, retry once without phones on “phone already exists”**

Mirror Starquik `isMeheryPhoneAlreadyExistsError` + omit phones and re-call `updateUserProfile`. Keep existing force-retry for in-progress / login-wait skips.

- [ ] **Step 3: Update profile rule + skill text**

Canonical example becomes:

```json
{
  "name": { "formattedName": "Jane Doe" },
  "phones": [{ "phone": "+919876543210" }],
  "additionalInfo": {
    "email": "jane@example.com"
  }
}
```

State explicitly: host sends flat `{ name, phones, email }`; never top-level `emails` from mobile; omit `source`.

---

### Task 3: Host — Starquik link sequence inside `MeheryTracker`

**Files:**
- Modify: `src/mehery/MeheryTracker.ts`
- Create: `src/mehery/linkGate.ts` (guest wait + UserLoggedIn poll + reset helpers — keep tracker thin)
- Keep: `src/mehery/deviceLinkRepair.ts` for poisoned-link recovery (call after Starquik-style reset fails or on MD5/poison errors)

**Interfaces:**
- `ensureGuestRegisteredBeforeLogin(): Promise<boolean>` — clear `user_id`, poll `isRegistered==='true'` and non-empty `registered_user_id` (~8–10s, 250ms poll like Starquik)
- `waitForUserLoggedIn(timeoutMs?: number): Promise<boolean>`
- `resetGuestRegistrationState(): Promise<void>` — clear login/guest keys Starquik clears; drop `device_id`; do not clear unrelated app storage

- [ ] **Step 1: Add `linkGate.ts` with Starquik-equivalent helpers**

Port logic from Starquik `ensureMeheryGuestRegistered` / `waitForMeheryLinkCompleted` / `resetMeheryGuestRegistrationState` (read current constants from Starquik `mehery.ts` near those functions). Use `@react-native-async-storage/async-storage`.

- [ ] **Step 2: Wire into `runPendingUserLogin` before first `OnUserLogin`**

When `!alreadyLinked`:

1. `await ensureGuestRegisteredBeforeLogin()` — if false, log warn and treat as login failure (no profile PUT).
2. `result = await sdk.OnUserLogin(userId)`
3. `linked = await waitForUserLoggedIn()` — if false, `resetGuestRegistrationState()`, re-bootstrap SDK if needed (`ensureSdkReady` / existing bootstrap), retry `OnUserLogin` **once**, poll again.
4. On poison/MD5 errors, keep existing `recoverFromFailedDeviceLink` then one more login attempt.
5. Only if link verified (`UserLoggedIn` or process `linkedUserId` after confirmed success) call `buildMeheryProfileInfo` + `pushUserProfile`.

Do **not** set `this.linkedUserId = userId` until link is verified (or SDK returned success **and** `UserLoggedIn`).

- [ ] **Step 3: Keep call sites unchanged**

`identityListeners`, `useOtpVerification`, `startMehery` continue to call `setUserDetails` only — no HomeScreen requirement for APP Brew.

---

### Task 4: Unit / host tests for builder + link gate (lightweight)

**Files:**
- Create: `src/mehery/__tests__/buildMeheryProfileInfo.test.ts` if a Jest path exists for `src/`; otherwise add host-shape assertions next to vendor tests by exporting builder (already exported).
- Create: `src/mehery/__tests__/linkGate.test.ts` with AsyncStorage mocked — or skip if no RN Jest harness; then cover via vendor + manual simulator only.

- [ ] **Step 1: Assert builder output**

```ts
expect(buildMeheryProfileInfo({
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+9198',
})).toEqual({
  name: 'Jane Doe',
  phones: ['+9198'],
  email: 'jane@example.com',
})
expect(result).not.toHaveProperty('emails')
```

- [ ] **Step 2: Run whatever test command the repo uses for `src/` or vendor only**

```bash
cd "/Users/neil/Desktop/APP Brew/vendor/react-native-mehery-event-sender" && pnpm test
```

If host Jest is unavailable, document simulator as the gate for Task 3.

---

### Task 5: iOS Simulator — run app and verify Metro logs

**Files:** none (runtime)

**Log success gates (must all appear for a login session):**

| Gate | Log / signal |
|------|----------------|
| SDK ready | `[Mehery] SDK ready` or bootstrap success |
| Guest register | guest registration confirmed / `isRegistered` path (add a clear `console.log` in `linkGate` if missing) |
| Link OK | `[MeheryTracker] OnUserLogin ok for <userId>` |
| Profile push | `[MeheryTracker]` / SDK profile ok — **not** skipped for empty payload; **not** client 4xx on emails |
| Payload shape | SDK log of PUT body includes `additionalInfo.email` and **does not** include top-level `emails` |

Failure logs that mean do-not-ship: `OnUserLogin still failed`, `guest device registration not confirmed`, profile `Client error 5xx` with emails, or profile never attempted after login.

- [ ] **Step 1: Boot Metro + simulator**

```bash
cd /Users/neil/Desktop/APP-Brew || cd "/Users/neil/Desktop/APP Brew"
pnpm run-ios --simulator="iPhone 16 Pro"
```

If build fails on pods: `pnpm pod-install` then retry. Prefer clean if stale: `pnpm clean-ios`.

- [ ] **Step 2: Fresh-auth smoke**

1. If already logged in: sign out (confirm `OnUserLogOut` / `setUserDetails(undefined)` path).
2. Complete OTP / sign-in with a real test account that has name + email + phone.
3. Capture Metro console from cold start through post-login (~30–60s).

- [ ] **Step 3: Profile-edit smoke (if UI allows)**

Edit name in app profile → save → expect second `updateUserProfile` with new name and **skip `/device/link`** (`Same user already linked — skip /device/link, sync profile`).

- [ ] **Step 4: Persist log excerpt**

Save a short excerpt under `docs/superpowers/plans/2026-09-15-mehery-profile-sim-log-excerpt.md` (redact tokens/PII beyond last-4 phone / email domain) listing which gates passed.

- [ ] **Step 5: Verdict**

Only proceed to TestFlight if all gates pass. If link or profile fails, fix and re-run Task 5 — do not archive.

---

### Task 6: Bump build + archive + upload TestFlight

**Files:**
- Modify: `ios/natori.xcodeproj/project.pbxproj` — all `CURRENT_PROJECT_VERSION = 12` → `13` (keep `MARKETING_VERSION = 1.3.0`)
- Confirm: `ios/natori/Info.plist` uses `$(CURRENT_PROJECT_VERSION)` / marketing vars (or bump `CFBundleVersion` if hardcoded)
- Use: `ios/ExportOptions.plist` (`destination=upload`), team `6CRFUK7DVC`, scheme `natori`, bundle `com.app.appbrew`

- [ ] **Step 1: Bump version to 13**

Update every `CURRENT_PROJECT_VERSION = 12` in `project.pbxproj` to `13` for app + extensions.

- [ ] **Step 2: Archive Release**

```bash
cd /Users/neil/Desktop/APP-Brew || cd "/Users/neil/Desktop/APP Brew"
rm -rf ios/build/natori.xcarchive ios/build/export ios/build/upload-export
mkdir -p ios/build

xcodebuild archive \
  -workspace ios/natori.xcworkspace \
  -scheme natori \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath ios/build/natori.xcarchive \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=6CRFUK7DVC \
  CODE_SIGN_STYLE=Automatic \
  CURRENT_PROJECT_VERSION=13 \
  MARKETING_VERSION=1.3.0
```

Expected: `ARCHIVE SUCCEEDED`.

- [ ] **Step 3: Optional local IPA sanity**

```bash
xcodebuild -exportArchive \
  -archivePath ios/build/natori.xcarchive \
  -exportPath ios/build/export \
  -exportOptionsPlist ios/ExportOptionsLocal.plist \
  -allowProvisioningUpdates
```

Confirm IPA exists under `ios/build/export/`.

- [ ] **Step 4: Upload to App Store Connect / TestFlight**

```bash
xcodebuild -exportArchive \
  -archivePath ios/build/natori.xcarchive \
  -exportPath ios/build/upload-export \
  -exportOptionsPlist ios/ExportOptions.plist \
  -allowProvisioningUpdates
```

Expected: upload succeeds (Apple ID session / Xcode automatic signing must be valid on this Mac). Hermes dSYM UUID warnings are non-blocking if historically accepted.

- [ ] **Step 5: Confirm in App Store Connect**

Open https://appstoreconnect.apple.com/apps → app **Mehery** / `com.app.appbrew` → TestFlight → build **1.3.0 (13)** processing or ready to test. Report the build URL/status to the user.

---

## Self-review

1. **Spec coverage:** both symptoms (link + profile fields) → Tasks 1–3; simulator log proof → Task 5; TestFlight → Task 6; docs/rules corrected → Task 2.
2. **Placeholders:** none; commands and code are concrete.
3. **Types:** flat host `{ name?: string; phones?: string[]; email?: string }` → vendor `additionalInfo.email`; no top-level `emails` from host.

## Out of scope

- Porting Starquik commerce `additionalInfo` fields (`cart_value`, segments, etc.)
- Moving login exclusively to a Home-focus bootstrap (APP Brew has no equivalent; hardened login path is enough)
- Editing `Desktop/msdk/**`
- Android release / Play upload (unless user asks after iOS TF)

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-09-15-mehery-profile-starquik-parity.md`.

**Executing options:**

1. **Subagent-driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline** — implement Tasks 1→6 in this session  

Which do you want?
