# Manual QA Quick Reference Card

**For**: PR #227 FeesExpensesStep Auto-Save Feature
**Time**: 5 minutes setup + 45-60 minutes testing
**Print This**: Laminate and keep nearby during testing

---

## STARTUP (Choose One)

```
Full:        npm run qa:startup
Lightweight: npm run qa:startup:lightweight
Quick:       npm run qa:startup:quick
Manual:      npm run dev
             then open http://localhost:5173/modeling-wizard
```

## BROWSER SETUP (2 minutes)

1. Press F12 (DevTools)
2. Go to "Network" tab
3. Ensure recording ON (red circle)
4. Filter: type "POST" or "PATCH"

## FORM NAVIGATION

1. Open: http://localhost:5173/modeling-wizard
2. Click "Next" → "Next" → "Next"
3. At "Step 4: Fees & Expenses" ✓

---

## TEST SUMMARY (21 tests)

### Phase 1: Debounce (750ms)
```
1.1: Type "2.5" → wait 750ms → 1 save request ✓
1.2: Type "2", wait 400ms, type "5" → 1 total request ✓
1.3: Type "10" (invalid) → wait 750ms → 0 requests ✓
```

### Phase 2: Unmount (Save on cleanup)
```
3.1: Enter "2.5" → Previous → returns with value ✓
3.2: Enter "3.0" → back button → returns with value ✓
3.3: Enter "10" (invalid) → Previous → reverts to default ✓
```

### Phase 3: Errors (Display validation)
```
4.1: Rate "10" → error "Must be between 0 and 5" ✓
5.1: StepDown year "15" → error "Must be between 1 and 10" ✓
6.1: StepDown rate "2.5" (≥ initial 2.0) → error ✓
```

### Phase 4: Dirty State (beforeunload warning)
```
7.1: Type "2.5" → Ctrl+W → warning appears ✓
7.2: Type "2.5" → wait 750ms → Ctrl+W → NO warning ✓
7.3: Type "2.5", save, type "1.0" → Ctrl+W → warning ✓
```

### Phase 5: Reset (Clear state)
```
8.1: Enter values → reset → all cleared to defaults ✓
8.2: Enter value → reset → Ctrl+W → NO warning ✓
```

### Edge Cases (3 tests)
```
E1: Change 3 fields → 1 save request with all ✓
E2: Enable stepdown → leave required empty → no save ✓
E3: Valid → invalid → valid → 2 saves (not 3) ✓
```

---

## QUICK TEST TEMPLATE

Copy and fill for each test:

```
Test: [Number - Name]
Browser: [Chrome/Firefox/Edge/Safari]

Setup: [Done? Y/N]
Action 1: [Done? Y/N] → Expected: [Met? Y/N]
Action 2: [Done? Y/N] → Expected: [Met? Y/N]
Action 3: [Done? Y/N] → Expected: [Met? Y/N]

Result: [PASS / FAIL]
Notes: [Any issues or observations]
```

---

## KEY SHORTCUTS

| Task | Shortcut |
|------|----------|
| Open DevTools | F12 |
| Inspect element | Ctrl+Shift+C |
| Console tab | Ctrl+Shift+J |
| Network tab | Ctrl+Shift+E |
| Clear Network | Ctrl+L |
| Close tab | Ctrl+W |
| Close tab (Mac) | Cmd+W |

---

## NETWORK TAB CHECKLIST

For each request, verify:

```
METHOD:  [ ] POST or PATCH
STATUS:  [ ] 200 or 201
URL:     [ ] Contains "modeling-wizard"
PAYLOAD: [ ] Contains changed field value
TIMING:  [ ] Appears at 750ms ±50ms
```

---

## ERROR MESSAGES (Expected)

```
Rate (Management Fee):
  "Must be between 0 and 5"

StepDown - After Year:
  "Must be between 1 and 10"

StepDown - New Rate:
  "Must be less than initial rate"

beforeunload dialog:
  "You have unsaved changes. Are you sure?"
```

---

## PASS/FAIL CRITERIA

### PASS When:
- Request fires at ~750ms (±50ms)
- Invalid data produces error, no save
- beforeunload warning appears for unsaved
- beforeunload warning gone after save
- Data persists across navigation
- Form reset clears all state
- No console errors (validation messages OK)

### FAIL When:
- Request fires too early (<700ms) or late (>800ms)
- Multiple requests fire in one debounce cycle
- Invalid data is saved (validation bypassed)
- beforeunload warning doesn't appear
- beforeunload warning appears when it shouldn't
- Data doesn't persist or persists when it shouldn't
- Console errors (actual errors, not validation)

---

## TROUBLESHOOTING

| Problem | Fix |
|---------|-----|
| Dev server won't start | `npm run doctor:quick` then `npm install` |
| Network tab empty | Recording ON? Filter correct? Type in form again |
| No form visible | Navigate to http://localhost:5173/modeling-wizard |
| beforeunload not showing | Ensure typing registered (wait 1sec), try Ctrl+W |
| Value doesn't persist | Check Network tab - did request fire? Status 200? |

---

## TIMER REFERENCE

```
Debounce target: 750 milliseconds

Count method:
  one-thousand-one
  one-thousand-two
  one-thousand-three
  one-thousand-four
  one-thousand-five
  one-thousand-six
  one-thousand-seven
  (approximately 750ms)

Acceptable range: 700-800ms
```

---

## BROWSER MATRIX

```
Chrome:  [1] [2] [3] [4] [5] [E1] [E2] [E3]
Firefox: [1] [2] [3] [4] [5] [E1] [E2] [E3]
Edge:    [1] [2] [3] [4] [5] [E1] [E2] [E3]
Safari:  [1] [2] [3] [4] [5] [E1] [E2] [E3]

Minimum: 3 browsers, all test case categories
```

---

## SIGN-OFF

When all 21 tests + 3 edge cases PASS in 3+ browsers:

```
QA Engineer: _______________________
Date:        _______________________
Result:      [_] PASS  [_] FAIL
Notes:       _______________________
```

---

## DOCUMENT CROSS-REFERENCE

| For | See |
|-----|-----|
| Detailed procedures | MANUAL-QA-SETUP-GUIDE.md |
| DevTools setup | DEVTOOLS-QA-SETUP.md |
| Full checklist | fees-expenses-step-manual-qa-checklist.md |
| Overview | PR227-QA-EXECUTION-SUMMARY.md |
| Component code | client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx |

---

## TIPS FOR EFFICIENCY

1. **Batch by phase**: Do all Phase 1 tests (1.1, 1.2, 1.3) before moving to Phase 2
2. **One browser first**: Complete all tests in Chrome, then Firefox
3. **Screenshot failures**: Network tab + Console + UI state (helps debugging)
4. **Document timings**: Note actual timings for variance analysis
5. **Test combinations**: Try different field value combinations (not just examples)

---

## EXPECTED FLOW

```
1. npm run qa:startup (15 sec)
   ↓
2. Navigate to http://localhost:5173/modeling-wizard (30 sec)
   ↓
3. Open DevTools, go to Step 4 (30 sec)
   ↓
4. Run test Phase 1 in Chrome (15 min)
   ↓
5. Run test Phase 2 in Chrome (15 min)
   ↓
6. Switch to Firefox, run Phase 1 + 2 (20 min)
   ↓
7. Switch to Edge, run selected tests (15 min)
   ↓
8. Fill checklist + sign-off (5 min)
   ↓
TOTAL: ~60 minutes
```

---

## ONE-PAGER SUMMARY

**Component**: FeesExpensesStep (Wizard Step 4)
**Feature**: 750ms debounced auto-save
**Tests**: 21 functional + 3 edge cases
**Duration**: 60 minutes
**Result**: PASS/FAIL checkboxes in checklist

**Key Behavior**:
- Type value → wait 750ms → save fires
- Invalid data → validation error, no save
- Change value → beforeunload warning
- Navigate away → save on unmount
- All state clears on form reset

**Setup**: `npm run qa:startup`
**Browser**: Chrome + Firefox + Edge/Safari (min 3)
**Sign-Off**: fees-expenses-step-manual-qa-checklist.md

---

**Print Date**: 2025-11-30
**Status**: Ready for Manual QA
**Next**: Start with MANUAL-QA-SETUP-GUIDE.md Quickstart
