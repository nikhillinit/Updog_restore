---
id: REFL-030
title: Mock ID Generator Type Change Breaks Downstream Assertions
status: DRAFT
date: 2026-03-23
severity: high
category: Infrastructure
discovered: 2026-03-23
tags: [testing, mock, database, type-safety]
last_updated: 2026-04-03
---

# REFL-030: Mock ID Generator Type Change Breaks Downstream Assertions

## Anti-Pattern

Changing `generateId()` in the shared database mock from UUID strings to serial
integers without auditing all test files that assert on ID type or format.

## What Went Wrong

Phase 4 changed `database-mock.ts` `generateId()` from UUID strings to
auto-incrementing integers to match the `serial('id')` schema definition. This
broke 11 tests across 4 files:

- 4 tests in `time-travel-schema.test.ts` asserting
  `typeof result.id === 'string'`
- 4 tests in `variance-tracking-schema.test.ts` asserting the same
- 3 tests in `lot-service.test.ts` calling `assertValidUUID(lot.id)`

Additionally, the serial counter started at 1 which collided with preseeded mock
rows (funds id=1, users id=1, companies id=1).

## Root Cause

The mock's `generateId()` is called by every `db.insert().values().returning()`
chain across the entire test suite. Changing its return type is a global
behavioral change that requires auditing all consumers.

## Fix

1. Start the serial counter at 1000 (past all preseeded row IDs 1-5)
2. Before changing mock infrastructure, grep for all assertion patterns:
   ```bash
   grep -rn "typeof.*\.id.*string\|assertValidUUID" tests/
   ```
3. Fix all affected assertions in the same commit as the infrastructure change

## Detection

Run the full test suite (`npm test`) before pushing, not just a targeted slice.
The Phase 4 contract slice (7 files, 152 tests) passed, but the full suite (201
files, 3454 tests) caught all 11 failures.

## Prevention Checklist

- [ ] Before changing shared mock behavior, grep for all dependent assertions
- [ ] Start auto-increment counters past preseeded data ranges
- [ ] Run full test suite before first push when mock infrastructure changes
- [ ] Include blast-radius fix in the same commit as the infrastructure change
