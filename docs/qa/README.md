# Manual QA Documentation for PR #227

Welcome to the optimized manual QA workflow for FeesExpensesStep auto-save feature testing.

This directory contains comprehensive documentation and tools to streamline the QA process for PR #227, which implements a 750ms debounced auto-save feature with unmount protection and dirty state tracking.

---

## WHAT TO READ FIRST

### Start Here (5 minutes)

**[QA-QUICK-REFERENCE.md](./QA-QUICK-REFERENCE.md)** - One-page cheat sheet
- Quick startup commands
- 21 test cases summarized (1 line each)
- Key shortcuts and troubleshooting
- Print this and keep at your desk

### Then Read (10 minutes)

**[PR227-QA-EXECUTION-SUMMARY.md](./PR227-QA-EXECUTION-SUMMARY.md)** - Executive overview
- Implementation context and why manual QA needed
- Quick start options (Full/Lightweight/Ultra-Fast)
- Test suite breakdown by phase
- Expected outcomes and pass criteria
- Merge readiness checklist

### Then Execute (45-60 minutes)

**[MANUAL-QA-SETUP-GUIDE.md](./MANUAL-QA-SETUP-GUIDE.md)** - Complete test procedures
- 5-minute quickstart
- Detailed step-by-step procedures for all 21 tests
- Edge case testing
- Browser compatibility checklist
- Performance verification
- Troubleshooting guide

### Reference as Needed (During testing)

**[DEVTOOLS-QA-SETUP.md](./DEVTOOLS-QA-SETUP.md)** - Browser tools configuration
- Chrome/Edge/Firefox/Safari setup details
- Network tab, Console, Performance, Memory tabs
- Keyboard shortcuts for each browser
- QA workflow optimization
- Performance profiling procedures

### Final Sign-Off

**[fees-expenses-step-manual-qa-checklist.md](./fees-expenses-step-manual-qa-checklist.md)** - Test checklist
- Original checklist with checkboxes
- All 21 test cases + 3 edge cases
- Browser compatibility matrix
- Performance verification section
- Formal sign-off block for QA engineer

---

## QUICK START

### Option 1: Automatic Setup (Recommended)
```bash
npm run qa:startup
# Automatically starts server, waits for readiness, opens browser
# Time: ~30 seconds to browser open
```

### Option 2: Lightweight (No Docker)
```bash
npm run qa:startup:lightweight
# Skips PostgreSQL/Redis, uses in-memory queues
# Time: ~15 seconds
```

### Option 3: Ultra-Fast (Minimal deps)
```bash
npm run qa:startup:quick
# Minimal backend, fastest startup
# Time: ~5 seconds
```

### Option 4: Manual Control
```bash
npm run dev
# Then follow MANUAL-QA-SETUP-GUIDE.md section 3: "Open Browser & Navigate"
```

---

## DOCUMENT GUIDE

| Document | Size | Purpose | Audience | When |
|----------|------|---------|----------|------|
| QA-QUICK-REFERENCE | 1 page | Cheat sheet | QA Engineer | Before & during tests |
| PR227-QA-EXECUTION-SUMMARY | 5 pages | Strategic overview | Leads & QA | Before starting |
| MANUAL-QA-SETUP-GUIDE | 15 pages | Detailed procedures | QA Engineers | During test execution |
| DEVTOOLS-QA-SETUP | 8 pages | Tool configuration | Technical QA | Before starting |
| fees-expenses-step-manual-qa-checklist | 5 pages | Test checklist | QA Engineer | During & after tests |

---

## FEATURE OVERVIEW

**Component**: FeesExpensesStep (Wizard Step 4)
**Feature**: 750ms Debounced Auto-Save
**Implementation**:
- React Hook Form for state management
- Zod schema for validation
- Custom useDebounce hook (750ms delay)
- Unmount protection (saves on cleanup)
- Dirty state tracking (beforeunload warning)
- Form reset capability

**Test Coverage**:
- **Automated**: 1,006/1,354 tests PASS (74.3%)
- **Manual**: 21 functional + 3 edge cases (this process)

**Automated Testing Blocker**: jest-dom import issue
- Prevents automated UI/behavior tests
- Manual QA unblocks merge verification

---

## TEST BREAKDOWN

### Phase 1: Debounce Mechanics (3 tests, 15 min)
- 1.1: Verify 750ms debounce delay
- 1.2: Rapid typing cancels previous timers
- 1.3: Invalid data rejection (no save)

### Phase 2: Unmount Protection (3 tests, 15 min)
- 3.1: Save on wizard navigation (Previous)
- 3.2: Save on browser back button
- 3.3: Invalid data NOT saved on unmount

### Phase 3: Error Display (3 tests, 10 min)
- 4.1: Fee basis error display
- 5.1: Step-down afterYear error
- 6.1: Step-down newRate error

### Phase 4: Dirty State & beforeunload (3 tests, 10 min)
- 7.1: Warn on unsaved changes
- 7.2: No warning after save
- 7.3: Dirty state persists across fields

### Phase 5: Form Reset (2 tests, 5 min)
- 8.1: Reset clears all fields
- 8.2: Reset clears dirty state

### Edge Cases (3 tests, 5 min)
- E1: Multiple fields changed simultaneously
- E2: Step-down required fields validation
- E3: Valid → Invalid → Valid transitions

**Total**: 21 tests + 3 edge cases = 24 scenarios
**Duration**: ~60 minutes for complete QA cycle
**Browsers**: Minimum 3 (Chrome + Firefox + Edge/Safari)

---

## TOOLS PROVIDED

### npm Scripts

```bash
npm run qa:startup              # Full stack + browser
npm run qa:startup:lightweight  # Skip Docker services
npm run qa:startup:quick        # Ultra-fast mode
npm run qa:startup:no-browser   # Server only
```

### Script: `/scripts/qa-startup.js`

Intelligent startup script with:
- Environment validation (Docker, dependencies)
- Multiple startup strategies
- Automatic browser launch
- Health check before opening browser
- Clear startup messaging

---

## BROWSER COMPATIBILITY

### Recommended Testing Sequence

1. **Primary**: Chrome (DevTools most comprehensive)
2. **Secondary**: Firefox (Storage tab unique feature)
3. **Tertiary**: Edge (Chromium-based, similar to Chrome) OR Safari (macOS only)

### DevTools Setup (2 minutes per browser)

1. Open DevTools (F12)
2. Go to Network tab
3. Enable recording (red circle)
4. Filter for POST/PATCH requests
5. See DEVTOOLS-QA-SETUP.md for detailed browser-specific guides

---

## EXPECTED OUTCOMES

### Successful Test Pattern

```
Setup: [Preconditions met]
Actions: [Steps executed as specified]
Results: [Observable outcomes verified]
```

### Example: Test 1.1 (750ms Debounce)

```
Setup:
  - Network tab open, recording ON
  - At Step 4: Fees & Expenses

Actions:
  1. Type "2.5" in Rate field
     → Network tab: EMPTY (no request yet)

  2. Wait 750ms (count: one-thousand-one through seven)
     → Network tab: Single POST request appears

  3. Inspect request:
     → Method: POST or PATCH
     → Status: 200 or 201
     → Payload: "managementFee": {"rate": 2.5, ...}

Results:
  [✓] Request fires at ~750ms
  [✓] Exactly 1 request (not multiple)
  [✓] Payload contains correct value
```

---

## PASS CRITERIA

### Acceptance Requirements

ALL of the following must be true:

1. **All 21 test cases**: PASS checkmark
2. **All 3 edge cases**: PASS checkmark
3. **Cross-browser**: Tested in 3+ browsers (Chrome + Firefox + minimum 1 other)
4. **Performance**: Debounce 750ms ±50ms acceptable variance
5. **Memory**: No memory leaks during repeated cycles
6. **Errors**: No console errors (validation messages OK)
7. **UX**: Form responsive, error messages clear
8. **Sign-off**: QA engineer name, date, and result (PASS/FAIL)

### Failure Criteria

Any of these = FAIL:

- Debounce timing outside 700-800ms range
- Multiple save requests in single edit cycle
- Invalid data being saved (validation bypassed)
- beforeunload warning missing for unsaved changes
- Data not persisting after navigation
- Browser-specific failures (no workarounds)
- Console JavaScript errors (validation messages expected)

---

## WORKFLOW OVERVIEW

```
                    START
                      ↓
        Read QA-QUICK-REFERENCE (1 min)
                      ↓
        Read PR227-QA-EXECUTION-SUMMARY (5 min)
                      ↓
        npm run qa:startup (setup + browser)
                      ↓
        Navigate to http://localhost:5173/modeling-wizard
                      ↓
        Open DevTools (F12) → Network tab
                      ↓
        ┌─────────────────────────────┐
        │ Execute Test Phases 1-5     │
        │ (Follow MANUAL-QA-SETUP.md) │
        │ 21 tests × 3+ browsers      │
        └─────────────────────────────┘
                      ↓
        Document results in checklist
                      ↓
        Fill sign-off section
                      ↓
        Submit for merge verification
                      ↓
                    END
```

---

## TROUBLESHOOTING

### Quick Fixes

| Issue | Fix | Docs |
|-------|-----|------|
| Dev server won't start | `npm run doctor:quick` then `npm install` | MANUAL-QA-SETUP > Troubleshooting |
| Network tab empty | Recording ON? Type in form again | DEVTOOLS-QA-SETUP > Network tab |
| Form not visible | Navigate to http://localhost:5173/modeling-wizard | MANUAL-QA-SETUP > Browser Setup |
| beforeunload not showing | Ensure typing registered, try Ctrl+W | MANUAL-QA-SETUP > Phase 4 |
| Value doesn't persist | Check Network tab status = 200 | MANUAL-QA-SETUP > Phase 2 |

**Full troubleshooting**: See MANUAL-QA-SETUP-GUIDE.md > TROUBLESHOOTING section

---

## DEVELOPER REFERENCE

### Key Files

- **Component**: `/client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx`
- **Schema**: `/shared/schemas/modeling-wizard.schemas.ts`
- **Hook**: `/client/src/hooks/useDebounce.ts`
- **API**: `/server/routes/modeling-wizard.ts` (or equivalent)

### API Endpoints

Save request:
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

Response:
```
200 OK
{
  "success": true,
  "data": { /* saved data */ }
}
```

---

## SIGN-OFF LOCATION

After completing all tests, fill out:

**File**: `fees-expenses-step-manual-qa-checklist.md` > Sign-Off section

```
- QA Engineer: [Your name]
- Date: [Test date]
- Result: [ ] Pass  [ ] Fail (with notes)
```

This sign-off unblocks merge verification.

---

## SUPPORT & ESCALATION

### During QA

1. Check **Troubleshooting** section (above)
2. Review component code in `/client/src/components/modeling-wizard/steps/`
3. Check test comments for implementation details

### If Issue Found

1. Take screenshot (Network tab + Console + UI)
2. Note exact reproduction steps
3. Document in checklist "Notes" section
4. Reference CLAUDE.md for escalation path

### Escalation Contact

See CLAUDE.md for support channels and issue tracking procedures.

---

## TIMELINE

### Recommended Schedule

```
Prep Phase (10 min):
  - Read QA-QUICK-REFERENCE
  - Read PR227-EXECUTION-SUMMARY
  - Run npm run qa:startup

Test Phase (50 min):
  - Phases 1-3: 40 min (Chrome + Firefox)
  - Phases 4-5: 10 min (Edge/Safari)

Wrap-Up (5 min):
  - Fill checklist
  - Sign-off document

Total: ~65 minutes
```

Can be spread across multiple sessions if needed.

---

## CHECKLIST: BEFORE YOU START

- [ ] Read QA-QUICK-REFERENCE (2 min)
- [ ] Read PR227-QA-EXECUTION-SUMMARY (5 min)
- [ ] npm run qa:startup (or npm run dev)
- [ ] Browser at http://localhost:5173/modeling-wizard
- [ ] DevTools open, Network tab recording
- [ ] Step 4: "Fees & Expenses" form visible
- [ ] All form fields interactive
- [ ] Multiple browsers ready (Chrome, Firefox, +1)
- [ ] fees-expenses-step-manual-qa-checklist.md open
- [ ] Timer/stopwatch available
- [ ] Screenshot tool ready
- [ ] Quiet testing environment (can focus)

---

## NEXT STEPS

1. **Read**: QA-QUICK-REFERENCE.md (1 page, 2 min)
2. **Understand**: PR227-QA-EXECUTION-SUMMARY.md (5 pages, 5 min)
3. **Execute**: MANUAL-QA-SETUP-GUIDE.md (15 pages, 60 min)
4. **Reference**: DEVTOOLS-QA-SETUP.md (as needed, 0-15 min)
5. **Sign-Off**: fees-expenses-step-manual-qa-checklist.md (5 min)

**Status**: Ready to begin manual QA

---

## VERSION & METADATA

| Attribute | Value |
|-----------|-------|
| Feature | PR #227: FeesExpensesStep auto-save |
| Created | 2025-11-30 |
| Test Cases | 21 functional + 3 edge cases |
| Est. Duration | 60 minutes |
| Browsers | Chrome, Firefox, Edge, Safari |
| Status | Ready for Manual QA Execution |

---

## DOCUMENT RELATIONSHIPS

```
README.md (you are here)
├── QA-QUICK-REFERENCE.md (start with this)
├── PR227-QA-EXECUTION-SUMMARY.md (read next)
├── MANUAL-QA-SETUP-GUIDE.md (detailed procedures)
├── DEVTOOLS-QA-SETUP.md (browser configuration)
├── fees-expenses-step-manual-qa-checklist.md (test checklist & sign-off)
└── (Original request/context documents)
    ├── /docs/qa/fees-expenses-step-manual-qa-checklist.md (original)
    ├── /CLAUDE.md (development guide)
    └── /package.json (npm scripts)
```

---

**Welcome to streamlined manual QA!**

Start with QA-QUICK-REFERENCE.md, then follow the workflow above.

Questions? Check the Troubleshooting sections in MANUAL-QA-SETUP-GUIDE.md or DEVTOOLS-QA-SETUP.md.

Good luck with testing!
