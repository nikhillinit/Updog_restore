# Issue #153: Refactor computeJCurvePath - Findings

## Research Findings

### Current Implementation Analysis

**File:** `shared/lib/jcurve.ts`
**Function:** `computeJCurvePath` (lines 72-183, ~112 lines)
**Cyclomatic Complexity:** ~41 (threshold: 8)

**Existing Helper Functions:**
| Function | Lines | Complexity | Purpose |
|----------|-------|------------|---------|
| `generatePiecewiseSeed` | 24 | ~5 | Generate fallback TVPI curve |
| `generateCapitalCalls` | 42 | ~8 | Capital call schedule with pacing |
| `materializeNAVandDPI` | 57 | ~10 | NAV/DPI from TVPI curve |
| `computeSensitivityBands` | 52 | ~8 | Parameter perturbation analysis |
| `cumulativeFromPeriods` | 9 | ~2 | Cumulative sum helper |
| `padOrTrimDecimals` | 4 | ~1 | Array padding utility |

**Main Function Complexity Sources:**
1. **Lines 89-152:** Large if/else for curve fitting modes (piecewise vs fitted)
2. **Lines 97-114:** Nested calibration loop when `calledSoFar` provided
3. **Lines 139-145:** Monotonic sanitization loop

### Critical API Mismatch

**Tests expect (from jcurve.spec.ts, jcurve-golden.spec.ts):**
```typescript
interface JCurveConfig {
  fundSize: Decimal;
  targetTVPI: number;
  investmentPeriodQuarters: number;
  fundLifeQuarters: number;
  actualTVPIPoints: { quarter: number; tvpi: number }[];
  navCalculationMode?: 'standard' | 'fee-adjusted';
  finalDistributionCoefficient?: number;
}

// Return type
interface JCurveResult {
  mainPath: { quarter: number; tvpi: number; dpi: number; rvpi: number }[];
  upperBand: { quarter: number; tvpi: number }[];
  lowerBand: { quarter: number; tvpi: number }[];
}
```

**Implementation provides:**
```typescript
interface JCurveConfig {
  kind: CurveKind;  // 'gompertz' | 'logistic' | 'piecewise'
  horizonYears: number;
  investYears: number;
  targetTVPI: Decimal;  // Note: Decimal, not number
  step: Step;  // 'quarter' | 'year'
  // ... other fields
}

interface JCurvePath {
  tvpi: Decimal[];
  nav: Decimal[];
  dpi: Decimal[];
  calls: Decimal[];
  fees: Decimal[];
  params: Record<string, number | Decimal>;
  fitRMSE?: number;
  sensitivityBands?: { low: Decimal[]; high: Decimal[] };
}
```

**Implications:**
- Tests cannot run against current implementation
- Either tests are stale OR there's a missing adapter layer
- Must resolve before refactoring to ensure golden test coverage

### Test Configuration Finding (2026-01-17)

**vitest.config.ts includes:**
- `tests/unit/**/*.test.ts`
- `tests/perf/**/*.test.ts`

**Excluded (orphaned):**
- `tests/shared/*.spec.ts` (uses `.spec.ts` extension, wrong directory)

**Conclusion:** The jcurve test files are **stale/orphaned**:
1. Not included in vitest config
2. Use different API than implementation
3. Use `.spec.ts` extension vs `.test.ts` convention

**Resolution:** Create new golden tests in `tests/unit/` using actual API, or update config to include `tests/shared/`

### Codex CLI Setup

**Location:** `C:\Users\nikhi\AppData\Local\nvm\v20.19.0\node_modules\@openai\codex\`
**Version:** 0.85.0 (updated from 0.46.0)
**Auth:** Valid ChatGPT Pro OAuth tokens in `~/.codex/auth.json`
**Config:** `gpt-5.2-codex` model, `xhigh` reasoning effort

**Usage Note:** Wrapper script doesn't work in non-TTY Bash; must call native binary directly:
```bash
"/c/Users/nikhi/AppData/Local/nvm/v20.19.0/node_modules/@openai/codex/vendor/aarch64-pc-windows-msvc/codex/codex.exe" exec "prompt" --sandbox read-only --json
```

## Technical Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Codex invocation | wrapper vs native binary | native binary | Wrapper fails in non-TTY |
| Planning docs | single file vs planning-with-files | planning-with-files | Better structure for iteration |

## Codex Recommendations (2026-01-17)

**Session:** 019bced1-ec1a-7cd0-9b66-0e2f8cafcab1
**Model:** gpt-5.2-codex, xhigh reasoning

### Recommended Extractions

| Function | Signature | Est. Complexity |
|----------|-----------|-----------------|
| `selectCurveStrategy` | `(cfg, params) => "piecewise" \| "gompertz" \| "logistic"` | ~2 |
| `buildCurvePath` | `(xs, cfg, params, strategy) => number[]` | ~3 |
| `calibrateCalledSoFar` | `(xs, cfg, params, calledSoFar, buildPath) => Params` | ~4-6 |
| `sanitizeMonotonic` | `(values, direction) => number[]` | ~2-3 |
| `computePiecewisePath` | `(xs, cfg, params) => number[]` | ~3-5 |
| `computeGompertzPath` | `(xs, cfg, params) => number[]` | ~3-5 |
| `computeLogisticPath` | `(xs, cfg, params) => number[]` | ~3-5 |

**Codex Concerns:**
- Calibration loop extraction must preserve termination criteria
- Monotonic sanitization can hide upstream issues
- Strategy split risks duplicated parameter prep
- Must preserve numerical stability and output ordering

---

## Critical Evaluation of Codex Recommendations

### Strengths
1. Clear strategy pattern for curve type dispatch
2. Separates calibration logic (good isolation)
3. Generic monotonic sanitization is reusable
4. Estimated complexities are within thresholds

### Weaknesses & Concerns

| Issue | Analysis | Severity |
|-------|----------|----------|
| **Over-engineering** | 7 new functions for 112-line function may be excessive | Medium |
| **Overlap with existing code** | `computePiecewisePath` duplicates `generatePiecewiseSeed` | High |
| **Type mismatch** | Codex uses `number[]` but code uses `Decimal[]` | Medium |
| **Ignores existing imports** | `fitTVPI`, `gompertz`, `logistic` already exist in jcurve-fit.ts, jcurve-shapes.ts | High |
| **Calibration coupling** | Lines 97-114 are tightly coupled to TVPI calculation | Medium |

### Counter-Analysis: Actual Code Structure

**Main function breakdown (112 lines):**
```
Lines 78-82:   Setup (5 lines)
Lines 84-152:  TVPI generation (68 lines) ← MAIN COMPLEXITY
Lines 155:     Capital calls (1 line, delegates)
Lines 158-166: NAV/DPI (9 lines, delegates)
Lines 169:     Sensitivity bands (1 line, delegates)
Lines 171-182: Result assembly (12 lines)
```

**TVPI generation breakdown (68 lines):**
```
Lines 89-92:   Piecewise branch (4 lines)
Lines 93-152:  Fitted branch (59 lines):
  - Lines 94-95:   Seed generation (2 lines)
  - Lines 97-114:  Calibration loop (18 lines)
  - Lines 116-122: fitTVPI call (7 lines)
  - Lines 125-131: tvpiArr generation (7 lines)
  - Lines 134-145: Sanitization (12 lines)
  - Lines 147-152: Result assignment (6 lines)
```

### Alternative Minimal Decomposition

Instead of 7 new functions, extract 2-3:

| Function | Purpose | Lines Extracted | Complexity |
|----------|---------|-----------------|------------|
| `fitAndBuildTVPI` | Combine fitting + array generation | ~35 | ~6-7 |
| `calibrateToActuals` | Calibration loop only | ~18 | ~4 |
| `sanitizeTVPICurve` | Monotonic + endpoint clamping | ~12 | ~3 |

**Rationale:**
- Leverages existing `fitTVPI`, `gompertz`, `logistic` modules
- Doesn't duplicate `generatePiecewiseSeed`
- Fewer functions = less cognitive overhead
- Maintains clear data flow

### Recommendation

**Hybrid approach:**
1. **Accept** Codex's `sanitizeMonotonic` extraction (generic, reusable)
2. **Reject** separate strategy functions (already have `fitTVPI` polymorphism)
3. **Modify** calibration extraction to be simpler closure, not full function
4. **Add** `buildFittedTVPICurve` to encapsulate lines 93-152

**Expected outcome:**
- `computeJCurvePath`: ~40 lines, complexity ~5
- `buildFittedTVPICurve`: ~45 lines, complexity ~6
- `sanitizeMonotonic`: ~10 lines, complexity ~2
- `calibrateToActuals`: ~15 lines, complexity ~4

## Resources

- Issue #153: https://github.com/nikhillinit/Updog_restore/issues/153
- PR #145 (ESLint suppression): docs/PR_NOTES/CODACY_JCURVE_NOTE.md
- Codex CLI docs: https://github.com/openai/codex
- Planning-with-files: https://github.com/OthmanAdi/planning-with-files
