# Phase 3 Internal Documentation Hub

> **Purpose:** Accelerate developer onboarding from 2 weeks → 3-5 days by
> documenting 6 critical undocumented systems.

**Target Audience:** You (after breaks), first collaborator, future maintainers

**Documentation Standard:** 90%+ clarity/completeness/utility (internal
reference, not marketing)

---

## Quick Start

**New to the codebase?** Start here:

1. [Database Schema & Drizzle ORM](database/01-overview.md) - Foundation layer
2. [Data Validation with Zod](validation/01-overview.md) - Type safety patterns
3. [API Layer Reference](api/01-overview.md) - 31 documented endpoints
4. [TanStack Query Guide](state/01-overview.md) - Frontend state management
5. [Testing Architecture](testing/01-multi-project.md) - Vitest multi-project
   setup
6. [AI Agent System](agents/01-overview-and-base.md) - Autonomous development

**Adding a new feature?**

- API endpoint: [api/02-validation.md](api/02-validation.md) +
  [api/05-integration.md](api/05-integration.md)
- Validation schema:
  [validation/02-zod-patterns.md](validation/02-zod-patterns.md)
- State management: [state/02-queries.md](state/02-queries.md) +
  [state/03-mutations.md](state/03-mutations.md)

---

## Documentation Map

### Foundation Layer (Week 46)

**Database** - Drizzle ORM, CQRS patterns, connection pooling

- [01-overview.md](database/01-overview.md) - Architecture decisions, schema
  design
- [02-patterns.md](database/02-patterns.md) - Query patterns, transactions,
  migrations
- [03-optimization.md](database/03-optimization.md) - Pooling, indexes,
  performance

**Validation** - Zod schemas, discriminated unions, type guards

- [01-overview.md](validation/01-overview.md) - Strategy, integration points
- [02-zod-patterns.md](validation/02-zod-patterns.md) - Schema composition,
  refinements
- [03-type-system.md](validation/03-type-system.md) - Discriminated unions, type
  guards
- [04-integration.md](validation/04-integration.md) - Frontend ↔ backend ↔
  database sync

### Interface Layer (Week 47)

**API** - REST patterns, validation pipeline, idempotency

- [01-overview.md](api/01-overview.md) - Architecture, conventions, error
  handling
- [02-validation.md](api/02-validation.md) - Zod validation, error propagation
- [03-middleware.md](api/03-middleware.md) - Async handlers, rate limiting,
  tracing
- [04-storage.md](api/04-storage.md) - Abstraction layer, idempotency, caching
- [05-integration.md](api/05-integration.md) - Frontend consumption, retry logic

**State Management** - TanStack Query, cache strategy, optimistic updates

- [01-overview.md](state/01-overview.md) - Architecture, design decisions
- [02-queries.md](state/02-queries.md) - Query patterns, cache management
- [03-mutations.md](state/03-mutations.md) - Optimistic updates, invalidation
- [04-integration.md](state/04-integration.md) - Engine integration, performance

### Application Layer (Week 48)

**AI Agents** - BaseAgent, memory, thinking, orchestration

- [01-overview-and-base.md](agents/01-overview-and-base.md) - Architecture +
  base patterns
- [02-memory.md](agents/02-memory.md) - Memory system, conversation cache
- [03-failure-and-cost.md](agents/03-failure-and-cost.md) - Error handling,
  budget
- [04-quick-reference.md](agents/04-quick-reference.md) - Common recipes,
  examples

**Testing** - Vitest multi-project, fixtures, path aliases

- [01-multi-project.md](testing/01-multi-project.md) - Server vs client
  environments
- [02-fixtures.md](testing/02-fixtures.md) - Test data, mocks, golden datasets
- [03-micro-benchmark.md](testing/03-micro-benchmark.md) - Performance testing

### Supporting Documentation

**Architecture** - Visual diagrams and system overviews

- [state-flow.md](architecture/state-flow.md) - Data flow across the stack
  (Mermaid)

**Checklists** - Quality gates and processes

- [definition-of-done.md](checklists/definition-of-done.md) - 10-line DoD
  template
- [self-review.md](checklists/self-review.md) - 5-question quality check

**Maintenance** - Keeping docs fresh

- [maintenance.md](maintenance.md) - Quarterly ritual (1h every 3 months)

---

## Documentation Conventions

### Structure

- **Hub-and-spoke:** Complex systems split into 3-6 files (not monolithic)
- **Progressive disclosure:** Simple concepts → details → integration →
  scenarios
- **Design Rationale:** Every module has "Why" section (from Why-Questions
  workflow)
- **Tiny DoD:** Every file has 10-line Definition of Done footer

### Code References

- File links: `[schema.ts](../shared/schema.ts)`
- Line references: `[fund-calc.ts:142](../server/lib/fund-calc.ts#L142)`
- Auto-generated via `node scripts/extract-code-references.mjs`

### Examples

- Copy-paste ready (no placeholders, includes imports)
- Runnable commands with expected output
- Edge cases demonstrated (not just happy path)

### Quality Standards

- **90%+ human review score** (clarity, completeness, utility)
- **Self-validation:** Agent creates VALIDATION-NOTES.md
- **Ultimate test:** Can implement feature using only docs in 2-4h after break

---

## Maintenance

**Quarterly Ritual** (1 hour every 3 months):

1. Run staleness check: `node scripts/extract-code-references.mjs --check-stale`
2. Fix broken anchors and outdated examples
3. Add new patterns discovered during development
4. Update Next Review dates in DoD footers

**Next Review:** 2026-02-06 (3 months from Phase 3 completion)

See [maintenance.md](maintenance.md) for detailed process.

---

## Success Metrics

Phase 3 delivers value when:

- ✅ You can onboard yourself after 6-month break in 2-4 hours
- ✅ First collaborator onboards in 3-5 days (vs 2 weeks without docs)
- ✅ API integration time: 2 days → 8 hours (75% reduction)
- ✅ Examples work when copy-pasted (zero placeholders)
- ✅ Docs answer "why" not just "what" (Design Rationale present)

**ROI:** $289K-668K over 5 years (145-445x return on 25-33h investment)

---

## Navigation Tips

**I want to...**

- Understand the database schema →
  [database/01-overview.md](database/01-overview.md)
- Add a new API endpoint → [api/05-integration.md](api/05-integration.md)
- Write a Zod schema →
  [validation/02-zod-patterns.md](validation/02-zod-patterns.md)
- Manage cache with TanStack Query → [state/02-queries.md](state/02-queries.md)
- Create a custom AI agent →
  [agents/04-quick-reference.md](agents/04-quick-reference.md)
- Fix a test failure →
  [testing/01-multi-project.md](testing/01-multi-project.md)
- See data flow visually →
  [architecture/state-flow.md](architecture/state-flow.md)

**I need to know...**

- Why Drizzle over Prisma? →
  [database/01-overview.md#design-rationale](database/01-overview.md#design-rationale)
- How idempotency works →
  [api/04-storage.md#idempotency](api/04-storage.md#idempotency)
- Cache invalidation strategy →
  [state/03-mutations.md#invalidation](state/03-mutations.md#invalidation)
- Common testing mistakes →
  [testing/01-multi-project.md#gotchas](testing/01-multi-project.md#gotchas)

---

**Created:** November 6, 2025 **Phase:** 3 (Documentation) **Status:** Week 46
infrastructure setup complete **Contributors:** You (solo dev)
