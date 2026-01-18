---
type: reflection
id: REFL-006
title: XIRR Newton-Raphson Divergence on Extreme Returns
status: VERIFIED
date: 2026-01-18
version: 1
severity: critical
wizard_steps: []
error_codes: [XIRR_NO_CONVERGENCE, XIRR_DIVERGED]
components: [xirr, analytics, calculations]
keywords: [xirr, newton-raphson, brent, divergence, extreme-irr, financial-calculation]
test_file: tests/regressions/REFL-006.test.ts
superseded_by: null
---

# Reflection: XIRR Newton-Raphson Divergence on Extreme Returns

## 1. The Anti-Pattern (The Trap)

**Context:** Newton-Raphson method for XIRR calculation diverges or oscillates on extreme return scenarios (>100% annualized IRR, 10x returns in 6 months).

**How to Recognize This Trap:**
1.  **Error Signal:** `XIRR_NO_CONVERGENCE` or infinite loop in XIRR calculation
2.  **Code Pattern:** Pure Newton-Raphson without fallback:
    ```typescript
    // ANTI-PATTERN
    function xirr(flows: CashFlow[]): number {
      let rate = 0.1; // Initial guess
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const npv = calculateNPV(flows, rate);
        const derivative = calculateDerivative(flows, rate);
        rate = rate - npv / derivative; // Newton step
        if (Math.abs(npv) < TOLERANCE) return rate;
      }
      throw new Error('XIRR_NO_CONVERGENCE');
    }
    ```
3.  **Mental Model:** Assuming Newton-Raphson converges for all valid cash flow scenarios. It doesn't - extreme returns cause derivative to approach zero, causing divergence.

**Financial Impact:** Fund performance reports show "N/A" or crash entirely for high-performing investments. LPs cannot see their actual returns for successful exits.

> **DANGER:** Do NOT use pure Newton-Raphson for XIRR without a bracketing fallback method.

## 2. The Verified Fix (The Principle)

**Principle:** Use Newton-Raphson with Brent's method fallback for robust convergence.

**Implementation Pattern:**
1.  Try Newton-Raphson first (fast for normal cases)
2.  If divergence detected, fall back to Brent's method (guaranteed convergence)
3.  Use intelligent initial guess based on cash flow pattern

```typescript
// VERIFIED IMPLEMENTATION
import Decimal from 'decimal.js';

interface XIRRResult {
  irr: number;
  converged: boolean;
  method: 'newton' | 'brent' | 'bisection';
  iterations: number;
}

function xirrNewtonBisection(flows: CashFlow[]): XIRRResult {
  // 1. Try Newton-Raphson first (fast for normal cases)
  const newtonResult = tryNewtonRaphson(flows);
  if (newtonResult.converged) {
    return { ...newtonResult, method: 'newton' };
  }

  // 2. Newton failed - use Brent's method (guaranteed convergence)
  // First, bracket the root
  const bracket = findBracket(flows, -0.99, 10.0);
  if (!bracket) {
    // No sign change found - try wider search
    const wideBracket = findBracket(flows, -0.999, 100.0);
    if (!wideBracket) {
      return { irr: NaN, converged: false, method: 'brent', iterations: 0 };
    }
  }

  // 3. Brent's method within bracket
  const brentResult = brentMethod(flows, bracket.low, bracket.high);
  return { ...brentResult, method: 'brent' };
}

function tryNewtonRaphson(flows: CashFlow[]): XIRRResult {
  const initialGuess = estimateInitialRate(flows);
  let rate = initialGuess;
  let prevRate = rate;

  for (let i = 0; i < 100; i++) {
    const npv = calculateNPV(flows, rate);
    const derivative = calculateDerivative(flows, rate);

    // Divergence detection
    if (Math.abs(derivative) < 1e-10) {
      return { irr: rate, converged: false, method: 'newton', iterations: i };
    }

    const step = npv / derivative;
    rate = rate - step;

    // Oscillation detection
    if (i > 10 && Math.abs(rate - prevRate) > Math.abs(rate)) {
      return { irr: rate, converged: false, method: 'newton', iterations: i };
    }

    if (Math.abs(npv) < 1e-10) {
      return { irr: rate, converged: true, method: 'newton', iterations: i };
    }

    prevRate = rate;
  }

  return { irr: rate, converged: false, method: 'newton', iterations: 100 };
}
```

**Key Learnings:**
1. Newton-Raphson is fast but not robust for extreme IRRs
2. Brent's method guarantees convergence if root is bracketed
3. Intelligent initial guess improves Newton success rate
4. Always return convergence status so callers can handle failures

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-006.test.ts` validates extreme return scenarios
*   **Source Session:** `.taskmaster/docs/findings.md` lines 34-37
*   **Golden Tests:** `tests/unit/xirr-golden-set.test.ts` includes extreme return cases
*   **Implementation:** `client/src/lib/finance/xirr.ts` uses hybrid Newton-Brent approach
