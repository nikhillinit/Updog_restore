# Document Restructuring: Multi-Agent Template

**Purpose**: Transform monolithic strategic documents into modular, navigable,
CI-verified file suites

**Quality Target**: 72/100 (monolith) → 96/100 (restructured)

**Time Estimate**: 5-6 hours (5 phases)

**Based On**: ADR-015 (DECISIONS.md), Session 2025-11-27

---

## Pre-Flight Checklist

Before starting, verify:

- [ ] You have a monolithic document (500+ lines, multiple sections)
- [ ] Document contains mixed content (findings, patterns, recommendations)
- [ ] You've read [ADR-015](#) in DECISIONS.md
- [ ] You have 5-6 hours available for full workflow
- [ ] npm environment available for Phase 4 validation

---

## Phase 1: Human-Led Architectural Outline (45 min)

### Inputs

- Original monolithic document path
- Understanding of document's purpose and audience

### Tasks

**1.1 Content Analysis** (15 min)

```
Analyze the monolithic document and identify:
- Major thematic sections (not just headings)
- Repeated concepts that need cross-referencing
- Natural breaking points in the narrative
- Content that belongs in an index vs detailed files
```

**1.2 File Structure Design** (20 min)

```
Design the file structure (content-first, not quota-driven):

ALWAYS include:
- 00-INDEX.md (navigation hub)
- 01-EXECUTIVE-SUMMARY.md (1-2 min read)
- XX-ACTION-PLAN.md (actionable next steps)
- XX-METRICS-AND-VERIFICATION.md (success criteria)

Add as needed:
- Analysis files (1 per major document reviewed)
- Synthesis file (cross-document patterns)
- Evidence validation report (if claims need verification)

TARGET: 6-10 files (let content guide count, don't force)
```

**1.3 Terminology Glossary** (10 min)

```
Create a glossary of 10-15 domain-specific terms to prevent semantic drift:

Example format:
- Temporal displacement: Documentation timestamps lag git reality
- Phase 0A: Project infrastructure setup phase
- Quality score: 0-100 scale for document assessments
- MOIC: Multiple on Invested Capital
- BigInt precision: 8-decimal scale (100,000,000)

This glossary ensures all agents use consistent terminology.
```

**1.4 Cross-Reference Strategy** (10 min)

```
Define qualitative linking rules (NOT quotas):

Rule 1: Summary claims → Analysis evidence
Rule 2: Action items → Supporting analysis
Rule 3: INDEX → All documents
Rule 4: Concept introductions → Detailed explanations

Target: 40-60 natural links (emerge from content, not forced)
```

### Outputs

- `docs/plans/YYYY-MM-DD-[topic]-restructure.md`
  - 8-file structure outline
  - Terminology glossary (15+ terms)
  - Cross-reference strategy (4 rules)
  - Line range mapping (original → new files)

---

## Phase 2: Single-Agent Sequential Split (30 min)

**CRITICAL**: Use ONE agent with FULL context (prevents semantic drift)

### Agent Prompt

````
**AGENT: docs-architect**

**Task**: Split monolithic document into modular files

**Context**: Refactoring plan at `docs/plans/YYYY-MM-DD-[topic]-restructure.md`

**Input**: `docs/analysis/ORIGINAL-MONOLITH.md` (XXX lines)

**Output**: `docs/analysis/[topic]-YYYY-MM-DD/*.md` (8 files)

**CRITICAL CONSTRAINTS**:
1. **Verbatim extraction** - Copy text exactly, no rewording
2. **No improvements** - Don't fix typos, enhance clarity, or add details
3. **Preserve markdown** - Keep formatting, code blocks, tables intact
4. **Follow line mapping** - Use refactoring plan's line ranges
5. **Terminology consistency** - Use glossary terms EXACTLY as defined

**Quality Check**:
- Count lines: expect 1,000-1,100 total (slight expansion from headers OK)
- Verify no content loss: original lines - markdown dividers = new lines
- Check terminology: all glossary terms used consistently

**File Template** (for each file):
```markdown
# [Title from Refactoring Plan]

**Read Time**: ~X minutes

**Date**: YYYY-MM-DD
**Status**: DRAFT
**Source**: ORIGINAL-MONOLITH.md (lines XXX-YYY)

---

[Content extracted verbatim from line ranges]
````

```

### Validation (Checkpoint 2)

Run multi-AI validation BEFORE proceeding to Phase 3:

```

Use: mcp**multi-ai-collab**ask_all_ais

Prompt: "Review the 8-file split in `docs/analysis/[topic]-YYYY-MM-DD/` against
the refactoring plan. Verify:

1. Content integrity: All lines from original present in split files?
2. Terminology consistency: Glossary terms used consistently?
3. No hallucinations: Any content added that wasn't in original?
4. File count optimal: Should we merge/split any files?

Original: XXX lines Split: YYY lines across 8 files Difference: ZZZ lines
(expect small delta for headers/navigation)"

````

**Only proceed if**: GEMINI + OPENAI consensus on content integrity ✅

---

## Phase 3: Multi-Agent Parallel Refinement (90 min)

**NOW SAFE** to parallelize (split complete, independent tasks)

### Deploy 4 Agents in Parallel

Use Task tool with 4 parallel calls in ONE message:

```typescript
Task({ agent: 'docs-architect', prompt: 'Agent 1: Structure Enhancement...' }),
Task({ agent: 'docs-architect', prompt: 'Agent 2: Qualitative Cross-Linking...' }),
Task({ agent: 'docs-architect', prompt: 'Agent 3: Evidence Validation...' }),
Task({ agent: 'docs-architect', prompt: 'Agent 4: Formatting + Style...' })
````

#### Agent 1: Structure Enhancement

```
Add to ALL files (including INDEX):

1. **Breadcrumb Navigation** (7 content files, NOT INDEX):
   Format: <!-- Breadcrumb Navigation -->
           [← INDEX](00-INDEX.md) | [Next Section →](XX-NEXT.md)

   Last file: No "Next Section" link

2. **Read Time Estimates** (ALL 8 files):
   Formula: word_count / 200 words per minute
   Format: **Read Time**: ~X minutes
   Placement: After title, before content

3. **Verify INDEX Reading Paths**:
   Ensure INDEX has role-based reading paths:
   - New Developer (10-15 min)
   - PM/Stakeholder (15-20 min)
   - Architect/Full Review (40-50 min)
```

#### Agent 2: Qualitative Cross-Linking

```
Apply 4 Linking Rules (from Phase 1):

Rule 1: Summary Claims → Analysis Evidence
- Find assertions in EXECUTIVE-SUMMARY
- Link to supporting sections in detailed analyses
- Format: [detailed analysis](02-FILE.md#anchor)

Rule 2: Action Items → Supporting Analysis
- Find recommendations in ACTION-PLAN
- Link back to analysis that justifies them
- Format: Based on [analysis](03-FILE.md#finding)

Rule 3: INDEX → All Documents
- Verify INDEX links to all 7 content files
- Add anchor links for key sections

Rule 4: Concept Introductions → Detailed Explanations
- Find first mention of domain terms
- Link to detailed explanation (usually in SYNTHESIS or analysis)

External References (optional):
- Link to CAPABILITIES.md, DECISIONS.md, CHANGELOG.md
- Use root-relative paths: ../../../FILE.md

TARGET: 40-60 natural links (stop when value diminishes)
```

#### Agent 3: Evidence Validation

```
Review all claims for supporting evidence:

1. **Identify Claims**:
   - Numerical claims (counts, percentages, dates)
   - Status claims ("completed", "100% done")
   - Timeline claims ("Phase X finished Nov 10")

2. **Add Verification Commands**:
   Format: Verify with: `git show COMMIT_HASH`

   Example verification commands:
   - git log --since="2025-11-20"
   - grep "MOIC" shared/db/schema.ts
   - find server/routes -name "*portfolio*.ts" | wc -l

3. **Flag Unsupported Claims**:
   Use: [EVIDENCE NEEDED] comment (NOT emoji)

4. **Cross-Reference with Git**:
   Spot-check timeline claims against:
   git log --oneline --since="YYYY-MM-DD"

**Deliverable**: Report of:
- Claims verified: X (with commands added)
- Claims needing evidence: Y (flagged)
- Timeline discrepancies: Z (if any)
```

#### Agent 4: Formatting + Style

````
Enforce CI-ready formatting:

1. **No-Emoji Policy** (CRITICAL for CI/CD):
   Find: ✅❌⚠️🔍🎯📋🛑
   Replace with approved text (see CLAUDE.md):
   - ✅ → [x] or PASS: or SUCCESS:
   - ❌ → [ ] or FAIL: or ERROR:
   - ⚠️ → **WARNING:** or **NOTE:**
   - 🛑 → **GATE:** or **CHECKPOINT:**

2. **Code Block Language Tags**:
   Fix: ``` → ```bash or ```typescript or ```json

3. **Table Formatting**:
   Verify: Aligned columns, consistent separators

4. **Markdown Best Practices**:
   - Heading hierarchy (# → ## → ### in order)
   - Blank lines before/after headings
   - Consistent list formatting
   - No trailing whitespace

**Deliverable**: Count of:
- Emoji violations fixed: X
- Code blocks tagged: Y
- Tables formatted: Z
````

### Validation (Checkpoint 3)

Human review for semantic consistency:

- [ ] Cross-references add value (not forced)?
- [ ] Evidence gaps acceptable or need resolution?
- [ ] Timeline discrepancies need correction?
- [ ] Breadcrumb navigation works well?

---

## Phase 4: NPM Verification + CI Integration (60 min)

### 4.1 Install Dependencies (5 min)

```bash
npm install --save-dev remark-cli remark-lint remark-preset-lint-recommended markdown-link-check
```

### 4.2 Add NPM Scripts (5 min)

Edit `package.json`:

```json
{
  "scripts": {
    "docs:lint": "remark docs/analysis --frail --quiet",
    "docs:check-links": "node scripts/check-doc-links.mjs",
    "docs:verify": "npm run docs:lint && npm run docs:check-links"
  }
}
```

### 4.3 Create Remark Config (10 min)

Create `.remarkrc.mjs`:

```javascript
import remarkPresetLintRecommended from 'remark-preset-lint-recommended';
import remarkLintNoUndefinedReferences from 'remark-lint-no-undefined-references';

const remarkConfig = {
  plugins: [
    remarkPresetLintRecommended,
    // Allow text inside [brackets] without treating as broken references
    [
      remarkLintNoUndefinedReferences,
      {
        allow: ['VERIFIED', 'INFERRED', 'CLAIMED', 'EVIDENCE NEEDED', 'x', ' '],
      },
    ],
  ],
};

export default remarkConfig;
```

### 4.4 Create Link Checker Script (20 min)

Create `scripts/check-doc-links.mjs`:

```javascript
#!/usr/bin/env node

import { glob } from 'glob';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const files = glob.sync('docs/analysis/**/*.md', { cwd: rootDir });
let totalLinks = 0;
let brokenLinks = 0;
const errors = [];

console.log(`Checking links in ${files.length} markdown files...`);

for (const file of files) {
  const filePath = join(rootDir, file);
  const content = readFileSync(filePath, 'utf-8');
  const fileDir = dirname(filePath);

  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const linkText = match[1];
    const linkUrl = match[2];
    totalLinks++;

    // Skip external links
    if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://'))
      continue;
    if (linkUrl.startsWith('#')) continue;

    const [linkPath, anchor] = linkUrl.split('#');
    if (!linkPath) continue;

    let targetPath;
    if (linkPath.startsWith('/')) {
      targetPath = join(rootDir, linkPath);
    } else {
      targetPath = resolve(fileDir, linkPath);
    }

    if (!existsSync(targetPath)) {
      brokenLinks++;
      errors.push({ file, link: linkUrl, text: linkText, target: targetPath });
    }
  }
}

if (brokenLinks === 0) {
  console.log(`\n[PASS] All ${totalLinks} links are valid`);
  process.exit(0);
} else {
  console.error(
    `\n[FAIL] Found ${brokenLinks} broken links out of ${totalLinks} total:\n`
  );
  for (const error of errors) {
    console.error(`  File: ${error.file}`);
    console.error(`  Link: [${error.text}](${error.link})`);
    console.error(`  Target not found: ${error.target}\n`);
  }
  process.exit(1);
}
```

### 4.5 Create GitHub Actions Workflow (20 min)

Create `.github/workflows/verify-strategic-docs.yml`:

```yaml
name: Verify Strategic Documentation

on:
  push:
    paths:
      - 'docs/analysis/**/*.md'
      - '.remarkrc.mjs'
      - 'package.json'
  pull_request:
    paths:
      - 'docs/analysis/**/*.md'

jobs:
  verify-docs:
    name: Documentation Verification
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --prefer-offline

      - name: Run documentation verification
        run: npm run docs:verify
```

### Validation (Checkpoint 4)

```bash
# Local validation
npm run docs:verify

# Expected output:
# [PASS] Markdown linting: 0 warnings
# [PASS] All XX links are valid
```

Fix any violations before proceeding.

---

## Phase 5: Human QA - Narrative Cohesion (45 min)

**NOT checking** (CI validates these):

- Broken links
- Emoji violations
- Formatting issues

**CHECKING** (human judgment):

### 5.1 Strategic Clarity (10 min)

```
Compare to original monolith:

Question: "What are the 4 blockers?"
- Monolith: Scan 875 lines → X minutes
- Restructured: INDEX → FILE.md#blockers → Y seconds

Target: 10x improvement (e.g., 5 min → 30 sec)
```

### 5.2 Narrative Flow (10 min)

```
Read files sequentially: 01 → 02 → 03 → ... → 07

Check:
- Does each file build on previous context?
- Are transitions natural between files?
- Any redundancy or contradictions?
- Cross-references connect related concepts?

Target: Natural progression "what's wrong" → "why" → "what to do"
```

### 5.3 Navigability Test (10 min)

```
Simulate 5 realistic queries with timer:

1. "What are the blockers?" → INDEX → FILE → <30 sec
2. "What's the timeline slippage?" → INDEX → FILE → <30 sec
3. "What should we do first?" → INDEX → ACTION-PLAN → <30 sec
4. "What are the patterns?" → INDEX → SYNTHESIS → <30 sec
5. "How do we verify fixes?" → INDEX → METRICS → <30 sec

Target: ALL scenarios < 30 seconds
```

### 5.4 Executive Summary Validation (5 min)

```
Word count: npm run count-words 01-EXECUTIVE-SUMMARY.md
Reading time: word_count / 200

Content check:
- [ ] Identifies core issue?
- [ ] Provides accuracy scores?
- [ ] Lists critical findings?
- [ ] Links to detailed analyses?
- [ ] Scannable format (tables, headers)?

Target: ≤ 2 minutes (400 words max)
```

### 5.5 Value Assessment (10 min)

```
Compare original vs restructured:

| Metric | Monolith | Restructured | Improvement |
|--------|----------|--------------|-------------|
| Findability | Linear scan | Direct nav | Xx faster |
| Onboarding | XX-min read | 1-min summary | Xx faster |
| Maintainability | 1 file | 8 files | Xx easier |
| Reusability | Hard to excerpt | Direct link | New capability |
| CI Integration | None | Automated | New capability |

Target: 3-4x productivity improvement
```

### Final Quality Score

```
Calculate overall score:

Strategic Clarity:       /20
Narrative Flow:          /20
Navigability:            /20
Executive Summary:       /20
Value vs Monolith:       /20
----------------------------
TOTAL:                   /100

Target: ≥ 90/100 (96/100 is reference implementation)
```

### Validation (Checkpoint 5)

- [ ] Strategic clarity improved vs monolith
- [ ] Narrative flows naturally
- [ ] 2-min executive summary achieved
- [ ] Find info in <30 sec
- [ ] Better than monolith (3-4x gain)

**Decision**: APPROVE or ITERATE

---

## Post-Execution Documentation (65 min)

### 1. Update CHANGELOG.md (10 min)

Add to `[Unreleased]` section:

```markdown
## [Unreleased] - YYYY-MM-DD

### Added

- **Document Restructuring (COMPLETE - All 5 Phases)**: Transformed XXX-line
  [topic] monolith into 8 modular, CI-verified files (quality: 72/100 → 96/100)
  - Phase 1-2: Architectural outline + single-agent split (8 files, XXX lines)
  - Phase 3: Multi-agent refinement (breadcrumbs, 48 links, evidence,
    formatting)
  - Phase 4: NPM verification + CI (remark, link check, GitHub Actions)
  - Phase 5: Human QA (10x clarity, <30 sec navigation, 96/100 score)

  **Artifacts**: docs/analysis/[topic]-YYYY-MM-DD/\*.md **See**: ADR-015 in
  DECISIONS.md for approach rationale
```

### 2. Create ADR in DECISIONS.md (15 min)

_If this is your first use of the template, create ADR-015. Otherwise, reference
it._

Already created? Add note:

```markdown
### Related Sessions

- 2025-11-27: Strategic Document Review restructuring (reference implementation)
- YYYY-MM-DD: [Your topic] restructuring (this session)
```

### 3. Create Reusable Template (30 min)

You're reading it! This file serves as the template.

For future sessions, copy this file and customize:

- Replace `[topic]` with your document topic
- Update file paths to match your structure
- Adjust agent prompts for domain-specific terminology

### 4. Update Workflow Cheatsheet (10 min)

Add lessons learned to `cheatsheets/document-review-workflow.md`:

```markdown
## Lessons Learned: [YYYY-MM-DD Session]

**What Worked Well:**

- [Specific practice that saved time or improved quality]
- [Tool/script that was particularly useful]

**What Would Improve:**

- [Automation opportunity identified]
- [Process adjustment needed]

**Key Metrics:**

- Time: X hours (vs Y hour estimate)
- Quality: Z/100 (vs 96/100 target)
- Link count: A natural links
- Productivity gain: Bx for consumers
```

---

## Success Criteria Summary

Use this checklist to verify completion:

### Automated Validation

- [ ] `npm run docs:verify` passes
- [ ] No emoji violations detected
- [ ] All cross-references resolve
- [ ] GitHub Actions workflow runs successfully

### Human Validation

- [ ] Strategic clarity improved vs monolith (10x target)
- [ ] Narrative flows naturally across files
- [ ] 2-min executive summary achieves goal (<400 words)
- [ ] Can find specific info in <30 seconds
- [ ] Quality score 90-100/100 measured

### Process Validation

- [ ] Template tested and works for this domain
- [ ] Lessons documented in cheatsheet
- [ ] ADR updated in DECISIONS.md
- [ ] CHANGELOG.md updated

---

## Troubleshooting

### "Agent 2 created 100+ links (way over 40-60 target)"

**Diagnosis**: Agent misunderstood "qualitative" as "comprehensive"

**Fix**: Re-run Agent 2 with stricter prompt:

```
STOP adding links when you ask: "Does this link help the reader or just hit a quota?"
If the answer is "quota," DELETE the link.
Target: 40-60 NATURAL links. Quality > Quantity.
```

### "Validation shows broken links to root files"

**Diagnosis**: Path calculation error (common on Windows)

**Fix**: Links from `docs/analysis/[topic]-YYYY-MM-DD/FILE.md` to root:

- WRONG: `../../FILE.md` (goes to docs/)
- CORRECT: `../../../FILE.md` (goes to root)

### "Phase 5 QA shows poor narrative flow"

**Diagnosis**: Phase 2 split wasn't verbatim (agent "improved" text)

**Fix**: Re-run Phase 2 with STRICT verbatim constraint:

```
CRITICAL: Copy text EXACTLY character-for-character.
Do NOT fix typos, enhance clarity, or add details.
Preserve original text including any flaws.
```

### "Quality score < 90/100"

**Diagnosis**: One or more phases rushed or skipped

**Fix by phase**:

- Phase 1: Redo terminology glossary (likely inconsistent)
- Phase 2: Verify line coverage (likely content gaps)
- Phase 3: Check link quality (likely forced/artificial)
- Phase 4: Check CI compliance (likely emoji violations)
- Phase 5: Re-test navigability (likely poor INDEX)

---

## Version History

- **v1.0** (2025-11-27): Initial template based on strategic document review
  session
- **v1.1** (TBD): Updates based on second session learnings

---

**Questions?** See [ADR-015](#) in DECISIONS.md or
`cheatsheets/document-review-workflow.md`
