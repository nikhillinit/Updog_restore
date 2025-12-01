# Phoenix v3.0 Phase 1 Track 2 - Wizard Auto-Save Implementation
## Session Handoff - 2025-11-30

---

## SESSION SUMMARY

**Status**: IN PROGRESS - TDD RED phase for auto-save feature
**Branch**: `phoenix/phase-1-wizard-fees`
**Baseline**: MAINTAINED (452 TS errors, 74.2% test pass rate verified)
**Context Used**: 151k/200k tokens (76%)

---

## WHAT WAS ACCOMPLISHED

### 1. Phase 0 Verification (COMPLETE)
- [x] Confirmed Phase 0 merge to main (commit 870b9b2c)
- [x] Verified TypeScript baseline: 452 errors (unchanged)
- [x] Confirmed test pass rate: 74.2% (baseline maintained)
- [x] Created Track 2 feature branch: `phoenix/phase-1-wizard-fees`

### 2. Design Phase (COMPLETE)
- [x] Invoked `brainstorming` skill for architecture refinement
- [x] Validated XState-First approach (design doc created on separate branch)
- [x] Key decisions documented:
  - localStorage-only persistence (no API for drafts)
  - 750ms debounce before save
  - Unmount protection via ref capture
  - XState machine orchestrates save states (editing/saving/saved/error)

### 3. TDD Setup (IN PROGRESS - RED Phase)
- [x] Invoked `test-driven-development` skill
- [x] Created comprehensive test file: `tests/unit/fees-expenses-step.test.tsx`
- [x] Tests cover:
  - Debounced auto-save (750ms delay)
  - Invalid data rejection during debounce
  - Unmount protection (save on component unmount)
  - Error display for all fields (basis, step-down fields)
  - Dirty check with navigation warning
  - Form reset handling

### 4. Test Configuration Issues (ENCOUNTERED)
- Import issue with `expect` from vitest in client tests
- Test file moved from `client/src/components/**/__tests__/` to `tests/unit/`
- Pattern follows existing `capital-allocation-step.test.tsx`
- Error: `ReferenceError: expect is not defined` in setup

---

## CURRENT STATE

### Files Modified

1. **tests/unit/fees-expenses-step.test.tsx** (NEW)
   - 200+ lines of comprehensive TDD tests
   - 5 test suites covering all requirements
   - Following TDD RED-GREEN-REFACTOR cycle

2. **Branch State**
   - Current branch: `phoenix/phase-1-wizard-fees`
   - Clean working tree (test file added)
   - No implementation yet (following TDD - tests first)

### Next Immediate Steps

**BEFORE CONTINUING CODE**:
1. Fix test setup issue (expect import)
   - Check `tests/setup/jsdom-setup.ts` for proper vitest imports
   - Compare with working client test setup
   - Run tests to VERIFY RED (tests must fail before implementing)

**AFTER TESTS PASS SETUP**:
2. Run tests to verify RED failures:
   ```bash
   npx vitest run tests/unit/fees-expenses-step.test.tsx --project=client --reporter=verbose
   ```

3. Confirm RED failures are correct:
   - Tests should fail because features don't exist yet
   - Failure messages should be clear and expected
   - NOT errors (import issues, syntax), but actual test failures

**THEN BEGIN GREEN PHASE**:
4. Create custom hook `useDebounce` (if doesn't exist)
5. Modify `FeesExpensesStep.tsx` to add:
   - Debounced auto-save effect (750ms)
   - Unmount protection via ref
   - Complete error display for all fields
   - Dirty check logic
   - Reset handling

6. Extend `modeling-wizard.machine.ts`:
   - Add `SAVE_DRAFT` event type
   - Add states: `savingDraft`, `draftSaved`, `saveDraftError`
   - Add action: `saveDraftToStorage`
   - Wire up transitions

---

## KEY DECISIONS & RATIONALE

### 1. XState-First Approach (from Multi-AI Review)
**Decision**: Use XState machine to orchestrate save lifecycle
**Rationale**:
- Wizard already uses XState - consistency matters
- Save states (editing/saving/saved/error) are core to UX - machine makes them explicit
- Testability is critical - state machines are easier to test
- Multi-AI consensus strongly favored this approach

### 2. localStorage-Only (from Design Doc)
**Decision**: No API calls for draft saves, only localStorage
**Rationale**:
- Drafts are temporary user session data
- Reduces server load and network requests
- Faster save operations
- Final submission still goes to API

### 3. 750ms Debounce (from Multi-AI Review)
**Decision**: Use 750ms delay before triggering save
**Rationale**:
- Gemini recommended 750ms (was 500-1000ms range)
- Balance between responsiveness and reducing save frequency
- User can type continuously without flooding saves

### 4. Unmount Protection (Critical Safety Net)
**Decision**: Save on component unmount to prevent data loss
**Rationale**:
- User might navigate before debounce completes
- Use ref to capture latest form state
- Cleanup function in useEffect guarantees execution

---

## IMPLEMENTATION PLAN (TDD Sequence)

### Test Suite Breakdown

**Test 1: Debounced Auto-Save**
```typescript
test('debounces auto-save for 750ms after user input')
// RED: Will fail - no debounce implementation exists
// GREEN: Add useDebounce hook + effect in FeesExpensesStep
```

**Test 2: Invalid Data Rejection**
```typescript
test('does not save invalid data during debounce')
// RED: Will fail - validation not integrated with save
// GREEN: Add Zod validation check before calling onSave
```

**Test 3: Unmount Protection**
```typescript
test('saves on component unmount to prevent data loss')
// RED: Will fail - no unmount effect exists
// GREEN: Add useEffect cleanup with ref capture
```

**Test 4-6: Error Display**
```typescript
test('shows error message for invalid management fee basis')
test('shows error message for step-down afterYear field when invalid')
test('shows error message for step-down newRate field when >= initial rate')
// RED: All will fail - error display missing for these fields
// GREEN: Add error message JSX for each field
```

**Test 7: Dirty Check**
```typescript
test('warns user before navigation with unsaved changes')
// RED: Will fail - no beforeunload listener
// GREEN: Add beforeunload effect with isDirty check
```

**Test 8: Form Reset**
```typescript
test('resets form to initial values when reset prop changes')
// RED: Will fail - no reset prop handling
// GREEN: Add shouldReset prop + useEffect to call form.reset()
```

---

## INTEGRATION POINTS

### Files to Modify (GREEN Phase)

1. **client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx**
   - Current: Lines 44-49 have basic auto-save (no debounce)
   - Add: useDebounce hook integration
   - Add: useRef for form values
   - Add: unmount protection effect
   - Add: error display for missing fields (lines ~78-90, ~106-134)
   - Add: dirty check effect
   - Add: shouldReset prop + reset handling

2. **client/src/machines/modeling-wizard.machine.ts**
   - Current: Has `SAVE_STEP` event (line 179), auto-save timer (lines 788-793)
   - Add: `SAVE_DRAFT` event to ModelingWizardEvents type
   - Add: New states under `active.editing`:
     ```typescript
     savingDraft: { invoke: saveDraftToStorage, onDone: 'draftSaved', onError: 'saveDraftError' }
     draftSaved: { after: { 1500: 'editing' } }
     saveDraftError: { on: { SAVE_DRAFT: 'savingDraft' } }
     ```
   - Add: `saveDraftToStorage` action (localStorage write)

3. **client/src/hooks/useDebounce.ts** (CREATE if doesn't exist)
   - Standard debounce hook
   - Generic type parameter
   - Configurable delay
   - Pattern: `const debouncedValue = useDebounce(value, 750);`

---

## QUALITY GATES (Must Pass Before PR)

### Before Commit
- [ ] All tests pass (unit + integration)
- [ ] Test coverage ≥80% for modified files
- [ ] `npm run check` passes (0 NEW TS errors beyond 452)
- [ ] Manual QA test plan completed (12 items from plan)

### Test Coverage Target
```
FeesExpensesStep.tsx: ≥80% branch coverage
- Debounce logic: covered
- Unmount protection: covered
- Error display: covered (all fields)
- Dirty check: covered
- Reset handling: covered
```

### Manual QA Checklist
1. Fill out management fee rate (2.0%)
2. Wait 750ms, verify "Saving..." then "Saved" appears
3. Select fee basis: "Committed Capital"
4. Change to invalid rate (6%), verify error shows
5. Enable step-down toggle
6. Verify afterYear and newRate fields appear
7. Enter invalid step-down rate (3% when rate is 2%), verify error
8. Navigate to Step 3, then back to Step 4
9. Verify all form data persisted
10. Type rapidly (simulate race condition), verify no data loss
11. Refresh page mid-edit, verify localStorage recovery
12. Complete all 7 steps, verify submission includes fees data

---

## KNOWN ISSUES & BLOCKERS

### Issue 1: Test Setup Error (CURRENT BLOCKER)
**Error**: `ReferenceError: expect is not defined`
**Location**: `tests/setup/jsdom-setup.ts:2:31`
**Impact**: Cannot verify RED phase (tests won't run)
**Solution**: Fix vitest import in jsdom-setup.ts
**Priority**: CRITICAL - must fix before proceeding

### Issue 2: useDebounce Hook Availability
**Status**: Unknown if hook exists in codebase
**Workaround**: Create custom hook if needed (simple implementation)
**Files to Check**:
- `client/src/hooks/useDebounce.ts`
- `client/src/hooks/` directory

---

## BASELINE STATUS

### TypeScript Errors
```
Total: 452 errors (UNCHANGED from Phase 0)
├── client:   58 errors
├── server:  392 errors
├── shared:    1 error
└── unknown:   1 error

Status: BASELINE MAINTAINED ✓
```

### Test Pass Rate
```
Pass Rate: 74.2% (1005/1354 tests)
├── Passing: 1005 tests
├── Failing:  269 tests (KNOWN BASELINE - acceptable)
├── Skipped:   80 tests
└── Total:   1354 tests

Status: BASELINE MAINTAINED ✓
```

---

## CONTINUATION CHECKLIST

When resuming this session:

1. [ ] Pull latest from `phoenix/phase-1-wizard-fees` branch
2. [ ] Verify baseline: `npm run baseline:progress`
3. [ ] Fix test setup issue (expect import)
4. [ ] Run tests to VERIFY RED:
   ```bash
   npx vitest run tests/unit/fees-expenses-step.test.tsx --project=client
   ```
5. [ ] Confirm failures are expected (features not implemented)
6. [ ] Begin GREEN phase: implement features one test at a time
7. [ ] Follow TDD cycle: implement → verify test passes → move to next test
8. [ ] After all tests GREEN: run REFACTOR phase
9. [ ] Run full manual QA checklist
10. [ ] Update todo list with completed items

---

## FILES REFERENCE

### Created This Session
- `tests/unit/fees-expenses-step.test.tsx` - Comprehensive TDD test suite

### To Modify Next (GREEN Phase)
- `client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx`
- `client/src/machines/modeling-wizard.machine.ts`
- `client/src/hooks/useDebounce.ts` (create if needed)

### Reference Files (Do Not Modify)
- `tests/unit/capital-allocation-step.test.tsx` - Pattern reference
- `client/src/schemas/modeling-wizard.schemas.ts` - Validation schemas
- `PHOENIX-PLAN-2025-11-30.md` - Strategy document

---

## ESTIMATED TIME REMAINING

**Total for Track 2**: 6-9 hours (from revised plan)
**Completed**: ~2 hours (setup, design, test writing)
**Remaining**: 4-7 hours
- Fix test setup: 15-30 min
- GREEN phase implementation: 2-3 hours
- REFACTOR phase: 30-60 min
- Integration tests: 1-2 hours
- Manual QA: 30 min
- PR creation: 30 min

---

## CONTACT POINTS FOR QUESTIONS

**Documentation**:
- Design decisions: docs/plans/2025-11-30-wizard-autosave-design.md (on design branch)
- Phoenix strategy: docs/strategies/PHOENIX-PLAN-2025-11-30.md
- Execution runbook: runbooks/phoenix-execution.md (lines 142-192 for Phase 1)

**Skills to Invoke**:
- `test-driven-development` - Already active, continue TDD cycle
- `verification-before-completion` - Use before claiming work done
- `systematic-debugging` - If test failures are unexpected

**Key Principle**:
> NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
> Tests must fail for the RIGHT reason (feature missing, not typos)

---

**Ready to Continue**: Fix test setup → Verify RED → Begin GREEN phase

Good luck! Remember: Features first, baseline contained, quality enforced.
