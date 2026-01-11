# TypeScript Baseline Reduction: High-Leverage File Cleanup

**Date:** 2026-01-11 **Goal:** Reduce TypeScript errors from 217 → 177 (18%
reduction, 40 errors fixed) **Estimated Time:** 1-2 hours **Risk Level:** Low

## Overview

Fix TypeScript errors in 3 high-leverage files using systematic pattern-based
corrections. Each file contains repeatable error patterns that can be addressed
with type guards and proper interfaces.

## Current State

**TypeScript Error Distribution (217 total):**

- 55 TS2322 (Type assignment mismatches)
- 53 TS2345 (Argument type mismatches)
- 37 TS2339 (Property does not exist)
- 30 TS18046 (Possibly undefined)
- 19 TS2769 (No overload matches)
- 18 TS2532 (Possibly undefined)

**High-Leverage Files:**

- `BulkImportModal.tsx`: 15 errors (7% of total)
- `EnhancedAnalyticsPanel.tsx`: 17 errors (8% of total)
- `ScenarioComparison.tsx`: 8 errors (4% of total)
- **Total: 40 errors = 18% reduction potential**

## File Prioritization & Risk Assessment

**Execution Order (lowest to highest risk):**

### 1. BulkImportModal.tsx (15 errors) - LOWEST RISK

- **Pattern:** CSV parsing returns `unknown[]`, accessing properties without
  type guards
- **Fix:** Create `CsvRow` interface, add type assertions with validation
- **Risk Level:** Low - validation logic already exists, just needs types
- **Tests:** Manual CSV upload test (no automated tests)

### 2. EnhancedAnalyticsPanel.tsx (17 errors) - MEDIUM RISK

- **Pattern:** Empty object types `{}` instead of proper interfaces
- **Fix:** Find API response types or infer from usage
- **Risk Level:** Medium - depends on API contract being stable
- **Tests:** Visual regression (analytics display)

### 3. ScenarioComparison.tsx (8 errors) - HIGHEST RISK

- **Pattern:** Mixed (TS18046, TS7053, TS7031, TS2739, TS2345)
- **Fix:** Multiple type issues, likely needs interface changes
- **Risk Level:** Higher - more complex type dependencies
- **Tests:** Scenario comparison UI flows

## Implementation Approach

### BulkImportModal.tsx Fix Strategy

Create typed interface for CSV rows:

```typescript
interface CsvRow {
  company_name: string;
  investment_date: string;
  stage: string;
  amount_invested: string;
  valuation_pre_money: string;
  valuation_post_money: string;
  equity_percentage: string;
  sector: string;
  lead_investor: string;
  status: string;
  notes: string;
  _rowNumber: number;
}

// Replace unknown[] with CsvRow[]
const parseCSV = (text: string): CsvRow[] => { ... }

// Add type guard for validation
function isValidCsvRow(row: unknown): row is CsvRow {
  return typeof row === 'object' && row !== null &&
    'company_name' in row && 'investment_date' in row;
}

// Use in validateAndImport
parsedData.forEach(row => {
  if (!isValidCsvRow(row)) {
    errors.push({ row: row._rowNumber, message: 'Invalid row format' });
    return;
  }
  // Now TypeScript knows row is CsvRow - all 15 errors disappear
});
```

### EnhancedAnalyticsPanel.tsx Fix Strategy

- Search for API endpoint that provides analytics data
- Infer interface from API response or usage sites
- Create proper type definitions (IrrResult, DistributionStats,
  MonteCarloResult)
- Replace `{}` with actual types

### ScenarioComparison.tsx Fix Strategy

- Analyze the mixed errors case-by-case
- Define missing interfaces for scenario data
- Add proper type annotations to function parameters

## Testing & Verification Strategy

**Per-File Verification Workflow:**

After each file fix:

1. **TypeScript check:** `npx tsc --noEmit` - confirm errors reduced
2. **Lint check:** `npm run lint` - no new ESLint issues
3. **Build test:** `npm run build` - successful compilation
4. **Unit tests:** `npm test` - existing tests pass
5. **Update baseline:** `npm run baseline:save` - ratchet down errors
6. **Commit:** Atomic commit with clear message

**Rollback Strategy:**

- Each file is a separate commit
- If any step fails: `git reset --hard HEAD` and document failure
- Skip problematic file, continue to next
- Come back to skipped files with different approach

**Success Metrics Tracking:**

```
File 1 (BulkImportModal): 217 → 202 (-15 errors)
File 2 (EnhancedAnalytics): 202 → 185 (-17 errors)
File 3 (ScenarioComparison): 185 → 177 (-8 errors)
Total reduction: 40 errors (18%)
```

## Failure Handling

- **Runtime bugs:** Revert immediately
- **Test failures:** Analyze diff, fix manually if trivial, otherwise revert
- **New TS errors:** Likely type cascade, revert and reassess

## Codex Execution Plan

Each file gets its own Codex invocation via heredoc to handle complex
instructions safely:

```bash
codex-wrapper - /c/dev/Updog_restore <<'EOF'
Fix all TypeScript errors in @client/src/components/investments/BulkImportModal.tsx:
1. Create CsvRow interface matching CSV_TEMPLATE_HEADERS
2. Add type guard isValidCsvRow
3. Replace unknown[] with CsvRow[] in parseCSV return type
4. Add type guards in validateAndImport function
5. Ensure zero runtime behavior changes
EOF
```

## Success Criteria

- TypeScript errors: 217 → 177 (18% reduction)
- Zero runtime behavior changes
- All existing tests pass
- Build completes without new errors
- Each file committed separately with clear messages

## Notes

- This is phase 1 of baseline reduction
- After success, can target TS2322/TS2345 patterns (108 errors, 50% of total)
- File-by-file approach minimizes blast radius
- Clear rollback path for each change
