# Manual QA Setup & Execution Guide for PR #227

**Feature**: FeesExpensesStep auto-save with 750ms debounce
**Component**: Step 4 of Modeling Wizard
**URL**: http://localhost:5173/modeling-wizard
**Total test cases**: 21 functional + 3 edge cases
**Expected duration**: 45-60 minutes

---

## QUICKSTART (5 minutes)

### 1. Pre-flight Checks

```bash
# Windows PowerShell/CMD ONLY (critical for sidecar linking)
npm run doctor:quick
# Expected: "doctor:quick ✅ sidecar modules OK"

# Check Docker status (optional - only needed if using Redis/DB)
docker-compose ps
# Note: If Docker is not running, use --memory mode below
```

### 2. Start Development Server

**Option A: Full Stack (with Database + Redis)**
```bash
npm run dev:infra && npm run dev
# Services: PostgreSQL, Redis, API, Frontend
# Frontend ready at: http://localhost:5173
# Time: ~30-45 seconds
```

**Option B: API Only (Lightweight - Recommended for QA)**
```bash
npm run dev
# Runs: API + Frontend (uses in-memory queue)
# Frontend ready at: http://localhost:5173
# Time: ~15 seconds
```

**Option C: Ultra-Fast (No Redux/Queues)**
```bash
npm run dev:quick
# Frontend + minimal backend
# Time: ~5 seconds
# Note: May skip some async operations
```

### 3. Open Browser & Navigate

```
URL: http://localhost:5173/modeling-wizard
Action: Click "Next" through steps 1-3 to reach Step 4
Expected: See "Fees & Expenses" form with:
  - Management Fee section
    - Rate (%) field [default: 2.0]
    - Fee Basis dropdown [default: "Committed Capital"]
  - Fee Step-Down toggle [default: Off]
  - Admin Expenses section
    - Annual Amount ($M) field
    - Growth Rate (%) field
```

---

## BROWSER SETUP FOR QA

### Chrome / Edge / Firefox DevTools

Open DevTools (F12 or Right-click > Inspect) and pin these panels:

1. **Network Tab** (primary)
   - Filter: Type "POST" or "PATCH" in search
   - Watch for save requests (payload inspection)
   - Note request timing

2. **Console Tab** (secondary)
   - Filter: Click "Errors" to see validation errors
   - Watch for warnings/exceptions during testing

3. **Performance Tab** (for debounce timing)
   - Record while typing to measure 750ms delay
   - Look for: start time + 750ms + request fire

### Optional: Memory Profiling

For edge case testing (memory leaks):
1. Open DevTools Memory tab
2. Take heap snapshot at start
3. Perform test cycle 10x
4. Take final snapshot
5. Compare: should see stable memory, not unbounded growth

---

## TEST EXECUTION PLAN

### Phase 1: Debounce Mechanics (15 min)

**Test 1.1: 750ms Debounce Delay**

Setup:
- Open Network tab in DevTools
- Go to "Fees & Expenses" step
- Clear or focus on "Rate (%)" field

Actions:
```
Step 1: Type "2.5" in "Rate (%)" field
         Immediately check Network tab -> NO request yet (expected)

Step 2: Wait 750ms (count: one-thousand-one, one-thousand-two, ... one-thousand-seven)
         Expected: Single save request fires
         Verify: POST/PATCH request payload shows "managementFee.rate: 2.5"
```

Result:
- [ ] Immediate typing: No network request
- [ ] After 750ms: Single request fires
- [ ] Payload contains correct value

---

**Test 1.2: Rapid Typing Cancels Previous Timers**

Setup:
- Network tab open
- Clear "Rate (%)" field

Actions:
```
Step 1: Type "2" (wait 400ms - exactly halfway)
Step 2: Type "5" (creates "25" total)
        Total time from "2" to "5": 400ms + typing time
Step 3: Wait 750ms from final keystroke
        Expected: Only ONE save request fires for "25"
```

Verification:
- [ ] Inspect Network tab: count POST/PATCH requests
- [ ] Should see exactly 1 request (for final value "25")
- [ ] NOT 2 requests (would indicate timer not cancelled)
- [ ] Payload shows final value only

---

**Test 1.3: Invalid Data Rejection (No Save Attempt)**

Setup:
- Network tab open
- Console tab open (watch for validation messages)
- Know validation rule: Rate must be 0-5%

Actions:
```
Step 1: Type "10" in "Rate (%)" field
        Check Console -> should show validation error
        Error text: "Must be between 0 and 5"

Step 2: Wait 1500ms (to ensure 750ms debounce would fire)
        Check Network tab -> NO save request should appear
        (Invalid data is rejected before auto-save)
```

Result:
- [ ] Console shows error message for "10"
- [ ] After 750ms: Network tab remains empty (no save attempt)
- [ ] Error styling visible in UI

---

### Phase 2: Unmount Protection (15 min)

**Test 3.1: Save on Wizard Navigation (Previous Button)**

Setup:
- Enter a value in "Rate (%)" field: "2.5"
- Immediately click "Previous" button (don't wait 750ms)

Actions:
```
Step 1: Type "2.5" in Rate field
Step 2: Immediately click "Previous" button
        Expected: Component unmounts, save fires on cleanup
        Check Network tab: request should appear (even before unmount completes)

Step 3: Click "Next" to return to Step 4
        Expected: Form reloads with value "2.5" (from saved data)
```

Result:
- [ ] Network request fires on unmount
- [ ] Value persists when navigating back
- [ ] Form shows saved value "2.5"

---

**Test 3.2: Save on Browser Back Button**

Setup:
- At Step 4, enter "3.0" in Rate field
- Immediately click browser back button

Actions:
```
Step 1: Type "3.0" in Rate field
Step 2: Click browser back button (don't wait 750ms)
        Check Network tab: save should fire

Step 3: Click browser forward to return to wizard
        Expected: Value persists as "3.0"
```

Result:
- [ ] Network request fires on unmount
- [ ] Navigating forward shows saved value "3.0"
- [ ] No data loss on browser navigation

---

**Test 3.3: Invalid Data NOT Saved on Unmount**

Setup:
- Know: invalid rate is > 5%
- Have Network + Console tabs open

Actions:
```
Step 1: Type "10" (invalid) in Rate field
        Console shows: "Must be between 0 and 5"

Step 2: Immediately click "Previous" button
        Check Network tab: NO request should fire (invalid data rejected)

Step 3: Click "Next" to return to Step 4
        Expected: Form shows default value "2.0" (not the invalid "10")
```

Result:
- [ ] No network request on unmount (invalid data skipped)
- [ ] Navigating back shows default, not invalid value
- [ ] Validation prevents data persistence

---

### Phase 3: Error Display (10 min)

**Test 4.1: Management Fee Rate Error**

Setup:
- Rate field visible
- Validation rule: 0-5%

Actions:
```
Step 1: Type "7.5" in "Rate (%)" field
        Expected: Error message appears below field
        Text: "Must be between 0 and 5"

Step 2: Check error styling
        Expected: Red text color (text-error class)
```

Result:
- [ ] Error message displays for invalid value
- [ ] Correct validation text shown
- [ ] Error styling consistent (red color)

---

**Test 5.1: Fee Step-Down "After Year" Error**

Setup:
- Enable "Fee Step-Down" toggle
- Validation rule: After Year must be 1-10

Actions:
```
Step 1: Type "15" in "After Year" field (invalid, > 10)
        Expected: Error message displays

Step 2: Verify error text: "Must be between 1 and 10"
Step 3: Verify red error styling
```

Result:
- [ ] Error shows for value > 10
- [ ] Error text matches validation rule
- [ ] Red styling applied

---

**Test 6.1: Fee Step-Down "New Rate" Error**

Setup:
- Enable "Fee Step-Down" toggle
- Initial rate = 2.0% (or current value)
- Validation rule: New Rate must be < initial rate

Actions:
```
Step 1: In "New Rate (%)" field, type "2.5" (invalid, >= 2.0)
        Expected: Error message displays

Step 2: Verify error text: "Must be less than initial rate"
Step 3: Verify red error styling
```

Result:
- [ ] Error shows for New Rate >= initial rate
- [ ] Error text is correct
- [ ] Consistent styling with other errors

---

### Phase 4: Dirty State & beforeunload (10 min)

**Test 7.1: Warn on Unsaved Changes**

Setup:
- Type "2.5" in Rate field (triggers isDirty=true)
- Do NOT wait 750ms for auto-save

Actions:
```
Step 1: Type "2.5" in Rate field
Step 2: Immediately press Ctrl+W (Windows) or Cmd+W (Mac) to close tab
        Expected: Browser warning appears
        Text: "You have unsaved changes. Are you sure you want to leave?"

Step 3: Click "Cancel" to stay
        Expected: Return to form, value still "2.5"
```

Result:
- [ ] beforeunload warning appears
- [ ] User can cancel navigation
- [ ] Form data preserved

---

**Test 7.2: No Warning After Save**

Setup:
- Type "2.5" in Rate field
- Wait 750ms for auto-save to complete

Actions:
```
Step 1: Type "2.5"
Step 2: Wait 750ms (observe Network tab: save completes)
        isDirty should clear after successful save

Step 3: Press Ctrl+W to close tab
        Expected: NO warning (isDirty=false)
        Tab closes immediately
```

Result:
- [ ] No beforeunload warning after save
- [ ] Tab closes without prompt
- [ ] isDirty cleared after successful save

---

**Test 7.3: Dirty State Persists Across Fields**

Setup:
- Have "Rate" and "Annual Amount" fields visible

Actions:
```
Step 1: Type "2.5" in "Rate (%)" field
Step 2: Wait 750ms (auto-save)
        isDirty should clear

Step 3: Type "1.0" in "Annual Amount ($M)"
        isDirty = true again

Step 4: Immediately press Ctrl+W (before 750ms for Annual Amount)
        Expected: beforeunload warning (still unsaved Annual Amount)
```

Result:
- [ ] isDirty correctly tracks multi-field changes
- [ ] Warning appears for new unsaved changes
- [ ] Each field independently triggers dirty state

---

### Phase 5: Form Reset (5 min)

**Test 8.1: Reset Clears All Fields**

Setup:
- Need to find/trigger form reset mechanism
- May require parent component interaction or special test data

Actions:
```
Step 1: Enter custom values:
        - Rate: 3.5
        - Fee Basis: "Fair Market Value" (or available option)
        - Annual Amount: 2.0
        - Growth Rate: 5.0

Step 2: Trigger reset (check component API)
        Expected: All fields revert to defaults
        - Rate: 2.0
        - Basis: "Committed Capital"
        - Amounts reset

Step 3: Verify no data remains
```

Result:
- [ ] All fields reset to initial defaults
- [ ] No persisted custom values remain

---

**Test 8.2: Reset Clears Dirty State**

Setup:
- Type "2.5" in Rate field (sets isDirty=true)
- Trigger form reset

Actions:
```
Step 1: Modify field (isDirty = true)
Step 2: Trigger reset
Step 3: Press Ctrl+W to close tab
        Expected: NO warning (isDirty cleared)
```

Result:
- [ ] isDirty clears on reset
- [ ] No beforeunload warning after reset
- [ ] Clean state preserved

---

## EDGE CASE TESTING (5 min)

**Edge Case 1: Multiple Fields Changed Simultaneously**

Actions:
```
Step 1: Open Network tab
Step 2: Rapidly change:
        - Rate: 2.5
        - Annual Amount: 1.0
        - Growth Rate: 4.0
        (all within 500ms)

Step 3: Wait 750ms from last keystroke
        Expected: Single debounced save request
        Payload contains ALL three changes
```

Result:
- [ ] One network request fires (debounce batches changes)
- [ ] Payload includes all three field updates
- [ ] Values save atomically together

---

**Edge Case 2: Step-Down Required Fields Validation**

Actions:
```
Step 1: Enable "Fee Step-Down" toggle
Step 2: Leave "After Year" and "New Rate" empty
Step 3: Wait 1500ms
        Expected: NO save request (required fields missing)
        Error messages show for both empty fields
```

Result:
- [ ] Validation prevents save when required fields empty
- [ ] Error messages visible for missing fields
- [ ] Debounce respects validation rules

---

**Edge Case 3: Valid → Invalid → Valid Transitions**

Actions:
```
Step 1: Type "2.5" in Rate (valid)
        Wait 750ms -> Save fires (1st save)

Step 2: Change to "10" (invalid)
        Wait 750ms -> NO save fires

Step 3: Change to "3.0" (valid)
        Wait 750ms -> Save fires (2nd save)

Step 4: Check Network tab
        Expected: Exactly 2 save requests total
        NOT 3 (invalid request should not fire)
```

Result:
- [ ] Total requests: 2 (not 3)
- [ ] Invalid data skipped
- [ ] Save recovers after invalid state

---

## BROWSER COMPATIBILITY CHECKLIST

Test in at least 2-3 browsers:

- [ ] Chrome (latest) - Primary
- [ ] Firefox (latest) - Secondary
- [ ] Edge or Safari (if available)

For each browser:
- [ ] Debounce timing consistent (750ms +/- 50ms)
- [ ] Network requests visible in DevTools
- [ ] Error messages display correctly
- [ ] beforeunload warning triggers
- [ ] No console errors during testing

---

## PERFORMANCE VERIFICATION

### Debounce Timer Accuracy

Setup: Browser DevTools Performance tab

Actions:
```
Step 1: Open Performance tab
Step 2: Click "Record" (red circle)
Step 3: Type "2.5" in Rate field
Step 4: Wait until after save request fires
Step 5: Click "Stop"
Step 6: Analyze timeline
        Expected:
        - First keystroke at time T
        - Save request at T + ~750ms
        - Timing accurate to ±50ms
```

Result:
- [ ] Debounce timer fires at ~750ms
- [ ] Not earlier (no premature save)
- [ ] Not significantly later (responsive)

---

### Memory Leak Detection

Setup: Browser DevTools Memory tab

Actions:
```
Step 1: Take baseline heap snapshot
Step 2: Perform this cycle 10 times:
        - Type "2.5" in Rate
        - Wait 750ms (auto-save)
        - Click "Previous"
        - Click "Next" (return to step)

Step 3: Take final heap snapshot
Step 4: Compare snapshots:
        Expected: Memory stable, no unbounded growth
        Acceptable: <10% increase over 10 cycles
```

Result:
- [ ] Memory stable across cycles
- [ ] No listener leaks (beforeunload cleaned)
- [ ] No subscription leaks (watch() unsubscribed)

---

## FINAL ACCEPTANCE CHECKLIST

Before signing off, verify ALL items:

**Functionality:**
- [ ] All 21 test cases PASS
- [ ] All 3 edge cases PASS
- [ ] 750ms debounce timing verified
- [ ] Invalid data properly rejected
- [ ] Unmount protection fires correctly
- [ ] beforeunload warning works as expected

**Cross-Browser:**
- [ ] Tested in Chrome
- [ ] Tested in Firefox
- [ ] Tested in Edge/Safari (if available)
- [ ] No browser-specific failures

**Performance:**
- [ ] Debounce accuracy: 750ms ±50ms
- [ ] Memory stable (no leaks)
- [ ] No console errors
- [ ] UI responsive (no lag during typing)

**Code Quality:**
- [ ] DevTools shows clean requests
- [ ] Error messages are user-friendly
- [ ] Styling consistent across errors
- [ ] Form state properly tracked

**Sign-Off (MANDATORY):**
```
QA Engineer Name: _______________________
Date: _______________________
Result: [ ] PASS  [ ] FAIL

If FAIL, document issues here:
_________________________________________
_________________________________________
```

---

## TROUBLESHOOTING

### Dev Server Won't Start

**Symptom**: "Cannot find module 'vite'"

**Fix**:
```bash
npm run doctor:links
npm install
npm run dev
```

---

### Docker Services Not Available

**Symptom**: Database/Redis errors

**Fix**: Use lightweight mode
```bash
# Skip Docker entirely
npm run dev
```

---

### Network Requests Not Showing

**Symptom**: Network tab empty, no requests visible

**Fix**:
1. Open Network tab BEFORE typing
2. Clear filters (ensure "Fetch/XHR" selected)
3. Check console for errors
4. Verify frontend at http://localhost:5173, API at http://localhost:5000/api/...

---

### beforeunload Warning Not Showing

**Symptom**: Closing tab doesn't prompt, even with unsaved data

**Fix**:
1. Ensure isDirty = true (wait for field change to register)
2. Try different shortcut: Ctrl+W or Cmd+W (both should work)
3. Check browser console for listener attachment errors

---

### Form Values Not Persisting

**Symptom**: Navigate away, return, value is default (not saved)

**Fix**:
1. Check Network tab: verify save request fired
2. Check API response: should be 200/201 success
3. Verify browser stores cookies/localStorage (privacy settings)
4. Check browser console for save errors

---

## DEVELOPER REFERENCE

### Key Files

- **Component**: `/client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx`
- **Schema**: `/shared/schemas/modeling-wizard.schemas.ts`
- **Hook**: `/client/src/hooks/useDebounce.ts`
- **API**: `/server/routes/modeling-wizard.ts` (or equivalent)

### API Endpoints

Save request format:
```
POST /api/modeling-wizard/step/4
{
  "managementFee": {
    "rate": 2.5,
    "basis": "committed",
    "stepDown": { "enabled": false }
  },
  "adminExpenses": {
    "annualAmount": 1.0,
    "growthRate": 4.0
  }
}
```

Expected response:
```
200 OK
{
  "success": true,
  "data": { /* saved data */ }
}
```

---

## NOTES

**Session Date**: 2025-11-30
**Feature PR**: #227
**Feature**: Auto-save with 750ms debounce
**Status**: Draft -> Manual QA required for merge

**Known Limitations**:
- Manual QA checklist location: `docs/qa/fees-expenses-step-manual-qa-checklist.md`
- Automated tests blocked by jest-dom import issue (see PR notes)
- Manual testing required to verify 21 test cases

**DX Optimizations in This Guide**:
- 5-minute quickstart for rapid environment setup
- Option A/B/C for different infrastructure scenarios
- Streamlined DevTools setup (no extra panels needed)
- Minimal prerequisite knowledge required
- Clear expected outcomes for each test
- Troubleshooting section for common issues
- Copy-paste test sequences (reduce re-reading)

**Support**: If tests fail or have questions, check CLAUDE.md for escalation paths.
