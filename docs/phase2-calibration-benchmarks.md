# Phase 2 Calibration Benchmarks

**Status**: ACTIVE **Date**: 2026-02-22 **Purpose**: Source, date, range, and
rationale for every calibration band

## Parameter Benchmarks (CI-Blocking)

### Graduation Rate Defaults

| Stage Transition | Graduate | Fail | Remain | Source                                          |
| ---------------- | -------- | ---- | ------ | ----------------------------------------------- |
| Seed -> Series A | 35%      | 45%  | 20%    | Kauffman Foundation (2012), CB Insights (2023)  |
| A -> B           | 45%      | 35%  | 20%    | PitchBook Annual VC Report (2023)               |
| B -> C           | 55%      | 25%  | 20%    | Cambridge Associates benchmark (2022)           |
| C -> Exit        | 65%      | 15%  | 20%    | Industry consensus, lower failure at late stage |

**Rationale:**

- **Failure rate monotonically decreasing**: Earlier-stage companies have higher
  failure rates. This is universally accepted in VC literature. The 45% seed
  failure rate aligns with the commonly cited "60-75% of seed investments fail
  to return capital" statistic (accounting for partial returns and remain).
- **Graduation rate monotonically increasing**: Later-stage companies have more
  traction and lower risk, so graduation probability increases.
- **Remain rate constant at 20%**: Simplifying assumption. In practice, "remain"
  (neither graduating nor failing in a given period) varies by stage, but 20% is
  a reasonable default for quarterly transitions.

**Sources:**

- Kauffman Foundation. "We Have Met The Enemy... And He Is Us." (2012). Analyzed
  100 VC funds, found ~60% of investments failed to return 1x.
- CB Insights. "Venture Capital Funnel." (2023). Updated statistics on startup
  stage transitions.
- PitchBook. "Annual Venture Capital Report." (2023). Stage-by-stage advancement
  rates.
- Cambridge Associates. "US Venture Capital Index and Selected Benchmark
  Statistics." (2022).

### Monotonicity Invariants

| Invariant                | Direction  | Rationale                                |
| ------------------------ | ---------- | ---------------------------------------- |
| Failure rate by stage    | Decreasing | Risk reduces with maturity               |
| Graduation rate by stage | Increasing | Higher success probability with traction |
| Follow-on check size     | Increasing | Later rounds are larger (A < B < C)      |

## Output Benchmarks (Quarantined)

### MOIC Envelope

| Metric                         | Min  | Max   | Source                           | Date |
| ------------------------------ | ---- | ----- | -------------------------------- | ---- |
| Portfolio MOIC (median)        | 1.5x | 3.0x  | Cambridge Associates US VC Index | 2023 |
| Portfolio MOIC (top quartile)  | 2.5x | 4.0x  | Cambridge Associates             | 2023 |
| Single company MOIC (breakout) | 10x  | 100x+ | Power law distribution           | N/A  |

### Loss Ratio

| Metric                              | Min | Max | Source                           | Date |
| ----------------------------------- | --- | --- | -------------------------------- | ---- |
| Companies returning < 1x            | 30% | 70% | Horsley Bridge Partners analysis | 2022 |
| Companies returning 0x (total loss) | 20% | 50% | CB Insights                      | 2023 |
| Companies returning > 5x            | 5%  | 15% | Correlation Ventures             | 2022 |

**Rationale:** VC returns follow a power law distribution. A small number of
investments generate most of the returns. The loss ratio band accounts for fund
strategy variation (early-stage funds have higher loss rates).

### Top-Decile Concentration

| Metric                          | Min | Max | Source                   | Date |
| ------------------------------- | --- | --- | ------------------------ | ---- |
| Value from top 10% of companies | 50% | 80% | Kauffman Foundation      | 2012 |
| Value from top 20% of companies | 70% | 95% | AngelList portfolio data | 2023 |

### Timing Benchmarks

| Metric           | Range        | Source         | Date |
| ---------------- | ------------ | -------------- | ---- |
| Seed to Series A | 12-24 months | PitchBook      | 2023 |
| Series A to B    | 12-18 months | PitchBook      | 2023 |
| Series B to C    | 12-24 months | PitchBook      | 2023 |
| Series C to Exit | 18-36 months | PitchBook      | 2023 |
| Total fund life  | 7-12 years   | ILPA Standards | 2023 |

## Benchmark Update Policy

- Benchmarks should be reviewed annually against latest industry reports.
- Changes to parameter defaults require updating both this document and the
  corresponding tests.
- Any change that moves a parameter outside its benchmark range must be
  documented with rationale.
