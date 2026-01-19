---
status: ACTIVE
last_updated: 2026-01-19
---

# Team Memory: The Reflection System

This directory contains the Updog_restore repository's "Team Memory" - a collection of reflections that capture critical lessons learned, especially those related to financial logic, architectural patterns, and bug prevention.

**Goal:** Prevent logic regressions and ensure hard-won knowledge is codified and automatically shared with developers at the moment they need it.

## Guiding Principles

1.  **Codify, Don't Just Document:** Plain documentation goes stale. Reflections are machine-readable and integrated into the development workflow.
2.  **Prevent, Don't Just Detect:** The system proactively warns developers *before* they implement a known anti-pattern.
3.  **Automate and Enforce:** The index is auto-generated, and validation runs in CI to prevent drift.
4.  **Fail Loud:** Financial systems must not fail silently. Reflections and their tests enforce this principle.

## Core Components

-   **Reflections (`REFL-*.md`):** Individual markdown files capturing a single lesson - anti-pattern, risks, and verified fix.
-   **Index (`SKILLS_INDEX.md`):** Auto-generated, machine-readable index. **Do not edit manually.**
-   **Manager Script (`scripts/manage_skills.py`):** Python script to create, validate, and index reflections.
-   **Regression Tests (`tests/regressions/`):** Every `VERIFIED` reflection has a regression test.

## Integration with Existing Memory

This system complements (does not replace) existing memory:

| System | Purpose | When to Use |
|--------|---------|-------------|
| `CHANGELOG.md` | What changed | After any change |
| `DECISIONS.md` | Why we chose it | Architectural decisions |
| `docs/skills/REFL-*.md` | How to avoid bugs | After fixing a logic bug |
| `.claude/skills/` | Thinking frameworks | Workflow patterns |

## Developer Workflow

### Before You Code: `/advise`

For high-risk areas (waterfalls, reserves, fees, XIRR):

```bash
/advise "I am about to implement GP catch-up logic for European waterfall."
```

Claude consults `SKILLS_INDEX.md` and provides a pre-flight checklist.

### After Fixing a Bug: `/retrospective`

Codify valuable lessons immediately:

```bash
/retrospective --title "GP Catch-up Logic Fails on Zero IRR"
```

This creates:
1.  New reflection file (e.g., `docs/skills/REFL-004-gp-catch-up-logic-fails-on-zero-irr.md`)
2.  Corresponding test stub (e.g., `tests/regressions/REFL-004.test.ts`)
3.  Automatically rebuilds `SKILLS_INDEX.md`

### Committing a Fix

The `/commit` command detects fix keywords and prompts:

> This appears to be a fix. Create reflection? (y/n/later)

## Managing Reflections

### Creating a New Reflection

```bash
python scripts/manage_skills.py new --title "Your Reflection Title"
```

### Rebuilding the Index

```bash
python scripts/manage_skills.py rebuild
```

### Validating the System

```bash
python scripts/manage_skills.py validate
```

This runs in CI and fails on integrity errors.

## High-Risk Domains (Auto-Trigger /advise)

- Fund Logic: Waterfalls, Reserves, Fees, Carry
- State Management: Hydration, Persistence
- Math/Currency: Rounding, Precision, XIRR
- Portfolio Calculations: Capital allocation, Exit recycling

## Related Documentation

When working with the reflection system, consult these additional resources:

| Document | Purpose | When to Use |
|----------|---------|-------------|
| [SKILLS_INDEX.md](SKILLS_INDEX.md) | Reflection registry | Finding specific reflections |
| [CAPABILITIES.md](../../CAPABILITIES.md) | Available agents and tools | Before complex tasks |
| [cheatsheets/anti-pattern-prevention.md](../../cheatsheets/anti-pattern-prevention.md) | 24 cataloged anti-patterns | Code review |
| [cheatsheets/daily-workflow.md](../../cheatsheets/daily-workflow.md) | Standard development workflow | Daily reference |
| [DECISIONS.md](../../DECISIONS.md) | Architectural decisions | Understanding "why" |

### Key Agents for Reflection-Related Work

- **waterfall-specialist**: Domain expert for carry distribution calculations
- **phoenix-precision-guardian**: Precision and type-safety hardening
- **xirr-fees-validator**: Validation for XIRR and fee calculations
- **test-repair**: Autonomous test failure detection and repair
