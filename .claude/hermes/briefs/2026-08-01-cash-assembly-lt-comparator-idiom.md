# cash-assembly-call-sizing-v1.ts:167 — isNegative() -> lt(0) idiom nit

Frozen spec for this dispatch. No filed issue (carried as a working note from
the WP-L3 session, never formally written up). Do not re-derive scope from
anywhere else.

## Scope

Single file: `shared/lib/internal-economics/cash-assembly-call-sizing-v1.ts`,
function `assertNonNegativeScheduledAmounts` (currently line 167):

```ts
if (value.isNegative()) {
```

Decimal.js's `.isNegative()` and `.lt(0)` are behaviorally equivalent for every
real Decimal value this codebase produces. This is a pure idiom-consistency
change, not a behavior fix.

## Why this is worth doing (idiom precedent already checked)

Module-wide (`shared/lib/internal-economics/`), `.lt(0)` is the dominant
comparator idiom — used in 3 files:

- `cash-assembly-event-stream-v1.ts:102`
- `presentation-rounding-v1.ts:50,64,72,89`
- `cash-assembly-period-loop-v1.ts:476`

`.isNegative()` appears in exactly 1 file (this one, this one call site). Align
it with the dominant local idiom.

## Fix

```ts
if (value.lt(0)) {
```

That is the entire change. Do not touch the error-throwing block, the message
text, the `NEGATIVE_SCHEDULED_AMOUNT_FIELDS` loop, or anything else in the file.

## Tests

This is a behavior-preserving rename of a comparator, not new behavior — do not
add a new test case. Confirm the EXISTING test(s) covering
`assertNonNegativeScheduledAmounts` / `NEGATIVE_SCHEDULED_AMOUNT` still pass
unmodified (grep the test suite for `NEGATIVE_SCHEDULED_AMOUNT` or
`assertNonNegativeScheduledAmounts` to find them first — do not guess the file
name).

## Constraints (non-negotiable)

- Frozen module (Phoenix protected path: `shared/lib/internal-economics/`). This
  dispatch implements the change; it does NOT merge it — a separate
  `phoenix-precision-guardian` specialist review happens after this dispatch
  returns, before any commit/PR.
- Do not touch `shared/lib/finance/xirr.ts` or anything related to issue #1256 —
  that is a separate, already-committed fix on a different branch.
- Single-line change. If you find yourself editing more than the one `if`
  condition, stop and report rather than proceeding.

## Verification (must all pass before returning)

```
TZ=UTC npm run check
npm run lint
TZ=UTC npm run phoenix:truth
```

Phoenix truth cases must show zero drift (frozen-module edit — any movement is a
stop-and-report, not a proceed).
