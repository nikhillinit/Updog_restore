# Phase 2: Production Hardening - Detailed Plan

## Overview
- Estimate: 8-9 hours
- Priority: MEDIUM (after Phase 1)
- Status: NOT STARTED (blocked by Phase 1 completion)

---

## Step 2.1: Portable Tooling

### Original Plan
- Effort: 2 hours
- Action: Create scripts/reflection-tools/ with npm integration

### Scope
- Create dedicated tooling directory
- Add npm scripts (npm run reflection:new, etc.)
- Cross-platform compatibility (Windows + Unix)

### Status: NOT STARTED

---

## Step 2.2: Test File Regeneration

### Original Plan
- Effort: 2 hours
- Action: Create test templates and regeneration tooling

### Notes
- REFL-018.test.ts already migrated during consolidation
- May need template system for future tests

### Status: PARTIALLY DONE (one test migrated)

---

## Step 2.3: Defensive CI Checks

### Original Plan
- Effort: 1.5 hours
- Action: Add Python linting, missing test detection

### Scope
- CI job to validate manage_skills.py
- Check all VERIFIED reflections have tests
- Lint Python code

### Status: NOT STARTED

---

## Step 2.4: Bidirectional Wizard Links

### Original Plan
- Effort: 2 hours
- Action: Link wizard steps to REFL-IDs and vice versa

### Scope
- Add wizard_steps frontmatter to all reflections
- Create wizard-to-reflection mapping
- Surface in UI/documentation

### Status: NOT STARTED

---

## Step 2.5: Coverage Metrics Dashboard

### Original Plan
- Effort: 1.5 hours
- Action: Track reflection coverage

### Scope
- Dashboard showing reflection count, test coverage
- Identify areas without reflections
- Track usage patterns

### Status: NOT STARTED

---

## Phase 2 Dependencies

```
Phase 1 Complete
    │
    ├── Step 2.1: Portable Tooling (independent)
    │
    ├── Step 2.2: Test Regeneration (independent)
    │
    ├── Step 2.3: Defensive CI (depends on 2.1 for tooling paths)
    │
    ├── Step 2.4: Bidirectional Links (independent)
    │
    └── Step 2.5: Metrics Dashboard (depends on 2.3 for CI data)
```

## Execution Strategy

Parallelizable work:
- 2.1 + 2.2 can run in parallel
- 2.4 is independent, can run anytime

Sequential requirements:
- 2.3 should follow 2.1
- 2.5 should follow 2.3
