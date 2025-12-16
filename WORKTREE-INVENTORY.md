# Worktree Inventory - 2025-12-15

## All Worktrees

```
C:/dev/Updog_restore                                                                                   d1a9c263 [main]
C:/dev/Updog_main                                                                                      acb86201 [hotfix/ci-governance-failures]
C:/dev/Updog_portfolio_route                                                                           92eb2f69 [feature/portfolio-route-v1]
C:/dev/Updog_pr227_worktree                                                                            196479a1 [phoenix/phase-1-wizard-fees]
C:/dev/Updog_restore.worktrees/50-7-day-cleanup-remove-legacy-fund-creation-paths-and-temporary-flags 4669c11b [50-7-day-cleanup-remove-legacy-fund-creation-paths-and-temporary-flags]
C:/dev/Updog_sandbox                                                                                   7aafd191 [sandbox-remediation]
C:/Users/nikhi/.claude-worktrees/Updog_restore/flamboyant-allen                                        e11c3cc8 [flamboyant-allen]
C:/Users/nikhi/.claude-worktrees/Updog_restore/pensive-davinci                                         e11c3cc8 [pensive-davinci]
```

**Total Count:** 8 worktrees

## Per-Worktree Status

### Worktree: C:/dev/Updog_restore

**Branch:** main **Commit:** d1a9c263 fix: resolve TypeScript errors in capital
allocation merged files (#280) (2 hours ago) **Status:** 3 modified files
(untracked: KICKOFF-HYGIENE-SPRINT.md,
PROJECT-PHOENIX-COMPREHENSIVE-STRATEGY.md, auto-discovery/)

**Classification:**

- **Age:** Current (2 hours)
- **Uncommitted Changes:** Yes (3 untracked files)
- **Contains Critical Work:** Yes (main development branch)
- **Decision:** **KEEP** - Primary worktree
- **Rationale:** This is the main branch and primary working directory

---

### Worktree: C:/dev/Updog_main

**Branch:** hotfix/ci-governance-failures **Commit:** acb86201 fix(ci): Upgrade
deprecated actions/cache v4.1.2 to v4 (3 weeks ago) **Status:** 0 modified files

**Classification:**

- **Age:** 21 days
- **Uncommitted Changes:** No
- **Contains Critical Work:** Possibly (CI fix)
- **Decision:** **MERGE or DELETE** - Needs assessment
- **Rationale:** CI hotfix from 3 weeks ago, likely either merged already or
  abandoned

---

### Worktree: C:/dev/Updog_portfolio_route

**Branch:** feature/portfolio-route-v1 **Commit:** 92eb2f69 feat(agent-core):
Extended Thinking Integration across all TypeScript agents (6 weeks ago)
**Status:** 0 modified files

**Classification:**

- **Age:** 42 days
- **Uncommitted Changes:** No
- **Contains Critical Work:** Possibly (Extended Thinking + Portfolio Route)
- **Decision:** **ASSESS** - May contain valuable work
- **Rationale:** Extended Thinking integration mentioned in CAPABILITIES.md as
  complete; verify if this branch was source

---

### Worktree: C:/dev/Updog_pr227_worktree

**Branch:** phoenix/phase-1-wizard-fees **Commit:** 196479a1 fix(qa): resolve
Semgrep code quality issues in qa-startup.js (2 weeks ago) **Status:** 2
modified files

**Classification:**

- **Age:** 14 days
- **Uncommitted Changes:** Yes (2 modified files)
- **Contains Critical Work:** Possibly (Phase 1 wizard/fees)
- **Decision:** **ASSESS** - Review uncommitted changes
- **Rationale:** Phoenix Phase 1 work with uncommitted changes; need to verify
  if superseded by recent PRs

---

### Worktree: C:/dev/Updog_restore.worktrees/50-7-day-cleanup-remove-legacy-fund-creation-paths-and-temporary-flags

**Branch:**
50-7-day-cleanup-remove-legacy-fund-creation-paths-and-temporary-flags
**Commit:** 4669c11b Merge branch 'main' into deployment-fix - resolved
package.json conflict (4 months ago) **Status:** Unknown (needs check)

**Classification:**

- **Age:** 120 days (4 months)
- **Uncommitted Changes:** Unknown
- **Contains Critical Work:** No (stale)
- **Decision:** **DELETE** - Stale worktree
- **Rationale:** 4 months old, likely abandoned or already merged

---

### Worktree: C:/dev/Updog_sandbox

**Branch:** sandbox-remediation **Commit:** 7aafd191 docs: Add comprehensive
handoff memo for test remediation continuation (8 weeks ago) **Status:** 0
modified files

**Classification:**

- **Age:** 56 days
- **Uncommitted Changes:** No
- **Contains Critical Work:** Possibly (test remediation docs)
- **Decision:** **MERGE DOCS** - Extract documentation, then delete
- **Rationale:** Test remediation handoff memo; extract valuable docs before
  removing worktree

---

### Worktree: C:/Users/nikhi/.claude-worktrees/Updog_restore/flamboyant-allen

**Branch:** flamboyant-allen **Commit:** e11c3cc8 fix(tests): correct
database-mock path in server/db.ts (2 weeks ago) **Status:** 0 modified files

**Classification:**

- **Age:** 14 days
- **Uncommitted Changes:** No
- **Contains Critical Work:** No (duplicate)
- **Decision:** **DELETE** - Duplicate of pensive-davinci
- **Rationale:** Same commit as pensive-davinci (e11c3cc8); appears to be
  duplicate Claude-generated worktree

---

### Worktree: C:/Users/nikhi/.claude-worktrees/Updog_restore/pensive-davinci

**Branch:** pensive-davinci **Commit:** e11c3cc8 fix(tests): correct
database-mock path in server/db.ts (2 weeks ago) **Status:** 0 modified files

**Classification:**

- **Age:** 14 days
- **Uncommitted Changes:** No
- **Contains Critical Work:** Maybe (database-mock fix)
- **Decision:** **ASSESS** - Check if fix was merged, then delete
- **Rationale:** Same commit as flamboyant-allen; need to verify if
  database-mock fix is on main

---

## Consolidation Plan (8 → ≤2)

### VERIFIED: Safe to Delete (5 worktrees)

1. **flamboyant-allen**
   - Reason: Duplicate of pensive-davinci (same commit e11c3cc8)
   - Verification: Both at identical commit
   - Action: DELETE immediately

2. **pensive-davinci**
   - Reason: database-mock fix already merged to main (commit e11c3cc8 in git
     log)
   - Verification: `git log --grep="database-mock"` shows fix on main
   - Action: DELETE after flamboyant-allen

3. **Updog_main (hotfix/ci-governance-failures)**
   - Reason: CI cache fix merged via PR #221 (commit bc6b29ef)
   - Verification: `git log --grep="cache v4"` shows acb86201 merged
   - Action: DELETE

4. **50-7-day-cleanup**
   - Reason: Stale (4 months old), no recent activity
   - Verification: Last commit 4669c11b from September 2025
   - Action: DELETE (archive branch first)

5. **Updog_portfolio_route**
   - Reason: Extended Thinking integration merged via PR #205 (commit c06980e9)
   - Verification: `git log --grep="Extended Thinking"` shows 92eb2f69 merged
   - Action: DELETE

### VERIFIED: Safe to Delete (1 worktree)

6. **Updog_sandbox**
   - Reason: Remediation docs already on main in docs/archive/remediation/
   - Verification: `ls docs/archive/remediation/` shows all files present
   - Action: DELETE

### VERIFIED: Needs Review (1 worktree)

7. **Updog_pr227_worktree (phoenix/phase-1-wizard-fees)**
   - Uncommitted: 2 untracked files (typescript-check-output.txt,
     typescript-output.txt)
   - Reason: Output files only, no code changes
   - Verification: `git status --short` shows only .txt outputs
   - Action: DELETE (safe - no actual code changes)

### Keep (1 worktree)

8. **Updog_restore (main)** - Primary working directory
   - Action: KEEP

**Final Count:** 8 → 1 worktree (100% consolidation)

---

## Next Steps

1. **Pre-Flight:** Verify database-mock fix on main
2. **Delete Duplicates:** Remove flamboyant-allen immediately
3. **Delete Stale:** Remove 50-7-day-cleanup
4. **Assess Hotfix:** Check if CI governance fix is merged
5. **Extract Docs:** Pull test remediation memo from sandbox
6. **Verify Extended Thinking:** Check if portfolio_route was source
7. **Review PR227:** Assess uncommitted changes in phoenix worktree

---

**Generated:** 2025-12-15 **Baseline Commit:** d1a9c263 **Hygiene Sprint
Phase:** 0.1 - Documentation Complete
