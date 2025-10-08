# TypeScript Error Fix Plan
**Generated:** 2025-10-07
**Total Errors:** 809

## Error Summary by Type

| Error Code | Count | Category | Difficulty |
|------------|-------|----------|------------|
| TS4111 | 305 | Index signature access | Low |
| TS18048 | 119 | Possibly undefined | Medium |
| TS2532 | 94 | Object possibly undefined | Medium |
| TS2322 | 66 | Type assignment | Medium-High |
| TS2345 | 56 | Argument type mismatch | Medium |
| TS7006 | 45 | Implicit any | Low-Medium |
| TS2339 | 29 | Property doesn't exist | High |
| TS2769 | 23 | Parameter count mismatch | Medium |
| Others | 72 | Various | Varies |

## Priority Fix Strategy

### Phase 1: TS4111 - Index Signature Access (305 errors)
**Priority:** HIGH (blocks strict mode)
**Difficulty:** LOW
**Estimated Time:** 2-3 hours

**What:** Properties from index signatures must use bracket notation
**Fix Pattern:** `obj.property` → `obj['property']`

**Affected Areas:**
- Test files: `vi.resetAllMocks()` → `vi['resetAllMocks']()`
- Express Response: `res.setHeader()` → `res['setHeader']()`
- Express Request: `req.header()` → `req['header']()`
- Process env: `process.env.VAR` → `process.env['VAR']`
- Response locals: `res.locals` → `res['locals']`

**Top Files:**
- `server/routes/variance.ts` (31 errors)
- `server/routes/portfolio-intelligence.ts` (30 errors)
- `server/routes/health.ts` (24 errors)
- `server/middleware/enhanced-audit.ts` (18 errors)
- `server/services/monte-carlo-simulation.ts` (22 errors)

**Automation Approach:**
```bash
# Can be semi-automated with sed/perl for common patterns:
# - vi.METHOD → vi['METHOD']
# - res.setHeader → res['setHeader']
# - req.header → req['header']
# - process.env.VAR → process.env['VAR']
```

### Phase 2: TS7006 - Implicit Any (45 errors)
**Priority:** HIGH (enables strictNullChecks benefits)
**Difficulty:** LOW-MEDIUM
**Estimated Time:** 1-2 hours

**What:** Function parameters lack explicit types
**Fix Pattern:** `function foo(param)` → `function foo(param: Type)`

**Analysis Needed:**
- Review each function signature
- Add explicit type annotations
- May reveal underlying type issues

### Phase 3: TS18048 & TS2532 - Undefined Checks (213 errors)
**Priority:** MEDIUM (improves safety)
**Difficulty:** MEDIUM
**Estimated Time:** 4-6 hours

**What:** Values possibly undefined without null checks
**Fix Patterns:**
```typescript
// Pattern 1: Optional chaining
obj.property → obj?.property

// Pattern 2: Nullish coalescing
value || default → value ?? default

// Pattern 3: Guard clauses
if (!value) throw new Error(...)
// or
if (!value) return

// Pattern 4: Type narrowing
if (value === undefined) return
// use value (now narrowed)
```

**Hot Spots:**
- `client/src/core/reserves/computeReservesFromGraduation.ts` (14 errors)
- `client/src/core/capitalAllocationSolver.ts` (5 errors)
- `client/src/core/pacing/PacingEngine.ts` (3 errors)
- `client/src/core/LiquidityEngine.ts` (2 errors)

**Categories:**
- Array `.find()` results (possibly undefined)
- Object property access on optional values
- Function parameters that can be undefined
- State values before initialization

### Phase 4: TS2322 - Type Assignment (66 errors)
**Priority:** MEDIUM
**Difficulty:** MEDIUM-HIGH
**Estimated Time:** 3-4 hours

**What:** Type mismatches in assignments
**Common Issues:**
- `string | undefined` → `string`
- `number | undefined` → `number`
- Discriminated union mismatches
- Array element type mismatches

**Requires:** Case-by-case analysis and type refinement

### Phase 5: TS2345 - Argument Type Mismatch (56 errors)
**Priority:** MEDIUM
**Difficulty:** MEDIUM
**Estimated Time:** 2-3 hours

**What:** Function called with wrong argument types
**Common Patterns:**
- Passing `undefined` where not allowed
- Number/string confusion
- Missing type coercion

**Examples:**
```typescript
// ScenarioCard.tsx - passing undefined to number param
formatPercent(value) // value: number | undefined
→ formatPercent(value ?? 0)
```

### Phase 6: TS2339 - Property Doesn't Exist (29 errors)
**Priority:** LOW-MEDIUM
**Difficulty:** HIGH
**Estimated Time:** 2-3 hours

**What:** Accessing properties not in type definition
**Causes:**
- Missing interface properties
- Incorrect type assertions
- Third-party type definitions incomplete

**Requires:** Type system architecture review

### Phase 7: TS2769 - Parameter Count Mismatch (23 errors)
**Priority:** LOW
**Difficulty:** MEDIUM
**Estimated Time:** 1-2 hours

**What:** Functions called with wrong number of arguments
**Fix:** Match function signature or update signature

### Phase 8: Remaining Errors (72 errors)
**Priority:** LOW
**Difficulty:** VARIES
**Estimated Time:** 3-5 hours

**Categories:**
- TS2554: Wrong argument count (6)
- TS2538: Cannot be used as index type (13)
- TS7031: Binding element implicitly has 'any' type (6)
- TS2353: Object literal cannot specify 'readonly' (6)
- Others: Various edge cases

## Recommended Execution Order

1. **Phase 1 (TS4111)** - Mechanical, can be partially automated
2. **Phase 2 (TS7006)** - Reveals type contracts, helps subsequent phases
3. **Phase 3 (TS18048/TS2532)** - Core safety improvements
4. **Phase 5 (TS2345)** - Often resolved by Phase 3 fixes
5. **Phase 4 (TS2322)** - May be reduced by earlier phases
6. **Phase 6 (TS2339)** - Requires architectural decisions
7. **Phase 7 (TS2769)** - Quick cleanup
8. **Phase 8 (Remaining)** - Case-by-case

## Automation Opportunities

### Quick Wins (Can Script)
```bash
# TS4111: Common patterns
- vi.resetAllMocks() → vi['resetAllMocks']()
- vi.clearAllMocks() → vi['clearAllMocks']()
- process.env.VARIABLE → process.env['VARIABLE']
- res.setHeader → res['setHeader']
- res.write → res['write']
- req.header → req['header']
```

### Semi-Automated
- TS7006: Extract function signatures, prompt for types
- TS18048: Flag `.find()` calls, add null checks

### Manual Only
- TS2322: Type refinement decisions
- TS2339: Interface design
- TS2769: API contract changes

## Risk Assessment

### Low Risk (Safe to batch fix)
- TS4111: Pure syntax change
- TS7006: Explicit type annotations

### Medium Risk (Review each)
- TS18048/TS2532: Runtime behavior changes
- TS2345: May hide logic bugs

### High Risk (Careful review)
- TS2339: May indicate design issues
- TS2322: Type system assumptions

## Testing Strategy

After each phase:
1. Run full TypeScript check: `npx tsc --noEmit`
2. Run test suite: `npm test`
3. Verify build: `npm run build`
4. Check for new errors introduced

## Progress Tracking

- [ ] Phase 1: TS4111 (305) - Index signatures
- [ ] Phase 2: TS7006 (45) - Implicit any
- [ ] Phase 3: TS18048/TS2532 (213) - Undefined checks
- [ ] Phase 4: TS2322 (66) - Type assignments
- [ ] Phase 5: TS2345 (56) - Argument types
- [ ] Phase 6: TS2339 (29) - Missing properties
- [ ] Phase 7: TS2769 (23) - Parameter count
- [ ] Phase 8: Remaining (72)

## Notes

- Original review doc (@TYPESCRIPT_ERRORS_REVIEW.md) showed 23 errors
- Current count: 809 errors (35x increase)
- Suggests recent TypeScript config changes or dependency updates
- Consider creating baseline commit before starting fixes
