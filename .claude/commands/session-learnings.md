---
status: HISTORICAL
last_updated: 2026-01-19
---

# /session-learnings

Extract and codify learnings from completed work sessions.

## Usage

```
/session-learnings                    # Scan recent session artifacts
/session-learnings --session "DATE"   # Specific session
/session-learnings --all-recent       # All sessions from last 7 days
```

## Protocol

This command activates the `session-learnings` skill to:

1. **Scan session artifacts** - Find `findings.md`, `progress.md`, error logs
2. **Identify learning candidates** - Score potential reflections
3. **Generate report** - List candidates with recommendations
4. **Create reflections** - For high-scoring candidates

## Integration Points

### Input Sources

- `docs/plans/*/findings.md` - Planning-with-files findings
- `docs/plans/*/progress.md` - Progress logs with error tables
- `.taskmaster/*/findings.md` - Taskmaster session findings
- `CHANGELOG.md` - Recent fix entries
- `DECISIONS.md` - Recent architectural decisions

### Output Destinations

- `docs/skills/REFL-XXX-*.md` - New reflections
- `tests/regressions/REFL-XXX.test.ts` - Regression tests
- `docs/session-learning-reports/` - Archived learning reports

## Learning Candidate Scoring

| Factor | Points |
|--------|--------|
| Financial calculation bug | +3 |
| Repeated pattern (2+ times) | +3 |
| Production impact | +2 |
| Security implication | +2 |
| Performance impact | +1 |
| Developer friction | +1 |

**Threshold:** Score >= 3 suggests creating a reflection

## Example Output

```
# Session Learnings Report

**Session:** 2026-01-16
**Sources Analyzed:** 4

## Learning Candidates

### Candidate 1: Dynamic Imports Prevent Test Side Effects
- **Score:** 4/10
- **Source:** docs/plans/integration-test-phase0/findings.md:53
- **Category:** Infrastructure
- **Recommendation:** CREATE REFLECTION

### Candidate 2: Testcontainers Skip Pattern for Windows/CI
- **Score:** 3/10
- **Source:** docs/plans/integration-test-phase0/findings.md:87
- **Category:** Testing
- **Recommendation:** CREATE REFLECTION

## Actions
1. [x] Create REFL-001 for "Dynamic Imports Prevent Test Side Effects"
2. [x] Create REFL-002 for "Testcontainers Skip Pattern for Windows/CI"
```

## After Running

1. Review generated reflections in `docs/skills/REFL-*.md`
2. Fill in any missing details (code examples, error codes)
3. Implement regression tests in `tests/regressions/`
4. Change status from `DRAFT` to `VERIFIED` when tests pass
5. Run `python scripts/manage_skills.py rebuild` to update index
