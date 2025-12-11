# Phase 1.1.1 XIRR Baseline Heatmap

**Generated:** 2025-12-11T18:38:26.079Z  
**Pass Rate:** 36/51 (70.6%)

## Results Table

| Scenario ID                              | Expected IRR     | Actual IRR       |                  | Δ    | (bps)       | Status | Category |
| ---------------------------------------- | ---------------- | ---------------- | ---------------- | ---- | ----------- | ------ | -------- |
| 01-simple-positive-return                | N/A              | N/A              | N/A              | PASS | Valid       |
| 02-negative-return-loss                  | N/A              | N/A              | N/A              | PASS | Valid       |
| 03-multi-round-partial-distributions     | N/A              | N/A              | N/A              | PASS | Valid       |
| 04-quarterly-flows                       | N/A              | N/A              | N/A              | PASS | Valid       |
| 05-zero-return-breakeven                 | N/A              | N/A              | N/A              | PASS | Valid       |
| 06-newton-success-smooth                 | N/A              | N/A              | N/A              | PASS | Valid       |
| 07-newton-failure-bisection-fallback     | (no convergence) | (no convergence) | (no convergence) | FAIL | Convergence |
| 08-bisection-only-mode                   | N/A              | N/A              | N/A              | PASS | Valid       |
| 09-convergence-tolerance-boundary        | (no convergence) | (no convergence) | (no convergence) | FAIL | Convergence |
| 10-maximum-iterations-reached            | N/A              | N/A              | N/A              | PASS | Valid       |
| 11-excel-actual365-date-convention       | N/A              | N/A              | N/A              | PASS | Valid       |
| 12-same-day-cashflow-aggregation         | N/A              | N/A              | N/A              | PASS | Valid       |
| 13-leap-year-handling                    | 4.2843           | 5.1468           | 8625.0           | FAIL | Truth Error |
| 14-date-ordering-unsorted                | N/A              | N/A              | N/A              | PASS | Valid       |
| 15-timezone-independent                  | N/A              | N/A              | N/A              | PASS | Valid       |
| 16-no-sign-change-all-positive           | N/A              | N/A              | N/A              | PASS | Valid       |
| 17-no-sign-change-all-negative           | N/A              | N/A              | N/A              | PASS | Valid       |
| 18-insufficient-cashflows-single         | N/A              | N/A              | N/A              | PASS | Valid       |
| 19-out-of-bounds-extreme-rate            | (no convergence) | (no convergence) | (no convergence) | FAIL | Convergence |
| 20-floating-point-precision-tiny-amounts | N/A              | N/A              | N/A              | PASS | Valid       |
| 21-typical-vc-fund-10year                | 0.1846           | 0.1641           | 204.6            | FAIL | Truth Error |
| 22-early-exit-high-irr                   | N/A              | N/A              | N/A              | PASS | Valid       |
| 23-late-exit-lower-irr                   | N/A              | N/A              | N/A              | PASS | Valid       |
| 24-quarterly-recycling                   | N/A              | N/A              | N/A              | PASS | Valid       |
| 25-nav-heavy-terminal-value              | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 15                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 16                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 17                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 18                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 19                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 20                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 21                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 22                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 23                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 24                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 25                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 1                            | N/A              | N/A              | N/A              | FAIL | Valid       |
| Golden Case 2                            | 0.2988           | 0.4418           | 1430.0           | FAIL | Truth Error |
| Golden Case 3                            | 0.2087           | 0.1419           | 668.2            | FAIL | Truth Error |
| Golden Case 4                            | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 5                            | N/A              | N/A              | N/A              | FAIL | Valid       |
| Golden Case 6                            | -0.1386          | -0.1293          | 92.5             | FAIL | Precision   |
| Golden Case 7                            | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 8                            | 0.1607           | 0.1685           | 78.6             | FAIL | Precision   |
| Golden Case 9                            | 1.0308           | 1.1529           | 1221.3           | FAIL | Truth Error |
| Golden Case 10                           | 0.1190           | 0.0716           | 473.4            | FAIL | Truth Error |
| Golden Case 11                           | 0.1313           | 0.1697           | 383.9            | FAIL | Truth Error |
| Golden Case 12                           | 0.0794           | 0.0451           | 342.3            | FAIL | Truth Error |
| Golden Case 13                           | N/A              | N/A              | N/A              | PASS | Valid       |
| Golden Case 14                           | N/A              | N/A              | N/A              | PASS | Valid       |

## Summary

- **Total Tests:** 51
- **Passed:** 36
- **Failed:** 15
- **Pass Rate:** 70.6%

### Failure Categories

- **Convergence:** Solver failed to converge (expected edge cases)
- **Precision:** Within 500 bps but > 50 bps (tolerance boundary)
- **Truth Error:** > 500 bps delta (possible truth case error or real bug)
- **Valid:** All tests passed
