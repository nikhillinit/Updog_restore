---
status: ACTIVE
last_updated: 2026-05-20
owner: Core Team
review_cadence: P90D
categories: [tech-debt, type-safety]
keywords: [typescript, type-safety, any, type-guards, money-utils]
source_of_truth: false
related:
  - docs/governance/2026-05-19-refactor-roadmap.md
  - docs/reviews/refactor-audit-2026-05-19/code-quality-audit.md
related_code:
  - shared/utils/type-guards.ts
  - client/src/lib/type-guards.ts
  - shared/money.ts
  - shared/lib/money.ts
---

# Type Safety Remediation Summary

This summary replaces the older `TYPE-SAFETY-ACTION-PLAN.md`, whose raw counts
and file rankings were tied to a 2025-12-29 snapshot.

The durable guidance remains:

- Treat broad `any` elimination as a ratcheted cleanup, not a big-bang rewrite.
- Reuse existing type guards and branded/unit helpers before adding new local
  helpers.
- Consolidate semantic duplicates only after import matrices and behavior tests
  are in place.
- Prioritize shared financial boundaries: money utilities, type guards, schema
  barrels, and capital-allocation adapters.

The active execution order is governed by
`docs/governance/2026-05-19-refactor-roadmap.md`.
