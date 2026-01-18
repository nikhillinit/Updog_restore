---
type: reflection
id: REFL-013
title: Router Substring Matching Causes False Positives
status: DRAFT
date: 2026-01-18
version: 1
severity: medium
wizard_steps: []
error_codes: [ERR_ROUTE_MISMATCH]
components: [routing, discovery, pattern-matching]
keywords: [router, includes, substring, word-boundary, false-positive, pattern-matching]
test_file: tests/regressions/REFL-013.test.ts
superseded_by: null
---

# Reflection: Router Substring Matching Causes False Positives

## 1. The Anti-Pattern (The Trap)

**Context:** Discovery routing systems that use `includes()` for pattern matching cause false positives when short keywords appear as substrings in unrelated queries.

**How to Recognize This Trap:**
1.  **Error Signal:** Requests routed to wrong handlers; "brainstorm" matched by "ai" pattern because it contains "ai"
2.  **Code Pattern:** Using `includes()` for keyword matching:
    ```typescript
    // ANTI-PATTERN
    function matchPattern(query: string, keywords: string[]): boolean {
      return keywords.some(keyword =>
        query.toLowerCase().includes(keyword.toLowerCase())
      );
    }
    // "brainstorm" matches ["ai"] because "brainstorm" contains "ai"
    ```
3.  **Mental Model:** "If the query contains the keyword, it's a match." This ignores that short keywords can appear as substrings in unrelated words.

**Financial Impact:** Incorrect routing leads to wrong tool invocation, wasted compute, and incorrect results. In financial contexts, routing to wrong calculation engine could produce invalid outputs.

> **DANGER:** Do NOT use substring matching for keyword-based routing.

## 2. The Verified Fix (The Principle)

**Principle:** Use word boundary matching or exact token matching for routing keywords.

**Implementation Pattern:**
1.  Use regex word boundaries (`\b`) for keyword matching
2.  Tokenize query and match against tokens
3.  Avoid short keywords (< 3 chars) that commonly appear as substrings

```typescript
// VERIFIED IMPLEMENTATION

// Option 1: Word boundary regex (preferred)
function matchPatternWordBoundary(query: string, keywords: string[]): boolean {
  const normalizedQuery = query.toLowerCase();
  return keywords.some(keyword => {
    const regex = new RegExp(`\\b${escapeRegex(keyword.toLowerCase())}\\b`);
    return regex.test(normalizedQuery);
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Option 2: Token-based matching
function matchPatternTokens(query: string, keywords: string[]): boolean {
  // Split on non-word characters
  const tokens = new Set(
    query.toLowerCase().split(/\W+/).filter(Boolean)
  );
  return keywords.some(keyword =>
    tokens.has(keyword.toLowerCase())
  );
}

// Option 3: Minimum keyword length enforcement
const MIN_KEYWORD_LENGTH = 3;

function validateKeywords(keywords: string[]): string[] {
  const invalid = keywords.filter(k => k.length < MIN_KEYWORD_LENGTH);
  if (invalid.length > 0) {
    console.warn(`Short keywords may cause false positives: ${invalid.join(', ')}`);
  }
  return keywords.filter(k => k.length >= MIN_KEYWORD_LENGTH);
}
```

**Key Learnings:**
1. "ai" matches "brainstorm", "detail", "maintain", etc.
2. Word boundaries prevent substring matches
3. Consider keyword length constraints for routing patterns

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-013.test.ts` validates word boundary matching
*   **Source Session:** Jan 8-18 2026 - Router pattern system (32 to 82 patterns)
*   **Related Files:** `scripts/generate-discovery-map.ts`, `.claude/DISCOVERY-MAP.source.yaml`
