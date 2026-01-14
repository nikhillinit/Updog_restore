# Portfolio Management Testing Rubric

**Domain:** Portfolio companies, investments, cap tables **Estimated Time:** 60
minutes **Prerequisites:** Test fund created, database seeded

---

## Overview

This rubric covers portfolio company management, investment tracking, cap table
calculations, and company lifecycle management.

**Key Features:**

- Company creation and editing
- Investment event tracking (initial, follow-ons, exits)
- Cap table management (ownership %, dilution)
- Company status lifecycle (active, exited, written-off)
- Document attachments and notes
- Scenario planning (deal-level scenarios)

---

## Test Cases

### TC-PM-001: Company Creation - Happy Path

**Objective:** Verify company creation with required fields **Steps:**

1. Navigate to portfolio page (`/portfolio`)
2. Click "Add Company" button
3. Fill company form:
   - Name: "Test Company Alpha"
   - Sector: "Software"
   - Stage: "Seed"
   - Founded: "2023"
   - Location: "San Francisco, CA"
4. Click "Create Company"
5. Verify success toast appears
6. Verify redirect to company detail page
7. Verify company appears in portfolio list

**Expected Result:**

- Company created with generated ID
- Created timestamp recorded
- Status defaults to "Active"
- Company visible in portfolio table

**Time:** 3 minutes

---

### TC-PM-002: Company Validation

**Objective:** Verify company form validation rules **Steps:**

**Test 2a: Required Fields**

1. Click "Add Company"
2. Leave all fields empty
3. Click "Create Company"
4. Verify validation errors:
   - Name: "Company name is required"
   - Sector: "Sector is required"
   - Stage: "Stage is required"

**Test 2b: Name Uniqueness**

1. Fill form with name matching existing company
2. Click "Create Company"
3. Verify error: "Company name already exists in this fund"

**Test 2c: Founded Year Validation**

1. Enter founded year: 1899
2. Verify error: "Founded year must be 1900 or later"
3. Enter founded year: 2026
4. Verify error: "Founded year cannot be in the future"
5. Enter founded year: 2023 (valid)
6. Verify no error

**Test 2d: Valuation Validation**

1. Enter post-money valuation: -$1,000,000
2. Verify error: "Valuation must be greater than $0"
3. Enter post-money valuation: $0
4. Verify error: "Valuation must be greater than $0"
5. Enter post-money valuation: $10,000,000 (valid)
6. Verify no error

**Time:** 5 minutes

---

### TC-PM-003: Initial Investment Recording

**Objective:** Verify initial investment event creation **Steps:**

**Test 3a: Create Initial Investment**

1. Navigate to company detail page
2. Click "Record Investment" button
3. Select investment type: "Initial"
4. Fill investment form:
   - Amount: $1,000,000
   - Date: 2024-01-15
   - Round: "Seed"
   - Post-money valuation: $10,000,000
   - Shares purchased: 100,000
5. Click "Record Investment"
6. Verify success toast
7. Verify investment appears in company timeline
8. Verify cap table updates with new ownership

**Test 3b: Cap Table Calculation**

1. After recording $1M investment at $10M valuation
2. Verify cap table shows:
   - Total shares outstanding: 1,000,000 (implied)
   - Fund shares: 100,000
   - Fund ownership: 10.00%
   - Cost basis: $10.00/share

**Test 3c: Investment Validation**

1. Attempt to create another "Initial" investment
2. Verify error: "Company already has an initial investment"
3. Verify only one initial investment allowed per company

**Time:** 6 minutes

---

### TC-PM-004: Follow-On Investments

**Objective:** Verify follow-on investment tracking and dilution **Steps:**

**Test 4a: Record Follow-On**

1. Navigate to company with existing initial investment
2. Click "Record Investment"
3. Select investment type: "Follow-on"
4. Fill form:
   - Amount: $500,000
   - Date: 2024-06-15
   - Round: "Series A"
   - Post-money valuation: $25,000,000
   - Shares purchased: 20,000
5. Click "Record Investment"
6. Verify investment recorded

**Test 4b: Dilution Calculation**

1. After recording follow-on
2. Verify cap table updates:
   - Total shares outstanding: 2,500,000 (new total)
   - Fund shares: 120,000 (100k initial + 20k follow-on)
   - Fund ownership: 4.80% (diluted from 10%)
   - Weighted average cost basis: $12.50/share
3. Verify dilution alert shows: "Ownership diluted from 10.00% to 4.80%"

**Test 4c: Multiple Follow-Ons**

1. Record second follow-on: $1M at $50M valuation
2. Record third follow-on: $2M at $100M valuation
3. Verify cap table tracks all investments
4. Verify total invested amount: $4.5M
5. Verify cumulative ownership percentage
6. Verify investment timeline shows all events chronologically

**Time:** 8 minutes

---

### TC-PM-005: Exit Event Recording

**Objective:** Verify exit tracking and return calculations **Steps:**

**Test 5a: Full Exit (100% Liquidity)**

1. Navigate to company with investments
2. Click "Record Exit"
3. Fill exit form:
   - Exit type: "Acquisition"
   - Date: 2025-12-31
   - Exit valuation: $200,000,000
   - Proceeds to fund: $9,600,000
   - Liquidity: 100%
4. Click "Record Exit"
5. Verify company status changes to "Exited"

**Test 5b: Return Metrics**

1. After recording exit
2. Verify return metrics display:
   - Total invested: $4,500,000
   - Total proceeds: $9,600,000
   - Gross MOIC: 2.13x
   - Realized IRR: ~35% (calculated based on investment dates)
   - Holding period: ~24 months
3. Verify metrics match Excel calculations

**Test 5c: Partial Exit (Secondary Sale)**

1. Record partial exit:
   - Exit type: "Secondary"
   - Liquidity: 30%
   - Proceeds: $2,880,000
2. Verify company status remains "Active"
3. Verify remaining ownership: 70%
4. Verify partial return metrics calculated

**Test 5d: Write-Off (0% Recovery)**

1. Record write-off:
   - Exit type: "Write-off"
   - Exit valuation: $0
   - Proceeds: $0
   - Liquidity: 100%
2. Verify company status changes to "Written-off"
3. Verify loss metrics: -100% return, 0.00x MOIC

**Time:** 10 minutes

---

### TC-PM-006: Cap Table Management

**Objective:** Verify cap table calculations and dilution tracking **Steps:**

**Test 6a: Ownership Percentage Calculation**

1. Create company with initial investment:
   - Investment: $2M at $20M post-money
   - Expected ownership: 10%
2. Verify cap table shows 10.00%
3. Record external Series A (no fund participation):
   - New investors: $5M at $30M post-money
4. Verify fund ownership dilutes to: 6.67%

**Test 6b: Multiple Shareholders**

1. View cap table with multiple rounds
2. Verify table displays:
   - Shareholder name (Fund, Founders, Series A investors)
   - Shares owned
   - Ownership percentage
   - Investment amount
   - Share class (Common, Preferred A, Preferred B)
3. Verify total ownership sums to 100.00%

**Test 6c: Fully Diluted Shares**

1. Add option pool: 150,000 shares (15% of company)
2. Verify cap table shows:
   - Basic shares outstanding
   - Fully diluted shares (including options)
   - Basic ownership %
   - Fully diluted ownership %

**Test 6d: Cap Table Export**

1. Click "Export Cap Table"
2. Verify CSV download contains:
   - All shareholders
   - Share counts
   - Ownership percentages
   - Investment amounts
3. Verify Excel can open file without errors

**Time:** 8 minutes

---

### TC-PM-007: Company Status Lifecycle

**Objective:** Verify company status transitions and constraints **Steps:**

**Test 7a: Status Transitions**

1. Create new company (status: "Active")
2. Record initial investment (status remains "Active")
3. Record exit (status changes to "Exited")
4. Verify status badge updates in UI

**Test 7b: Status Constraints**

1. Navigate to exited company
2. Attempt to record new investment
3. Verify error: "Cannot invest in exited company"
4. Attempt to record another exit
5. Verify error: "Company already exited"

**Test 7c: Reactivation (Edge Case)**

1. Exited company with partial liquidity (e.g., 50%)
2. Record additional exit event for remaining 50%
3. Verify status updates to fully "Exited"
4. Verify no further transactions allowed

**Test 7d: Manual Status Override**

1. Navigate to active company
2. Click "Change Status" dropdown
3. Select "On Hold"
4. Verify status updates
5. Verify investment recording still allowed (not blocked)

**Time:** 6 minutes

---

### TC-PM-008: Document Attachments

**Objective:** Verify document upload and management **Steps:**

**Test 8a: Upload Document**

1. Navigate to company detail page
2. Click "Upload Document" button
3. Select file: "term_sheet.pdf" (2MB)
4. Fill metadata:
   - Document type: "Term Sheet"
   - Description: "Seed round terms"
   - Date: 2024-01-15
5. Click "Upload"
6. Verify upload progress indicator
7. Verify document appears in documents list
8. Verify file size displays: "2.0 MB"

**Test 8b: File Type Validation**

1. Attempt to upload executable: "malware.exe"
2. Verify error: "File type not allowed. Allowed: PDF, DOCX, XLSX, PNG, JPG"
3. Attempt to upload oversized file: 25MB PDF
4. Verify error: "Maximum file size is 20MB"

**Test 8c: Download Document**

1. Click document name link
2. Verify download starts
3. Verify downloaded file opens correctly

**Test 8d: Delete Document**

1. Click delete icon on document row
2. Verify confirmation modal: "Are you sure you want to delete this document?"
3. Click "Confirm"
4. Verify document removed from list
5. Verify deletion logged in audit trail

**Time:** 5 minutes

---

### TC-PM-009: Company Notes and Activity Log

**Objective:** Verify notes and audit trail functionality **Steps:**

**Test 9a: Add Note**

1. Navigate to company detail page
2. Click "Add Note" button
3. Enter note: "Met with CEO, discussed Q4 targets"
4. Click "Save Note"
5. Verify note appears with:
   - Note text
   - Author name
   - Timestamp
   - Edit/delete actions

**Test 9b: Edit Note**

1. Click "Edit" on existing note
2. Modify text
3. Click "Save"
4. Verify updated text displays
5. Verify "Edited" indicator appears with edit timestamp

**Test 9c: Activity Log**

1. Navigate to "Activity" tab
2. Verify activity log shows:
   - Company created
   - Investments recorded
   - Exits recorded
   - Notes added/edited
   - Documents uploaded/deleted
3. Verify each entry has:
   - Action description
   - User who performed action
   - Timestamp
   - Related data (e.g., investment amount)

**Time:** 4 minutes

---

### TC-PM-010: Scenario Planning (Deal-Level)

**Objective:** Verify scenario creation and comparison for individual companies
**Steps:**

**Test 10a: Create Base Scenario**

1. Navigate to company detail page
2. Click "Scenarios" tab
3. Click "Create Scenario"
4. Fill form:
   - Name: "Base Case"
   - Description: "Expected outcome"
5. Add scenario cases:
   - Case 1: 50% probability, $5M exit, 24 months
   - Case 2: 50% probability, $10M exit, 36 months
6. Click "Save Scenario"
7. Verify weighted summary displays:
   - Expected value: $7.5M
   - Expected MOIC: 3.75x (assuming $2M invested)
   - Probability-weighted IRR

**Test 10b: Create Alternative Scenarios**

1. Create "Bull Case" scenario:
   - 100% probability, $20M exit, 18 months
2. Create "Bear Case" scenario:
   - 100% probability, $1M exit, 12 months
3. Verify all 3 scenarios listed

**Test 10c: Scenario Comparison**

1. Click "Compare Scenarios"
2. Select: Base Case vs Bull Case
3. Verify comparison table shows:
   - Exit value delta: +$12.5M
   - MOIC delta: +6.67x
   - Time to exit delta: -18 months
4. Verify visual charts (bar chart comparing metrics)

**Time:** 8 minutes

---

### TC-PM-011: Portfolio Filtering and Search

**Objective:** Verify portfolio filtering, sorting, and search **Steps:**

**Test 11a: Sector Filter**

1. Navigate to portfolio page
2. Apply sector filter: "Software"
3. Verify only software companies display
4. Apply sector filter: "Healthcare"
5. Verify only healthcare companies display
6. Clear filter
7. Verify all companies display

**Test 11b: Status Filter**

1. Apply status filter: "Active"
2. Verify only active companies display
3. Apply status filter: "Exited"
4. Verify only exited companies display
5. Apply multiple statuses: "Active" + "On Hold"
6. Verify both groups display

**Test 11c: Search**

1. Enter search: "Alpha"
2. Verify only companies with "Alpha" in name display
3. Enter search: "2023" (founded year)
4. Verify companies founded in 2023 display
5. Clear search
6. Verify all companies display

**Test 11d: Sorting**

1. Click "Name" column header
2. Verify companies sort alphabetically (A-Z)
3. Click again
4. Verify reverse sort (Z-A)
5. Click "Invested" column
6. Verify companies sort by total invested amount (descending)
7. Click "MOIC" column
8. Verify companies sort by MOIC (highest first)

**Time:** 5 minutes

---

### TC-PM-012: Bulk Operations

**Objective:** Verify bulk actions on multiple companies **Steps:**

**Test 12a: Bulk Status Change**

1. Select 3 companies using checkboxes
2. Click "Bulk Actions" dropdown
3. Select "Change Status" → "On Hold"
4. Verify confirmation modal lists all 3 companies
5. Click "Confirm"
6. Verify all 3 companies' status updated to "On Hold"

**Test 12b: Bulk Export**

1. Select 5 companies
2. Click "Bulk Actions" → "Export Data"
3. Verify CSV download contains only selected 5 companies
4. Verify CSV includes:
   - Company names
   - Invested amounts
   - Ownership percentages
   - MOIC, IRR metrics

**Test 12c: Bulk Tag Assignment**

1. Select 4 companies
2. Click "Bulk Actions" → "Add Tag"
3. Enter tag: "High Potential"
4. Click "Apply"
5. Verify all 4 companies now have "High Potential" tag
6. Verify tag appears in portfolio table

**Time:** 4 minutes

---

## Summary Checklist

After completing all test cases, verify:

- [ ] Companies can be created with validation
- [ ] Investments tracked accurately (initial, follow-ons, exits)
- [ ] Cap table calculations correct (ownership %, dilution)
- [ ] Company status lifecycle enforced
- [ ] Documents upload/download/delete correctly
- [ ] Notes and activity log capture all actions
- [ ] Scenarios create and compare properly
- [ ] Portfolio filters and search work
- [ ] Bulk operations complete successfully
- [ ] All metrics match Excel calculations

---

## Known Issues

Document any bugs found during testing:

| Test Case | Issue Description | Severity | GitHub Issue |
| --------- | ----------------- | -------- | ------------ |
| TC-PM-XXX | [Description]     | [Level]  | #XXX         |

---

## Test Data

**Sample Company:**

```json
{
  "name": "Test Company Alpha",
  "sector": "Software",
  "stage": "Seed",
  "founded": 2023,
  "location": "San Francisco, CA"
}
```

**Sample Investment:**

```json
{
  "type": "Initial",
  "amount": 1000000,
  "date": "2024-01-15",
  "round": "Seed",
  "postMoneyValuation": 10000000,
  "sharesPurchased": 100000
}
```

---

## Related Documentation

- [cheatsheets/cap-table-modeling.md](../../cheatsheets/cap-table-modeling.md) -
  Cap table calculation patterns
- [shared/schemas/portfolio.schemas.ts](../../shared/schemas/portfolio.schemas.ts) -
  Validation schemas
- [server/routes/portfolio.ts](../../server/routes/portfolio.ts) - API endpoints
