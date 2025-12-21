# Cheatsheets Index

Complete reference to all 30 project cheatsheets, organized by category.

**Quick Navigation:** Use Ctrl+F / Cmd+F to search for specific topics.

---

## Agent System (3 files)

- **[agent-architecture.md](agent-architecture.md)** - Cookbook patterns,
  orchestrator-workers, evaluator-optimizer workflows
- **[multi-agent-orchestration.md](multi-agent-orchestration.md)** -
  Coordination strategies, parallel execution, context sharing
- **[agent-memory-integration.md](agent-memory-integration.md)** - Memory
  enablement guide, Redis + Native memory, pattern learning

---

## Workflows (5 files)

- **[daily-workflow.md](daily-workflow.md)** - Day-to-day development patterns
- **[document-review-workflow.md](document-review-workflow.md)** - Plan
  verification, code-is-truth protocol
- **[pr-review-workflow.md](pr-review-workflow.md)** - Pull request checklist,
  review standards
- **[evaluator-optimizer-workflow.md](evaluator-optimizer-workflow.md)** -
  Closed-loop refinement, iterative improvement
- **[correct-workflow-example.md](correct-workflow-example.md)** - Reference
  implementation

---

## Memory Management (3 files)

- **[memory-commands.md](memory-commands.md)** - `/log-change`, `/log-decision`
  usage patterns
- **[memory-patterns.md](memory-patterns.md)** - Session/project/longterm
  scopes, Redis + Native memory
- **[memory-commit-strategy.md](memory-commit-strategy.md)** - Version control
  integration, CHANGELOG conventions

---

## Testing (2 files + skills)

- **[testing.md](testing.md)** - Test strategy, Vitest configuration, golden
  test suites, TDD workflows
- **[service-testing-patterns.md](service-testing-patterns.md)** - API/service
  test patterns, integration testing

**Related Skills & Agents** (in `.claude/`):

- **test-scaffolder agent** - Scaffold test infrastructure for new modules
- **test-fixture-generator skill** - Factory functions, golden datasets,
  generators
- **test-pyramid skill** - E2E scope control, test level governance
- **test-repair agent** - Fix failures + flakiness detection

---

## Quality & Guidelines (6 files)

- **[anti-pattern-prevention.md](anti-pattern-prevention.md)** - 24 cataloged
  patterns, prevention strategies, quality gates
- **[claude-code-best-practices.md](claude-code-best-practices.md)** - Tool
  usage, workflow optimization
- **[claude-commands.md](claude-commands.md)** - Slash command reference
- **[claude-md-guidelines.md](claude-md-guidelines.md)** - Meta-documentation
  (CLAUDE.md maintenance guidelines)
- **[emoji-free-documentation.md](emoji-free-documentation.md)** - No-emoji
  policy, approved replacements
- **[documentation-validation.md](documentation-validation.md)** - Promptfoo
  evaluation framework

---

## Code Quality (3 files)

- **[ai-code-review.md](ai-code-review.md)** - MCP-based review integration,
  multi-AI collaboration
- **[exact-optional-property-types.md](exact-optional-property-types.md)** -
  TypeScript precision patterns
- **[react-performance-patterns.md](react-performance-patterns.md)** - Frontend
  optimization, bundle analysis

---

## Development Workflows (5 files)

- **[capability-checklist.md](capability-checklist.md)** - Pre-implementation
  verification
- **[coding-pairs-playbook.md](coding-pairs-playbook.md)** - Pair programming
  patterns
- **[extended-thinking.md](extended-thinking.md)** - Deep reasoning integration
  (ThinkingMixin)
- **[init-vs-update.md](init-vs-update.md)** - `/init` command usage
- **[prompt-improver-hook.md](prompt-improver-hook.md)** - Hook configuration

---

## API & Integration (1 file)

- **[api.md](api.md)** - REST endpoint conventions, Zod validation, Express
  patterns

---

## Miscellaneous (2 files)

- **[command-summary.md](command-summary.md)** - npm scripts quick reference
- **[pr-merge-verification.md](pr-merge-verification.md)** - Baseline test
  comparison, merge criteria

---

## Usage Tips

### Finding What You Need

**For specific tasks:**

- Testing → `testing.md`, `service-testing-patterns.md`
- Code review → `ai-code-review.md`, `pr-review-workflow.md`
- Memory/logging → `memory-commands.md`, `memory-patterns.md`
- Quality → `anti-pattern-prevention.md`, `claude-code-best-practices.md`

**For workflows:**

- Daily development → `daily-workflow.md`
- Document review → `document-review-workflow.md`
- Iterative refinement → `evaluator-optimizer-workflow.md`

**For guidelines:**

- CLAUDE.md maintenance → `claude-md-guidelines.md`
- Documentation standards → `emoji-free-documentation.md`,
  `documentation-validation.md`
- API design → `api.md`

---

## Maintenance

**Adding new cheatsheets:**

1. Create file in `cheatsheets/` directory
2. Add entry to appropriate category in this INDEX
3. Update CLAUDE.md if it's a core workflow reference
4. Run `npm run validate:claude-md` to verify links

**Last updated:** 2025-12-14
