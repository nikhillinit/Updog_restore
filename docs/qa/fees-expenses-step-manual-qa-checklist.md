# FeesExpensesStep Manual QA Checklist

**Component**: FeesExpensesStep (Modeling Wizard Step 4)
**Feature**: Auto-save functionality with validation
**Date**: 2025-11-30
**QA Type**: Manual browser testing
**Reason**: Test infrastructure blocked by baseline issue (jest-dom import)

## Prerequisites

1. Start development server:
   ```bash
   npm run dev
   ```

2. Navigate to Modeling Wizard in browser:
   - URL: `http://localhost:5173/modeling-wizard`
   - Step 4: "Fees & Expenses"

## Test Scenarios

### GREEN Cycle 1-2: Debounced Auto-Save

**Test Case 1.1: Verify 750ms debounce delay**

- [ ] **Setup**: Open browser DevTools Network tab
- [ ] **Action**: Type "2.5" in "Rate (%)" field
- [ ] **Expected**: NO immediate network request
- [ ] **Action**: Wait 750ms (observe Network tab)
- [ ] **Expected**: Single save request fires after 750ms
- [ ] **Verify**: Request payload contains `managementFee.rate: 2.5`

**Test Case 1.2: Rapid typing cancels previous timers**

- [ ] **Setup**: Clear "Rate (%)" field
- [ ] **Action**: Type "2" → wait 400ms → type "5" (total "25")
- [ ] **Expected**: Only ONE save request fires (for "25", not "2")
- [ ] **Verify**: Wait 1000ms total, only one network request

**Test Case 1.3: Invalid data rejection**

- [ ] **Setup**: Open browser DevTools Console
- [ ] **Action**: Type "10" in "Rate (%)" field (invalid, > 5%)
- [ ] **Expected**: Error message displays: "Must be between 0 and 5"
- [ ] **Action**: Wait 750ms, check Network tab
- [ ] **Expected**: NO save request fires (invalid data rejected)

---

### GREEN Cycle 3: Unmount Protection

**Test Case 3.1: Save on wizard navigation**

- [ ] **Setup**: Enter "2.5" in "Rate (%)" field
- [ ] **Action**: Immediately click "Previous" button (before 750ms)
- [ ] **Expected**: Component unmounts, save fires before unmount
- [ ] **Verify**: Navigate back to step, value persists as "2.5"

**Test Case 3.2: Save on browser back button**

- [ ] **Setup**: Enter "3.0" in "Rate (%)" field
- [ ] **Action**: Click browser back button (before 750ms)
- [ ] **Expected**: Save fires on unmount
- [ ] **Verify**: Navigate forward, value persists as "3.0"

**Test Case 3.3: Invalid data NOT saved on unmount**

- [ ] **Setup**: Enter "10" in "Rate (%)" field (invalid)
- [ ] **Action**: Click "Previous" button immediately
- [ ] **Expected**: NO save fires (invalid data rejected)
- [ ] **Verify**: Navigate back, value reverts to default (2.0)

---

### GREEN Cycles 4-6: Error Display

**Test Case 4.1: Fee basis error display**

- [ ] **Setup**: Inspect "Fee Basis" dropdown
- [ ] **Action**: Select invalid option (if schema allows)
- [ ] **Expected**: Error message displays below dropdown
- [ ] **Verify**: Error text matches validation message

**Test Case 5.1: Step-down afterYear error**

- [ ] **Setup**: Enable "Fee Step-Down" toggle
- [ ] **Action**: Enter "15" in "After Year" field (invalid, > 10)
- [ ] **Expected**: Error displays: "Must be between 1 and 10"
- [ ] **Verify**: Error text color is red (`text-error` class)

**Test Case 6.1: Step-down newRate error**

- [ ] **Setup**: Enable "Fee Step-Down", initial rate = 2.0
- [ ] **Action**: Enter "2.5" in "New Rate (%)" field (invalid, >= 2.0)
- [ ] **Expected**: Error displays: "Must be less than initial rate"
- [ ] **Verify**: Error styling consistent with other errors

---

### GREEN Cycle 7: Dirty Check + beforeunload

**Test Case 7.1: Warn on unsaved changes**

- [ ] **Setup**: Enter "2.5" in "Rate (%)" field
- [ ] **Action**: Immediately attempt to close browser tab (Ctrl+W / Cmd+W)
- [ ] **Expected**: Browser warning: "You have unsaved changes. Are you sure?"
- [ ] **Verify**: User can cancel and return to form

**Test Case 7.2: No warning after save**

- [ ] **Setup**: Enter "2.5" in "Rate (%)" field
- [ ] **Action**: Wait 750ms for auto-save to complete
- [ ] **Action**: Attempt to close browser tab
- [ ] **Expected**: NO warning (isDirty cleared after save)
- [ ] **Verify**: Tab closes without prompt

**Test Case 7.3: Dirty state persists across fields**

- [ ] **Setup**: Enter "2.5" in "Rate (%)", wait 750ms (save)
- [ ] **Action**: Enter "1.0" in "Annual Amount ($M)"
- [ ] **Action**: Immediately attempt to close tab (before 750ms)
- [ ] **Expected**: Browser warning appears (isDirty=true)

---

### GREEN Cycle 8: Form Reset

**Test Case 8.1: Reset clears all fields**

- [ ] **Setup**: Enter custom values in all fields:
  - Rate: 3.5
  - Fee Basis: "Fair Market Value"
  - Annual Amount: 2.0
  - Growth Rate: 5.0
- [ ] **Action**: Trigger form reset (via parent component prop change)
- [ ] **Expected**: All fields revert to initial values
- [ ] **Verify**: Rate = 2.0, Basis = "Committed Capital", etc.

**Test Case 8.2: Reset clears dirty state**

- [ ] **Setup**: Enter "2.5" in "Rate (%)" (sets isDirty=true)
- [ ] **Action**: Trigger form reset via `shouldReset` prop
- [ ] **Expected**: isDirty cleared
- [ ] **Verify**: Attempt browser close, NO warning appears

---

## Edge Cases

**Edge Case 1: Multiple fields changed simultaneously**

- [ ] **Setup**: Open form
- [ ] **Action**: Rapidly change Rate (2.5), Annual Amount (1.0), Growth Rate (4.0)
- [ ] **Expected**: Single debounced save with ALL changes
- [ ] **Verify**: Network tab shows one request with all 3 values

**Edge Case 2: Step-down required fields validation**

- [ ] **Setup**: Enable "Fee Step-Down" toggle
- [ ] **Action**: Leave "After Year" and "New Rate" empty
- [ ] **Expected**: NO save fires (required fields missing)
- [ ] **Verify**: Error messages display for both fields

**Edge Case 3: Valid → Invalid → Valid transitions**

- [ ] **Setup**: Enter valid "2.5" (wait for save)
- [ ] **Action**: Change to invalid "10" (wait 750ms, no save)
- [ ] **Action**: Change to valid "3.0" (wait 750ms)
- [ ] **Expected**: TWO saves total (2.5, 3.0), NOT three

---

## Browser Compatibility

Test in the following browsers:

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest, macOS only)
- [ ] Edge (latest)

---

## Performance Verification

**Performance Test 1: Debounce timer accuracy**

- [ ] **Setup**: Open browser DevTools Performance tab
- [ ] **Action**: Record performance while typing "2.5"
- [ ] **Verify**: Debounce timer fires at ~750ms (±50ms acceptable)

**Performance Test 2: No memory leaks**

- [ ] **Setup**: Open browser DevTools Memory tab
- [ ] **Action**: Navigate to step, enter data, navigate away (repeat 10x)
- [ ] **Verify**: Memory usage stable (no unbounded growth)
- [ ] **Check**: Event listeners properly cleaned up (beforeunload, watch)

---

## Acceptance Criteria

All checkboxes above must be checked for QA to pass:

- [ ] All 21 test cases pass
- [ ] All 3 edge cases pass
- [ ] Tested in 3+ browsers
- [ ] Performance verified (debounce accuracy, no memory leaks)
- [ ] No console errors or warnings
- [ ] User experience smooth and responsive

---

## Notes & Observations

**Issues Found**:
(Document any bugs or unexpected behavior here)

**Performance**:
(Note any lag, stuttering, or performance issues)

**Browser-Specific Issues**:
(Note any cross-browser compatibility issues)

---

## Sign-Off

- **QA Engineer**: _________________
- **Date**: _________________
- **Result**: [ ] Pass  [ ] Fail (see notes)
