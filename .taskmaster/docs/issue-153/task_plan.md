# Issue #153: Refactor computeJCurvePath - Task Plan

## Goal
Refactor `shared/lib/jcurve.ts::computeJCurvePath` to reduce cyclomatic complexity from ~41 to <=8 per function and function length from ~112 to <=50 lines, while maintaining exact output parity.

## Phases

### Phase 1: Context Gathering [complete]
- [x] Read current implementation (`shared/lib/jcurve.ts`)
- [x] Review Issue #153 requirements
- [x] Identify existing helper functions
- [x] Discover test/implementation API mismatch
- [x] Set up Codex CLI for consultation

### Phase 2: External Consultation [complete]
- [x] Configure Codex CLI (auth, version update)
- [x] Get Codex refactoring recommendations
- [x] Critically evaluate recommendations (see findings.md)
- [x] Document alternative approaches

### Phase 3: Strategy Design [in_progress]
- [ ] Resolve API mismatch (tests vs implementation)
- [x] Design function decomposition (hybrid approach)
- [ ] Define concrete function signatures
- [ ] Create golden test snapshots

### Phase 4: Implementation [pending]
- [ ] Create feature branch
- [ ] Implement helper function extractions
- [ ] Run golden tests for parity verification
- [ ] Remove ESLint suppression

### Phase 5: Validation [pending]
- [ ] All existing tests pass
- [ ] Cyclomatic complexity <= 8 per function
- [ ] Function length <= 50 lines per function
- [ ] PR review and merge

## Technical Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| API mismatch handling | Tests appear stale; verify if tests run before refactoring | investigate |
| Decomposition pattern | Hybrid: extract 3 helpers, leverage existing modules | approved |
| Golden test approach | Snapshot before/after | approved |
| Reject Codex 7-function approach | Over-engineering; duplicates existing code | approved |
| Accept sanitizeMonotonic extraction | Generic, reusable, reduces main function | approved |
| Extract buildFittedTVPICurve | Encapsulates fitted branch (lines 93-152) | approved |
| Extract calibrateToActuals | Isolates calibration loop (lines 97-114) | approved |

## Errors Encountered

| Timestamp | Error | Resolution |
|-----------|-------|------------|
| 2026-01-17 | Codex CLI no stdout in Bash | Use native binary directly |
| 2026-01-17 | Codex version 0.46.0 outdated | Updated to 0.85.0 |

## Constraints
- No breaking changes to existing consumers
- Must maintain Excel parity for financial calculations
- ESLint rules: complexity <= 8, max-lines-per-function <= 50
