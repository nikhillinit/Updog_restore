---
status: REFERENCE
audience: agents
last_updated: 2026-06-23
owner: 'Platform / GP Modeling'
review_cadence: P365D
---

# Debate Synthesis: v3.3 Trust-First Milestones

**Date:** 2026-06-23 **Comparators:** Kimi (hermes-2026-06-23T09-10-46-409Z),
Codex (hermes-2026-06-23T09-10-54-575Z), Claude (local Plan agent) **Verdict:**
Request changes before implementation

---

## Amendments Required Before Implementation

### A1. BLOCKING: Add `/api/portfolio-companies` to H0/H1 scope

**Source:** Codex (grounded in `server/routes/portfolio-companies.ts:44`,
`server/storage.ts:558`)

The list route returns ALL companies when no `fundId` query param is provided.
This is a live cross-fund data leak. Add to H0/H1:

- Negative security test: `GET /api/portfolio-companies` without `fundId` must
  return 400 or empty-scoped results, not all companies across all funds.
- Fund-scope enforcement on list and detail endpoints.

### A2. BLOCKING: Specify per-company investment aggregation rule

**Source:** All three lanes (Kimi, Codex, Claude)

`shared/schema/portfolio.ts:144-146` defines `many(investments)` per
`portfolioCompanies`. Section 9.1 must add:

```
For each portfolioCompanies row, the adapter loads ALL investments rows for that
company within the fund. The oldest investments row (by investmentDate) is the
parent for initial-round reconciliation. All rounds across all investment rows
for that company contribute to the follow-on sum. If multiple investments rows
have rounds that qualify as initial (per section 9.3 tolerance), emit
ROLE_CLASSIFICATION_AMBIGUOUS per section 9.3.1 and degrade that company to
mapped_amount_only.
```

### A3. Correct flag enforcement claims (sections 2.1 and 7)

**Source:** All three lanes

Replace the current claim with:

```
enable_portfolio_intelligence is enforced by server/config/features.ts:19 reading
process.env['ENABLE_PORTFOLIO_INTELLIGENCE'] and server/routes.ts:168
conditionally mounting the route. It is registered in flags/registry.yaml but
route enforcement reads the env var directly, not through the generated flag
consumer path. client/src/app/route-control-flags.ts does not include it.
```

Add H2 acceptance criterion: unify flag enforcement so the registry.yaml
consumer is the single enforcement point, or document the intentional dual path.

### A4. Resolve parallel flag registry

**Source:** Kimi + Claude

`shared/feature-flags/flag-definitions.ts:258-266` duplicates
`enable_investment_rounds` outside `flags/registry.yaml`. The client resolves
flags via `flag-definitions.ts` (`ALL_FLAGS`), not the generated file.

Add H2 acceptance criterion: retire `shared/feature-flags/flag-definitions.ts`
or make it the generated output of `flags:generate`.

### A5. Merge H5 + H4a into a single PR

**Source:** All three lanes

The `ProvenanceEnvelopeV1` has no consumer until H4a's `RoundsToModelResponse`
uses it. Building the envelope alongside its first consumer avoids speculative
API design, enables unit testing via H4a's golden fixtures, and reduces PR
count.

### A6. Merge H4b + H6 into a single PR

**Source:** All three lanes

Shadow mode is only meaningful with a canonical route to serve it. Delivering
`/fund-model-results/:fundId/moic-analysis` in the same PR as the shadow
controller gives end-to-end testability.

### A7. Parallelize H2 and H3

**Source:** All three lanes

Route policy MVP (H2) and investment-round readiness (H3) touch different file
sets. Zero overlap. Both can land independently after H0/H1.

### A8. Defer H7a/H7b to a separate LP-export phase

**Source:** All three lanes

Remove H7a, H7b, `lp_export_audit` (section 8.5), signed envelopes, HMAC,
watermarking from this plan. Move to a separate plan document referenced from
H9's decision packet. Reduces PR count from 11 to 8 and aligns scope with the
stated "one trustworthy MOIC vertical" goal.

### A9. Shrink `fund_calculation_modes` to one calc key

**Source:** All three lanes

Change section 7's SQL CHECK to: `CHECK (calc_key IN ('moic_consumes_rounds'))`

Add reserve and forecast keys in the H9 decision packet migration.

### A10. Add `> 0` CHECK on `investment_rounds.investment_amount`

**Source:** Kimi + Claude

`shared/schema/investment-rounds.ts:47` has no positivity constraint. The
tolerance math in section 9.3 breaks on zero. Add to H3:

```sql
ALTER TABLE investment_rounds
  ADD CONSTRAINT investment_rounds_amount_positive
  CHECK (investment_amount > 0);
```

### A11. Define `diff_summary` JSON schema and hash algorithm

**Source:** Kimi + Claude

Add to H4b specification:

```ts
interface ReconciliationDiffSummary {
  perCompany: Array<{
    companyId: number;
    legacyMoic: string; // Decimal string
    candidateMoic: string; // Decimal string
    deltaAbs: string; // Decimal string
  }>;
  aggregateDeltaAbs: string;
  companiesChanged: number;
  companiesUnchanged: number;
}
```

`legacy_hash` and `candidate_hash` use `canonicalSha256` from
`shared/lib/canonical-hash` (already used by `investment-round-service.ts:6`).

### A12. Specify date-type handling in reconciliation

**Source:** Kimi

`investment_rounds.roundDate` is `date`; `investments.investmentDate` is
`timestamp`. Section 9.3's `daysBetween` must:

- Treat `date` as midnight UTC
- Compare in UTC (repo convention)
- Document this in the adapter's JSDoc

### A13. Define supersede-after-acceptance behavior

**Source:** Kimi

Add to section 7 or H4b: "If a round used in an accepted reconciliation is
superseded, the shadow residency clock resets for that fund. The accepted
reconciliation remains historical but is no longer valid for cutover gate
evaluation."

### A14. Add `base_currency` rollback safety criteria

**Source:** Kimi + Claude

Section 8.1 rollback (`DROP COLUMN`) is safe only while
`SELECT count(*) FROM funds WHERE base_currency != 'USD'` returns zero. Add a
pre-rollback query and a backfill validation step to H3.

### A15. Inventory client-derived math in H0/H1

**Source:** Codex

`client/src/components/portfolio/tabs/OverviewTab.tsx:94,234,303` computes
per-company MOIC, average MOIC, and return percent client-side. The
`no-client-derived-math` guardrail scope (section 11) must inventory these
existing violations and either:

- Add them to a known-violations allowlist (with a follow-up to move to server)
- Fix them as part of H4a (evidence contract makes server MOIC the authority)

### A16. Correct `StaticTemplateProvenance` characterization

**Source:** Claude

Section 2.1's claim that "quarantined or prototype-blocked requires
quarantineReason" is imprecise. `static_template`
(`portfolio-prototype-block.ts:28-36`) has `quarantineReason?: never` and
`actionability: 'non_actionable'`. It is non-actionable but NOT quarantined. The
invariant is:

- `quarantineReason` required when `actionability === 'quarantined'` OR
  `sourceKind === 'prototype_blocked'`
- `static_template` with `non_actionable` passes validation WITHOUT
  `quarantineReason`

### A17. Handle degenerate edge cases

**Source:** Claude

Add to H4a/H4b specification:

- **Empty fund** (zero companies, zero rounds): produce valid
  `RoundsToModelResponse` with `trustState: 'LIVE'`, empty mappings, zero
  coverage counts. Currency rule must not block on an empty set.
- **Mode without rounds**: if `moic_consumes_rounds = 'shadow'` but the fund has
  zero rounds, shadow controller produces identical legacy/candidate (no diff
  row) or skips reconciliation entirely.

### A18. Add a spike milestone before H4a (renamed H5+H4a)

**Source:** All three lanes (Kimi explicit, others implicit)

A one-day prototype of the three-hop query with sample round data against real
Postgres will surface the multiple-investments-per-company issue and validate
Decimal.js arithmetic before contracts are finalized.

### A19. Placeholder sections must be filled

**Source:** Codex

Sections 11 (testing), 12 (observability), 13 (rollback), and 15 (acceptance
criteria) were truncated/summarized in the plan file. The full v3.3 spec must
include the complete text from the user's original, not abbreviated versions.
Verify all 21 acceptance criteria are enumerated.

---

## Revised PR Sequence (8 PRs)

| PR   | Milestone | Scope                                                                                         |
| ---- | --------- | --------------------------------------------------------------------------------------------- |
| PR-A | H0/H1     | Trust audit + portfolio-companies scope fix + client-math inventory + #910 501 assertions     |
| PR-B | H2        | Route-policy overlay + verifier + flag registry unification + CODEOWNERS                      |
| PR-C | H3        | Same-fund supersede + base_currency + amount positivity CHECK + concurrency tests             |
| PR-D | H5+H4a    | Envelope + evidence contract + three-hop adapter + golden fixtures + no-client-math guardrail |
| PR-E | H4b+H6    | Shadow controller + reconciliation_runs + fund_calculation_modes + canonical MOIC route       |
| PR-F | H8        | Docs + closeout packets for the MOIC vertical                                                 |
| PR-G | H9        | Reserve/forecast decision packet (includes LP-export readiness assessment)                    |
| PR-H | --        | (Future) LP role/export phase if H9 approves                                                  |

H2 (PR-B) and H3 (PR-C) can land in parallel after PR-A.

---

## Decision Required

1. **Accept the 8-PR scope reduction?** Deferring H7a/H7b to a separate phase.
2. **Accept the spike before PR-D?** One-day three-hop query validation.
3. **H0/H1 scope expansion:** add portfolio-companies fund-scope + client-math
   inventory?
