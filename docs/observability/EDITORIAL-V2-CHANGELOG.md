---
status: ACTIVE
last_updated: 2026-01-19
---

# Editorial v2 Changelog - PR #113 Review

**Date:** 2025-10-06
**Editor:** Human + Claude collaboration
**Status:** ✅ Complete

---

## Overview

Streamlined PR #113 review documents from detailed 5-document suite into **3 paste-ready GitHub comments** based on comprehensive editorial feedback.

---

## Changes Made

### 1. **Structure Simplification**

**Before (v1):**
- 5 separate documents (review, summary, auth, fundcalc, split instructions)
- ~50+ pages of detailed analysis
- Duplication across documents
- Mixed tone and specificity

**After (v2):**
- 3 focused, paste-ready comments
- ~10 pages total, zero duplication
- Consistent professional tone
- Actionable code snippets only

### 2. **Content Corrections**

#### Fee Timing Contradiction (Fixed)
**v1 said:** "Fees need periodizing" AND "fees already periodized (lines 380-395)"
**v2 says:** "Fees appear to be periodized. Add golden test to verify fee accrual."

#### CI Specifics Removed (Made Invariant)
**v1 said:** "30+ checks failing", "400KB budget breach", "7 TS errors at line X"
**v2 says:** "Build is currently red; see the latest CI run linked on the PR for details"

**Why:** Line numbers and counts drift; linking to latest CI run prevents doc rot.

#### Tone Adjustment
**v1 said:** "🔴 DO NOT MERGE"
**v2 says:** "**Blocked pending fixes**"

**Why:** Maintains collaboration, less confrontational.

#### Timelines Removed
**v1 had:** "Day 1/2/3" implementation timeline
**v2 has:** Only readiness checklists as merge gates

**Why:** Avoids committing to external timelines; focuses on outcomes.

### 3. **Security Enhancements Added**

#### Auth Hardening
- ✅ Added explicit `alg` allowlist pre-check (before verification)
- ✅ Added aud/iss exact-match guidance (trailing slash pitfalls noted)
- ✅ Added `npm pkg set dependencies.jose="^5"` command (prevents devDeps regression)
- ✅ Added dual entry-point guidance (keep `jose` server-only, not in client bundle)
- ✅ Added clock-skew edge test requirement (±300s for nbf/iat/exp)

#### Fund Calc Hardening
- ✅ Added follow-on reserve cap guard (never go negative)
- ✅ Added structured warning on cap (logger.warn with context)
- ✅ Added CSV header stability test (prevents BI/Excel breakage)
- ✅ Added fee accrual test (verify total = fundSize × rate × years)

### 4. **Deduplication**

**v1:** Split instructions repeated in 3 places
**v2:** Single authoritative split-plan-comment.md, others link to it

**v1:** Auth security snippets duplicated across auth-review and full-review
**v2:** Single auth-comment.md with all security fixes

### 5. **Archiving**

All v1 documents moved to:
```
docs/observability/archive/2025-10-06/
├── pr-113-review-v1.md              (21KB - full technical analysis)
├── pr-113-auth-comment-v1.md        (5KB - detailed auth review)
├── pr-113-fundcalc-comment-v1.md   (8KB - detailed calc review)
├── pr-113-split-instructions-v1.md  (8KB - detailed split guide)
├── pr-113-summary-v1.md             (4KB - executive summary)
└── pr-113-merge-review-final-v1.md  (16KB - final merge review)
```

---

## Editorial Principles Applied

### 1. **Paste-Ready Focus**
Every document is **immediately usable** as a GitHub comment. No "see other doc for details."

### 2. **Invariant Specifics**
Avoid brittleness:
- ❌ "Line 42 has error X"
- ✅ "Strict-null check on `flag` var; see latest CI run"

### 3. **Code > Words**
Replace explanations with copy/paste snippets:
- ❌ "You should add async error handling"
- ✅ "Add this asyncHandler wrapper: ```ts\n// code here\n```"

### 4. **Collaborative Tone**
- ❌ "DO NOT MERGE - CRITICAL BUGS"
- ✅ "Blocked pending fixes - here's how to address them"

### 5. **Outcome-Based Gates**
- ❌ "Fix this by Thursday"
- ✅ "Ready when: [ ] async handler added [ ] tests pass"

---

## Usage Guide

### For Reviewers (Post to GitHub)

```bash
# Post auth blocking issues
gh pr comment 113 --body-file docs/observability/auth-comment.md

# Post fund calc improvements
gh pr comment 113 --body-file docs/observability/fundcalc-comment.md

# Post split plan (closing comment)
gh pr comment 113 --body-file docs/observability/split-plan-comment.md

# Then close PR #113
gh pr close 113 --comment "Split into PR-A (auth) and PR-B (calc) per review"
```

### For PR Authors (Execute)

```bash
# Split the PR
cd c:/dev/Updog_restore
# Follow docs/observability/split-plan-comment.md

# Fix auth issues
# Follow docs/observability/auth-comment.md checklist

# Fix fund calc issues
# Follow docs/observability/fundcalc-comment.md checklist
```

---

## Metrics

### Document Reduction
- **v1:** 6 files, 62KB total
- **v2:** 3 files, 10KB total
- **Reduction:** 84% smaller, zero duplication

### Actionability Score
- **v1:** 15 code snippets scattered across 6 docs
- **v2:** 8 copy/paste snippets concentrated in 3 docs
- **Improvement:** 100% of snippets immediately usable

### Readability
- **v1:** 30-40 min read time (all docs)
- **v2:** 5-10 min read time per comment
- **Improvement:** 3x faster consumption

---

## References

- **v2 Documents:** [docs/observability](.)
  - [auth-comment.md](./auth-comment.md)
  - [fundcalc-comment.md](./fundcalc-comment.md)
  - [split-plan-comment.md](./split-plan-comment.md)

- **v1 Archive:** [docs/observability/archive/2025-10-06](./archive/2025-10-06/)

- **Index:** [README.md](./README.md)

---

*Editorial v2 completed 2025-10-06 17:56 CDT*
