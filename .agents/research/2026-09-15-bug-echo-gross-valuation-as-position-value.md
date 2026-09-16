# bug-echo Report: gross company valuation used as the fund's position value

**Date:** 2026-09-15 **Pattern source:** inferred from the PR #1522 fix
(`fac5fca18`, `client/src/pages/portfolio-company-summary.tsx`), which replaced
`toNumber(company.currentValuation)` and `currentValue / invested` with the
ownership-adjusted `currentValue` / `moic` from `GET /api/portfolio-overview`.
**Scan tool:** regex (Grep), plus manual reads of every match **Files scanned:**
`client/src/**`, `server/**`, `shared/**` (`*.ts`, `*.tsx`, tests excluded from
candidates) **Pattern validated against pre-fix file:** yes
(`git show fac5fca18~1:client/src/pages/portfolio-company-summary.tsx` line 95
matches `currentValuation`) **Pre-flight:** clean worktree on a branch cut from
`origin/main`; build manifest `package.json` present (no build run by this
skill); output directory `.agents/research/`. **Recon:** 51 raw
`currentValuation` matches in 17 non-test client files (0 previously swept: no
prior `bug-echo:` commits), so the full report shape applies. The high-count
tighten offer could not be put to a user in this autonomous session; every site
was classified instead.

## Pattern

**Anti-pattern:** the company-level `currentValuation` (gross enterprise value,
user-entered mark) is displayed as the fund's current value or divided by
`investmentAmount` / `investedAmount` to produce a MOIC, without scaling by
`ownershipCurrentPct`. **Correct pattern:** position value =
`currentValuation x ownershipCurrentPct` only when ownership is non-null and
greater than zero; a null or a recorded zero ownership keeps the unscaled
`currentValuation` (ADR-054, the `legacy_current_valuation` rung); MOIC =
position value / invested. For UI, read the server-authoritative
`GET /api/portfolio-overview` rows. For engine contracts whose
`currentValuation` already means position value (the reserve engine), pass the
position, not the company valuation. **Search regex:** `currentValuation`
(recon), narrowed by reading each site for a division by invested capital or a
"current value" label.

**Reference implementation (CANON):**
`server/services/portfolio-overview-service.ts:61-66`
(`currentValue = ownership != null && ownership > 0 ? valuation x ownership : valuation; moic = invested <= 0 ? 0 : currentValue / invested`;
a recorded zero ownership is deliberately left unscaled per ADR-054).
`server/services/metrics-aggregator.ts:875-884` and
`server/services/actual-metrics-calculator.ts:182-191` apply the same rule.

## Summary

- BUG findings: 3 (all resolved on `fix/qa-1521-1522-followups`)
- WATCH findings: 2
- OK findings: 12 (grouped below)
- REVIEW findings: 0

## BUG Findings

### Issue Rating Table

| #   | Finding                                                                                                                                                                                                                                                                                                                                                            | Urgency | Risk: Fix | Risk: No Fix | ROI       | Blast Radius     | Fix Effort | Status                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------- | ------------ | --------- | ---------------- | ---------- | ------------------------------- |
| 1   | `client/src/lib/wizard-reserve-bridge.ts:131,141` - synthetic companies enter with `currentValuation = entryStage.valuation` (company round valuation) and `currentMOIC = valuation / check`; the reserve engine reads `currentValuation` as position value, so Expected Portfolio MOIC in the wizard's Capital Allocation step is inflated by about 1 / ownership | HIGH    | Low       | High         | Excellent | 1 file (+1 test) | Small      | Fixed (`b99811404`)             |
| 2   | `client/src/components/portfolio/portfolio-table.tsx:185-190` - `calculateMultiple(currentValuation, investmentAmount)` rendered as MOIC next to "Current Value"; no importer anywhere in the repo                                                                                                                                                                 | LOW     | Low       | Low          | Good      | 1 file           | Trivial    | Fixed by deletion (`eeb1aee20`) |
| 3   | `client/src/utils/export-excel.ts:41-46,68-69` - `formatMultiple(currentValuation, investmentAmount)` in the CSV export; imported only by one utility test                                                                                                                                                                                                         | LOW     | Low       | Low          | Good      | 2 files          | Trivial    | Fixed by deletion (`eeb1aee20`) |

### Detailed findings

**1. Wizard synthetic portfolio passes company valuation as position value**

`client/src/lib/wizard-reserve-bridge.ts:131,141` (at fac5fca18)

```ts
totalInvested: initialCheckSize,
currentValuation: entryStage.valuation,
ownershipPercentage: Math.min(impliedOwnership, 1.0),
...
currentMOIC: entryStage.valuation / initialCheckSize,
```

**Why this is a bug:** `DeterministicReserveEngine.calculateCurrentMOIC` is
`currentValuation / totalInvested` and its parity fixtures carry
`currentMOIC = currentValuation / totalInvested` (5,000,000 / 1,000,000 = 5.0
with 15% ownership), so the engine's `currentValuation` is the fund's position
value. Feeding the round valuation makes every synthetic company start at
roughly `1 / ownership` times cost, and `calculateProjectedMOIC` multiplies that
into `expectedPortfolioMOIC`, which the Capital Allocation step shows with an
"exceeds 5x, verify assumptions" warning. **Suggested fix (applied):** enter at
cost: `currentValuation: initialCheckSize`, `currentMOIC: 1`. Ownership
(`check / roundSize`) is deliberately unchanged; see the prospector report's
review item.

**2. Dead portfolio table with the gross multiple**

`client/src/components/portfolio/portfolio-table.tsx:185-190` -
`{company.currentValuation ? formatCurrency(company.currentValuation) : 'N/A'}`
under "Current Value" and
`calculateMultiple(company.currentValuation, company.investmentAmount)` under
MOIC. No importer in `client/`, `tests/`, docs or the audit matrix. Deleted.

**3. Dead Excel export with the gross multiple**

`client/src/utils/export-excel.ts:41-46` -
`(parseFloat(currentValuation) / parseFloat(investmentAmount)).toFixed(2)`. Only
`tests/unit/utils/wave2-utility-boundaries.test.ts` imported it; that test case
was removed with the file. The live export path
(`client/src/utils/exports/index.ts`) labels the column "Current Valuation" and
computes no multiple.

## WATCH Findings (near-threshold, defensive only)

| #   | Finding                                                                                                                                                                                                                                      | Urgency | Risk: Fix | Risk: No Fix | ROI      | Blast Radius | Fix Effort | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- | ------------ | -------- | ------------ | ---------- | ------ |
| W1  | `client/src/lib/wizard-reserve-bridge.ts:493-517` - `wizardPortfolioToAdapterFormat` sets `exitMultiple` and `targetMoic` to `currentValuation / investedAmount`; only reachable through `calculateReservesForWizard`, which has no importer | LOW     | Low       | Low          | Marginal | 1 file       | Small      | Open   |
| W2  | `client/src/lib/wizard-calculations.ts:125-140` - validation warnings use `currentValuation / investedAmount` as MOIC (">10x unusually high") on wizard inputs whose valuation semantics are undocumented                                    | LOW     | Low       | Low          | Marginal | 1 file       | Small      | Open   |

**Why WATCH not BUG:** W1 is unreachable today (legacy adapter kept "for
backward compatibility"); W2 only shapes warning copy. Both become BUG the
moment a caller passes company valuations. Suggested defensive fix: document
that `WizardPortfolioCompany.currentValuation` is the position value, or delete
the legacy adapter.

## OK Findings (intentional, no action needed)

- `server/services/portfolio-overview-service.ts:61-66` - CANON:
  ownership-scaled position value and MOIC.
- `server/services/metrics-aggregator.ts:875-884` - ownership-scaled NAV
  contribution (`legacy_current_valuation_ownership_scaled`).
- `server/services/actual-metrics-calculator.ts:182-191` - ownership-scaled NAV.
- `client/src/components/dashboard/dual-forecast-dashboard.tsx:394,527-560` -
  gross valuation charted, but labeled "Recorded (unverified) valuation vs
  invested capital" with an evidence rail; not presented as position value.
- `client/src/pages/variance-tracking.tsx:2169` - `currentValuation` shown
  beside `baselineValuation` in a valuation column; no multiple derived.
- `client/src/utils/exports/index.ts:69` - "Current Valuation" column, honest
  label, no multiple.
- `client/src/components/portfolio/SecondaryMarketAnalysis.tsx` -
  `MOCK_POSITIONS` where `currentValuation` is explicitly a position mock.
- `client/src/components/investments/valuation-update-dialog.tsx`,
  `exit-valuation-editor.tsx`, `add-event-dropdown.tsx`,
  `investment-editor.tsx` - company-valuation editors; the value is the
  company's, labeled as such.
- `client/src/lib/wizard-calculations.ts:187`,
  `client/src/lib/excel-parity-validator.ts` - sums of wizard valuations and
  parity fixtures; not user-facing multiples.
- `client/src/types/fund.ts:35`,
  `client/src/components/portfolio/drag-drop-chart-builder.tsx:74` - type and
  column declarations.

## Companion sweeps from the same fix (inline)

### Missing `main` landmark on routes rendered outside `AppLayout` (from the `shared-dashboard.tsx` fix)

Candidates are the routes `PublicEntryRouter` mounts plus the router's own
fallbacks. CANON: `client/src/app/app-router.tsx:210` (session-error screen
already uses `<main>`).

| #   | Finding                                                                                                                                                                                                                                  | Urgency | Risk: Fix | Risk: No Fix | ROI       | Blast Radius | Fix Effort | Status              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- | ------------ | --------- | ------------ | ---------- | ------------------- |
| L1  | `client/src/pages/login.tsx:28` - root `div`, public-only route                                                                                                                                                                          | MEDIUM  | Low       | Medium       | Excellent | 1 file       | Trivial    | Fixed (`054d3cac2`) |
| L2  | `client/src/pages/portal/access-denied.tsx:20` - root `div`, public-only route                                                                                                                                                           | MEDIUM  | Low       | Medium       | Excellent | 1 file       | Trivial    | Fixed (`054d3cac2`) |
| L3  | `client/src/pages/not-found.tsx:8` via `app-router.tsx:180` - root `div` on the public-entry 404; the same component renders inside `AppLayout`'s `<main>` on the authenticated side, so the landmark was added at the public mount only | MEDIUM  | Low       | Medium       | Excellent | 1 file       | Trivial    | Fixed (`054d3cac2`) |

OK: `client/src/app/app-routes.tsx:139-147` `PageLoadingFallback` is a transient
Suspense fallback in both contexts.

### Fund id shown instead of fund name (from the `Fund {company.fundId}` fix)

13 sites render `Fund ${id}`; every one falls back to the id only when the fund
name is unavailable (`currentFund.name` when ids match, `scopedFundName ?? ...`,
`input.fundName?.trim() || ...`). That is the CANON shape; 0 BUG.

### Executed history passed into the forecast engine (from the #1521 `useLiquidityAnalytics.ts:352` filter)

`server/routes/liquidity.ts:117-125` passes body transactions unfiltered into
`generateLiquidityForecast`. The route is mounted in `makeApp`
(`mount-common-routes.ts:90`) but `client/src/hooks/use-liquidity.ts` has no
importer, so nothing live calls it. WATCH; the engine sums whatever it is given
by contract, so the fix belongs at the caller when one appears.

### Ownership fraction displayed without scaling (from the `formatOwnership` fix)

No other client site renders `ownershipCurrentPct`;
`enhanced-investments-table.tsx:762` formats a mock `ownershipPercentage` that
is already a percent. 0 echoes.
