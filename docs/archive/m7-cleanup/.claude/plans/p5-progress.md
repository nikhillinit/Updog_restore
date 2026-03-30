# P5 Tech Debt Reduction - Progress

## Status: SCOPING

## Investigation Phases

- [x] Phase 1: Gather tech debt signals (TODOs, skipped tests, lint
      suppressions)
- [x] Phase 2: Review DECISIONS.md and CHANGELOG.md for known debt
- [x] Phase 3: Analyze test coverage gaps and skip counts
- [x] Phase 4: Check dependency health and bundle size
- [x] Phase 5: Synthesize findings and prioritize
- [x] Phase 6: Write task plan

## Key Metrics (baseline @ 9f34b181)

- Tests: 2,884 passing / 213 skipped / 3,097 total
- Test files: 141 passing / 11 skipped / 152 total
- TODO/FIXME/HACK: 80+ in source
- eslint-disable no-explicit-any: 130 files (90 client, 40 server)
- `as any` / `: any`: 76 occurrences across 30 files
- @deprecated markers: ~40 across ~15 files
- Undocumented quarantines: 28
- Console.log in client: 45 across 15 files
- Outdated major deps: 6 packages
