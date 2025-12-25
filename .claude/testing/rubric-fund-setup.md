# Fund Setup & Configuration Testing Rubric

**Domain:** Fund creation and configuration
**Estimated Time:** 45 minutes
**Prerequisites:** Database seeded, development server running

---

## Overview

This rubric covers the 7-step fund setup wizard and fund configuration management. The wizard guides users through creating a new fund with all required parameters.

**Wizard Steps:**
1. Fund Details (name, size, vintage, duration)
2. GP Commitment (commitment amount, timing)
3. Management Fees (fee structure, timing)
4. Carry Waterfall (GP/LP splits, hurdle rate, catch-up)
5. Deployment Strategy (pacing rules)
6. Reserve Strategy (allocation rules)
7. Review & Confirm (preview all settings)

---

## Test Cases

### TC-FS-001: Wizard Navigation - Happy Path
**Objective:** Verify wizard step navigation works correctly
**Steps:**
1. Navigate to `/funds/new`
2. Fill in Fund Details step (valid data)
3. Click "Next" button
4. Verify navigation to GP Commitment step
5. Continue through all 7 steps clicking "Next"
6. Verify "Review & Confirm" step shows all entered data
7. Click "Create Fund"
8. Verify redirect to fund dashboard

**Expected Result:**
- Each step transition is smooth (no page reload)
- Progress indicator highlights current step
- All entered data persists across steps
- Fund is created successfully
- Success toast notification appears

**Data Validation:**
- Fund appears in database with correct parameters
- Fund ID is generated (integer)
- Created timestamp is accurate

**Time:** 5 minutes

---

### TC-FS-002: Step 1 - Fund Details Validation
**Objective:** Verify fund details form validation
**Steps:**

**Test 2a: Required Fields**
1. Navigate to `/funds/new`
2. Leave all fields empty
3. Click "Next"
4. Verify validation errors appear for required fields

**Expected Errors:**
- Fund Name: "Fund name is required"
- Fund Size: "Fund size is required"
- Vintage Year: "Vintage year is required"
- Fund Duration: "Duration is required"

**Test 2b: Fund Size Range Validation**
1. Enter fund size: $0
2. Verify error: "Fund size must be greater than $0"
3. Enter fund size: $999,999
4. Verify error: "Minimum fund size is $1,000,000"
5. Enter fund size: $10,000,000,001
6. Verify error: "Maximum fund size is $10,000,000,000"
7. Enter fund size: $50,000,000 (valid)
8. Verify no error, field shows "$50,000,000"

**Test 2c: Vintage Year Validation**
1. Enter vintage year: 1999
2. Verify error: "Vintage year must be 2000 or later"
3. Enter vintage year: 2051
4. Verify error: "Vintage year cannot be more than 1 year in the future"
5. Enter vintage year: 2024 (valid)
6. Verify no error

**Test 2d: Duration Validation**
1. Enter duration: 0 years
2. Verify error: "Duration must be at least 1 year"
3. Enter duration: 21 years
4. Verify error: "Maximum duration is 20 years"
5. Enter duration: 10 years (valid)
6. Verify no error

**Test 2e: Fund Name Uniqueness**
1. Enter fund name matching existing fund: "Test Fund I"
2. Fill other required fields
3. Click "Next"
4. Verify error: "Fund name already exists"

**Time:** 8 minutes

---

### TC-FS-003: Step 2 - GP Commitment Configuration
**Objective:** Verify GP commitment validation and calculations
**Steps:**

**Test 3a: Commitment Amount Validation**
1. Complete Step 1 with valid data
2. Navigate to Step 2
3. Enter GP commitment: $0
4. Verify error: "GP commitment must be greater than $0"
5. Enter GP commitment: $50,000,001 (exceeds fund size)
6. Verify error: "GP commitment cannot exceed fund size"
7. Enter GP commitment: $5,000,000 (10% of $50M fund)
8. Verify commitment percentage displays: "10.00%"

**Test 3b: Commitment Timing**
1. Select commitment timing: "Upfront"
2. Verify tooltip explains: "Full GP commitment at fund inception"
3. Select commitment timing: "Pro-rata"
4. Verify tooltip explains: "GP commits proportionally with each capital call"
5. Select commitment timing: "Hybrid"
6. Verify additional fields appear for hybrid schedule

**Time:** 5 minutes

---

### TC-FS-004: Step 3 - Management Fees Configuration
**Objective:** Verify management fee structure validation
**Steps:**

**Test 4a: Fee Percentage Validation**
1. Complete Steps 1-2
2. Navigate to Step 3
3. Enter management fee: -1%
4. Verify error: "Management fee must be 0% or greater"
5. Enter management fee: 5.01%
6. Verify error: "Maximum management fee is 5%"
7. Enter management fee: 2%
8. Verify no error

**Test 4b: Fee Calculation Preview**
1. Set management fee: 2%
2. Verify annual fee calculation displays: "$1,000,000" (2% of $50M)
3. Verify 10-year total displays: "$10,000,000"

**Test 4c: Fee Step-Down Configuration**
1. Enable "Step-down after investment period"
2. Verify additional fields appear:
   - Investment period duration
   - Post-investment fee percentage
3. Set investment period: 5 years
4. Set post-investment fee: 1.5%
5. Verify fee schedule preview shows:
   - Years 1-5: 2% ($1M/year)
   - Years 6-10: 1.5% ($750K/year)

**Time:** 6 minutes

---

### TC-FS-005: Step 4 - Carry Waterfall Configuration
**Objective:** Verify American waterfall configuration and validation
**Steps:**

**Test 5a: GP/LP Split Validation**
1. Complete Steps 1-3
2. Navigate to Step 4
3. Enter GP carry: 15%
4. Verify LP share auto-calculates: 85%
5. Verify sum equals 100%
6. Enter GP carry: 25%
7. Verify LP share updates: 75%
8. Enter GP carry: 101%
9. Verify error: "GP carry cannot exceed 100%"

**Test 5b: Hurdle Rate Configuration**
1. Enable "Preferred return (hurdle)"
2. Enter hurdle rate: 0%
3. Verify error: "Hurdle rate must be greater than 0%"
4. Enter hurdle rate: 25%
5. Verify error: "Maximum hurdle rate is 20%"
6. Enter hurdle rate: 8%
7. Verify no error
8. Verify hurdle type options: "Hard" or "Soft"

**Test 5c: Catch-Up Configuration**
1. Enable "GP catch-up"
2. Verify catch-up percentage field appears
3. Enter catch-up: 50%
4. Verify waterfall preview displays:
   - Tier 1: Return of capital to LPs
   - Tier 2: Preferred return to LPs (8%)
   - Tier 3: Catch-up to GP (50%)
   - Tier 4: Carried interest split (20/80)

**Test 5d: Waterfall Preview with Sample Data**
1. Use waterfall configuration: 20% GP carry, 8% hurdle, 50% catch-up
2. Verify preview table shows sample distributions:
   - Total proceeds: $100M
   - LP capital: $50M returned
   - LP preferred: $4M (8% of $50M)
   - GP catch-up: $2M
   - Remaining split: $44M (20/80 split)
   - Final GP take: ~$10.8M
   - Final LP take: ~$89.2M

**Time:** 10 minutes

---

### TC-FS-006: Step 5 - Deployment Strategy Configuration
**Objective:** Verify pacing strategy validation
**Steps:**

**Test 6a: Pacing Model Selection**
1. Complete Steps 1-4
2. Navigate to Step 5
3. Verify pacing model options:
   - Linear (equal deployments)
   - Front-loaded (deploy faster early)
   - Back-loaded (deploy slower early)
   - Custom (manual schedule)

**Test 6b: Linear Pacing**
1. Select "Linear" model
2. Set deployment period: 5 years
3. Verify annual deployment preview: $10M/year
4. Verify deployment schedule chart renders

**Test 6c: Custom Pacing Validation**
1. Select "Custom" model
2. Add year 1: 30% ($15M)
3. Add year 2: 30% ($15M)
4. Add year 3: 20% ($10M)
5. Add year 4: 15% ($7.5M)
6. Verify error: "Total must equal 100%" (only 95%)
7. Add year 5: 5% ($2.5M)
8. Verify no error, total equals 100%

**Time:** 5 minutes

---

### TC-FS-007: Step 6 - Reserve Strategy Configuration
**Objective:** Verify reserve allocation rules
**Steps:**

**Test 7a: Reserve Policy Selection**
1. Complete Steps 1-5
2. Navigate to Step 6
3. Verify reserve policy options:
   - Fixed percentage (e.g., 50% of each investment)
   - Rule-based (based on stage, sector)
   - ML-recommended (AI-driven allocation)
   - No reserves

**Test 7b: Fixed Percentage Reserves**
1. Select "Fixed percentage"
2. Enter reserve ratio: 0%
3. Verify error: "Reserve ratio must be greater than 0%"
4. Enter reserve ratio: 201%
5. Verify error: "Maximum reserve ratio is 200%"
6. Enter reserve ratio: 50%
7. Verify example calculation: $1M initial → $500K reserved

**Test 7c: Rule-Based Reserves**
1. Select "Rule-based"
2. Add rule: "Seed stage → 100% reserve"
3. Add rule: "Series A → 50% reserve"
4. Add rule: "Series B+ → 25% reserve"
5. Verify rules table displays all configurations
6. Test rule conflict detection (overlapping conditions)

**Time:** 5 minutes

---

### TC-FS-008: Step 7 - Review & Confirm
**Objective:** Verify review step displays all configurations correctly
**Steps:**

**Test 8a: Data Accuracy**
1. Complete all 6 previous steps
2. Navigate to Step 7
3. Verify review summary displays:
   - Fund Details (name, size, vintage, duration)
   - GP Commitment (amount, percentage, timing)
   - Management Fees (percentage, annual amount)
   - Carry Waterfall (GP/LP split, hurdle, catch-up)
   - Deployment Strategy (pacing model, schedule)
   - Reserve Strategy (policy, parameters)

**Test 8b: Edit Navigation**
1. Click "Edit" button on Fund Details section
2. Verify navigation back to Step 1
3. Change fund name
4. Click "Next" through to Step 7
5. Verify updated fund name appears in review

**Test 8c: Fund Creation**
1. Review all data in Step 7
2. Click "Create Fund"
3. Verify loading state during creation
4. Verify success toast: "Fund created successfully"
5. Verify redirect to fund dashboard at `/funds/{fundId}`

**Time:** 5 minutes

---

### TC-FS-009: Wizard State Persistence
**Objective:** Verify wizard saves progress and handles interruptions
**Steps:**

**Test 9a: Browser Refresh**
1. Start wizard, complete Steps 1-3
2. Refresh browser page (F5)
3. Verify wizard restores to Step 3
4. Verify all data from Steps 1-3 is preserved

**Test 9b: Navigation Away and Back**
1. Start wizard, complete Step 1
2. Navigate to home page (`/`)
3. Navigate back to `/funds/new`
4. Verify wizard shows Step 2 (not Step 1)
5. Verify Step 1 data is preserved

**Test 9c: Session Expiry**
1. Start wizard, complete Steps 1-2
2. Simulate session expiry (clear localStorage or wait for timeout)
3. Attempt to navigate to Step 3
4. Verify redirect to login page
5. After login, verify wizard state is lost (security)

**Time:** 4 minutes

---

### TC-FS-010: Fund Duplication
**Objective:** Verify fund duplication creates accurate copy
**Steps:**

1. Navigate to existing fund detail page
2. Click "Duplicate Fund" button
3. Verify wizard opens pre-filled with original fund data
4. Verify fund name appended with " (Copy)"
5. Change fund name to "Test Fund II"
6. Click through wizard without changing other fields
7. Create duplicated fund
8. Verify new fund created with:
   - Same size, vintage, duration as original
   - Same GP commitment, fees, waterfall
   - Different fund ID and name
   - Created timestamp is current date

**Time:** 4 minutes

---

### TC-FS-011: Fund Editing
**Objective:** Verify fund parameter editing with constraints
**Steps:**

**Test 11a: Edit Allowed Fields (Pre-Activation)**
1. Navigate to fund detail page (fund not yet activated)
2. Click "Edit Fund" button
3. Verify all fields are editable
4. Change fund size from $50M to $75M
5. Save changes
6. Verify updated fund size displays

**Test 11b: Edit Restricted After Activation**
1. Activate fund (make first investment or capital call)
2. Click "Edit Fund"
3. Verify restricted fields are disabled:
   - Fund size (locked after activation)
   - Vintage year (locked after activation)
   - Waterfall structure (locked after distributions)
4. Verify editable fields:
   - Fund name
   - Management fee (with warning)

**Test 11c: Edit Validation**
1. Edit fund name to empty string
2. Verify error: "Fund name is required"
3. Edit fund name to match another fund
4. Verify error: "Fund name already exists"

**Time:** 6 minutes

---

## Summary Checklist

After completing all test cases, verify:

- [ ] All 7 wizard steps navigate correctly
- [ ] All form validations work as expected
- [ ] Data persists across steps
- [ ] Review step accurately reflects all inputs
- [ ] Fund creation succeeds with valid data
- [ ] Wizard state survives browser refresh
- [ ] Fund duplication creates accurate copy
- [ ] Fund editing respects activation constraints
- [ ] All error messages are clear and helpful
- [ ] UI is responsive and accessible

---

## Known Issues

Document any bugs found during testing:

| Test Case | Issue Description | Severity | GitHub Issue |
|-----------|-------------------|----------|--------------|
| TC-FS-XXX | [Description]     | [Level]  | #XXX         |

---

## Test Data

**Sample Fund Configuration:**
```json
{
  "name": "Test Fund I",
  "size": 50000000,
  "vintage": 2024,
  "duration": 10,
  "gpCommitment": 5000000,
  "managementFee": 0.02,
  "carryStructure": {
    "gpCarry": 0.20,
    "hurdleRate": 0.08,
    "catchUp": 0.50
  }
}
```

---

## Related Documentation

- [DECISIONS.md](../../DECISIONS.md) - Fund setup architecture decisions
- [cheatsheets/fund-modeling.md](../../cheatsheets/fund-modeling.md) - Fund modeling patterns
- [shared/schemas/fund.schemas.ts](../../shared/schemas/fund.schemas.ts) - Zod validation schemas
