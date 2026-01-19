---
status: HISTORICAL
last_updated: 2026-01-19
---

# Next Session Kickoff Prompt

**Copy and paste this into your next Claude Code session:**

---

## Portfolio Route Phase 2: API Contracts & Schemas

I'm continuing the Portfolio Route Lot-Level MOIC implementation from Phase 1 (schema complete).

**Context:**
- Branch: `feat/portfolio-lot-moic-schema` (6 commits, clean working tree)
- Phase 1: ✅ COMPLETE (database schema, migrations, tests, agent memory)
- Phase 2: Define API contracts + request/response schemas (4-6 hours)
- Read: `HANDOFF-MEMO-SCHEMA-TDD-PHASE1-COMPLETE.md` for full context

**Immediate Tasks:**

1. **Verify clean branch state:**
   ```bash
   git branch --show-current  # feat/portfolio-lot-moic-schema
   git status                 # Clean working tree
   git log --oneline -6       # Review commits
   ```

2. **Create PR for Phase 1 (optional but recommended):**
   ```bash
   git push -u origin feat/portfolio-lot-moic-schema
   gh pr create --title "feat(schema): Portfolio Route Lot-Level MOIC - Phase 1"
   ```

3. **Begin Phase 2 - Define API Contracts:**

   Use **docs-architect agent** to create frozen data contracts:
   - `docs/api/contracts/portfolio-route-v1.md`
   - Include: InvestmentLotV1, ForecastSnapshotV1, ReserveAllocationV1
   - With: TypeScript types, Zod schemas, API examples

4. **Create API Request/Response Schemas:**

   Use **code-reviewer agent** with strict coding pairs (10-20 line cycles):
   - File: `shared/schemas/portfolio-route.ts`
   - POST snapshot request schema (with pagination)
   - GET snapshot response schema (with cursor)
   - POST lot request schema (with idempotency)
   - PUT snapshot request schema (with optimistic locking)

**Workflow:**
- ✅ Use **agent-first approach** (75% time savings from Phase 1)
- ✅ Use **strict coding pairs** (10-20 line review cycles with code-reviewer)
- ✅ Follow **test-driven-development** skill (RED-GREEN-REFACTOR)
- ✅ Apply **verification-before-completion** (evidence before claims)

**Agent Memory:**
- Load learnings: `cheatsheets/agent-memory/database-expert-schema-tdd.md`
- Patterns: Idempotency, partial unique indices, BigInt mode, timezone support

**Success Criteria Phase 2:**
- [ ] Frozen contracts documented (`docs/api/contracts/portfolio-route-v1.md`)
- [ ] Request/response schemas created (`shared/schemas/portfolio-route.ts`)
- [ ] All schemas validated with code-reviewer (10-20 line cycles)
- [ ] 2-3 clean commits (contracts → schemas)

**Time Estimate:** 4-6 hours

**Key Decisions from Phase 1:**
- Partial unique indices essential for nullable idempotency keys
- BigInt mode critical for financial precision (>$90M amounts)
- Timezone support required for multi-region deployments
- Integration tests optional (use `npm run db:studio` for schema validation)

---

**Ready to start Phase 2?** Reply with: "Yes, begin Phase 2 with docs-architect agent for contracts"
