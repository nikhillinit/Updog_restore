---
type: reflection
id: REFL-009
title: CRLF Line Endings Break Frontmatter Parsing
status: VERIFIED
date: 2026-01-18
version: 1
severity: medium
wizard_steps: []
error_codes: []
components: [scripts, parsing, cross-platform]
keywords: [crlf, lf, line-endings, frontmatter, yaml, windows, linux, regex]
test_file: tests/regressions/REFL-009.test.ts
superseded_by: null
---

# Reflection: CRLF Line Endings Break Frontmatter Parsing

## 1. The Anti-Pattern (The Trap)

**Context:** Scripts that parse YAML frontmatter from markdown files fail on Windows because regex patterns only match LF (`\n`), not CRLF (`\r\n`).

**How to Recognize This Trap:**
1.  **Error Signal:** CI passes on Linux but fails locally on Windows; frontmatter returns empty/default values
2.  **Code Pattern:** Regex patterns using literal `\n`:
    ```typescript
    // ANTI-PATTERN
    function parseFrontmatter(content: string) {
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      //                              ^^ Only matches LF!
      return match ? yaml.parse(match[1]) : {};
    }
    ```
3.  **Mental Model:** Assuming all text files use Unix line endings. Git on Windows may preserve CRLF depending on `core.autocrlf` setting.

**Financial Impact:** Cross-platform CI failures waste debugging time. Frontmatter with staleness dates or status flags returns wrong defaults, causing false validation failures.

> **DANGER:** Do NOT use literal `\n` in regex for file parsing without handling CRLF.

## 2. The Verified Fix (The Principle)

**Principle:** Always use `\r?\n` pattern or normalize line endings before parsing.

**Implementation Pattern:**
1.  Use `\r?\n` to match both LF and CRLF
2.  Or normalize input before parsing
3.  Test with both line ending styles

```typescript
// VERIFIED IMPLEMENTATION

// Option 1: Use \r?\n in regex (preferred)
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  //                              ^^^^ Matches both LF and CRLF
  if (!match) return {};

  try {
    return yaml.parse(match[1]) ?? {};
  } catch {
    return {};
  }
}

// Option 2: Normalize line endings first
function parseFrontmatterNormalized(content: string): Record<string, unknown> {
  // Normalize to LF before parsing
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);

  if (!match) return {};
  return yaml.parse(match[1]) ?? {};
}

// Option 3: Split-based parsing (most robust)
function parseFrontmatterSplit(content: string): Record<string, unknown> {
  const lines = content.split(/\r?\n/);

  if (lines[0] !== '---') return {};

  const endIndex = lines.indexOf('---', 1);
  if (endIndex === -1) return {};

  const yamlContent = lines.slice(1, endIndex).join('\n');
  return yaml.parse(yamlContent) ?? {};
}
```

**Key Learnings:**
1. Git `core.autocrlf` setting affects line endings differently per platform
2. CI (Linux) uses LF, Windows dev machines may use CRLF
3. Always test scripts with both line ending styles
4. Consider using `.gitattributes` to force LF for specific file types

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-009.test.ts` validates both line ending styles
*   **Source Session:** Jan 1-7 2026 - CI routing discovery validation failures
*   **Files Affected:** `scripts/generate-discovery-map.ts:284, 724`
