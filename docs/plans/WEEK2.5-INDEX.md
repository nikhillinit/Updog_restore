# Week 2.5 Foundation Hardening - Documentation Index

## Quick Navigation

### Start Here (Next Session)

**For immediate action** (30 seconds):
- [week2.5-phase2-quickstart.md](../../.claude/prompts/week2.5-phase2-quickstart.md) - Copy-paste commands and checklist

**For Codex workflow** (recommended, ~25 min):
- [WEEK2.5-PHASE2-AGENT-STRATEGY.md](WEEK2.5-PHASE2-AGENT-STRATEGY.md) - Complete agent usage guide with Codex commands

**For full context** (5 min):
- [WEEK2.5-PHASE2-COMPLETE-GUIDE.md](WEEK2.5-PHASE2-COMPLETE-GUIDE.md) - All paths, validation, troubleshooting

**For detailed investigation**:
- [WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md](WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md) - Complete analysis, hypotheses, diagnostics

### Context & Handoff

**Session handoff**:
- [HANDOFF-SUMMARY.md](HANDOFF-SUMMARY.md) - What was done, git state, next steps

**Phase 1 results**:
- [WEEK2.5-FOUNDATION-HARDENING-RESULTS.md](WEEK2.5-FOUNDATION-HARDENING-RESULTS.md) - Complete Phase 1 report

**Original plan**:
- [WEEK2.5-FOUNDATION-HARDENING-KICKOFF.md](WEEK2.5-FOUNDATION-HARDENING-KICKOFF.md) - Initial plan (executed)

## Document Purposes

### Quick Reference

| Need | Document | Time |
|------|----------|------|
| Start Phase 2 now | [week2.5-phase2-quickstart.md](../../.claude/prompts/week2.5-phase2-quickstart.md) | 30 sec |
| Use Codex workflow | [WEEK2.5-PHASE2-AGENT-STRATEGY.md](WEEK2.5-PHASE2-AGENT-STRATEGY.md) | 2 min |
| Understand problem | [WEEK2.5-PHASE2-COMPLETE-GUIDE.md](WEEK2.5-PHASE2-COMPLETE-GUIDE.md) | 5 min |
| Deep investigation | [WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md](WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md) | 10 min |
| Review Phase 1 | [WEEK2.5-FOUNDATION-HARDENING-RESULTS.md](WEEK2.5-FOUNDATION-HARDENING-RESULTS.md) | 5 min |
| Session context | [HANDOFF-SUMMARY.md](HANDOFF-SUMMARY.md) | 3 min |

## Phase 1 Documentation (Completed)

### Results & Analysis
- **WEEK2.5-FOUNDATION-HARDENING-RESULTS.md**
  - Complete Phase 1 execution report
  - TypeScript: 387 → 0 errors
  - React: Deduplicated to 18.3.1
  - Integration tests: 26 files segregated
  - Hook error discovery and analysis

### Original Plan
- **WEEK2.5-FOUNDATION-HARDENING-KICKOFF.md**
  - Original v7 plan (all edge cases resolved)
  - Gate 0, Phase 1C, Phase 1D specifications
  - Success metrics
  - Execution order

### Scripts Created
- `scripts/gate0-baseline.ps1` - Comprehensive baseline diagnostics
- `scripts/phase1c-simple.ps1` - Integration test validation
- `scripts/phase1d-verify.ps1` - React version verification

### Artifacts Generated
- `artifacts/gate0-metadata.json` - Baseline metrics (JSON)
- `artifacts/gate0-*.log` - Diagnostic logs
- `artifacts/baseline-test-output.log` - Test results with hook errors
- `artifacts/phase1d-*.log` - React deduplication logs

## Phase 2 Documentation (Ready to Execute)

### Quick Start
- **.claude/prompts/week2.5-phase2-quickstart.md**
  - 30-second overview
  - Codex command ready to copy-paste
  - Investigation checklist
  - Expected outcomes

### Complete Guide
- **WEEK2.5-PHASE2-COMPLETE-GUIDE.md**
  - All execution paths (Codex, Direct, Agent-heavy)
  - Most likely fix with code
  - Validation checklist
  - Troubleshooting guide
  - Git workflow
  - Copy-paste commands

### Agent Strategy
- **WEEK2.5-PHASE2-AGENT-STRATEGY.md**
  - Codex-first workflow (recommended)
  - error-debugging fallback
  - Parallel execution examples
  - Decision tree
  - When to use which agent

### Investigation Guide
- **WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md**
  - Complete problem analysis
  - All hypotheses with evidence
  - Diagnostic commands
  - Manual fix examples
  - React 18 breaking changes
  - Reference materials

### Handoff
- **HANDOFF-SUMMARY.md**
  - Phase 1 achievements
  - Phase 2 context
  - Files modified
  - Git state
  - Next steps
  - Copy-paste prompts

## Recommended Reading Order

### For Next Session (5 min total)
1. [week2.5-phase2-quickstart.md](../../.claude/prompts/week2.5-phase2-quickstart.md) (30 sec) - Get oriented
2. [WEEK2.5-PHASE2-AGENT-STRATEGY.md](WEEK2.5-PHASE2-AGENT-STRATEGY.md) (2 min) - Choose workflow
3. [WEEK2.5-PHASE2-COMPLETE-GUIDE.md](WEEK2.5-PHASE2-COMPLETE-GUIDE.md) (2 min) - Validation steps
4. Start executing with Codex

### For Deep Understanding (20 min)
1. [HANDOFF-SUMMARY.md](HANDOFF-SUMMARY.md) (3 min) - Session context
2. [WEEK2.5-FOUNDATION-HARDENING-RESULTS.md](WEEK2.5-FOUNDATION-HARDENING-RESULTS.md) (5 min) - Phase 1 results
3. [WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md](WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md) (10 min) - Investigation guide
4. [WEEK2.5-PHASE2-AGENT-STRATEGY.md](WEEK2.5-PHASE2-AGENT-STRATEGY.md) (2 min) - Execution strategy

## Key Files for Phase 2 Execution

### Must Read Before Fixing
1. `tests/setup/jsdom-setup.ts` - Primary suspect (likely missing cleanup)
2. `vitest.config.ts` (lines 78-127) - jsdom environment config
3. `tests/setup/test-infrastructure.ts` - Global mocks

### Validation Test
- `tests/unit/capital-allocation-step.test.tsx` - Sample failing test for quick validation

### Artifacts for Reference
- `artifacts/post-hardening-test-results.log` - Full hook error output (517 errors)
- `artifacts/gate0-metadata.json` - Baseline metrics

## Copy-Paste Prompts

### Start Phase 2 (Codex Workflow)
```
Read .claude/prompts/week2.5-phase2-quickstart.md and execute Codex workflow to fix React hook errors in jsdom test environment.

Target: Eliminate 517 hook errors in 25-30 minutes using Codex skill.
```

### Start Phase 2 (Direct Investigation)
```
Read docs/plans/WEEK2.5-PHASE2-JSDOM-RTL-KICKOFF.md and fix React hook errors.

Investigation priority:
1. Check tests/setup/jsdom-setup.ts for missing RTL cleanup
2. Verify @testing-library/react version >= 13.0.0
3. Test fix with single test file
4. Run full client suite
```

### Review Phase 1
```
Review docs/plans/WEEK2.5-FOUNDATION-HARDENING-RESULTS.md for Phase 1 context and achievements.
```

## Status Summary

**Phase 1**: ✓ Complete
- TypeScript: 0 errors
- React: Deduplicated to 18.3.1
- Integration tests: Segregated
- Documentation: Complete

**Phase 2**: Ready to execute
- Problem: 517 hook errors identified
- Root cause: jsdom/RTL setup (not dependencies)
- Documentation: Complete with 3 workflow options
- Estimated time: 25-50 minutes

**Overall Progress**: 50% complete (Phase 1 done, Phase 2 ready)

---

**Last Updated**: 2025-12-20
**Current Branch**: week2-foundation-hardening
**Ready For**: Phase 2 execution
