# ADR-007: Exit Recycling Policy

## Status

Accepted

## Context

**What is Exit Recycling in VC Funds?**

Exit recycling is a Limited Partnership Agreement (LPA) provision that allows a
venture capital fund to reinvest exit proceeds back into new or follow-on
investments, rather than immediately distributing all proceeds to Limited
Partners (LPs). This mechanism extends the fund's deployment capacity beyond its
initial committed capital, enabling GPs to capitalize on additional investment
opportunities during the fund's active period.

**Why This Feature Exists**

Press On Ventures requires exit recycling modeling to:

- **Scenario Planning**: Model different recycling strategies to understand
  their impact on fund deployment capacity and LP returns
- **Strategic Flexibility**: Enable GPs to explore aggressive deployment
  strategies where early exits fuel additional investments
- **LP Communication**: Provide clear calculations showing how recycling
  provisions affect capital calls, distributions, and net returns
- **Comparative Analysis**: Compare funds with and without recycling provisions
  to quantify the strategic value

**Industry Standards and Practices**

Exit recycling is a common but carefully constrained provision in VC LPAs:

- **Typical Cap Range**: 10-20% of committed capital (rarely exceeds 25%)
- **Typical Period**: 3-5 years from vintage year
- **Standard Rate**: 75-100% of exit proceeds eligible for recycling
- **Basis Convention**: Percentage of committed capital (most predictable for
  LPs)
- **Period Start**: Measured from fund vintage year, not first investment
- **Eligibility**: Time-based only—if exit occurs within recycling period,
  proceeds are eligible

**Relationship to Fee Recycling**

Exit recycling is distinct from management fee recycling (see
`client/src/lib/fee-calculations.ts`):

- **Fee Recycling**: Cap is the cumulative management fees paid to date
- **Exit Recycling**: Cap is a fixed percentage of committed capital
- **Mutual Exclusivity**: Funds can implement both provisions simultaneously;
  they operate on independent caps
- **Use Cases**: Fee recycling is more conservative (5-10% of fund), exit
  recycling enables more aggressive deployment (10-20%)

---

## Decision 1: Recycling Cap Structure

**Decision**: Use percentage-based cap relative to committed capital with range
validation [0%, 25%]

**Rationale**

Industry standard practice dictates that recycling caps are expressed as a
percentage of committed capital:

1. **Predictability for LPs**: Percentage of committed capital is known at fund
   inception
2. **Fund Size Independence**: Percentage-based caps scale naturally across
   different fund sizes
3. **Standard Range**: 10-20% is common, >20% triggers scrutiny, 25% is hard
   maximum

**Alternatives Considered**

- **Absolute Dollar Cap** (Rejected): Doesn't scale; less intuitive for
  comparative analysis
- **Called Capital Basis** (Rejected): Unpredictable; varies over time
- **Investment-Specific Caps** (Not Implemented): Added complexity without user
  demand

**Implementation**

- Formula: `maxRecyclableCapital = fundSize × (recyclingCapPercent / 100)`
- Validation: 0-25% hard limit, warnings at >20% and <5%
- Code: `client/src/lib/exit-recycling-calculations.ts:158-163`

---

## Decision 2: Recycling Period Conventions

**Decision**: Use year-based periods with integer years [1-10 years], assessed
from fund vintage year

**Rationale**

1. **Annual Fund Planning Cycles**: VC funds operate on annual cycles
2. **Industry Standard Range**: 3-5 years typical, 1-2 too short, 7-10 overlaps
   harvest period
3. **Vintage Year Basis**: Period measured from fund vintage, ensuring
   predictable eligibility
4. **Extension Support**: Schema supports extensions but wizard uses fixed
   periods

**Alternatives Considered**

- **Month-Based Periods** (Schema Supports): Unnecessary precision for scenario
  planning
- **Rolling Windows** (Not Implemented): Per-investment tracking too complex
- **Milestone-Based Periods** (Not Implemented): Unpredictable for LPs, circular
  dependencies

**Implementation**

- Eligibility: `isExitWithinRecyclingPeriod(exitYear, period)` returns
  `exitYear <= period`
- Annual capacity: `maxRecyclableCapital / recyclingPeriod` for pacing analysis
- Validation: 1-10 years, warnings at <3 years and >7 years
- Code: `client/src/lib/exit-recycling-calculations.ts:596-601`

---

## Decision 3: Exit Eligibility Criteria

**Decision**: Time-based eligibility only (within recycling period), no other
restrictions

**Rationale**

1. **Simplicity Priority**: Single time criterion provides 90% of modeling value
2. **Industry Norm**: Standard LPA provisions use period-based eligibility
   without carve-outs
3. **Predictable Modeling**: All exits in years 1-N eligible, all after year N
   ineligible
4. **Flexibility Preserved**: Schema includes `excludedInvestments` for future
   use

**Alternatives Considered**

- **Investment-Specific Exclusions** (Schema Supports): Too complex for wizard
- **Minimum Exit Size Threshold** (Not Implemented): Uncommon in practice
- **Exit Type Filtering** (Not Implemented): Not requested by users
- **Performance-Based Eligibility** (Not Implemented): Creates perverse
  incentives

**Implementation**

- Single check: `exitEvent.withinRecyclingPeriod` boolean flag
- Eligible proceeds: full `fundProceeds` amount considered
- Ineligible proceeds: 0 recyclable, 100% to LPs
- Code: `client/src/lib/exit-recycling-calculations.ts:251-260`

---

## Decision 4: Recycling Rate and Timing Options

**Decision**: Support configurable recycling rate [0-100%] with immediate
recycling as default

**Rationale**

- **Rate Flexibility**: LPs may want partial recycling (50-100% typical)
- **Timing Options**: Schema supports immediate, quarterly, semi-annual, annual
- **Wizard Default**: Immediate recycling for simplicity

**Implementation**

- Formula: `recycledAmount = min(fundProceeds × rate, remainingCap)`
- Applied to eligible proceeds only
- Code: `client/src/lib/exit-recycling-calculations.ts:228-239`

---

## Decision 5: Cap Enforcement Strategy

**Decision**: Enforce cap strictly via chronological processing with zero
tolerance

**Rationale**

- Process exits chronologically (sort by year)
- Track remaining capacity cumulatively
- Stop recycling when cap reached
- Excess proceeds go to LPs
- Floating-point tolerance: 0.01

**Implementation**

- Sort exits before processing
- Cumulative capacity tracking
- `capReached` flag when `remainingCapacity <= 0.01`
- Code: `client/src/lib/exit-recycling-calculations.ts:287-314, 342`

---

## Decision 6: Management Fee Recycling

**Decision**: Support management fee recycling as separate calculation, not
integrated into exit recycling

**Rationale**

- Different source: fees vs. exit proceeds
- Schema supports both sources via `RecyclingPolicySchema`
- Wizard focuses on exit recycling only
- Separate function: `calculateMgmtFeeRecycling()`

**Implementation**

- Separate calculation function
- Can be combined in policy schema
- Not included in exit recycling calculations
- Code: `client/src/lib/exit-recycling-calculations.ts:361-366`

---

## Decision 7: Validation and Warnings

**Decision**: Implement comprehensive validation with errors (blocking) and
warnings (informational)

**Rationale**

- Guide users to industry norms
- Prevent impossible configurations
- Warn about uncommon patterns

**Validation Rules**

Errors (blocking):

- Cap outside [0%, 25%]
- Period outside [1, 10] years
- Rate outside [0%, 100%]

Warnings (informational):

- Cap >20% (uncommon, LP scrutiny)
- Cap <5% (low utility)
- Period <3 years (too short)
- Period >7 years (overlaps harvest)
- Rate <50% (reduces effective capacity)

**Implementation**

- `validateExitRecycling()` returns `ValidationResult`
- Errors block calculation
- Warnings shown to user but non-blocking
- Code: `client/src/lib/exit-recycling-calculations.ts:470-585`

---

## Consequences

### Positive

- Clear, predictable recycling behavior
- Industry-standard practices
- Flexible configuration options
- Strong validation prevents errors
- Scalable across fund sizes

### Negative

- No complex eligibility rules in wizard
- No investment-specific exclusions exposed
- Immediate recycling only (timing options in schema but not wizard)

### Neutral

- Management fee recycling kept separate
- Chronological processing required
- Capacity tracking overhead minimal

---

## References

- Implementation: `client/src/lib/exit-recycling-calculations.ts`
- Schema: `shared/schemas/recycling-policy.ts`
- Wizard Schema: `client/src/schemas/modeling-wizard.schemas.ts`
- Truth Cases: `docs/exit-recycling.truth-cases.json`
- Validation Framework: `scripts/validation/exit-recycling-validation.yaml`
