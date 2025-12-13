# PR #253 Review: Capital Allocation Verification Plan

## Summary

This PR adds an "Existence Verification Protocol" to prevent reviewers from making false claims about non-existent assets when those assets actually exist in the codebase.

**Files changed:**
- `.claude/DISCOVERY-MAP.md` (+44 lines) - New Section 0B
- `CLAUDE.md` (+33 lines) - Two new sections

---

## Review Assessment

### What Works Well

1. **Valid Problem Statement**: The issue of stale documentation leading to incorrect "doesn't exist" claims is real and documented in this codebase.

2. **Actionable Checklist**: The VERIFY-BEFORE-CRITIQUE checklist provides concrete steps:
   - Glob for agents
   - Glob for skills
   - Glob for implementations
   - Grep for references
   - Check router index

3. **Trigger Phrase Awareness**: Defining phrases that should trigger verification ("doesn't exist", "not implemented", etc.) is a good defensive pattern.

4. **Cross-referencing**: CLAUDE.md correctly references DISCOVERY-MAP.md Section 0B for the full protocol.

---

### Issues to Address

#### 1. Content Duplication (Medium Priority)

The verification protocol appears in **two places** with slight variations:
- `DISCOVERY-MAP.md` Section 0B (full version)
- `CLAUDE.md` (condensed version)

**Problem**:
- CLAUDE.md omits the skills glob step that DISCOVERY-MAP.md includes
- Trigger phrases differ slightly ("the codebase" vs "codebase")
- Creates maintenance burden - updates must happen in both places

**Recommendation**: Consider having CLAUDE.md simply reference DISCOVERY-MAP.md rather than duplicating content. Keep one source of truth.

#### 2. Section Numbering Inconsistency (Low Priority)

Using "0B" as a section number in DISCOVERY-MAP.md breaks the sequential pattern:
- Current: 0B, 1, 2, 3, 4, 5, 6, 7, 8
- Expected: Sequential numbering

**Recommendation**: Either use "0" or renumber to maintain logical flow. "Section 0B" implies there's a "0A" which doesn't exist.

#### 3. CLAUDE.md Already Overloaded (Medium Priority)

The current CLAUDE.md is ~509 lines and includes 39 "memory" placeholder lines (345-384). Adding more sections increases cognitive load.

**Recommendation**: Before adding content:
1. Clean up the "memory" placeholders (lines 345-384)
2. Consider if the brief CLAUDE.md section adds value beyond "see DISCOVERY-MAP.md"

#### 4. Glob Syntax Presentation (Low Priority)

The examples show:
```
Glob .claude/agents/*.md
```

This might be interpreted as a CLI command rather than a tool invocation. Claude Code's Glob tool takes a `pattern` parameter.

**Recommendation**: Clarify that these are tool invocations, e.g.:
```
Use Glob tool with pattern: .claude/agents/*.md
```

#### 5. Missing Skills Check in CLAUDE.md (Low Priority)

DISCOVERY-MAP.md checklist includes 5 steps, but CLAUDE.md version only has 3:
- Agents (present)
- Skills (MISSING in CLAUDE.md)
- Implementations (present)
- Grep references (MISSING in CLAUDE.md)
- Discovery index (present)

**Recommendation**: Either include all steps or explicitly state it's a condensed version.

---

### Verification Questions

Before approving, the following should be verified:

1. **Does this solve a documented problem?**
   - [x] YES - Stale documentation causing false critiques is mentioned in Document Review Protocol

2. **Are the referenced paths correct?**
   - [x] `.claude/agents/*.md` - EXISTS (31 files confirmed)
   - [x] `.claude/skills/*.md` - EXISTS (22 files confirmed)
   - [x] `docs/_generated/router-index.json` - EXISTS (confirmed)

3. **Is this consistent with existing patterns?**
   - [x] Document Review Protocol already exists in CLAUDE.md (lines 171-187)
   - [ ] New sections should use same formatting style

---

## Recommendations

### Required Changes

1. **Consistency**: Align trigger phrases between the two files
2. **Skills step**: Add skills glob to CLAUDE.md version OR explicitly note it's condensed

### Suggested Improvements

1. **Clean up CLAUDE.md**: Remove the 39 "memory" placeholder lines before adding new content
2. **Single source of truth**: Consider CLAUDE.md just pointing to DISCOVERY-MAP.md without duplicating the protocol
3. **Section numbering**: Change "0B" to "0" or insert before section 1 properly

### Optional Enhancements

1. Add a simple test case to verify the protocol catches real issues
2. Consider adding this to the Document Review Protocol section rather than as separate sections

---

## Decision

**Status**: CHANGES REQUESTED

The concept is sound and addresses a real problem. However, the implementation introduces duplication and inconsistency that will create maintenance burden.

Key fixes needed:
1. Align content between the two files
2. Clean up CLAUDE.md memory placeholders
3. Address section numbering

---

## Summary for PR Comment

The verification protocol is a good defensive pattern. Main concerns:
1. Duplicated content with slight inconsistencies between files
2. CLAUDE.md skills step missing vs DISCOVERY-MAP.md version
3. "0B" section numbering is unconventional
4. CLAUDE.md has 39 "memory" placeholder lines that should be cleaned before adding more content

Recommend aligning content or using CLAUDE.md as a brief pointer to the full protocol in DISCOVERY-MAP.md.
