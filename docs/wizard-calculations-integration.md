# Wizard Calculations Integration Guide

## Overview

The wizard calculations layer provides a clean API for modeling wizard components to perform portfolio validation, reserve calculations, and metrics enrichment. This guide explains how to integrate the calculation system with the XState wizard machine and React components.

## Architecture

```
┌─────────────────────────────────────────────┐
│ React Components                             │
│ - Uses useWizardCalculations() hook         │
│ - Sends PORTFOLIO_CHANGED events            │
│ - Sends CALCULATE_RESERVES events           │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│ useWizardCalculations Hook                   │
│ - Optimized useMemo dependencies ✅         │
│ - Strong typing (NO any!) ✅               │
│ - Returns reactive validation + metrics     │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│ XState Machine (wizard machine)              │
│ - Reactive validation (PORTFOLIO_CHANGED)   │
│ - Calculation actor (calculateReserves)     │
│ - State: calculatingReserves                │
│ - Context: portfolioValidation, calculations│
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│ Wizard Calculations Layer                   │
│ - validateWizardPortfolio()                 │
│ - enrichWizardMetrics()                     │
│ - generatePortfolioSummary()                │
│ - calculateReservesForWizard() (re-export)  │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│ Wizard Reserve Bridge                       │
│ - Format translation (dollars ↔ cents)      │
│ - Unit conversion (decimals ↔ basis points) │
│ - Adapter integration                       │
└─────────────────────────────────────────────┘
```

## Quick Start

### 1. Import the Hook

```typescript
import { useWizardCalculations } from '@/hooks/useWizardCalculations';
import { useActor } from '@xstate/react';
```

### 2. Use in Component

```typescript
function CapitalAllocationStep() {
  const [state, send] = useActor(wizardMachine);
  const portfolio = state.context.steps.capitalAllocation?.syntheticPortfolio || [];

  // Hook provides reactive validation and metrics
  const {
    validation,      // Full validation result
    isValid,         // Boolean: is portfolio valid?
    hasErrors,       // Boolean: has validation errors?
    hasWarnings,     // Boolean: has validation warnings?
    summary,         // Portfolio summary stats
    enrichedMetrics, // Enriched reserve metrics (if calculated)
    isReadyForCalculation, // Boolean: ready to calculate reserves?
    reserveAllocation,     // Raw reserve results (if available)
    hasReserves      // Boolean: has reserves been calculated?
  } = useWizardCalculations(portfolio, state.context);

  // ... rest of component
}
```

### 3. Handle Portfolio Changes

```typescript
const handlePortfolioChange = (newPortfolio: WizardPortfolioCompany[]) => {
  // Save portfolio data to machine
  send({
    type: 'SAVE_STEP',
    step: 'capitalAllocation',
    data: {
      ...state.context.steps.capitalAllocation,
      syntheticPortfolio: newPortfolio
    }
  });

  // Trigger reactive validation
  send({ type: 'PORTFOLIO_CHANGED' });
};
```

### 4. Display Validation Results

```typescript
{/* Show errors (blocks calculation) */}
{hasErrors && (
  <Alert variant="error">
    <AlertTitle>Portfolio Validation Errors</AlertTitle>
    <ul>
      {validation.errors.map((error, i) => (
        <li key={i}>{error}</li>
      ))}
    </ul>
  </Alert>
)}

{/* Show warnings (doesn't block calculation) */}
{hasWarnings && (
  <Alert variant="warning">
    <AlertTitle>Portfolio Warnings</AlertTitle>
    <ul>
      {validation.warnings.map((warning, i) => (
        <li key={i}>{warning}</li>
      ))}
    </ul>
  </Alert>
)}
```

### 5. Display Portfolio Summary

```typescript
<Card>
  <CardHeader>Portfolio Summary</CardHeader>
  <CardContent>
    <dl>
      <dt>Total Companies:</dt>
      <dd>{summary.totalCompanies}</dd>

      <dt>Total Invested:</dt>
      <dd>${summary.totalInvested.toLocaleString()}</dd>

      <dt>Total Valuation:</dt>
      <dd>${summary.totalValuation.toLocaleString()}</dd>

      <dt>Average MOIC:</dt>
      <dd>{summary.averageMOIC.toFixed(2)}x</dd>
    </dl>

    <h4>Sector Breakdown</h4>
    {Object.entries(summary.sectorBreakdown).map(([sector, invested]) => (
      <div key={sector}>
        {sector}: ${invested.toLocaleString()}
      </div>
    ))}
  </CardContent>
</Card>
```

### 6. Calculate Reserves Button

```typescript
const handleCalculateReserves = () => {
  if (isReadyForCalculation) {
    send({ type: 'CALCULATE_RESERVES' });
  }
};

<Button
  onClick={handleCalculateReserves}
  disabled={!isReadyForCalculation}
  loading={state.matches('active.calculatingReserves')}
>
  {state.matches('active.calculatingReserves')
    ? 'Calculating...'
    : 'Calculate Reserves'}
</Button>
```

### 7. Display Enriched Metrics

```typescript
{enrichedMetrics && (
  <Card>
    <CardHeader>Reserve Allocation Metrics</CardHeader>
    <CardContent>
      <dl>
        <dt>Total Planned Reserves:</dt>
        <dd>${enrichedMetrics.totalPlanned.toLocaleString()}</dd>

        <dt>Optimal MOIC:</dt>
        <dd>{enrichedMetrics.optimalMOIC.toFixed(2)}x</dd>

        <dt>Companies Supported:</dt>
        <dd>{enrichedMetrics.companiesSupported}</dd>

        <dt>Utilization Rate:</dt>
        <dd>{enrichedMetrics.insights.utilizationRate.toFixed(1)}%</dd>

        <dt>Reserve Efficiency:</dt>
        <dd>{enrichedMetrics.insights.reserveEfficiency.toFixed(2)}x</dd>

        <dt>Concentration Risk:</dt>
        <dd>
          <Badge variant={
            enrichedMetrics.insights.concentrationRisk === 'Low' ? 'success' :
            enrichedMetrics.insights.concentrationRisk === 'Medium' ? 'warning' :
            'error'
          }>
            {enrichedMetrics.insights.concentrationRisk}
          </Badge>
        </dd>

        <dt>Capital Deployment:</dt>
        <dd>{enrichedMetrics.insights.capitalDeployment}</dd>
      </dl>
    </CardContent>
  </Card>
)}
```

## API Reference

### Hook: `useWizardCalculations(portfolio, wizardContext)`

**Parameters:**
- `portfolio: WizardPortfolioCompany[]` - Array of portfolio companies
- `wizardContext: ModelingWizardContext | undefined` - Wizard machine context (strongly-typed, NO `any`)

**Returns:**
```typescript
{
  validation: PortfolioValidationResult,
  isValid: boolean,
  hasErrors: boolean,
  hasWarnings: boolean,
  summary: PortfolioSummary,
  enrichedMetrics: EnrichedReserveAllocation | null,
  isReadyForCalculation: boolean,
  reserveAllocation: ReserveAllocation | undefined,
  hasReserves: boolean
}
```

**Performance Optimization:**
- ✅ `validation` and `summary` only recalculate when `portfolio` changes
- ✅ `enrichedMetrics` only recalculates when specific context fields change:
  - `reserveAllocation`
  - `generalInfo`
  - `capitalAllocation`
- ✅ Does NOT recalculate on unrelated context changes (e.g., `currentStep`, `isDirty`)

### Function: `validateWizardPortfolio(portfolio)`

Validates portfolio data before reserve calculation.

**Parameters:**
- `portfolio: WizardPortfolioCompany[]` - Companies to validate

**Returns:**
```typescript
{
  valid: boolean,        // true if no errors
  errors: string[],      // Blocking errors
  warnings: string[]     // Non-blocking warnings
}
```

**Validation Rules:**
- Portfolio cannot be empty
- No duplicate company IDs
- All monetary values must be non-negative
- Ownership must be 0-100%
- Company name and ID required
- Stage must be valid

### Function: `generatePortfolioSummary(portfolio)`

Generates summary statistics and breakdowns.

**Parameters:**
- `portfolio: WizardPortfolioCompany[]` - Companies to summarize

**Returns:**
```typescript
{
  totalCompanies: number,
  totalInvested: number,
  totalValuation: number,
  averageMOIC: number,
  sectorBreakdown: Record<string, number>,  // sector → invested $
  stageBreakdown: Record<string, number>    // stage → invested $
}
```

### Function: `enrichWizardMetrics(allocation, context)`

Enriches reserve allocation with fund-specific insights.

**Parameters:**
- `allocation: ReserveAllocation` - Base reserve allocation
- `context: ModelingWizardContext` - Wizard context for fund data

**Returns:**
```typescript
{
  totalPlanned: number,
  optimalMOIC: number,
  companiesSupported: number,
  avgFollowOnSize: number,
  insights: {
    utilizationRate: number,        // % of fund deployed (including reserves)
    reserveEfficiency: number,       // MOIC improvement from reserves
    concentrationRisk: 'Low' | 'Medium' | 'High',
    capitalDeployment: 'Conservative' | 'Balanced' | 'Aggressive'
  }
}
```

**Risk Levels:**
- **Concentration Risk:**
  - Low: Top 3 companies < 50% of reserves
  - Medium: Top 3 companies 50-75% of reserves
  - High: Top 3 companies > 75% of reserves

- **Capital Deployment:**
  - Conservative: < 70% of capital allocated
  - Balanced: 70-90% of capital allocated
  - Aggressive: > 90% of capital allocated

### Function: `calculateReservesForWizard(ctx, portfolio)`

Main reserve calculation function (re-exported from bridge).

**Parameters:**
- `ctx: ModelingWizardContext` - Wizard state
- `portfolio: WizardPortfolioCompany[]` - Companies

**Returns:** `Promise<ReserveAllocation>`

## XState Machine Integration

### Context Fields

```typescript
interface ModelingWizardContext {
  // ... existing fields

  // Reactive portfolio validation (NEW)
  portfolioValidation?: PortfolioValidationResult;

  // Calculation results (NEW)
  calculations?: {
    reserves?: ReserveAllocation;
    enrichedReserves?: EnrichedReserveAllocation;
  };
}
```

### Events

```typescript
// Reactive validation
{ type: 'PORTFOLIO_CHANGED' }

// Calculate reserves
{ type: 'CALCULATE_RESERVES' }
```

### States

```
active
  ├── editing
  │   ├── on PORTFOLIO_CHANGED → actions: validatePortfolio
  │   └── on CALCULATE_RESERVES → calculatingReserves
  └── calculatingReserves
      ├── invoke: calculateReserves actor
      ├── onDone → editing + saveReserveCalculation
      └── onError → editing + clearReserveCalculation
```

### Workflow

1. **User edits portfolio** → UI calls `handlePortfolioChange()`
2. **Send PORTFOLIO_CHANGED event** → Machine runs `validatePortfolio` action
3. **Validation stored in context** → `context.portfolioValidation` updated
4. **Hook provides reactive validation** → UI shows errors/warnings immediately
5. **User clicks "Calculate"** → UI sends CALCULATE_RESERVES event
6. **Machine transitions to calculatingReserves** → Invokes `calculateReserves` actor
7. **Actor validates** → Checks `context.portfolioValidation.valid`
8. **Actor calculates** → Calls `calculateReservesForWizard()` and `enrichWizardMetrics()`
9. **Results stored in context** → `context.calculations` updated
10. **Hook provides enriched metrics** → UI displays results

## Type Safety

### ✅ NO `any` TYPES

The hook is strongly typed:
```typescript
export function useWizardCalculations(
  portfolio: WizardPortfolioCompany[],
  wizardContext: ModelingWizardContext | undefined  // ✅ NOT any!
)
```

### Type Imports

```typescript
import {
  type WizardPortfolioCompany,
  type PortfolioValidationResult,
  type PortfolioSummary,
  type EnrichedReserveAllocation,
  type ReserveAllocation
} from '@/lib/wizard-calculations';

import type { ModelingWizardContext } from '@/machines/modeling-wizard.machine';
```

## Performance Considerations

### Validation & Summary
- **Complexity:** O(n) where n = portfolio size
- **Performance:** Very fast (< 1ms for typical portfolios)
- **Memoization:** Recalculates only when `portfolio` array changes

### Enrichment
- **Complexity:** O(n) for metrics calculation
- **Performance:** Fast (< 5ms for typical portfolios)
- **Memoization:** Recalculates only when specific context fields change

### Reserve Calculation
- **Complexity:** O(n²) due to optimization algorithm
- **Performance:** 100-500ms for typical portfolios (10-50 companies)
- **Async:** Runs in background actor, doesn't block UI

## Error Handling

### Validation Errors

Validation errors are **blocking** - calculation cannot proceed:

```typescript
if (!isReadyForCalculation) {
  return (
    <Alert variant="error">
      Please fix validation errors before calculating reserves.
    </Alert>
  );
}
```

### Calculation Errors

Calculation errors transition back to editing state:

```typescript
// In component
const hasCalculationError = state.matches('active.editing') &&
                           !state.context.calculations?.reserves &&
                           state.context.portfolioValidation?.valid;

{hasCalculationError && (
  <Alert variant="error">
    Reserve calculation failed. Please try again.
  </Alert>
)}
```

## Testing

### Unit Tests

```bash
# Run wizard-calculations tests
npm test -- wizard-calculations

# Run with coverage
npm test -- wizard-calculations --coverage

# Run in watch mode
npm test -- wizard-calculations --watch
```

### Integration Tests

The test suite includes:
- Validation tests (10 tests)
- Enrichment tests (10 tests)
- Summary tests (7 tests)
- Integration tests (3 tests)
- Edge cases (2 tests)

**Total: 32 test cases**

## Troubleshooting

### "Required wizard data not available"
**Cause:** `generalInfo` or `capitalAllocation` steps incomplete
**Fix:** Ensure user completes General Info and Capital Allocation steps before calculating reserves

### "Portfolio validation must pass before calculation"
**Cause:** Attempting to calculate with invalid portfolio
**Fix:** UI should disable calculate button when `!isReadyForCalculation`

### Hook returns stale metrics
**Cause:** Context reference changed but specific fields didn't
**Fix:** Hook is already optimized - this shouldn't happen. Check if portfolio array identity is stable.

### Calculation takes too long
**Cause:** Large portfolio (>100 companies)
**Fix:** Consider pagination or showing progress indicator during calculation

## Best Practices

### 1. Guard Calculate Button

Always check `isReadyForCalculation`:

```typescript
<Button
  onClick={handleCalculate}
  disabled={!isReadyForCalculation}
>
  Calculate Reserves
</Button>
```

### 2. Show Loading State

Display loading indicator during calculation:

```typescript
const isCalculating = state.matches('active.calculatingReserves');

<Button loading={isCalculating}>
  {isCalculating ? 'Calculating...' : 'Calculate Reserves'}
</Button>
```

### 3. Validate Reactively

Send `PORTFOLIO_CHANGED` immediately after portfolio edits:

```typescript
const handleChange = (newPortfolio) => {
  send({ type: 'SAVE_STEP', ... });
  send({ type: 'PORTFOLIO_CHANGED' }); // ← Immediate validation
};
```

### 4. Display Warnings

Show warnings even if validation passes:

```typescript
{hasWarnings && isValid && (
  <Alert variant="warning">
    Portfolio is valid, but consider these warnings...
  </Alert>
)}
```

## See Also

- [wizard-calculations.ts](../client/src/lib/wizard-calculations.ts) - Calculation functions
- [wizard-reserve-bridge.ts](../client/src/lib/wizard-reserve-bridge.ts) - Format translation layer
- [modeling-wizard.machine.ts](../client/src/machines/modeling-wizard.machine.ts) - XState machine
- [useWizardCalculations.ts](../client/src/hooks/useWizardCalculations.ts) - React hook
- [reserves-adapter.ts](../client/src/adapters/reserves-adapter.ts) - Adapter for reserves engine
- [reserves-v11.ts](../shared/lib/reserves-v11.ts) - Core calculation engine
