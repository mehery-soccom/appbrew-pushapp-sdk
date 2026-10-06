# Mehery profile sim log excerpt (Task 5)

Simulator: iPhone 17 Pro · App 1.3.0 · Metro: `.superpowers/sdd/metro-task5.log`

PII redacted: email domain kept; local-part truncated; user id shown.

## Gates

| Gate | Result | Evidence (redacted) |
|------|--------|---------------------|
| SDK ready | PASS | `[Mehery] SDK ready — safe to login` |
| Guest register | PASS | `[Mehery][linkGate] guest registration confirmed` |
| Link OK | PASS | `[Mehery][linkGate] UserLoggedIn confirmed` + `[MeheryTracker] OnUserLogin ok for 3091…58141` + `/device/link` `linked: true` |
| Profile push | PASS | `[MeheryTracker] updateUserProfile ok` · HTTP 200 · `skipped: false` |
| Payload shape | PASS | PUT body has `additionalInfo.email` only — **no** top-level `emails` |

## PUT body (redacted)

```json
{
  "name": "Neilsa Carnac",
  "additionalInfo": {
    "email": "n***@gmail.com"
  }
}
```

No do-not-ship failure lines (`OnUserLogin still failed`, guest not confirmed, profile 5xx on emails).

## Verdict

**PASS** — TestFlight (Task 6) allowed.
