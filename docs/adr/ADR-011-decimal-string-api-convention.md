---
status: ACTIVE
last_updated: 2026-05-08
---

# ADR-011: Decimal-String API Convention for Money Fields

**Date:** 2026-05-08 **Status:** Accepted **Decision Makers:** LP Reporting
Phase 0 working group **Tags:** #money #precision #api-contract #lp-reporting
#decimal

**Related:**
[ADR-010 (XIRR Day-Count and Bounds)](./ADR-010-xirr-day-count-and-bounds.md),
[ADR-005 (XIRR Excel Parity)](./ADR-005-xirr-excel-parity.md)

---

## Context

Across the repository today, money values are represented inconsistently:

- `shared/schema-lp-reporting.ts` already uses `commitment_amount_cents`
  (`bigint`) on `lp_fund_commitments` and related tables, following the
  pre-LP-Reporting cents convention.
- The new LP Reporting tables (vehicles, cash_flow_events, valuation_marks,
  evidence_records, lp_metric_runs, narrative_runs, etc., introduced in Phase
  0.2) use `NUMERIC(20,6)` per the LP Reporting design section 5.
- Internal calculation code uses `Decimal.js` via `shared/lib/decimal-config.ts`
  (precision 28, ROUND_HALF_UP) and `shared/lib/decimal-utils.ts` for parsing,
  arithmetic, and equality.
- Wire formats vary: some routes return JS numbers, some return strings, some
  return cents-bigint-as-string.

Phase 0.3 of LP Reporting introduces 4 Zod contracts (cash-flow-event,
valuation-mark, evidence-record, lp-metric-run). Phase 0.5 enforces a "zero
JS-number money fields in new contracts" rule via grep gate. That rule needs a
single ADR to point at; otherwise contributors have no documented standard to
reference, and the gate is a magic rule.

This ADR locks the convention going forward and grandfathers existing modules
that use the cents-bigint pattern. No retroactive refactor is required by this
ADR alone; pre-existing modules MAY refactor in separate runs.

---

## Decision

### Layer rules

| Layer                      | Money representation                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Database**               | `NUMERIC(20,6)` columns. Never `double precision`, never cents-as-`bigint` for new LP Reporting tables. |
| **Backend calculations**   | `Decimal.js` via `shared/lib/decimal-config.ts`. Helpers in `shared/lib/decimal-utils.ts`.              |
| **API request / response** | Decimal string (e.g. `"1250000.000000"`). Never JS `number` for money fields.                           |
| **Frontend**               | String input + display formatting. No authoritative calculations in UI.                                 |
| **Rounding**               | Display/export boundary only. Currency 2 decimals; ratios 4 decimals internal, 2 in LP export.          |

### Zod contract enforcement (Phase 0.3+)

All new LP Reporting Zod contracts use `DecimalStringSchema`, defined as:

```typescript
const DecimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/);
type DecimalString = z.infer<typeof DecimalStringSchema>;
```

Money-typed fields in any contract under `shared/contracts/lp-reporting/` use
`DecimalStringSchema` (or a `MoneyString` alias). The Phase 0.5 verifier
enforces this with a grep:

```bash
grep -RnE "z\.number\(\)" shared/contracts/lp-reporting/
```

Any match in a money-named field (`amount`, `total`, `commitment`, `nav`,
`distribution`, `contribution`, `value`, `cost`, etc.) fails the gate.

### Grandfathering

The following pre-existing patterns are grandfathered for the tables on which
they currently appear, and are **not** required to migrate to `NUMERIC(20,6)` by
this ADR:

- `limited_partners.commitment_amount_cents` (`bigint`, cents)
- `lp_fund_commitments.commitment_amount_cents` (`bigint`, cents)
- `capital_activities.amount_cents` (`bigint`, cents)
- Any other column already in `shared/schema-lp-reporting.ts` or
  `shared/schema.ts` that uses the cents-bigint pattern at the date of this ADR

Grandfathered modules MAY refactor to `NUMERIC(20,6)` in a separate project.
They MUST refactor before any LP Reporting metric run consumes their values
directly with `Decimal.js` arithmetic, to avoid mixing units.

### What this ADR does not change

- ADR-005 / ADR-010: XIRR day-count, bounds, and Excel parity policy.
- The cents-bigint convention on grandfathered tables.
- Existing API responses that already use JS numbers for non-money fields
  (counts, percentages as ratios, IDs).

---

## Consequences

### Positive

- A single grep gate enforces the rule going forward; no policy debate per PR.
- The Phase 0.3 contracts have a documented standard to cite in JSDoc and code
  review.
- Frontend developers receive strings and never accidentally do authoritative
  arithmetic in JavaScript on a money field.

### Negative

- The wire format is more verbose than JS numbers (a string is larger than the
  same number in JSON).
- TypeScript's structural typing does not enforce "string-shaped like decimal";
  the Zod schema is the runtime guard. Compile-time discipline relies on the
  `DecimalString` type alias and code review.
- Mixing grandfathered cents-bigint and new `NUMERIC(20,6)` rows in a single
  metric run requires explicit conversion. The Phase 1 metric engine handles the
  conversion; this ADR documents the obligation.

---

## Code references

- `shared/lib/decimal-config.ts` (canonical Decimal.js init)
- `shared/lib/decimal-utils.ts` (parse, add, multiply, equality, rounding)
- `shared/schema-lp-reporting.ts` (grandfathered cents columns)
- `shared/schema/lp-reporting-evidence.ts` (Phase 0.2, NEW — `NUMERIC(20,6)`
  throughout)
- `shared/contracts/lp-reporting/` (Phase 0.3, NEW — `DecimalStringSchema`
  throughout)
- `docs/financial-precision.md` (existing precision policy)

---

## Verification

The Phase 0.5 integration verifier asserts:

1. `git diff --stat` for `shared/schema/lp-reporting-evidence.ts` shows no
   `decimal('...', { precision, scale })` with `scale < 6` or `precision < 20`.
   All money columns are `NUMERIC(20,6)`.
2. `grep -RnE "z\.number\(\)" shared/contracts/lp-reporting/` returns no matches
   in money-named fields.
3. `grep -RnE "(amount|total|commitment|nav|distribution|contribution| value|cost):\s*number" shared/contracts/lp-reporting/`
   returns no matches.
4. The contract tests round-trip a representative `DecimalString` value without
   numeric coercion.

---

## Changelog

| Date       | Change                                                        |
| ---------- | ------------------------------------------------------------- |
| 2026-05-08 | Initial ADR — locks decimal-string-at-API-boundary convention |
