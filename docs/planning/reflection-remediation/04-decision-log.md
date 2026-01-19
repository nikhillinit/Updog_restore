# Decision Log: Reflection System Remediation

## Metadata
- Created: 2026-01-18T22:40:00Z
- Total Decisions: 3

---

## Decision 001: Consolidation Approach

**Date**: 2026-01-18T21:50:00Z
**Context**: Two duplicate reflection systems existed with ID collisions

**Options Considered**:
1. Canonicalize in docs/skills/ (migrate from tools/reflection/, delete legacy)
2. Canonicalize in tools/reflection/ (migrate docs/skills/ there)
3. Hybrid: Create new unified location
4. Keep both with clear ownership boundaries

**Decision**: Option 1 - Canonicalize in docs/skills/

**Rationale**:
- Codex-Claude consensus: minimal disruption with maximum maintainability
- docs/skills/ already had 17 reflections vs 2 in tools/reflection/
- tools/reflection/ was a portable scaffold, not primary use location
- Migration complexity: LOW
- Breaking change risk: LOW

**Impact**: PR #442 created and merged

---

## Decision 002: REFL-001 ID Resolution

**Date**: 2026-01-18T21:55:00Z
**Context**: Both systems had REFL-001 with different content
- docs/skills/REFL-001: "Dynamic Imports Prevent Test Side Effects"
- tools/reflection/REFL-001: "Reserve Engine Null Safety"

**Options Considered**:
1. Keep docs/skills/REFL-001, discard tools/reflection/REFL-001
2. Replace docs/skills/REFL-001 with tools/reflection/REFL-001
3. Rename tools/reflection/REFL-001 to new ID (REFL-018)

**Decision**: Option 3 - Create REFL-018

**Rationale**:
- Both reflections have unique, valuable content
- Renaming preserves all knowledge
- Sequential ID (018) maintains index consistency
- No existing references to break

**Impact**: REFL-018-reserve-engine-null-safety.md created

---

## Decision 003: REFL-002 Duplicate Resolution

**Date**: 2026-01-18T21:55:00Z
**Context**: tools/reflection/REFL-002 ("Router Substring Matching") duplicated docs/skills/REFL-013

**Options Considered**:
1. Keep both with different IDs
2. Merge content into REFL-013
3. Delete tools/reflection/REFL-002 as duplicate

**Decision**: Option 3 - Delete duplicate

**Rationale**:
- Content was identical (same topic, same fix)
- REFL-013 is the canonical version with proper test linkage
- No unique content would be lost

**Impact**: tools/reflection/REFL-002 deleted in PR #442

---

## Decision 004: /advise Enhancement Scope (Revised)

**Date**: 2026-01-18T23:36:00Z
**Context**: Codex Iteration 0 revealed /advise is NOT code-implemented

**Discovery**:
- /advise is a Claude Code "slash command" defined in configuration
- References in docs/skills/README.md (lines 34, 39, 85) and CAPABILITIES.md (lines 507, 530, 540)
- No runtime code exists - behavior is documentation-driven

**Options Considered**:
1. Update docs/skills/README.md with Related Documentation section
2. Create new Claude Code skill file in .claude/skills/
3. Abandon /advise enhancement (documentation sufficient)

**Decision**: Option 1 - Update README.md

**Rationale**:
- /advise behavior comes from documentation that Claude Code reads
- Adding "Related Documentation" section to README.md achieves the goal
- No code modification needed - simpler implementation
- Maintains existing architecture

**Impact**: Step 1.3 re-scoped from "code modification" to "documentation update"

---

## Pending Decisions

### Decision 005: CWD Fix Implementation Approach
**Status**: PENDING (Phase 1, Step 1.2)
**Options to evaluate**:
1. Add find_repo_root() using `git rev-parse --show-toplevel` (subprocess)
2. Add find_repo_root() using marker file (.git directory detection)
3. Use environment variable for repo root
4. Require execution from repo root (document limitation)

**Codex Findings** (Iteration 0):
- Existing git rev-parse patterns in codebase (vite.config.ts:181, etc.)
- Option 1 aligns with existing project patterns
- Subprocess approach is clean and already used elsewhere

**Recommended**: Option 1 - git rev-parse (pending final decision)
