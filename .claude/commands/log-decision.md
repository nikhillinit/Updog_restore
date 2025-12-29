---
description: "Guided ADR (Architecture Decision Record) entry for DECISIONS.md"
argument-hint: "[title]"
allowed-tools: Read, Write, Edit, Grep
---

# Log Decision - ADR Entry

Add a structured Architecture Decision Record (ADR) to DECISIONS.md.

## When to Use

Use this command when:
- Making architectural choices (framework, library, pattern)
- Choosing between competing approaches
- Establishing new conventions or standards
- Making trade-offs that affect future development
- Deprecating or removing significant functionality

## ADR Format

```markdown
### ADR-XXX: [Title]

**Date**: YYYY-MM-DD
**Status**: [Proposed | Accepted | Deprecated | Superseded by ADR-YYY]

#### Context

[What is the issue that motivated this decision?]
[What constraints or requirements exist?]

#### Decision

[What is the change being proposed or made?]

#### Consequences

**Positive:**
- [Benefit 1]
- [Benefit 2]

**Negative:**
- [Trade-off 1]
- [Trade-off 2]

**Neutral:**
- [Side effect that's neither good nor bad]
```

## Workflow

1. **Check existing ADRs**: Read DECISIONS.md to get next ADR number
2. **Identify context**: What problem are we solving?
3. **Document alternatives**: What other options were considered?
4. **Record the decision**: What did we choose and why?
5. **Note consequences**: What are the trade-offs?

## Example ADR

```markdown
### ADR-014: Use Decimal.js for Financial Calculations

**Date**: 2025-12-29
**Status**: Accepted

#### Context

Financial calculations in waterfall distributions and XIRR were experiencing
precision drift due to floating-point arithmetic. Excel parity tests were
failing intermittently with 1e-7 tolerance.

#### Decision

Adopt Decimal.js for all financial calculations, replacing native JavaScript
number operations where precision matters.

#### Consequences

**Positive:**
- Eliminates floating-point precision errors
- Achieves consistent Excel parity (1e-10 tolerance possible)
- Industry-standard approach for financial software

**Negative:**
- Performance overhead (~3x slower than native numbers)
- Additional dependency (18KB gzipped)
- Learning curve for team

**Neutral:**
- Requires migration of existing calculations
```

## ADR Number Assignment

Before creating a new ADR:

```bash
grep -E "^### ADR-[0-9]+" DECISIONS.md | tail -1
```

Use the next sequential number. Current highest should be ADR-013.

## Quality Checklist

Before completing:
- [ ] ADR number is sequential (no gaps or conflicts)
- [ ] Context clearly explains the problem
- [ ] Decision is specific and actionable
- [ ] Consequences include both positive and negative
- [ ] Status is set (usually "Accepted" for new ADRs)
- [ ] Date stamp present (YYYY-MM-DD)
- [ ] No emojis used (per CLAUDE.md policy)

## Related Files

- `DECISIONS.md` - Main ADR file in project root
- `docs/adr/` - Extended ADR documentation (numbered ADR-010+)
- `CHANGELOG.md` - Reference ADRs when logging related changes

## Warning: ADR Number Conflicts

Per DISCOVERY-MAP.md, ADR-010 through ADR-012 exist in BOTH `DECISIONS.md`
and `docs/adr/` with different content. When referencing these ADRs,
specify the file path explicitly until resolved.
