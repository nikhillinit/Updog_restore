---
status: HISTORICAL
last_updated: 2026-01-19
---

# Superpowers Skills Integration Summary

**Date**: 2025-11-07 **Source**:
[obra/superpowers](https://github.com/obra/superpowers)

## Overview

Updated project documentation to reflect the comprehensive Superpowers skills
library—a collection of 28 structured thinking frameworks and workflow patterns
that **auto-activate when relevant** to ensure consistent best practices.

## Changes Made

### 1. CAPABILITIES.md - Major Update

**Skills Library Section Expanded from 13 to 28 skills across 6 categories:**

#### New Categories Added:

- **🧪 Testing Skills (3)**
  - `test-driven-development` ⭐ - RED-GREEN-REFACTOR cycle (auto-activates)
  - `condition-based-waiting` - Async test patterns without flaky timeouts
  - `testing-anti-patterns` - Prevent common testing mistakes

- **🐛 Debugging & Problem Solving (4)** - Enhanced with:
  - `verification-before-completion` ⭐ - Evidence before assertions
  - `defense-in-depth` - Multi-layer validation

- **🤝 Collaboration Skills (9)** - NEW category with:
  - `executing-plans` - Batch execution with review checkpoints
  - `requesting-code-review` - Pre-review checklist
  - `receiving-code-review` - Technical rigor over blind agreement
  - `using-git-worktrees` - Parallel development isolation
  - `finishing-a-development-branch` - Merge/PR decision workflow
  - `subagent-driven-development` - Fast iteration with quality gates

- **📖 Meta Skills (4)** - NEW category:
  - `writing-skills` - TDD for process documentation
  - `sharing-skills` - Contribute skills upstream
  - `testing-skills-with-subagents` - Validate skill quality
  - `using-superpowers` ⭐ - Mandatory skill usage workflows

#### Workflow Patterns Updated:

Added Superpowers-enforced workflows:

1. **TDD Feature Development** - test-driven-development auto-activation
2. **Debugging Workflow** - systematic-debugging with mandatory root cause phase
3. **Feature Planning Workflow** - brainstorming → writing-plans →
   subagent-driven-development
4. **Plan Execution Workflow** - executing-plans with review checkpoints
5. **Code Review Workflow** - requesting-code-review → receiving-code-review

#### Most Commonly Forgotten Section:

Updated to highlight:

- 28 Superpowers skills with auto-activation
- Mandatory workflows (test-driven-development, systematic-debugging,
  verification-before-completion)
- using-superpowers skill as the entry point

### 2. CLAUDE.md - Superpowers Reference Added

Added new section: **Superpowers Slash Commands (if installed)**

- `/superpowers:brainstorm` - Socratic design refinement
- `/superpowers:write-plan` - Detailed implementation plans
- `/superpowers:execute-plan` - Batch execution with checkpoints

Included note about auto-activation and reference to CAPABILITIES.md for
complete library.

## Key Concepts: Auto-Activation

**Critical Feature**: Skills activate automatically when relevant:

- `test-driven-development` → Activates when implementing features
- `systematic-debugging` → Activates when debugging (enforces "NO FIXES WITHOUT
  ROOT CAUSE")
- `verification-before-completion` → Activates before claiming work done
- `brainstorming` → Recommended before writing code

This makes workflows **mandatory** rather than optional, ensuring consistent
quality.

## Agent Integration

Agents should now:

1. **Check CAPABILITIES.md FIRST** for available skills before implementing
   workflows
2. **Use Superpowers skills** via `Skill("skill-name")` tool
3. **Follow auto-activated workflows** when they trigger (e.g.,
   systematic-debugging during bug fixes)
4. **Leverage collaboration skills** for complex tasks
   (subagent-driven-development, executing-plans)
5. **Use meta skills** to improve the skills library itself (writing-skills,
   testing-skills-with-subagents)

## Benefits for This Project

### VC Fund Modeling Context

**Typical workflows now have structure**:

- **Engine optimization**: test-driven-development →
  verification-before-completion
- **Waterfall changes**: inversion-thinking → systematic-debugging →
  defense-in-depth
- **API routes**: writing-plans → subagent-driven-development (follow existing
  patterns)
- **Test failures**: systematic-debugging (root cause first) →
  verification-before-completion

### Quality Gates

1. **TDD enforced** - test-driven-development activates during feature work
2. **Root cause required** - systematic-debugging prevents symptomatic fixes
3. **Evidence required** - verification-before-completion before claiming
   success
4. **Code review rigor** - receiving-code-review demands technical verification

### Multi-Agent Coordination

- `subagent-driven-development` - Fast iteration with code review between tasks
- `dispatching-parallel-agents` - Concurrent investigation of independent
  failures
- `executing-plans` - Batch execution with human review checkpoints

## Documentation Structure

```
CAPABILITIES.md (PRIMARY REFERENCE)
├── Skills Library (28 skills across 6 categories)
│   ├── Testing Skills (3)
│   ├── Debugging & Problem Solving (4)
│   ├── Collaboration Skills (9)
│   ├── Thinking Frameworks (4)
│   ├── Memory & Knowledge (2)
│   └── Meta Skills (4)
├── Workflow Patterns (7 updated workflows)
└── Most Commonly Forgotten (Superpowers highlighted)

CLAUDE.md (QUICK REFERENCE)
└── Superpowers Slash Commands section
    └── References CAPABILITIES.md for complete library

.claude/skills/README.md (DETAILED GUIDE)
└── Individual skill documentation with examples
```

## Next Steps for Users

1. **Read CAPABILITIES.md** - See complete 28-skill library
2. **Explore `.claude/skills/README.md`** - Detailed skill documentation
3. **Use skills via Skill tool** - `Skill("test-driven-development")`
4. **Trust auto-activation** - Skills trigger when relevant
5. **Install slash commands (optional)** - `/superpowers:brainstorm`, etc.

## Statistics

- **Skills Added**: 15 new skills (13 → 28 total)
- **Categories**: 6 (added Testing, Collaboration, Meta)
- **Workflows Updated**: 7 comprehensive workflows
- **Auto-Activation**: 6 skills with automatic triggering
- **Lines Changed**: 155+ lines across 2 core documentation files

## Validation

✅ CAPABILITIES.md updated with complete Superpowers library ✅ CLAUDE.md
references Superpowers with link to CAPABILITIES.md ✅ Workflow patterns updated
to reflect auto-activation ✅ Most Commonly Forgotten section highlights new
skills ✅ Clear distinction between auto-activated and manual skills ✅
Integration with existing project tools documented

---

**Status**: ✅ Complete - Documentation updated to reflect obra/superpowers
integration
