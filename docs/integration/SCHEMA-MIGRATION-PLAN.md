---
status: ACTIVE
last_updated: 2026-05-17
---

# Schema System Integration Plan

## Overview

Current integration state for fund modeling schemas and active calculation
surfaces. Earlier schema-native engine prototype work is historical; production
fund construction now runs through `/fund-setup`, server-backed snapshots, and
the shared economics engine when enabled.

## Architecture

### Active Approach

Production supports the store-based fund setup flow and server-backed
calculation snapshots:

```
┌─────────────────────────────────────────────────────────────┐
│                        UI Layer                              │
├─────────────────────┬───────────────────────────────────────┤
│   Fund setup        │   Results / forecasting                 │
│   (/fund-setup)     │   (server-backed reads)                 │
└──────────┬──────────┴─────────────┬─────────────────────────┘
           │                        │
           │                        │
   ┌───────▼────────┐      ┌────────▼──────────┐
   │ FundDraftWrite │      │ fund snapshots /  │
   │      V1        │      │ metrics services  │
   │                │      │                   │
   └───────┬────────┘      └────────┬──────────┘
           │                        │
           │                ┌───────▼───────┐
           │                │ shared        │
           │                │ economics     │
           │                └───────┬───────┘
           │                        │
   ┌───────▼────────────────────────▼──────────┐
   │        Active Calculation Surfaces         │
   ├────────────────┬──────────────────────────┤
   │  fund-setup    │ shared economics +       │
   │  publish flow  │ reserve/pacing snapshots │
   └────────────────┴──────────────────────────┘
```

### Components

#### 1. **fund-setup publish flow** (current)

- Uses `/fund-setup` as the production owner for fund construction
- Publishes through `POST /api/funds/finalize`
- Dispatches authoritative reserve and pacing calculations
- Optionally dispatches GP economics when `enable_gp_economics_engine` is
  enabled
- **Status**: Active

#### 2. **shared economics engine** (current)

- Uses `FundDraftWriteV1` plus economics assumptions
- Produces review-step dry-runs and persisted economics snapshots
- **Status**: Active when the GP economics feature flag is enabled

#### 3. **fund-calc.ts** (legacy engine - v1.0.0)

- Uses `FundModelInputs` (frozen schema from PR #2)
- Simple deterministic calculations
- Exit buckets via `index % 4`
- Flat 2% management fees
- Upfront capital calls only
- **Status**: Maintained for backward compatibility

#### 4. **schema-adapter.ts** (bridge layer)

Two-way conversion:

- `adaptToLegacySchema()` - ExtendedFundModelInputs → FundModelInputs
- `adaptFromLegacySchema()` - FundModelInputs → ExtendedFundModelInputs
- `validateLegacyCompatibility()` - Warn about features lost in conversion

**Use Cases**:

- Migrate existing fund configurations to new schema
- Run new configurations through legacy engine for comparison
- Gradual migration of UI components

## Migration Path

### Phase 1: Dual Engine Support (historical)

- [x] Create `ExtendedFundModelInputs` schema system
- [x] Build schema-native engine prototype
- [x] Create `schema-adapter.ts` bridge
- [x] Document schemas and examples

**Current status**: the schema-native engine prototype and its worker were
removed after B4 analysis showed no live product instantiation path. The active
production path is `/fund-setup` plus server-backed results and forecasting.

### Phase 2: Production Route Alignment (current)

- [x] Route fund construction through `/fund-setup`
- [x] Publish through `POST /api/funds/finalize`
- [x] Read results through `/api/funds/:id/results`
- [x] Read deterministic forecasting through `/api/funds/:id/dual-forecast`
- [ ] Keep schema-adapter usage under review

**Result**: routed product surfaces use server-backed calculations instead of a
client-side schema-native engine prototype.

### Phase 3: Golden Fixtures

- [ ] Create canonical active-surface test cases with known outputs
- [ ] Snapshot economics, reserve, pacing, and forecast outputs for regression
      detection
- [ ] Keep route-level tests tied to `/fund-setup`,
      `/fund-model-results/:fundId`, and `/financial-modeling`

**Test Cases**:

1. **Simple Case** - Single-stage fund, no fees, no exits
2. **Standard VC Fund** - $100M early-stage, 2%/1.5% fees, European waterfall
3. **Complex Case** - Multi-tier fees, recycling, American waterfall

### Phase 4: Advanced Features

- [ ] Implement Reserve Optimizer v1 (MOIC-based ranking)
- [ ] Add sophisticated reserve allocation strategies
- [ ] Implement FMV marking for active investments
- [ ] Add exit proceeds recycling logic
- [ ] Build waterfall tier visualization

### Phase 5: Deprecation & Cleanup (PR #7+)

- [x] Remove dormant schema-native engine prototype from active source
- [ ] Reassess `schema-adapter.ts` once no active callers remain
- [ ] Reassess legacy `fund-calc.ts` only after all active routes are confirmed
      to use server-backed calculations

## Active Surface Matrix

| Surface                        | Purpose                              | Status                     |
| ------------------------------ | ------------------------------------ | -------------------------- |
| `/fund-setup`                  | Fund construction and publish flow   | Active                     |
| `/api/funds/finalize`          | Atomic create/publish entrypoint     | Active                     |
| Reserve snapshots              | Authoritative reserve outputs        | Active                     |
| Pacing snapshots               | Authoritative pacing outputs         | Active                     |
| Shared economics engine        | GP economics outputs when flagged on | Active/flagged             |
| `fund-calc.ts`                 | Legacy deterministic helper          | Backward compatibility     |
| Schema-native engine prototype | Former client-side prototype         | Removed from active source |

## API Stability Guarantees

### Legacy Schema (`FundModelInputs`)

**Status**: FROZEN

- No breaking changes without major version bump
- Semantic versioning applies
- Maintained for backward compatibility
- All existing integrations continue to work

### Extended Schema (`ExtendedFundModelInputs`)

**Status**: Schema artifacts retained

- Used by schema artifacts and adapters where still referenced
- No standalone active calculation engine currently consumes it
- Breaking changes require a migration path where persisted data is involved
- Zod schemas provide runtime validation safety

## Testing Strategy

### Unit Tests

- **Schema Validation**: All schemas validate correctly
- **Adapter Tests**: Round-trip conversion preserves data
- **Calculation Tests**: Active engines produce expected outputs

### Integration Tests

- **End-to-End**: UI → API → snapshots/results
- **Forecasting**: dual forecast aggregation uses current server-backed sources
- **Publish lifecycle**: finalize dispatches expected calculation engines

### Golden Fixtures

Snapshot tests should target active calculation surfaces: shared economics,
reserve snapshots, pacing snapshots, and dual forecast aggregation.

## Code Organization

```
client/src/lib/
├── fund-calc.ts              # Legacy engine (v1.0.0)
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

Performance targets should be attached to the active engine or route being
measured, not to the removed schema-native prototype.

| Surface                        | Target Evidence                                                              |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `/api/funds/finalize`          | publish completes and dispatches calc jobs without blocking on async workers |
| Shared economics               | bounded synchronous runtime for review-step dry-runs                         |
| `/api/funds/:id/dual-forecast` | dashboard-ready response within route SLO                                    |

## Error Handling

### Validation Errors

Active publish and economics paths use Zod for validation:

```typescript
try {
  const validated = FundDraftWriteV1Schema.parse(userInput);
  const result = runEconomicsModel(validated);
} catch (error) {
  if (error instanceof z.ZodError) {
    // Show user-friendly validation errors
    console.error(error.errors);
  }
}
```

### Runtime Errors

- **Capital conservation**: Ensure no capital is created/destroyed
- **Invariant checks**: Validate assumptions (e.g., shares don't increase
  without financing)
- **Graceful degradation**: Return partial results if possible

## Monitoring & Observability

### Metrics to Track

- **Engine version**: snapshot `calcVersion` and route/service source
- **Calculation time**: P50, P95, P99
- **Validation errors**: Common failure modes
- **Feature usage**: Which policies are used most

### Logging

```typescript
logger.info('Fund calculation started', {
  engineVersion: 'economics-v1',
  fundId: inputs.id,
  fundSize: inputs.fundSize,
});

const startTime = performance.now();
const result = runEconomicsModel(inputs);
const duration = performance.now() - startTime;

logger.info('Fund calculation completed', {
  duration,
  annualRows: result.annual.length,
  tvpi: result.summary.finalTvpi,
});
```

## Next Steps

1. **Create Golden Fixtures**
   - Define 3-5 canonical test cases
   - Snapshot expected outputs
   - Set up CI regression tests

2. **Harden Active Results**
   - Keep `/fund-model-results/:fundId` tied to current snapshot versions
   - Keep `/financial-modeling` backed by dual forecast API data

3. **Reserve Optimizer**
   - MOIC-based ranking
   - Greedy allocation
   - Constraint handling

4. **Performance Gates**
   - Benchmark suite
   - CI performance tests
   - Bundle size limits

## Resources

- [Schema System README](../schemas/README.md)
- [Example Configurations](../../shared/schemas/examples/standard-fund.ts)
- [Legacy Schema](../../shared/schemas/fund-model.ts)
- [Extended Schema](../../shared/schemas/extended-fund-model.ts)
