# ADR-010: Monte Carlo Validation Strategy

**Status**: Approved **Date**: 2025-10-30 **Owners**: Platform Engineering, Risk
& Analytics

---

## 1. Context

Monte Carlo simulations for portfolio modeling require robust input validation
and NaN (Not a Number) prevention to ensure stable, reproducible results. Power
law distributions used in venture capital return modeling are particularly
sensitive to edge cases (zero values, infinite results, division by zero) that
can propagate through calculations and corrupt entire simulation runs.

### 1.1 Problem Statement

Without comprehensive validation:

- **Invalid inputs** (negative portfolio sizes, non-finite exponents) cause
  simulation crashes
- **NaN propagation** from edge cases (log(0), division by zero) corrupts
  thousands of scenarios
- **Non-deterministic results** from floating-point edge cases make debugging
  impossible
- **Silent failures** where calculations succeed but produce meaningless results

### 1.2 Business Impact

- **Fund modeling accuracy**: LP reports require 10,000+ Monte Carlo scenarios
  with 99.9%+ success rate
- **Performance**: NaN edge cases can cause 10-100x slowdowns in iterative
  algorithms
- **Auditability**: Regulators require reproducible, explainable simulation
  results

---

## 2. Decision

Implement **comprehensive input validation with early failure** for all Monte
Carlo and power law distribution functions. Validation occurs at function entry
points before expensive calculations begin.

### 2.1 Validation Strategy

**Core Principles:**

1. **Fail fast**: Reject invalid inputs immediately with descriptive errors
2. **Type safety**: Validate both type (number) and mathematical properties
   (finite, positive)
3. **Zero tolerance**: No silent coercion or "best effort" handling of bad
   inputs
4. **Explicit bounds**: Document valid ranges in code comments and error
   messages

### 2.2 Implementation Pattern

```typescript
// Pattern: Three-tier validation
function monteCarloFunction(input: number, scenarios: number): Result {
  // Tier 1: Type validation
  if (typeof input !== 'number' || typeof scenarios !== 'number') {
    throw new TypeError(
      `Expected numbers, got ${typeof input}, ${typeof scenarios}`
    );
  }

  // Tier 2: Mathematical validity
  if (!Number.isFinite(input) || !Number.isFinite(scenarios)) {
    throw new RangeError(
      `Non-finite input: input=${input}, scenarios=${scenarios}`
    );
  }

  // Tier 3: Domain constraints
  if (input <= 0 || scenarios <= 0) {
    throw new RangeError(
      `Positive values required: input=${input}, scenarios=${scenarios}`
    );
  }

  // Proceed with calculation
  return performCalculation(input, scenarios);
}
```

### 2.3 Specific Guards

**Power Law Distribution** (`server/services/power-law-distribution.ts`):

```typescript
// Lines 184-187: Input validation
if (
  typeof portfolioSize !== 'number' ||
  portfolioSize <= 0 ||
  !Number.isFinite(portfolioSize)
) {
  throw new RangeError(
    `portfolioSize must be a positive finite number, got: ${portfolioSize}`
  );
}
if (
  typeof scenarios !== 'number' ||
  scenarios <= 0 ||
  !Number.isFinite(scenarios)
) {
  throw new RangeError(
    `scenarios must be a positive finite number, got: ${scenarios}`
  );
}
```

**IRR Calculation Guards** (prevents NaN from negative powers):

```typescript
// When multiple <= 0, return sentinel value instead of NaN
if (multiple <= 0) {
  return -1.0; // Total loss sentinel (avoids Math.pow(negative, fractional))
}
```

---

## 3. Rationale

### 3.1 Why Fail Fast (Not Silent Coercion)

**Rejected Alternative**: Silently coerce invalid inputs (e.g.,
`Math.abs(input)`, `input || defaultValue`)

**Problems with coercion:**

- **Masks bugs**: Developer mistakes go undetected until production
- **Unpredictable**: `null`, `undefined`, `NaN` all behave differently in
  coercion
- **Audit trail loss**: No record that invalid input was received

**Benefits of fail fast:**

- **Clear debugging**: Stack trace points to exact invalid input source
- **Contract enforcement**: API consumers must validate before calling
- **No silent corruption**: Bad data never enters the calculation pipeline

### 3.2 Why isFinite() (Not Manual Checks)

**`Number.isFinite(x)`** checks both:

- `!isNaN(x)` - not NaN
- `x !== Infinity && x !== -Infinity` - not infinite

**More robust than:**

```typescript
// ❌ Incomplete: Allows NaN
if (x > 0) { ... }

// ❌ Incomplete: Allows Infinity
if (!isNaN(x)) { ... }

// ✅ Complete: Rejects both NaN and Infinity
if (Number.isFinite(x) && x > 0) { ... }
```

### 3.3 Why Positive-Only Constraints

Monte Carlo portfolio modeling has **natural domain constraints**:

- Portfolio size: Number of investments (1+)
- Scenarios: Simulation count (1+)
- Exponent: Power law shape parameter (>1 for realistic VC distributions)
- Multiples: Return multiples (≥0, where 0 = total loss)

**Rejecting zero/negative values prevents:**

- Division by zero (NaN propagation)
- Logarithm of zero/negative (NaN)
- Negative exponents in power calculations (unexpected behavior)

---

## 4. Alternatives Considered

### 4.1 Defensive Clamping

**Description**: Clamp inputs to valid ranges instead of throwing errors.

```typescript
// Example: portfolioSize = Math.max(1, portfolioSize || 1);
```

**Rejected because:**

- **Silent bugs**: Developer errors go unnoticed
- **Semantic confusion**: Clamping 0 → 1 changes meaning (no portfolio →
  1-investment portfolio)
- **Audit issues**: No way to track how often clamping occurred

**Acceptable use case**: User-facing UI inputs (sliders, forms) where clamping
is explicit user feedback, not silent correction.

### 4.2 Try-Catch at Simulation Level

**Description**: Wrap entire simulation in try-catch, discard failed scenarios.

```typescript
// Example: Run 12,000 scenarios, hope 10,000 succeed
```

**Rejected because:**

- **Wastes computation**: 20% overhead from failed scenarios
- **Masks root causes**: No way to know which input caused failure
- **Non-reproducible**: Random failures make debugging impossible

**Acceptable use case**: Portfolio-level aggregation where individual deal
failures are expected domain behavior (e.g., startup failures), not calculation
errors.

### 4.3 Warning Logs Instead of Errors

**Description**: Log warnings for invalid inputs but continue calculation.

```typescript
// Example: console.warn(`Invalid input: ${x}, using default`);
```

**Rejected because:**

- **Production blindness**: Warnings get lost in log noise
- **Progressive corruption**: One NaN can corrupt entire result set
- **No error boundary**: Caller has no way to detect and handle failure

**Acceptable use case**: Deprecation warnings for old API usage (non-critical,
informational).

---

## 5. Consequences

### 5.1 Positive Consequences

- ✅ **Fail fast**: Invalid inputs rejected at entry point (before expensive
  calculations)
- ✅ **Clear errors**: Descriptive RangeError messages aid debugging
- ✅ **Reproducibility**: Same inputs always produce same result or same error
- ✅ **Audit compliance**: Validation logic is explicit, testable, documented
- ✅ **Performance**: Early validation prevents wasted computation on bad inputs

### 5.2 Negative Consequences

- ⚠️ **Stricter contracts**: Callers must validate inputs before calling (no
  automatic coercion)
- ⚠️ **More error handling**: API consumers need try-catch around Monte Carlo
  calls
- ⚠️ **Test brittleness**: Tests must use valid inputs (can't rely on silent
  coercion)

### 5.3 Mitigation Plans

**For stricter contracts:**

- Document valid input ranges in JSDoc comments
- Provide validation helpers (`isValidPortfolioSize(x)`)
- Export constants for common ranges (`MIN_PORTFOLIO_SIZE = 1`)

**For error handling:**

- Provide typed error classes (`MonteCarloValidationError extends RangeError`)
- Document error conditions in API documentation
- Provide example try-catch patterns in integration guides

**For test brittleness:**

- Create test fixtures with valid inputs (`validMonteCarloInputs()`)
- Use property-based testing (fast-check) to generate valid random inputs
- Explicitly test validation logic with invalid inputs

---

## 6. Implementation Notes

### 6.1 Validation Checklist

For any function accepting numeric Monte Carlo inputs:

```typescript
// ✅ Validation checklist:
// [ ] typeof check (number, not string/object)
// [ ] isFinite check (not NaN, not Infinity)
// [ ] Range check (>0 for counts, >=0 for multiples)
// [ ] Descriptive error message (includes actual value)
```

### 6.2 Error Message Pattern

```typescript
// ✅ Good: Descriptive, includes actual value
throw new RangeError(
  `portfolioSize must be a positive finite number, got: ${portfolioSize}`
);

// ❌ Bad: Generic, no context
throw new Error('Invalid input');
```

### 6.3 Sentinel Values

When valid results can include zero/negative (e.g., IRR for total loss), use
**explicit sentinel values** documented in code comments:

```typescript
// Sentinel value: -1.0 represents total loss (100% capital loss)
// Avoids NaN from Math.pow(negative, fractional)
if (multiple <= 0) {
  return -1.0; // Total loss
}
```

### 6.4 Testing Strategy

**Unit tests must cover:**

1. **Happy path**: Valid inputs produce expected results
2. **Type errors**: Non-number inputs throw TypeError
3. **NaN/Infinity**: Non-finite inputs throw RangeError
4. **Zero/negative**: Out-of-range inputs throw RangeError with correct message
5. **Boundary values**: Edge cases (1e-12, Number.MAX_SAFE_INTEGER)

**Example test structure:**

```typescript
describe('Power Law Distribution Validation', () => {
  it('accepts valid positive finite numbers', () => {
    expect(() => samplePowerLaw(100, 10000)).not.toThrow();
  });

  it('rejects NaN portfolioSize', () => {
    expect(() => samplePowerLaw(NaN, 10000)).toThrow(RangeError);
    expect(() => samplePowerLaw(NaN, 10000)).toThrow(
      /portfolioSize must be a positive finite number/
    );
  });

  it('rejects Infinity scenarios', () => {
    expect(() => samplePowerLaw(100, Infinity)).toThrow(RangeError);
  });

  it('rejects zero portfolioSize', () => {
    expect(() => samplePowerLaw(0, 10000)).toThrow(RangeError);
  });
});
```

---

## 7. References

### 7.1 Implementation

- **Power Law Distribution**: `server/services/power-law-distribution.ts` (lines
  184-192)
- **Monte Carlo Engine**: `server/services/monte-carlo-engine.ts`
- **Validation Tests**:
  `tests/unit/services/monte-carlo-power-law-validation.test.ts`

### 7.2 Related ADRs

- **ADR-005**: XIRR Excel Parity (graceful null handling for Excel #NUM! errors)
- **ADR-008**: Capital Allocation Policy (deterministic engine architecture)

### 7.3 External References

- **IEEE 754 Floating Point**:
  [https://en.wikipedia.org/wiki/IEEE_754](https://en.wikipedia.org/wiki/IEEE_754)
- **JavaScript Number.isFinite()**:
  [https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite)
- **Power Law Distribution**:
  [https://en.wikipedia.org/wiki/Power_law](https://en.wikipedia.org/wiki/Power_law)

---

## 8. Approval and Review

**Reviewed by:**

- Platform Engineering (validation logic, error handling)
- Risk & Analytics (mathematical correctness, domain constraints)
- Quality Assurance (testing strategy, edge cases)

**Status**: Approved **Approved Date**: 2025-10-30

---

## 9. Change History

| Version | Date       | Changes          | Author               |
| ------- | ---------- | ---------------- | -------------------- |
| 1.0.0   | 2025-10-30 | Initial approval | Platform Engineering |

---

**Document Version**: 1.0.0 **Last Updated**: 2025-10-30
