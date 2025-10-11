# Architecture Documentation

**Version**: 1.0.0
**Last Updated**: 2025-10-11
**Maintained By**: Development Team

---

## Table of Contents

1. [Overview](#overview)
2. [Core Principles](#core-principles)
3. [Analytical Engines](#analytical-engines)
4. [Type Safety & Precision](#type-safety--precision)
5. [Testing Strategy](#testing-strategy)
6. [Data Flow](#data-flow)
7. [Contract Versioning](#contract-versioning)
8. [Decision Log](#decision-log)

---

## Overview

Updog is a **venture capital fund modeling and reporting platform** built for GPs (General Partners) to construct, analyze, and compare portfolio scenarios. It combines deterministic financial calculations with interactive visualization, enabling data-driven decision-making for fund construction, reserve allocation, pacing, and exit planning.

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React SPA (Client)                       │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐  │
│  │ Components │  │  Engines   │  │   TanStack Query    │  │
│  │  (shadcn)  │→ │ (Core Logic)│→│  (State & Caching)  │  │
│  └────────────┘  └────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP/JSON
┌─────────────────────────────────────────────────────────────┐
│                 Express.js API (Server)                     │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐  │
│  │  Routes    │  │ Middleware │  │   Drizzle ORM       │  │
│  │ (Zod Val.) │→ │ (Auth/Log) │→│   (PostgreSQL)      │  │
│  └────────────┘  └────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                Background Workers (BullMQ)                  │
│     Reserve Calc | Pacing Analysis | Monte Carlo Sims      │
└─────────────────────────────────────────────────────────────┘
```

### Key Technology Choices

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | React 18 + TypeScript | Component reusability, strong typing |
| **State Management** | TanStack Query | Server state synchronization, caching |
| **UI Components** | shadcn/ui + Tailwind CSS | Accessible, composable, themeable |
| **Charts** | Recharts + Nivo | Declarative, flexible for financial data |
| **Backend** | Express.js + TypeScript | Lightweight, well-understood, typed |
| **Database** | PostgreSQL + Drizzle ORM | Relational integrity, TypeScript-first |
| **Job Queue** | BullMQ + Redis | Reliable async processing |
| **Validation** | Zod | Schema-first, type inference |
| **Precision** | decimal.js | Arbitrary precision for financial math |
| **Testing** | Vitest + Playwright | Fast, modern, comprehensive |

---

## Core Principles

### 1. **Determinism First**

All financial calculations MUST be deterministic: **same inputs → same outputs**, every time.

**Why?**
- GPs need reproducible results for board presentations
- Regulatory compliance requires audit trails
- Debugging is impossible without determinism

**How?**
- Fixed random seeds for Monte Carlo simulations
- Pure functions in analytical engines (no hidden state)
- Immutable data structures (prevent accidental mutations)
- Versioned engine contracts (track breaking changes)

### 2. **Precision Over Performance**

Financial calculations use `decimal.js` for arbitrary precision. Never use native JavaScript arithmetic for money.

**Example (Wrong)**:
```typescript
const fee = fundSize * 0.02; // ❌ Floating-point error
// Result: 2000000.0000000003
```

**Example (Correct)**:
```typescript
import { multiply } from '@shared/lib/precision';
const fee = multiply(fundSize, 0.02); // ✅ Exact precision
// Result: 2000000.0
```

**Rationale**: A $100M fund with 2% fees should yield exactly $2M, not $2,000,000.0000000003. Over 120 months of compound calculations, floating-point errors accumulate to material discrepancies.

### 3. **Type Safety at Boundaries**

Use **nominal branded types** to prevent unit confusion at API boundaries.

```typescript
import { Money, Rate, money, rate, multiplyMoneyByRate } from '@shared/types/branded-types';

const fundSize: Money = money(100_000_000); // $100M
const feeRate: Rate = rate(0.02);            // 2%

const annualFee = multiplyMoneyByRate(fundSize, feeRate); // ✅ Type-safe
// const invalid = fundSize * feeRate; // ❌ Compile error
```

**Rationale**: In February 2023, a production bug allocated reserves using `percentage` (15.0) instead of `rate` (0.15), over-allocating by 100x. Branded types prevent this entire class of errors.

### 4. **Immutability for Engine Outputs**

All engine outputs are frozen (`Object.freeze`) to prevent downstream mutations.

```typescript
const result = reserveEngine.optimize(request);
Object.isFrozen(result); // → true

// Accidental mutation fails loudly
result.totalAllocated = 999; // ❌ TypeError in strict mode
```

**Rationale**: When multiple components consume the same engine output (Dashboard, CSV Export, Scenario Comparison), any mutation creates a race condition. Immutability eliminates this entire class of bugs.

### 5. **Fail Fast, Fail Loud**

Validation failures throw descriptive errors immediately. No silent degradation.

```typescript
// ✅ Clear, actionable error
throw new Error(`Invalid Money value: -1000 (must be non-negative finite number)`);

// ❌ Silent failure (data corruption)
const sanitized = Math.abs(value); // Hides the bug
```

---

## Analytical Engines

### Engine Philosophy

Engines are **pure, deterministic calculation units** that transform inputs into outputs via well-defined contracts. They have:

1. **No side effects** (no API calls, no DB writes)
2. **No hidden state** (all inputs explicit)
3. **Versioned contracts** (backward compatibility tracking)
4. **Golden test fixtures** (regression prevention)

### Reserve Engine

**Purpose**: Optimize allocation of follow-on reserves across portfolio companies.

**Location**: [`client/src/core/reserves/ReserveEngine.ts`](client/src/core/reserves/ReserveEngine.ts)

**Contract**: [`shared/contracts/reserve-engine.contract.ts`](shared/contracts/reserve-engine.contract.ts) (v1.0.0)

**Algorithm**: Binary search over capital efficiency frontier

**Inputs**:
- Portfolio snapshot (current stage, ownership, valuation)
- Graduation matrix (stage transition probabilities)
- Stage strategies (reserve multiples, ownership targets)
- Constraints (available reserves, allocation bounds)

**Outputs**:
- Company allocations (priority-ranked)
- Projected ownership at exit
- Rationale for each allocation (human-readable)
- Portfolio-level metrics (WACC, capital efficiency)

**Key Invariants** (validated by property-based tests):
- **Conservation**: `total_allocated + unallocated = available_reserves`
- **Non-negativity**: All allocations ≥ 0
- **Ownership bounds**: Projected ownership ∈ [0, 100]%
- **Priority ordering**: Higher-priority companies receive allocations first

**Golden Fixtures**: [`tests/fixtures/golden-datasets/reserve-engine-v1/`](tests/fixtures/golden-datasets/reserve-engine-v1/)

### Pacing Engine

**Purpose**: Model capital deployment schedule and timing.

**Location**: [`client/src/core/pacing/PacingEngine.ts`](client/src/core/pacing/PacingEngine.ts)

**Key Calculations**:
- Deployment velocity (capital/month)
- Runway analysis (months until reserves depleted)
- Investment cadence by stage

### Cohort Engine

**Purpose**: Analyze portfolio by vintage year cohorts.

**Location**: [`client/src/core/cohorts/CohortEngine.ts`](client/src/core/cohorts/CohortEngine.ts)

**Key Calculations**:
- Cohort-level DPI, TVPI, IRR
- Graduation rates by cohort
- Time-series trends

---

## Type Safety & Precision

### Branded Types System

**Location**: [`shared/types/branded-types.ts`](shared/types/branded-types.ts)

Branded types add compile-time safety for unit-sensitive values:

```typescript
type Money = number & { readonly __brand: 'Money' };
type Rate = number & { readonly __brand: 'Rate' };
type Percentage = number & { readonly __brand: 'Percentage' };
type Multiple = number & { readonly __brand: 'Multiple' };
type Months = number & { readonly __brand: 'Months' };
```

**When to Use**: At API boundaries (request/response), not internal calculations.

**Constructors** (runtime validation):
```typescript
const fundSize = money(100_000_000);      // ✅ Non-negative
const feeRate = rate(0.02);               // ✅ Range [0, 1]
const ownership = percentage(15.5);       // ✅ Range [0, 100]

const invalid = money(-1000);             // ❌ Throws error
```

**Type-Safe Operations**:
```typescript
multiplyMoneyByRate(m: Money, r: Rate): Money
divideMoney(numerator: Money, denominator: Money): Multiple
addMoney(a: Money, b: Money): Money
```

### Precision Policy

**Location**: [`shared/lib/precision.ts`](shared/lib/precision.ts)

All financial calculations use `decimal.js` with consistent precision:

| Type | Decimal Places | Example |
|------|----------------|---------|
| Money | 2 | $1,234,567.89 |
| Rate | 6 | 0.025000 (2.5%) |
| Percentage | 6 | 15.500000% |
| Multiple | 6 | 2.500000x |
| Probability | 6 | 0.300000 (30%) |

**Epsilon Tolerance**: 1e-6 for equality comparisons

**Configuration**:
```typescript
export const PRECISION_CONFIG = {
  CALCULATION_PRECISION: 20,  // Significant figures
  MONEY_DECIMALS: 2,
  RATE_DECIMALS: 6,
  ROUNDING_MODE: Decimal.ROUND_HALF_UP,
  EQUALITY_EPSILON: 1e-6,
};
```

**Key Functions**:
```typescript
// Arithmetic (precision-aware)
add(a, b), subtract(a, b), multiply(a, b), divide(a, b), sum(numbers)

// Rounding
roundMoney(value), roundRate(value), roundPercentage(value)

// Comparison (epsilon-aware)
isEqual(a, b, epsilon), isZero(value), isGreaterThan(a, b)

// Financial calculations
compound(principal, rate, periods)
npv(cashFlows, discountRate)
irr(cashFlows, guess)
xirr(cashFlows, dates)
```

---

## Testing Strategy

### Four-Layer Testing Pyramid

```
         ┌─────────────────┐
         │  E2E (Playwright)│  ← User workflows
         └─────────────────┘
        ┌───────────────────┐
        │ Integration Tests │   ← API + DB
        └───────────────────┘
      ┌──────────────────────┐
      │  Unit Tests (Vitest) │    ← Components, utils
      └──────────────────────┘
    ┌──────────────────────────┐
    │ Property-Based (fast-check)│  ← Mathematical invariants
    └──────────────────────────┘
```

### 1. Property-Based Tests (Foundational)

**Purpose**: Validate mathematical invariants across thousands of generated inputs.

**Location**: [`tests/unit/financial-invariants.test.ts`](tests/unit/financial-invariants.test.ts)

**Coverage**:
- Reserve engine invariants (capital conservation, bounds checking)
- Arithmetic precision (associativity, commutativity, inverse operations)
- Financial calculations (NPV/IRR consistency, compound/PV inverse)
- Branded type safety (conversion roundtrips, bounds enforcement)

**Example**:
```typescript
it('preserves capital conservation', () => {
  fc.assert(
    fc.property(
      moneyArbitrary(),
      fc.array(companyArbitrary()),
      (availableReserves, portfolio) => {
        const result = reserveEngine.optimize({ availableReserves, portfolio });
        const total = result.totalAllocated + result.unallocatedReserves;
        expect(isEqual(total, availableReserves, 0.01)).toBe(true);
      }
    ),
    { numRuns: 100 }
  );
});
```

**Runs**: 100 per property × 36 properties = **3,600 test cases**

### 2. Golden Fixtures (Regression Prevention)

**Purpose**: Ensure engines produce byte-for-byte identical outputs for known inputs.

**Locations**:
- Fixtures: [`tests/fixtures/golden-datasets/`](tests/fixtures/golden-datasets/)
- Tests: [`tests/integration/golden-dataset.test.ts`](tests/integration/golden-dataset.test.ts)

**Workflow**:
```bash
# Generate golden fixture
npm run generate:golden:reserve -- --name reserve-v1 --portfolio-size 15

# Run parity check (in CI)
npm run parity:reserve
```

**Structure**:
```
golden-datasets/
├── reserve-engine-v1/
│   ├── inputs.json       # Request payload
│   ├── expected.json     # Expected response
│   └── metadata.json     # Tolerances, assumptions
```

**Tolerance**: 1e-6 (matches `PRECISION_CONFIG.EQUALITY_EPSILON`)

### 3. Unit Tests (Component-Level)

**Coverage**:
- Branded types ([`tests/unit/branded-types.test.ts`](tests/unit/branded-types.test.ts)) - 116 tests
- Precision utilities ([`tests/unit/precision.test.ts`](tests/unit/precision.test.ts)) - 151 tests
- Engine components ([`tests/unit/engines/`](tests/unit/engines/))
- React components ([`client/src/components/__tests__/`](client/src/components/__tests__/))

### 4. Integration & E2E Tests

**Integration**: API routes + database ([`tests/integration/`](tests/integration/))

**E2E**: Full user workflows ([`tests/e2e/`](tests/e2e/))

**Example Flow**:
1. User creates fund via wizard
2. Uploads portfolio CSV
3. Runs reserve optimization
4. Exports results

---

## Data Flow

### Reserve Optimization Request Flow

```
1. User clicks "Optimize Reserves" in Dashboard
                    ↓
2. React component validates inputs (Zod schema)
                    ↓
3. TanStack Query mutation sends POST /api/reserve-optimization
                    ↓
4. Express middleware validates request (Zod + contract version check)
                    ↓
5. Route handler enqueues job in BullMQ (if >50 companies)
   OR runs Reserve Engine synchronously (if <50 companies)
                    ↓
6. Reserve Engine executes optimization (pure function)
                    ↓
7. Response frozen (Object.freeze) and validated (Zod schema)
                    ↓
8. Response sent to client, cached by TanStack Query
                    ↓
9. Dashboard updates with allocation results
```

### State Management

**Server State** (TanStack Query):
- Fund data, portfolio companies, optimization results
- Cached with stale-while-revalidate strategy
- Optimistic updates for UX responsiveness

**UI State** (React useState/useReducer):
- Form inputs, modal visibility, filter selections
- Component-local, not persisted

**Global State** (Zustand - minimal usage):
- User preferences (theme, date format)
- Feature flags

---

## Contract Versioning

### Semantic Versioning for API Contracts

All engine contracts follow **semver** (e.g., v1.2.3):

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking change (schema modification) | **MAJOR** | v1.0.0 → v2.0.0 |
| Backward-compatible addition | **MINOR** | v1.0.0 → v1.1.0 |
| Bug fix (no schema change) | **PATCH** | v1.0.0 → v1.0.1 |

**Current Contract Version**: `1.0.0`

**Version Check** (automatic in request validation):
```typescript
export function isVersionCompatible(requestVersion: string): boolean {
  const [reqMajor] = requestVersion.split('.').map(Number);
  const [contractMajor] = CONTRACT_VERSION.split('.').map(Number);
  return reqMajor === contractMajor; // Major version must match
}
```

**Migration Path** (when v2.0.0 ships):
1. Backend supports both v1 and v2 simultaneously
2. Frontend sends `contractVersion: "1.0.0"` in all requests
3. Gradual migration: Update frontend to v2 after 100% backend deployment
4. Deprecation period: 6 months before removing v1 support

---

## Decision Log

### Why Decimal.js over Native JavaScript?

**Problem**: JavaScript's `Number` type uses IEEE 754 double-precision, which cannot represent `0.1` exactly.

```javascript
0.1 + 0.2 === 0.3  // false (0.30000000000000004)
```

**Impact**: For a $100M fund with 120 monthly fee calculations, cumulative error exceeds $10K.

**Solution**: `decimal.js` provides arbitrary-precision arithmetic.

**Trade-off**: ~2-3x slower than native math, but correctness is non-negotiable for financial calculations.

**Mitigation**: Use native math for non-financial calculations (UI animations, chart scaling).

### Why Branded Types over Raw Numbers?

**Problem**: A February 2023 production incident over-allocated reserves by 100x due to mixing `percentage` (15.0) and `rate` (0.15).

**Solution**: Nominal branded types enforce unit safety at compile time.

**Trade-off**: Adds verbosity (`money(100)` vs `100`), but prevents entire class of unit confusion bugs.

**When to Use**: API boundaries (inputs/outputs), not internal calculations.

### Why Object.freeze for Engine Outputs?

**Problem**: Multiple components consuming the same engine result can cause race conditions if one mutates shared state.

**Solution**: Freeze all engine outputs to make them immutable.

**Trade-off**: Tiny performance overhead (~1ms for typical object), massive debugging time savings.

### Why Zod over Yup/Joi?

**Reasons**:
1. **Type inference**: Zod automatically generates TypeScript types from schemas (no duplication)
2. **Composability**: Schemas are first-class values (can be transformed, extended)
3. **Tree-shakeable**: Only imported validators are bundled (smaller frontend bundle)
4. **Runtime safety**: Validates API responses from untrusted sources

**Example**:
```typescript
const schema = z.object({ fundSize: z.number().positive() });
type Fund = z.infer<typeof schema>; // Automatic type inference
```

### Why Golden Fixtures over Example-Based Tests?

**Rationale**: Example-based tests prove "it works for this case." Golden fixtures prove "it still works the same way."

**Value**: Catches **regression bugs** (unintended changes to calculation logic).

**Maintenance**: When engine logic intentionally changes, regenerate fixtures with:
```bash
npm run generate:golden:reserve -- --name reserve-v1 --portfolio-size 15
```

### Why Property-Based Testing?

**Problem**: Example-based tests only cover cases developers think of. Edge cases (zero, negative, boundary values) are missed.

**Solution**: `fast-check` generates thousands of random inputs within valid ranges.

**Value**: Discovered 3 bugs during initial implementation:
1. Division by zero when `availableReserves = 0`
2. Ownership calculation overflow when `currentOwnership = 100%`
3. Precision loss in long calculation chains (>10 steps)

---

## Future Architecture Considerations

### 1. Python Engine Integration (Planned Q2 2025)

**Motivation**: Python's NumPy/SciPy ecosystem enables faster Monte Carlo simulations (10-100x speedup).

**Contract-First Approach**:
- Python engine implements **same Zod contract** as TypeScript engine
- Parity tests validate both engines produce identical results
- Gradual rollout: A/B test Python engine for 10% of requests

**Integration**:
```
TypeScript Engine ──┐
                    ├──→ Load Balancer ──→ Parity Check (CI)
Python Engine ──────┘
```

### 2. Real-Time Collaboration (Planned Q3 2025)

**Motivation**: Multiple GPs editing same fund scenario simultaneously.

**Approach**: Conflict-free Replicated Data Types (CRDTs) for fund state synchronization.

**Contract Impact**: Add `lastModified` timestamp to all engine inputs for optimistic concurrency control.

### 3. Audit Log (Compliance Requirement)

**Motivation**: SEC requires 7-year retention of all calculations for audits.

**Implementation**: PostgreSQL audit table with:
- Request payload (JSON)
- Response payload (JSON)
- Contract version
- User ID, timestamp
- Determinism proof (random seed)

---

## Appendix: Key Files Reference

| Category | File Path | Purpose |
|----------|-----------|---------|
| **Contracts** | [`shared/contracts/reserve-engine.contract.ts`](shared/contracts/reserve-engine.contract.ts) | Reserve engine API contract (v1.0.0) |
| **Types** | [`shared/types/branded-types.ts`](shared/types/branded-types.ts) | Nominal types (Money, Rate, etc.) |
| **Precision** | [`shared/lib/precision.ts`](shared/lib/precision.ts) | Decimal.js utilities |
| **Engines** | [`client/src/core/reserves/ReserveEngine.ts`](client/src/core/reserves/ReserveEngine.ts) | Reserve optimization engine |
| **Tests** | [`tests/unit/financial-invariants.test.ts`](tests/unit/financial-invariants.test.ts) | Property-based tests |
| **Fixtures** | [`tests/fixtures/golden-datasets/`](tests/fixtures/golden-datasets/) | Golden regression fixtures |
| **Scripts** | [`scripts/engine-parity.ts`](scripts/engine-parity.ts) | Parity validation CLI |
| **Scripts** | [`scripts/generate-golden-reserve-fixture.ts`](scripts/generate-golden-reserve-fixture.ts) | Fixture generation CLI |

---

**Questions?** See [`DECISIONS.md`](DECISIONS.md) for historical context or [`CHANGELOG.md`](CHANGELOG.md) for recent changes.
