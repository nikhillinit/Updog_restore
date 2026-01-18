---
name: session-learnings
description: Extract and codify learnings from planning-with-files sessions
trigger: After completing work sessions, before closing PRs
auto_activate: true
---

# Session Learnings Extraction

Extract valuable lessons from completed work sessions and codify them into the reflection system.

## When This Skill Activates

- After completing a work session with planning-with-files
- When `findings.md` or `progress.md` files exist with "Key Learnings" sections
- Before merging PRs that fixed bugs or discovered patterns
- When error logs show repeated issues that were resolved

## Protocol

### Phase 1: Scan Session Artifacts

Search for learning sources in order of priority:

1. **Planning-with-files outputs:**
   ```
   docs/plans/*/findings.md - "Key Learnings" sections
   docs/plans/*/progress.md - "Error Log" entries
   .taskmaster/docs/*/findings.md - Taskmaster findings
   ```

2. **Conversation patterns (inspired by ConversationAnalyzer):**
   - User corrections: "that was wrong", "I fixed it"
   - Repeated test failures on same error
   - Multiple attempts at same fix
   - Tool result patterns showing errors

3. **Memory files:**
   - CHANGELOG.md - Recent "fix:" entries
   - DECISIONS.md - Recent architectural decisions

### Phase 2: Identify Learning Candidates

For each source, extract:

| Field | Source |
|-------|--------|
| Title | "Key Learning" header or error description |
| Anti-Pattern | "Problem" or "What went wrong" section |
| Root Cause | "Why" or "Analysis" section |
| Fix | "Solution" or "Resolution" section |
| Impact | Financial/system consequences |

**Learning Candidate Scoring:**

- +3: Financial calculation bug
- +3: Repeated pattern (seen 2+ times)
- +2: Production impact documented
- +2: Security implication
- +1: Performance impact
- +1: Developer experience friction

**Threshold:** Score >= 3 suggests creating a reflection

### Phase 3: Output Learning Report

```markdown
# Session Learnings Report

**Session:** [DATE]
**Sources Analyzed:** [count]

## Learning Candidates

### Candidate 1: [Title]
- **Score:** [X/10]
- **Source:** [file:line]
- **Category:** [Fund Logic | State | Math | API | Infrastructure]
- **Anti-Pattern:** [brief description]
- **Fix:** [brief description]
- **Recommendation:** CREATE REFLECTION / UPDATE EXISTING / SKIP

### Candidate 2: ...

## Actions

1. [ ] Create REFL-XXX for "[title]"
2. [ ] Update REFL-YYY with additional case
3. [ ] Skip "[title]" - already documented in REFL-ZZZ
```

### Phase 4: Create Reflections

For each candidate with recommendation "CREATE REFLECTION":

1. Run duplicate check: `python scripts/manage_skills.py check --title "Title"`
2. Create reflection: `python scripts/manage_skills.py new --title "Title"`
3. Auto-populate from source:
   - Copy anti-pattern description
   - Copy fix implementation
   - Extract error codes
   - Set severity based on score

## Integration with ConversationAnalyzer Patterns

### Session Boundary Detection

Use 5-hour activity windows to group related learnings:
- Learnings within same session likely related
- Cross-session patterns indicate deeper issues

### Tool Usage Correlation

Track tool invocations that led to discoveries:
- Failed Bash commands revealing environment issues
- Read tool revealing unexpected code patterns
- Grep tool finding similar issues elsewhere

### Status Classification

| Recency | Classification | Action |
|---------|----------------|--------|
| < 1 hour | Active session | Wait for completion |
| < 24 hours | Recent session | Extract learnings now |
| > 24 hours | Historical | Review for missed patterns |

## Example Extraction

**Input (from findings.md):**
```markdown
### Key Learning: Dynamic Imports Prevent Side Effects

**Pattern Success**: Dynamic import pattern works for preventing import-time side effects.

**Key Learnings**:
1. Some files were already fixed
2. Not all skipped tests need dynamic imports
3. Client-side vs Server-side import differences
```

**Output (learning candidate):**
```markdown
### Candidate: Dynamic Imports Prevent Side Effects
- **Score:** 4 (repeated pattern +3, DX friction +1)
- **Source:** docs/plans/integration-test-phase0/findings.md:53
- **Category:** Infrastructure
- **Anti-Pattern:** Static imports of server modules in test files cause initialization side effects
- **Fix:** Use dynamic imports in beforeAll for server modules
- **Recommendation:** CREATE REFLECTION
```

## Usage

```
# Manual invocation
/session-learnings

# With specific session
/session-learnings --session "2026-01-15"

# Scan all recent sessions
/session-learnings --all-recent
```

## File Outputs

- `docs/skills/REFL-XXX-*.md` - New reflections
- `docs/session-learning-reports/YYYY-MM-DD.md` - Learning report archive
