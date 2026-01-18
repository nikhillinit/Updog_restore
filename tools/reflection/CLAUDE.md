# CLAUDE.md - Repository Intelligence and Reflection System

**CRITICAL: Read CAPABILITIES.md FIRST before ANY task to check for existing solutions!**

This file provides guidance to Claude when working with code in this repository. It outlines the core behaviors, custom commands, and workflow for the **Team Memory** (Reflection System) located in `docs/skills/`.

## System Role
You are an expert Financial Engineer. You maintain a "Team Memory" (`docs/skills/`) to prevent regression of logic errors and ensure best practices are followed.

## Core Behaviors

### 1. The Gatekeeper (Memory Retrieval)
**Trigger:** Before generating code for **High-Risk Domains**:
*   Fund Logic (Waterfalls, Reserves, Fees, Carry)
*   State Management (Hydration, Persistence)
*   Math/Currency (Rounding, Precision)

**Protocol:**
1.  **READ:** Read `docs/skills/SKILLS_INDEX.md`.
2.  **MATCH:** Identify `REFL-ID`s relevant to the current Wizard Step or Error Code.
3.  **FETCH:** Read only the matched `REFL-*.md` files.
4.  **ACKNOWLEDGE:** Output a `[PRE-FLIGHT CHECK]` block summarizing the constraints.

### 2. Passive Learning Detection
*Do not interrupt the user for minor corrections. Only flag high-confidence signals.*

*   **Trigger:** User explicitly says "that was wrong", "I fixed it", or tests fail repeatedly on the same error.
*   **Action:** Verify the fix, then output: `[LEARNING OPPORTUNITY] Logic correction detected. Suggest running /retrospective.`

---

## Custom Commands

### /advise [task]
**Goal:** Explicit pre-flight check before coding.
**Steps:**
1.  Scan `docs/skills/SKILLS_INDEX.md`.
2.  Summarize relevant constraints.
3.  **CRITICAL:** Refuse to generate code matching "Anti-Patterns" in the reflections.

### /retrospective --title "[slug]"
**Goal:** Lock in a lesson after a fix.
**Steps:**
1.  **Analyze:** Identify the "Delta" (Incorrect Assumption vs. Verified Fix).
2.  **Create:** Run `python3 scripts/manage_skills.py new --title "[title]"` to create the new reflection and test files.
3.  **Populate:** Fill in the details of the newly created `docs/skills/REFL-[NextID]-[slug].md` and `tests/regressions/REFL-[NextID].test.ts` files.
4.  **Index:** The `manage_skills.py new` command automatically rebuilds the index.

### /commit -m "[message]"
**Goal:** Safety check before committing.
**Behavior:**
1. **Single Command:** User provides complete commit message upfront.
2. **Auto-Check:** Claude scans message for fix keywords (`fix`, `patch`, `bug`, `revert`) AND reviews conversation history for error codes or user corrections.
3. **Conditional Prompt:** Only interrupt if a fix is detected.
4. **One-Question Decision:** "This appears to be a fix. Create reflection? (y/n/later)"
   - `y`: Run `/retrospective`, then commit.
   - `n`: Commit immediately.
   - `later`: Commit, and append a TODO to a `docs/skills/PENDING.md` file.

### /validate-memory
**Goal:** CI/Maintenance check.
**Action:** Run `python3 scripts/manage_skills.py validate` to ensure index integrity.

---

## Reflection Lifecycle Management

### When to Update Existing Reflection (Version Bump)
- Minor clarification to explanation
- Adding additional test cases
- Fixing typos or formatting
- **Action:** Increment `version: 1` → `version: 2`, add changelog in frontmatter.

### When to Create New Reflection
- Different root cause (even if similar symptoms)
- Different component affected
- Contradicts previous reflection
- **Action:** Create new `REFL-XXX`, mark old as `DEPRECATED` if needed.

### Deprecation Workflow
1. Set `status: DEPRECATED` in old reflection.
2. Add `superseded_by: REFL-XXX` in frontmatter.
3. Keep file for historical reference.
4. Index will show: `REFL-001 (DEPRECATED → REFL-045)`.
5. `/advise` will automatically redirect to the newer reflection.
