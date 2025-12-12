# Deprecation Header Template

Use this template when marking documents as deprecated or historical.

---

## For DEPRECATED Documents (Superseded)

Place at the **top** of the file (after title, before content):

```markdown
**DEPRECATED**: [YYYY-MM-DD]

This document has been superseded by [new-document.md](path/to/new-document.md).

**Reason**: [Brief explanation]

**Redirect**: See [new-document.md](path/to/new-document.md) for current
guidance.

---
```

**Example**:

```markdown
# Old Planning Document

**DEPRECATED**: 2025-12-12

This document has been superseded by
[PHOENIX-SOT/execution-plan-v2.34.md](PHOENIX-SOT/execution-plan-v2.34.md).

**Reason**: Phoenix project moved to single source of truth (PHOENIX-SOT/)
directory.

**Redirect**: See [PHOENIX-SOT/README.md](PHOENIX-SOT/README.md) for current
execution plan.

---
```

---

## For HISTORICAL Documents (Past Context)

Place at the **top** of the file (after title, before content):

```markdown
**HISTORICAL**: [YYYY-MM-DD]

This document describes work **already completed** on [date/phase].

**Status**: [Phase/Milestone] completed **Artifacts**: [Links to resulting code,
docs, or decisions] **Context**: Kept for historical reference and lessons
learned

---
```

**Example**:

```markdown
# Phase 1A XIRR Completion Report

**HISTORICAL**: 2025-11-10

This document describes work **already completed** on Phase 1A.

**Status**: Phase 1A completed (100% XIRR accuracy achieved) **Artifacts**: See
[DECISIONS.md ADR-015](../DECISIONS.md#adr-015) for architectural decisions
**Context**: Kept for historical reference and lessons learned

---
```

---

## For ACTIVE-BUT-DATED Documents

Place at the **top** of the file (after title, before content):

```markdown
**LAST UPDATED**: [YYYY-MM-DD]

**STATUS**: [Active | Under Review | Pending Update]

**NOTE**: This document may be outdated. Check [CHANGELOG.md](../CHANGELOG.md)
for recent changes.

---
```

**Example**:

```markdown
# Development Strategy

**LAST UPDATED**: 2025-08-17

**STATUS**: Under Review (pending Phase 2 updates)

**NOTE**: This document may be outdated. Check [CHANGELOG.md](../CHANGELOG.md)
for recent changes or
[PHOENIX-SOT/execution-plan-v2.34.md](PHOENIX-SOT/execution-plan-v2.34.md) for
current strategic direction.

---
```

---

## Usage Guidelines

### When to Use DEPRECATED

- Document has been **replaced** by a newer version
- Content is **obsolete** and should NOT be followed
- Clear **redirect path** exists to new document

### When to Use HISTORICAL

- Document describes **completed work**
- Useful for **context** and **lessons learned**
- No redirect needed (standalone artifact)

### When to Use ACTIVE-BUT-DATED

- Document is still **relevant** but **not recently updated**
- May contain **partially outdated** information
- User should **cross-check** with recent changes

---

## Archival vs Deprecation

**Deprecation Header**: Add to documents remaining in original location
**Archival**: Move to `docs/archive/` with optional deprecation header

**Decision Criteria**:

- **High Reference Value** → Deprecate in place (add header, keep location)
- **Low Reference Value** → Move to `docs/archive/` (optional header)
- **Zero Value** → Delete (rare, only after team review)

---

## Automation (Future)

Consider adding pre-commit hook:

```bash
# Check for planning docs >6 months old without deprecation headers
find docs -name "*PLAN*.md" -mtime +180 -exec grep -L "DEPRECATED\|HISTORICAL\|LAST UPDATED" {} \;
```

---

**Template Version**: 1.0 **Last Updated**: 2025-12-12 **Owner**: Development
Team
