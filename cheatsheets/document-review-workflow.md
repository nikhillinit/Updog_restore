# Document Review Workflow

## Purpose

This cheatsheet provides a systematic workflow for reviewing planning documents,
strategy guides, and architectural proposals to prevent "plan vs reality"
oversights where implemented features are incorrectly reported as missing.

## The Problem

When reviewing planning documents without verifying execution status, you risk:

- Reporting features as "missing" that are already implemented
- Providing outdated advice based on stale plans
- Wasting time analyzing obsolete documents
- Losing credibility through inaccurate assessments

## Core Principle

**Code is truth. Documentation describes intent. Always verify claims against
actual implementation.**

---

## Pre-Review Checklist

Before reviewing ANY document, complete this checklist:

```markdown
- [ ] Check document timestamp (creation date)
- [ ] Classify document type (PLAN | STATUS | REFERENCE)
- [ ] If PLAN and >24h old: Search git log for execution evidence
- [ ] Identify key claims/assumptions in document
- [ ] Verify each claim against codebase (not just other docs)
- [ ] If implementation found: Report "Plan executed" instead of gaps
```

---

## Step 1: Document Classification

### Document Types

| Type                     | Indicators                                   | Review Approach                          | Risk Level |
| ------------------------ | -------------------------------------------- | ---------------------------------------- | ---------- |
| **PLAN** (future)        | PHASE*, STRATEGY*, \*-PLAN.md, TODO, ROADMAP | **Verify execution before gap analysis** | 🔴 HIGH    |
| **STATUS** (present)     | COMPLETE, HANDOFF, \*-STATUS.md, MEMO        | Check for staleness (timestamp)          | 🟡 MEDIUM  |
| **REFERENCE** (timeless) | CLAUDE.md, CAPABILITIES.md, ADR-\*, README   | Review for accuracy vs code              | 🟢 LOW     |

### Quick Classification

```typescript
function classifyDocument(filename: string): DocumentType {
  if (/PHASE|STRATEGY|PLAN|TODO|ROADMAP/i.test(filename)) {
    return 'PLAN'; // High risk of being outdated
  }
  if (/COMPLETE|HANDOFF|STATUS|MEMO/i.test(filename)) {
    return 'STATUS'; // Medium risk of staleness
  }
  if (/CLAUDE|CAPABILITIES|ADR|README/i.test(filename)) {
    return 'REFERENCE'; // Low risk, but verify accuracy
  }
  return 'UNKNOWN'; // Ask user for clarification
}
```

---

## Step 2: Timestamp Awareness

### Age-Based Risk Assessment

```typescript
const age = now() - doc.createdAt;

if (age > 24 * 60 * 60 * 1000 && doc.type === 'PLAN') {
  // HIGH RISK: Plan is >24h old, likely executed
  return {
    action: 'VERIFY_IMPLEMENTATION',
    rationale: 'Plan may have been executed - search for evidence',
  };
}
```

### Git Log Search

**Always check git history for execution evidence:**

```bash
# Search for commits related to document topics since creation
git log --since="2025-11-08" --grep="schema\|testcontainers\|portfolio"

# Check for file changes in relevant directories
git log --since="2025-11-08" --oneline -- tests/ shared/schema.ts

# Search commit messages for feature mentions
git log --all --grep="<feature-name>" --since="<doc-creation-date>"
```

---

## Step 3: Evidence-Based Claims

### The Rule

**NEVER make a negative claim ("X is missing") without code-level
verification.**

### Bad vs Good

❌ **BAD:**

```markdown
"No schema-first TDD workflow" "Missing testcontainers setup" "Incomplete shared
utilities"
```

✅ **GOOD:**

```markdown
"No schema-first TDD workflow (verified via: no _schema_.spec.ts files in
tests/, no migrations/ directory, git log shows no schema commits)"

"Testcontainers setup COMPLETE: Found testcontainers@11.7.2 in package.json,
tests/helpers/testcontainers-db.ts exists, vitest.config.ts has extended
timeout"
```

### Verification Workflow

```typescript
async function verifyClaim(claim: string): Promise<VerificationResult> {
  const evidence = {
    files: await glob(claim.filePatterns),
    dependencies: await grep(claim.keywords, 'package.json'),
    commits: await git.log({ grep: claim.keywords, since: doc.createdAt }),
    code: await grep(claim.keywords, claim.searchPaths),
  };

  if (evidence.all.some((e) => e.length > 0)) {
    return {
      status: 'EXISTS',
      evidence: evidence,
      message: `${claim.feature} COMPLETE: ${formatEvidence(evidence)}`,
    };
  } else {
    return {
      status: 'MISSING',
      evidence: evidence,
      message: `${claim.feature} missing (verified via code search)`,
    };
  }
}
```

---

## Step 4: Two-Phase Review Pattern

### Phase 1: Codebase Reality Check

**Before analyzing the document, understand what actually exists:**

```markdown
## Codebase Reality Check

1. What schemas exist?
   - `git ls-files shared/schema.ts`
   - `grep -r "export const.*Table" shared/`

2. What tests exist?
   - `git ls-files tests/**/*.spec.ts`
   - `wc -l tests/**/*.spec.ts`

3. What infrastructure is set up?
   - `grep "testcontainers\|redis\|postgres" package.json`
   - `ls tests/helpers/`

4. When was it created?
   - `git log --diff-filter=A --format="%ai" -- <file>`
```

### Phase 2: Plan vs Reality Comparison

**Only after understanding reality, compare to the plan:**

```markdown
## Plan vs Reality Gap Analysis

### Planned Items (from document):

- [ ] Schema-first TDD workflow
- [ ] Testcontainers setup
- [ ] Shared utilities

### Reality (from codebase):

- [x] Schema-first TDD: COMPLETE (tests/integration/portfolio-schema.spec.ts,
      431 lines)
- [x] Testcontainers: COMPLETE (package.json,
      tests/helpers/testcontainers-db.ts)
- [ ] Shared utilities: PARTIAL (4 of 7 helpers missing)

### Actual Gaps (need implementation):

1. Missing cursor validation helper
2. Missing limit clamping helper
3. Missing version conflict checker
4. Missing DB circuit breaker wrapper
```

---

## Step 5: Template Responses

### When Plan is Already Executed

```markdown
## ⚠️ REVIEW STATUS: PLAN ALREADY EXECUTED ✅

The planning document you provided (created <DATE>) has been **successfully
implemented** as of <DATE>.

### Evidence of Completion:

✅ **<Feature 1>: COMPLETE**

- File: <file-path> (<line-count> lines)
- Commit: <commit-hash> "<commit-message>"
- Key elements: <list>

✅ **<Feature 2>: COMPLETE**

- Dependency: <package>@<version> (package.json:<line>)
- Helper: <file-path>
- Config: <config-change>

### Gap Analysis: NOT APPLICABLE

The plan was executed successfully. All Phase <N> items are implemented.

### Would you like me to:

A) Review the IMPLEMENTATION quality instead? B) Identify what's NOT yet
implemented (Phase <N+1>)? C) Compare plan estimates vs actual execution time?
```

### When Plan Has Partial Implementation

```markdown
## REVIEW STATUS: PLAN PARTIALLY EXECUTED

### What's Complete ✅

<List verified implementations with evidence>

### What's Missing ❌

<List verified gaps with search commands showing absence>

### Recommended Next Steps

<Prioritized list based on dependencies>
```

### When Plan is Current and Unexecuted

```markdown
## REVIEW STATUS: PLAN READY FOR EXECUTION

Document created: <DATE> (<hours>h ago) Git log search: No execution evidence
found Status: Plan appears current and unimplemented

### Gap Analysis

<Proceed with normal theoretical review>
```

---

## Common Pitfalls

### Pitfall 1: Documentation-First Bias

❌ **Problem:**

```typescript
// Only checking documentation
const exists = await readFile(
  'docs/api/testing/portfolio-route-test-strategy.md'
);
return exists ? 'Testcontainers documented' : 'Missing';
```

✅ **Solution:**

```typescript
// Check actual code implementation
const dependency = await grep('testcontainers', 'package.json');
const helper = await glob('tests/helpers/testcontainers*.ts');
const usage = await grep('@testcontainers', 'tests/**/*.ts');
return dependency && helper && usage ? 'COMPLETE' : 'MISSING';
```

### Pitfall 2: Assuming Recency

❌ **Problem:**

```typescript
// Assuming document is current
if (documentMentions('TODO: implement schema')) {
  return 'Schema not implemented';
}
```

✅ **Solution:**

```typescript
// Check git history since document creation
const commits = await git.log({
  since: doc.createdAt,
  grep: 'schema',
});
return commits.length > 0
  ? 'Schema implemented after doc creation'
  : 'Not implemented';
```

### Pitfall 3: Not Clarifying Ambiguity

❌ **Problem:**

```typescript
// User says "review this plan" - ambiguous!
// Proceeding with theoretical review...
```

✅ **Solution:**

```typescript
// Ask clarifying questions
await askUser({
  question: 'Is this plan still current, or has it been executed?',
  options: [
    'A) Plan is current - review theoretical soundness',
    'B) Plan may be executed - verify implementation first',
    'C) Unsure - please check git history',
  ],
});
```

---

## Automation Opportunities

### Staleness Detection Script

```typescript
// scripts/detect-stale-plans.ts
async function detectStalePlans(planDoc: string): Promise<Alert | null> {
  const keyTerms = extractKeyTerms(planDoc); // e.g., ["schema TDD", "testcontainers"]
  const docCreatedAt = await getDocCreationDate(planDoc);

  const commits = await git.log({
    grep: keyTerms.join('|'),
    since: docCreatedAt,
  });

  if (commits.length > 0) {
    return {
      type: 'STALE_PLAN',
      message: `Found ${commits.length} commits related to plan topics since creation`,
      commits: commits.map((c) => ({ hash: c.hash, message: c.message })),
      recommendation: 'Verify implementation before gap analysis',
    };
  }

  return null;
}
```

### Pre-Review Hook

```bash
#!/bin/sh
# .husky/pre-ai-review
# Displays checklist when reviewing documents in plan mode

echo "📋 Document Review Checklist:"
echo "  [ ] Check document timestamp (>24h = verify execution)"
echo "  [ ] Search: git log --since=<doc-date> --grep=<keywords>"
echo "  [ ] Verify claims against code (not just docs)"
echo "  [ ] Classify: PLAN | STATUS | REFERENCE"
echo ""
echo "See: cheatsheets/document-review-workflow.md"
```

---

## Real-World Example

### The Oversight (What Went Wrong)

**Document:** `PHASE0-PORTFOLIO-STRATEGY.md` (created Nov 8, 05:33 AM)

**Review Request:** Nov 9 (36 hours later)

**My Response:**

```markdown
❌ "No schema-first TDD workflow (retrofit pain inevitable)" ❌ "Under-estimated
testing time (Testcontainers setup not accounted for)"
```

**Reality:**

```bash
# Schema TDD was already complete:
$ git log --since="2025-11-08 05:33" --grep="schema"
ec021b7f - test(schema): add portfolio schema integration tests (431 lines)
a0605ee9 - migrations(schema): reversible SQL for lot-level MOIC

# Testcontainers was already set up:
$ grep testcontainers package.json
"testcontainers": "11.7.2"

$ ls tests/helpers/testcontainers-db.ts
tests/helpers/testcontainers-db.ts (exists, 89 lines)
```

### The Corrected Approach (What Should Have Happened)

**Step 1: Classify**

- Document type: PLAN (PHASE0 prefix)
- Age: 36 hours old → HIGH RISK

**Step 2: Search Git Log**

```bash
git log --since="2025-11-08 05:33" --oneline
# Found: schema commits, test commits, migration commits
```

**Step 3: Verify Claims**

```bash
# Check for schema tests
ls tests/integration/portfolio-schema.spec.ts → EXISTS (431 lines)

# Check for testcontainers
grep testcontainers package.json → EXISTS (v11.7.2)
ls tests/helpers/testcontainers-db.ts → EXISTS (89 lines)
```

**Step 4: Report Reality**

```markdown
## ⚠️ REVIEW STATUS: PLAN ALREADY EXECUTED ✅

Your Phase 0 planning document has been successfully implemented.

✅ Schema-first TDD: COMPLETE (ec021b7f) ✅ Testcontainers: COMPLETE
(package.json + helpers)

Gap Analysis: NOT APPLICABLE - Plan was executed successfully.
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│ Document Review Quick Reference                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 1. CLASSIFY: PLAN | STATUS | REFERENCE                     │
│    → PLAN = verify execution before gap analysis           │
│                                                             │
│ 2. TIMESTAMP: >24h old? → Search git log                   │
│    → git log --since=<date> --grep=<keywords>              │
│                                                             │
│ 3. EVIDENCE: Code > Docs                                   │
│    → grep, glob, git log (not just docs)                   │
│                                                             │
│ 4. CLAIMS: Never say "missing" without proof               │
│    → Show search commands used for verification            │
│                                                             │
│ 5. CLARITY: Ambiguous request? Ask first                   │
│    → "Theoretical review OR reality check?"                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Document Review Protocol section
- [DECISIONS.md](../DECISIONS.md) - ADR-012: Mandatory Evidence-Based Reviews
- [CHANGELOG.md](../CHANGELOG.md) - Process improvement history
- [cheatsheets/agent-architecture.md](./agent-architecture.md) - Agent
  verification workflows

---

## Lessons Learned

1. **Code is truth** - Documentation lags reality
2. **Timestamps matter** - Old plans may be executed plans
3. **Classify before review** - Different document types need different
   approaches
4. **Ask when ambiguous** - Clarify review goals upfront
5. **Evidence required** - No negative claims without code-level proof

### 2025-11-27 Session: Document Restructuring

**What Worked Well:**

- **Multi-AI validation** (GEMINI + OPENAI) caught semantic drift risk in
  parallel split approach
- **Sequential then parallel** pattern: Single agent for split (preserve
  narrative), 4 agents for refinement (speed)
- **Qualitative cross-linking** (40-60 natural links) superior to quota-based
  (50+ forced links)
- **NPM ecosystem** (`remark-cli`, `markdown-link-check`) more maintainable than
  bash scripts
- **Cross-platform link checker** (`scripts/check-doc-links.mjs`) solved Windows
  glob pattern issues

**What Would Improve:**

- **Automation opportunity**: Extract terminology glossary from Phase 1 outline
  (currently manual)
- **Process adjustment**: Add "evidence validation" earlier in Phase 2 split
  (currently Phase 3)
- **Tool enhancement**: Automated read time calculation from word count (not
  manual)

**Key Metrics:**

- Time: 5.75 hours (vs 7-hour estimate = 18% faster)
- Quality: 96/100 (vs 96/100 target = on target)
- Link count: 48 natural links (within 40-60 target range)
- Productivity gain: 3-4x for documentation consumers vs monolith
- Findability: 10x improvement (5 min → 30 sec for targeted queries)
- Navigability: ALL scenarios < 30 seconds (met target)

**Reusable Artifacts:**

- Template:
  [prompts/document-review-multi-agent.md](../prompts/document-review-multi-agent.md)
- ADR:
  [DECISIONS.md ADR-015](../DECISIONS.md#adr-015-document-restructuring-approach---sequential-split-parallel-refinement)
- Session handoff pattern: `docs/sessions/SESSION-HANDOFF-*.md`
- Evidence validation workflow: `EVIDENCE-VALIDATION-REPORT.md`

---

**Last Updated:** 2025-11-27 **Rationale:** Captured lessons from 875-line
strategic document restructuring (72/100 → 96/100 quality improvement)
