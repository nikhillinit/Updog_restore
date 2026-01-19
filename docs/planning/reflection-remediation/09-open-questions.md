# Open Questions Requiring Resolution

## Metadata
- Created: 2026-01-18T22:40:00Z
- Last Updated: 2026-01-18T23:36:00Z
- Total Questions: 3
- Blocking: 1
- Non-Blocking: 1
- Resolved: 1

---

## Resolved Questions

### Question 1: /advise Command Location [RESOLVED]

**Context**: Step 1.3 requires enhancing the /advise command, but implementation location is unknown.

**Resolution** (Codex Iteration 0):
- /advise is NOT code-implemented
- It is a Claude Code "slash command" defined via documentation
- References found in:
  - docs/skills/README.md (lines 34, 39, 85)
  - CAPABILITIES.md (lines 507, 530, 540)
- No runtime code exists - behavior is documentation-driven

**Impact**: Step 1.3 re-scoped to "Update docs/skills/README.md" instead of code modification

**Status**: RESOLVED - Decision 004 recorded

---

## Blocking Questions

### Question 2: CWD Fix Implementation Approach

**Context**: Step 1.2 requires fixing CWD dependency in manage_skills.py

**Current State**: Codex Iteration 0 confirmed hardcoded paths at lines 30-33

**Options**:
1. `git rev-parse --show-toplevel` (requires git) - **RECOMMENDED**
2. Marker file detection (.git directory)
3. Environment variable
4. Document requirement to run from root

**Trade-offs**:
- Option 1: Clean, aligns with existing patterns (vite.config.ts:181, etc.)
- Option 2: Works without git, may fail in edge cases
- Option 3: Requires user configuration
- Option 4: No code change, just documentation

**Codex Evidence**:
- vite.config.ts:181 uses `git rev-parse --short HEAD`
- scripts/deploy-staging.ps1:20 uses `git rev-parse --abbrev-ref HEAD`
- Subprocess pattern already established in codebase

**Blocking**: Step 1.2 execution

**Status**: READY FOR IMPLEMENTATION (Option 1 recommended)

---

## Non-Blocking Questions

### Question 3: Phase 2 Prioritization

**Context**: Phase 2 has 5 steps totaling 8-9 hours

**Current State**: All steps at equal priority in strategy document

**Question**: Should steps be re-prioritized based on:
- User impact (which would help most?)
- Implementation complexity (low-hanging fruit first?)
- Dependencies (unlock other work?)

**Options**:
1. Execute in document order (2.1 → 2.5)
2. Re-prioritize by impact
3. Parallelize independent steps

**Blocking**: Nothing (Phase 2 hasn't started)

**Status**: DEFER until Phase 1 complete

---

## Resolved Questions

### Question R1: Consolidation Approach
- **Resolution**: Option 1 (canonicalize in docs/skills/)
- **Documented**: 04-decision-log.md, Decision 001
- **Executed**: PR #442

### Question R2: REFL-001 ID Collision
- **Resolution**: Create REFL-018
- **Documented**: 04-decision-log.md, Decision 002
- **Executed**: PR #442

### Question R3: REFL-002 Duplicate
- **Resolution**: Delete (same as REFL-013)
- **Documented**: 04-decision-log.md, Decision 003
- **Executed**: PR #442
