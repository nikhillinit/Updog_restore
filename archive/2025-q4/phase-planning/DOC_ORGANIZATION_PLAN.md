# Root Document Organization Plan

**Generated**: 2025-10-31 **Current State**: 262 documents cluttering project
root **Project**: Press On Ventures VC Fund Modeling Platform

---

## Executive Summary

The project root contains **262 miscellaneous planning documents** accumulated
over multiple development phases. This creates:

- **Discovery friction** - Hard to find current/relevant documentation
- **Maintenance burden** - Unclear what's active vs obsolete
- **Onboarding confusion** - New developers overwhelmed by clutter
- **Git noise** - Excessive uncommitted files in status

**Recommended Action**: Archive 95% of documents, preserve 5% critical files in
root, integrate key content into official docs.

---

## Answer to Your Question

**Yes, using agents is the most effective approach**, but I recommend a **hybrid
strategy**:

1. **Use agents for**: Analysis, categorization, and intelligent consolidation
2. **Use scripts for**: Bulk file operations (safe, fast, auditable)
3. **Manual review for**: Final deletion decisions

This plan provides both:

- Automated migration script (execute in minutes)
- Clear categorization for agent-assisted content extraction

---

## Document Inventory by Category

### 1. KEEP IN ROOT (6 files) ✅

- `README.md` - Project overview
- `CLAUDE.md` - AI coding guidelines
- `CHANGELOG.md` - Change history
- `DECISIONS.md` - Architectural decisions
- `CAPABILITIES.md` - Available tools/agents
- `SECURITY.md` - Security policies

### 2. ACTIVE/RECENT (15 files) → docs/releases/

**Stage Normalization v3.4 (Current Feature)**:

- `FINAL-HANDOFF-MEMO-2025-10-30.md` → docs/releases/stage-normalization-v3.4.md
- `HANDOFF-Stage-Normalization-v3.4-Option-B-Implementation.md`
- `stage-normalization-v3.4-package-REVIEW.md`
- `PHASE4_HANDOFF_MEMO.md` → stage-norm-phase4.md
- `PHASE5_OPTIMIZED_STRATEGY.md` → stage-norm-phase5.md

### 3. HANDOFF MEMOS (14 files) → archive/2025-q4/handoff-memos/

Historical session continuity documents

### 4. DEPLOYMENT/CI/CD (30+ files) → archive/deployment-planning/

Historical build/deployment planning artifacts

### 5. DEMO/PRESENTATION (15 files) → archive/2025-q3/demo-prep/

Demo preparation artifacts from Q3 2025

### 6. AGENT/AI DEVELOPMENT (14 files) → docs/ai-optimization/

AI agent framework documentation (actively used)

### 7. STATUS/PROGRESS REPORTS (40+ files) → archive/status-reports/

Point-in-time status snapshots (superseded by CHANGELOG.md)

### 8. PHASE PLANNING (25+ files) → archive/phase-planning/

Historical sprint/phase planning documents

### 9. SECURITY/HARDENING (10 files) → archive/2025-q3/security-hardening/

Historical security work from Q3 2025

### 10. TEMPORARY .TXT FILES (30+ files) → DELETE

Logs, error dumps, chat transcripts (not in git history)

---

## Proposed Directory Structure

```
project-root/
├── README.md                          # Keep
├── CLAUDE.md                          # Keep
├── CHANGELOG.md                       # Keep
├── DECISIONS.md                       # Keep
├── CAPABILITIES.md                    # Keep
├── SECURITY.md                        # Keep
│
├── archive/                           # Historical artifacts
│   ├── 2025-q3/
│   │   ├── async-hardening/
│   │   ├── demo-prep/
│   │   ├── security-hardening/
│   │   └── typescript-baseline/
│   ├── 2025-q4/
│   │   ├── handoff-memos/
│   │   ├── stage-normalization/
│   │   └── phase-planning/
│   ├── deployment-planning/
│   ├── status-reports/
│   └── chat-transcripts/
│
├── docs/                              # Official documentation
│   ├── releases/                      # Feature release docs
│   │   ├── stage-normalization-v3.4.md
│   │   └── ...
│   ├── validation/                    # Validation strategies
│   ├── integration/                   # Integration guides
│   ├── ai-optimization/              # Agent framework
│   └── runbooks/                     # Operational guides
│
└── cheatsheets/                       # Quick reference guides
```

---

## How to Execute This Plan

### Option A: Automated (Recommended)

```powershell
# 1. Review the plan
cat DOC_ORGANIZATION_PLAN.md

# 2. Run dry-run to see what would happen
bash scripts/migrate-docs.sh --dry-run

# 3. Execute migration
bash scripts/migrate-docs.sh

# 4. Review results
git status
ls -R archive/ docs/

# 5. Commit
git add .
git commit -m "docs: organize root directory - archive historical artifacts"
```

### Option B: Agent-Assisted (For Content Extraction)

After migration, use agents to:

1. **Extract key insights** from handoff memos → CHANGELOG.md
2. **Consolidate strategies** from phase planning → DECISIONS.md
3. **Create runbooks** from deployment docs → docs/runbooks/
4. **Update cheatsheets** with best practices from implementation summaries

---

## Risk Assessment

### LOW RISK ✅

- Archiving: All files preserved, just moved
- Temporary .txt files: Not in git history
- Status reports: Superseded by CHANGELOG.md

### MEDIUM RISK ⚠️

- Deleting duplicates: Verify no unique content first
- Hidden files: `.agents-*.md` may be actively used

### HIGH RISK 🔴

- **None** - All operations reversible (archive > delete)

---

## Next Steps

1. **Review this plan** - Verify categorization makes sense
2. **Run migration script** - Execute automated reorganization
3. **Use agents for content extraction**:
   - Launch `docs-architect` agent to extract insights from handoff memos
   - Launch `code-simplifier` agent to consolidate duplicate strategies
   - Create cheatsheets from implementation summaries
4. **Update CLAUDE.md** - Add documentation policy
5. **Update .gitignore** - Prevent future clutter

---

## Migration Script

The migration script is ready at `scripts/migrate-docs.sh`:

**Features**:

- Dry-run mode for safety
- Preserves all files in archive/
- Creates organized directory structure
- No destructive operations (archive-first)
- Fully reversible

**Usage**:

```bash
# Preview changes
bash scripts/migrate-docs.sh --dry-run

# Execute migration
bash scripts/migrate-docs.sh
```

---

## Estimated Impact

- **Before**: 262 files in root
- **After**: 6 essential files in root
- **Archive**: ~250 files organized by date/theme
- **Deleted**: ~30 temporary .txt files (after manual review)
- **Time**: ~30 minutes total (5 min script + 25 min review)
- **Risk**: LOW (fully reversible)

---

## Success Criteria

✅ Root directory has 6-10 essential files only ✅ All historical content
preserved in archive/ ✅ Active docs organized in docs/releases/ ✅ Git status
clean (no untracked noise) ✅ Discoverable structure for new developers ✅ All
changes tracked in git history
