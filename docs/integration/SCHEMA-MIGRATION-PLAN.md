---
status: ACTIVE
last_updated: 2026-01-19
---

# Schema System Integration Plan

## Overview

Integration strategy for the new production-grade fund modeling schema system into the existing deterministic engine.

## Architecture

### Two-Path Approach

We support **both** legacy and new schema systems simultaneously:

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
├─────────────────────┬───────────────────────────────────────┤
│   Legacy UI         │   New Configuration Wizard             │
│   (fund-setup.tsx)  │   (schema-based forms)                 │
└──────────┬──────────┴─────────────┬─────────────────────────┘
           │                        │
           │                        │
   ┌───────▼────────┐      ┌────────▼──────────┐
   │ FundModelInputs│      │ ExtendedFundModel │
   │   (v1.0.0)     │      │     Inputs        │
   │                │      │   (v2.0.0)        │
   └───────┬────────┘      └────────┬──────────┘
           │                        │
           │                ┌───────▼───────┐
           │                │ Schema Adapter│
           │                │ (optional)    │
           │                └───────┬───────┘
           │                        │
   ┌───────▼────────────────────────▼──────────┐
   │        Fund Calculation Engine             │
   ├────────────────┬──────────────────────────┤
   │  fund-calc.ts  │   fund-calc-v2.ts        │
   │  (Legacy)      │   (Schema-Native)        │
   └────────────────┴──────────────────────────┘
```

### Components

#### 1. **fund-calc.ts** (Legacy Engine - v1.0.0)
- Uses `FundModelInputs` (frozen schema from PR #2)
- Simple deterministic calculations
- Exit buckets via `index % 4`
- Flat 2% management fees
- Upfront capital calls only
- **Status**: Maintained for backward compatibility

#### 2. **fund-calc-v2.ts** (Schema-Native Engine - v2.0.0)
- Uses `ExtendedFundModelInputs` natively
- Stage-driven cohort progression
- Fractional company counts
- Multi-tier fees with step-downs
- Flexible capital call policies
- European & American waterfalls
- Exit proceeds recycling
- **Status**: New development (PR #3.5+)

#### 3. **schema-adapter.ts** (Bridge Layer)
Two-way conversion:
- `adaptToLegacySchema()` - ExtendedFundModelInputs → FundModelInputs
- `adaptFromLegacySchema()` - FundModelInputs → ExtendedFundModelInputs
- `validateLegacyCompatibility()` - Warn about features lost in conversion

**Use Cases**:
- Migrate existing fund configurations to new schema
- Run new configurations through legacy engine for comparison
- Gradual migration of UI components

## Migration Path

### Phase 1: Dual Engine Support (Current)
✅ **Completed** in PR #3.5

- [x] Create `ExtendedFundModelInputs` schema system
- [x] Build `fund-calc-v2.ts` engine
- [x] Create `schema-adapter.ts` bridge
- [x] Document schemas and examples

**Result**: Both engines coexist. UI can use either.

### Phase 2: UI Migration (PR #4)
🔄 **In Progress**

- [ ] Create schema-based configuration wizard
- [ ] Add FeeProfile UI (tier editor, step-down selector)
- [ ] Add StageProfile UI (stage builder, rate sliders)
- [ ] Add CapitalCallPolicy UI (mode selector, schedule builder)
- [ ] Add WaterfallPolicy UI (tier configurator)
- [ ] Wire V2 engine into `FundProvider`
- [ ] Feature flag: `ENABLE_SCHEMA_V2`

**Result**: New UI uses ExtendedFundModelInputs. Legacy UI still supported.

### Phase 3: Golden Fixtures (PR #4-5)
- [ ] Create canonical test cases with known outputs
- [ ] Snapshot TVPI/DPI/IRR for regression detection
- [ ] Parity tests: V1 vs V2 on simple scenarios
- [ ] Performance benchmarks (< 15ms target)

**Test Cases**:
1. **Simple Case** - Single-stage fund, no fees, no exits
2. **Standard VC Fund** - $100M early-stage, 2%/1.5% fees, European waterfall
3. **Complex Case** - Multi-tier fees, recycling, American waterfall

### Phase 4: Advanced Features (PR #5-6)
- [ ] Implement Reserve Optimizer v1 (MOIC-based ranking)
- [ ] Add sophisticated reserve allocation strategies
- [ ] Implement FMV marking for active investments
- [ ] Add exit proceeds recycling logic
- [ ] Build waterfall tier visualization

### Phase 5: Deprecation & Cleanup (PR #7+)
- [ ] Migrate all existing configurations to V2
- [ ] Deprecate legacy engine (keep for historical runs)
- [ ] Remove adapter layer (V2 only)
- [ ] Rename `fund-calc-v2.ts` → `fund-calc.ts`
- [ ] Archive old engine as `fund-calc-legacy.ts`

## Feature Comparison

| Feature | Legacy (V1) | Schema-Native (V2) |
|---------|-------------|---------------------|
| **Input Schema** | `FundModelInputs` | `ExtendedFundModelInputs` |
| **Exit Modeling** | `index % 4` buckets | Stage-driven rates |
| **Company Counts** | Integer (`floor()`) | Fractional (Decimal) |
| **Management Fees** | Single rate, flat | Multi-tier, step-downs |
| **Capital Calls** | Upfront only | 6 modes + custom |
| **Waterfall** | Policy A (immediate) | European/American |
| **Recycling** | ❌ Not supported | ✅ Fees + proceeds |
| **Precision** | JavaScript `number` | Decimal.js (30 digits) |
| **Validation** | Zod + runtime | Zod + cross-field |
| **Performance** | ~5-10ms | ~10-15ms (target) |

## API Stability Guarantees

### Legacy Schema (`FundModelInputs`)
**Status**: FROZEN ✅

- No breaking changes without major version bump
- Semantic versioning applies
- Maintained for backward compatibility
- All existing integrations continue to work

### Extended Schema (`ExtendedFundModelInputs`)
**Status**: Evolving 🔄

- Version 2.0.0 released in PR #3.5
- Minor versions may add optional fields
- Breaking changes require migration path
- Zod schemas provide runtime validation safety

## Testing Strategy

### Unit Tests
- **Schema Validation**: All schemas validate correctly
- **Adapter Tests**: Round-trip conversion preserves data
- **Calculation Tests**: Engine produces expected outputs

### Integration Tests
- **End-to-End**: UI → Engine → Results
- **Parity Tests**: V1 vs V2 on overlapping features
- **Performance Tests**: < 15ms for 1,000 companies × 120 months

### Golden Fixtures
Snapshot tests with known-good outputs:

```typescript
// Example: Standard VC Fund
const standardFund: ExtendedFundModelInputs = { /* ... */ };
const result = runFundModelV2(standardFund);

expect(result.finalMetrics.tvpi).toBeCloseTo(2.54, 2);
expect(result.finalMetrics.dpi).toBeCloseTo(1.23, 2);
expect(result.finalMetrics.irr).toBeCloseTo(18.25, 2);
```

## Code Organization

```
client/src/lib/
├── fund-calc.ts              # Legacy engine (v1.0.0)
├── fund-calc-v2.ts           # Schema-native engine (v2.0.0)
├── schema-adapter.ts         # Bridge layer
├── decimal-utils.ts          # Shared utilities
└── xirr.ts                   # IRR calculations

shared/schemas/
├── fund-model.ts             # Legacy schema (FROZEN)
├── extended-fund-model.ts    # New complete schema
├── stage-profile.ts          # Stage-based modeling
├── fee-profile.ts            # Tiered fee structure
├── capital-call-policy.ts    # Call timing policies
├── waterfall-policy.ts       # Distribution waterfalls
├── recycling-policy.ts       # Recycling rules
└── examples/
    └── standard-fund.ts      # Example configurations
```

## Performance Targets

| Scenario | Target | Actual |
|----------|--------|--------|
| **Simple Fund** (10 cos, 40 periods) | < 5ms | TBD |
| **Standard Fund** (25 cos, 40 periods) | < 15ms | TBD |
| **Large Fund** (100 cos, 120 periods) | < 50ms | TBD |
| **Complex** (100 cos, recycling, waterfall) | < 100ms | TBD |

## Error Handling

### Validation Errors
Both engines use Zod for validation:

```typescript
try {
  const validated = ExtendedFundModelInputsSchema.parse(userInput);
  const result = runFundModelV2(validated);
} catch (error) {
  if (error instanceof z.ZodError) {
    // Show user-friendly validation errors
    console.error(error.errors);
  }
}
```

### Runtime Errors
- **Capital conservation**: Ensure no capital is created/destroyed
- **Invariant checks**: Validate assumptions (e.g., shares don't increase without financing)
- **Graceful degradation**: Return partial results if possible

## Monitoring & Observability

### Metrics to Track
- **Engine version**: v1 vs v2 usage
- **Calculation time**: P50, P95, P99
- **Validation errors**: Common failure modes
- **Feature usage**: Which policies are used most

### Logging
```typescript
logger.info('Fund calculation started', {
  engineVersion: 'v2.0.0',
  fundId: inputs.id,
  committedCapital: inputs.committedCapital.toString()
});

const startTime = performance.now();
const result = runFundModelV2(inputs);
const duration = performance.now() - startTime;

logger.info('Fund calculation completed', {
  duration,
  periods: result.periods.length,
  tvpi: result.finalMetrics.tvpi.toString()
});
```

## Next Steps

1. **Create Golden Fixtures** (PR #4)
   - Define 3-5 canonical test cases
   - Snapshot expected outputs
   - Set up CI regression tests

2. **Build Configuration Wizard** (PR #4)
   - Schema-based form UI
   - Real-time validation
   - Policy preview/comparison

3. **Integrate V2 Engine** (PR #4-5)
   - Wire into `FundProvider`
   - Feature flag rollout
   - A/B test V1 vs V2

4. **Reserve Optimizer** (PR #5)
   - MOIC-based ranking
   - Greedy allocation
   - Constraint handling

5. **Performance Gates** (PR #6)
   - Benchmark suite
   - CI performance tests
   - Bundle size limits

## Resources

- [Schema System README](../schemas/README.md)
- [Example Configurations](../../shared/schemas/examples/standard-fund.ts)
- [Legacy Schema](../../shared/schemas/fund-model.ts)
- [Extended Schema](../../shared/schemas/extended-fund-model.ts)
