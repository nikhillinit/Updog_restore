# Convention matrix — LP metrics validation

Comparison contract for cross-checking
`server/services/lp-reporting/metrics-engine.ts`. Any independent derivation
(hand or plugin) must honor these or divergences are noise.

| Quantity                      | Definition (authoritative)                                                                            | Source              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- |
| Money on wire                 | decimal string, 6 dp, NUMERIC(20,6)                                                                   | ADR-011             |
| contributions                 | Σ\|lp_capital_call\| − Σ\|recallable_distribution\|                                                   | metrics-engine.ts   |
| distributions                 | Σ\|lp_distribution\| + Σ\|realized_proceeds\|                                                         | metrics-engine.ts   |
| currentNav                    | Σ fairValue of active marks                                                                           | metrics-engine.ts   |
| active mark                   | markDate ≤ asOfDate; status ∉ {superseded, reversed}; one per companyId (or id), most recent markDate | selectActiveMarks() |
| excluded events               | status = reversed, or eventType = reversal                                                            | isLiveEvent()       |
| DPI                           | distributions / contributions                                                                         | —                   |
| RVPI                          | currentNav / contributions                                                                            | —                   |
| TVPI                          | DPI + RVPI (summed as Decimals before render)                                                         | —                   |
| MOIC                          | (distributions + currentNav) / contributions                                                          | —                   |
| ratios when contributions = 0 | null + ZERO_CONTRIBUTIONS warning                                                                     | metrics-engine.ts   |
| XIRR                          | Actual/365.25 day-count; bounds [-0.999999, 200]                                                      | ADR-005, ADR-010    |

Notes:

- XIRR rate magnitude is validated in `docs/xirr.truth-cases.json`. LP-metrics
  cases assert XIRR only at convergence level (a rate exists / converged), not
  the rate value, to avoid duplicating the solver's truth set.
- Fee logic is out of scope here; the fee authority is ADR-006 +
  `shared/lib/economics/economics-engine.ts` (NOT `shared/lib/fund-calc.ts`).
