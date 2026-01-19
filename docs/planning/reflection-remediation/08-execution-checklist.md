# Execution Checklist: Reflection System Remediation

## Pre-Flight Checks

### Before Any Phase 1 Work
- [x] Verify git working directory is clean
- [x] Create backup branch if needed
- [x] Document current commit hash
- [x] Initialize forensic documentation

### Before Step 1.2 (CWD Fix)
- [ ] Read scripts/manage_skills.py completely
- [ ] Identify all path operations
- [ ] Search for existing find_repo_root patterns
- [ ] Design solution and document in 04-decision-log.md
- [ ] Write test case for CWD edge case

### Before Step 1.3 (/advise Enhancement)
- [ ] Locate /advise implementation
- [ ] Document current behavior
- [ ] Design Related Documentation section
- [ ] Identify link targets

### Before Step 1.4 (Cross-links)
- [ ] Review SKILLS_INDEX.md structure
- [ ] Review rebuild_index() function
- [ ] Design footer content

---

## Phase 1 Execution Sequence

### Step 1.1: Consolidate Systems [COMPLETE]
- [x] Audit both directories
- [x] Identify unique content
- [x] Create REFL-018 from migrated content
- [x] Update vitest.config.ts
- [x] Delete tools/reflection/
- [x] Rebuild SKILLS_INDEX.md
- [x] Validate with Codex (6 checks)
- [x] Create PR and merge

### Step 1.2: Fix CWD Dependency [COMPLETE]
- [x] Read current manage_skills.py
- [x] Implement find_repo_root() using git rev-parse --show-toplevel
- [x] Update all path operations (REPO_ROOT, SKILLS_DIR, TESTS_DIR, etc.)
- [x] Test from root directory (PASS)
- [x] Test from subdirectory (PASS - ran from client/src)
- [ ] Update documentation
- [ ] Create PR

### Step 1.3: Enhance /advise (Revised - Documentation Only) [COMPLETE]
- [x] Locate implementation - DISCOVERY: /advise is NOT code, it's documentation-driven
- [x] Understand current behavior - Refs in docs/skills/README.md lines 34, 39, 85
- [x] Add Related Documentation section to README.md
- [x] Test output (N/A - documentation change only)
- [ ] Create PR

### Step 1.4: Cross-links in Index [COMPLETE]
- [x] Modify rebuild_index() at line 254
- [x] Add footer generation with Related Documentation table
- [x] Regenerate index (18 reflections)
- [x] Verify links in SKILLS_INDEX.md footer
- [ ] Create PR

---

## Post-Phase 1 Validation

- [x] All manage_skills.py commands work from any directory (tested from root, client/src, docs/)
- [x] /advise output includes Related Documentation (added to docs/skills/README.md)
- [x] SKILLS_INDEX.md has navigation footer (cross-links added)
- [x] Validation passes (`python scripts/manage_skills.py validate` - OK)
- [x] No lint errors (`npm run lint -- --quiet` - PASS)
- [x] No type errors (`npm run check` - PASS)
- [x] Documentation updated (forensic docs in docs/planning/reflection-remediation/)

---

## Phase 2 Execution Sequence

[PENDING - not started]

---

## Session Completion Checklist

### If Session Completes Successfully
- [ ] All Phase 1 steps marked complete
- [ ] All documentation files finalized
- [ ] Commit forensic documentation
- [ ] Update CHANGELOG.md
- [ ] Create summary PR

### If Session Must Pause
- [ ] Update 00-ITERATION-LOG.md with pause entry
- [ ] Update 09-open-questions.md with blockers
- [ ] Document handoff notes
- [ ] Commit partial documentation
- [ ] Note recommended next steps
