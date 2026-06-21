---
status: DRAFT
audience: agents
last_updated: 2026-06-21
owner: 'Core Team'
review_cadence: P30D
authority: docs/adr/ADR-023-investment-event-persistence.md
related_spec: docs/superpowers/specs/2026-06-21-investment-round-persistence-l3b-design.md
---

# Investment-Round Persistence (ADR-023 L3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. **Per the workspace workflow contract,
> every edit/test in this plan is dispatched via Hermes
> (`npm run hermes:production -- --task "..."`); Claude Code plans and verifies
> only.**

**Goal:** Flip `POST /api/investments/:id/rounds` (501) into a backed,
fund-scoped, idempotent create + list + read with an append-only supersede
correction path, behind `enable_investment_rounds` (default OFF, now
enable-able).

**Architecture:** A dedicated `investment_rounds` table (NUMERIC(20,6) money),
defined in the Drizzle schema (drives `db:push` → Testcontainers test DB + prod)
and mirrored by a journaled `server/migrations/*.sql` pair (drives
`release:check` + migration-runner test). A thin service holds idempotency +
supersede logic; the existing dual-mounted `investments` router gains the round
handlers. Mirrors the `task` (#871/#873) and `cash_event` (#862–#869) precedents
exactly.

**Tech Stack:** Drizzle ORM (Postgres), Zod, Express, Vitest + supertest +
Testcontainers, TanStack Query, Decimal-string money per ADR-011. Node 20.19+,
`TZ=UTC`.

**Authority:** [ADR-023](../../adr/ADR-023-investment-event-persistence.md)
(amended 2026-06-21 — decision 5 now append-only WITH supersede). Spec:
[2026-06-21-investment-round-persistence-l3b-design.md](../specs/2026-06-21-investment-round-persistence-l3b-design.md).

---

## File structure

**PR-0 (precondition, tiny):**

- Modify: `shared/schema/portfolio.ts` (add
  `unique('investments_id_fund_id_key')` on `investments`)
- Create:
  `server/migrations/20260621_investments_id_fund_unique_v1.{up,down}.sql`
- Create: `tests/integration/migrations/investments-id-fund-unique.test.ts`

**PR-1 (feature):**

- Create: `shared/schema/investment-rounds.ts` (Drizzle table)
- Modify: `shared/schema/index.ts` (export the new table) — confirm
  `shared/schema.ts` re-chains to it
- Create: `server/migrations/20260621_z_investment_rounds_v1.{up,down}.sql`
- Create: `shared/lib/canonical-hash.ts` (extract `canonicalize`+`sha256Hex`)
- Modify: `server/services/lp-reporting/import-reconciliation-service.ts`
  (re-import from the new util — DRY, no behaviour change)
- Create: `shared/contracts/investments/investment-round.contract.ts`
- Create: `server/services/investments/investment-round-service.ts`
- Modify: `server/routes/investments.ts` (replace the 501 `/rounds` handler; add
  GET list/read)
- Rewrite: `tests/integration/investment-scenario-capability.test.ts`
- Create: `tests/unit/services/investments/investment-round-service.test.ts`
- Create: `client/src/lib/investment-round-edit-model.ts` (serializer) +
  `client/src/hooks/useCreateRound.ts`
- Create: `tests/unit/lib/investment-round-edit-model.test.ts`
- Modify: `flags/registry.yaml` (+ regenerate `shared/generated/flag-*.ts`)

---

# PR-0 — Precondition migration

### Task 0.1: Add `UNIQUE (id, fund_id)` to `investments`

**Files:**

- Modify: `shared/schema/portfolio.ts:61-91`
- Create: `server/migrations/20260621_investments_id_fund_unique_v1.up.sql`,
  `.down.sql`
- Test: `tests/integration/migrations/investments-id-fund-unique.test.ts`

- [ ] **Step 1: Write the failing schema test** —
      `tests/integration/migrations/investments-id-fund-unique.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../../helpers/test-db'; // existing Testcontainers helper

describe('investments (id, fund_id) unique', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  beforeAll(async () => {
    db = await getTestDb();
  });

  it('has a unique constraint on (id, fund_id) so it can be a composite-FK target', async () => {
    const rows = await db.execute(sql`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'investments_id_fund_id_key' AND contype = 'u'
    `);
    expect(rows.rows.length).toBe(1);
  });
});
```

> Note: confirm the real Testcontainers helper path (`tests/helpers/*`); reuse
> whatever `investment-scenario-capability` or LP integration tests already
> import. Do not invent a new harness.

- [ ] **Step 2: Run it — expect FAIL** (constraint absent)

Run:
`npm run test:integration -- tests/integration/migrations/investments-id-fund-unique.test.ts`
Expected: FAIL (0 rows).

- [ ] **Step 3: Add the unique to the Drizzle schema** — in
      `shared/schema/portfolio.ts`, import `unique` and add to the `investments`
      config callback:

```ts
import { /* …existing… */ unique } from 'drizzle-orm/pg-core';
// …
export const investments = pgTable(
  'investments',
  {
    /* …unchanged columns… */
  },
  (table) => ({
    pricingConfidenceCheck: check(
      'investments_pricing_confidence_check',
      sql`${table.pricingConfidence} IN ('calculated', 'verified')`
    ),
    // Composite-FK target for investment_rounds(investment_id, fund_id).
    // id is already unique (PK) so this is always satisfiable even where
    // fund_id is NULL; it only makes (id, fund_id) referenceable.
    idFundKey: unique('investments_id_fund_id_key').on(table.id, table.fundId),
  })
);
```

- [ ] **Step 4: Write the journaled migration** —
      `server/migrations/20260621_investments_id_fund_unique_v1.up.sql`:

```sql
-- Precondition for ADR-023 L3b: make (id, fund_id) a composite-FK target for
-- investment_rounds. id is already unique (PK); NULL fund_id rows are allowed
-- (round-create rejects NULL-fund parents at the service, no backfill needed).
ALTER TABLE investments
  ADD CONSTRAINT investments_id_fund_id_key UNIQUE (id, fund_id);
```

`.down.sql`:

```sql
ALTER TABLE investments DROP CONSTRAINT IF EXISTS investments_id_fund_id_key;
```

- [ ] **Step 5: Run test — expect PASS** (db:push picks up the Drizzle change
      for the Testcontainers DB)

Run:
`npm run test:integration -- tests/integration/migrations/investments-id-fund-unique.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check + commit**

Run: `npm run check`

```bash
git add shared/schema/portfolio.ts server/migrations/20260621_investments_id_fund_unique_v1.up.sql server/migrations/20260621_investments_id_fund_unique_v1.down.sql tests/integration/migrations/investments-id-fund-unique.test.ts
git commit -m "feat(investments): add UNIQUE (id, fund_id) composite-FK target (ADR-023 L3b precondition)"
```

> PR-0 ships and merges independently before PR-1.

---

# PR-1 — Feature (rounds + supersede + flag + safe hygiene)

The remaining tasks are sequenced. Each is one self-contained change. Detailed
per-step code lives in the companion task files written at execution time; the
contract and service signatures below are the locked interfaces every later task
depends on.

## Locked interfaces (referenced by all PR-1 tasks)

```ts
// shared/contracts/investments/investment-round.contract.ts
export const SecurityTypeSchema = z.enum([
  'equity',
  'convertible_note',
  'safe',
  'warrant',
  'other',
]);
export const InvestmentRoundCreateSchema = z
  .object({
    fundId: z.number().int().positive(), // path-consistency check
    roundName: z.string().trim().min(1).max(120),
    securityType: SecurityTypeSchema,
    roundDate: z.string().date(), // date-only, never through Date()
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('USD'),
    investmentAmount: MoneyStringSchema, // imported, NOT redeclared
    roundSize: MoneyStringSchema.optional(),
    preMoneyValuation: MoneyStringSchema.optional(),
    supersedesRoundId: z.number().int().positive().optional(),
  })
  .strict();
export const InvestmentRoundResponseSchema = z
  .object({ /* …cols… */ etag: z.string().min(1) })
  .strict();
```

```ts
// server/services/investments/investment-round-service.ts
export async function createRound(
  input,
  { database }?
): Promise<
  | { kind: 'created'; row; xmin }
  | { kind: 'replayed'; row; xmin }
  | { kind: 'key_reused' } // -> 409 idempotency_key_reused
  | { kind: 'already_superseded' } // -> 409 round_already_superseded
  | { kind: 'supersede_target_missing' } // -> 404
  | { kind: 'supersede_target_other_investment' } // -> 400
>;
export async function listRoundsForInvestment(investmentId, { database }?); // current (non-superseded) only
export async function loadRound(investmentId, roundId, { database }?);
```

### Task 1: `investment_rounds` Drizzle table + journaled migration + RESTRICT schema test

Mirror `shared/schema/operating-objects.ts` and `investment_lots`
(partial-unique-idempotency idiom at `portfolio.ts:123-125`). Columns +
constraints per the spec § Step 1. Composite FK via
`foreignKey({ columns:[t.investmentId,t.fundId], foreignColumns:[investments.id, investments.fundId] }).onDelete('restrict').onUpdate('restrict')`;
self-FK `supersedesRoundId` → `investmentRounds.id` (`(): AnyPgColumn`);
`uniqueIndex('investment_rounds_supersedes_uq').on(t.supersedesRoundId).where(sql\`supersedes_round_id
IS NOT NULL\`)`; `unique('investment_rounds_fund_idem_key').on(t.fundId,
t.idempotencyKey)`. Export from `shared/schema/index.ts`. Write the journaled `20260621_z_investment_rounds_v1.{up,down}.sql`(down drops the table). **TDD:** schema test proves (a) the table exists, (b)`DELETE
FROM
investments`where a round exists raises FK RESTRICT, (c) a second row with the same`supersedes_round_id`
raises unique violation.

### Task 2: Extract `shared/lib/canonical-hash.ts`

Move `canonicalize` + `sha256Hex` (currently private in
`import-reconciliation-service.ts:87-110`) into `shared/lib/canonical-hash.ts`
as `export function canonicalSha256(value: unknown): string`. Repoint
`import-reconciliation-service.ts` to import it (its
`computeImportPreviewHash`/`computeSourceRowHash` stay, now delegating).
**TDD:** unit test asserts key-order independence (`{a,b}` === `{b,a}`) and that
`undefined` keys are dropped. Run the existing
`import-reconciliation-service.test.ts` to prove no behaviour change.

### Task 3: Shared Zod contract

Write `shared/contracts/investments/investment-round.contract.ts` per the locked
interface. **Import** `MoneyStringSchema`/`DecimalStringSchema` from
`@shared/contracts/lp-reporting/cash-flow-event.contract` (never redeclare).
`.strict()` response so `created_by`/`request_hash`/`idempotency_key` can never
leak. **TDD:** contract unit test — valid payload parses; 7-dp money rejects;
unknown key rejects; `supersedesRoundId` optional.

### Task 4: Service

Write `server/services/investments/investment-round-service.ts` mirroring
`task-service.ts` (explicit column map + `sql<string>\`xmin::text\``, `{
database }`DI seam,`splitXmin`). `createRound`:

1. compute
   `requestHash = canonicalSha256({ investmentId, fundId, roundName, securityType, roundDate, currency, investmentAmount, roundSize, preMoneyValuation, supersedesRoundId })`.
2. if `supersedesRoundId`: load it; missing → `supersede_target_missing`;
   different investment → `supersede_target_other_investment`;
   already-superseded (a row referencing it exists) → `already_superseded`.
3. `INSERT … ON CONFLICT (fund_id, idempotency_key) DO NOTHING RETURNING <cols+xmin>`.
   Row returned → `created`. No row → SELECT existing by
   `(fund_id, idempotency_key)`, compare `request_hash`: equal → `replayed`;
   differ → `key_reused`.
4. wrap the insert in try/catch: a `23505` on `investment_rounds_supersedes_uq`
   (concurrent supersede race) → `already_superseded`. `listRoundsForInvestment`
   returns rows where no other row's `supersedes_round_id` points at them,
   newest-first. **TDD:** service unit tests with a mocked DB seam cover created
   / replayed / key_reused / supersede happy + already_superseded.

### Task 5: Routes (extend `server/routes/investments.ts`)

Replace the 501 `/investments/:id/rounds` POST handler and add
`GET /investments/:id/rounds` + `GET /investments/:id/rounds/:roundId`. Pattern
(mirror `operating-object-tasks.ts` error ordering, but fund is **derived**):
parse `:id` → load investment via service (NOT storage in the new path) → 404 if
absent → `enforceProvidedFundScope(req, res, investment.fundId)` → read
`Idempotency-Key` via the `getIdempotencyKey` idiom
(`headers['idempotency-key'] ?? ['x-idempotency-key']`) → 428 if missing (create
only) → `InvestmentRoundCreateSchema.safeParse` → 400 → body `fundId` must equal
derived → 400 → `createRound(...)` → map result kinds to 201/200/409/404/400 →
`InvestmentRoundResponseSchema.parse` for the body. The two GETs run the same
load-investment + `enforceProvidedFundScope` before returning (closes the
read-path IDOR — ADR finding D). `cases` 501 handler untouched. The round
handlers import only the service (no new `../db`/`../storage`); the file's
existing `storage` import stays for legacy handlers.

### Task 6: Integration test rewrite

Rewrite `tests/integration/investment-scenario-capability.test.ts` against
Testcontainers + a seeded fund/investment + a scoped bearer token. Assert:
**201** create (full payload + `Idempotency-Key`); **200** exact retry replay;
**409** same key/different body; **428** missing key; **403** cross-fund;
**404** unknown investment; supersede happy (create→supersede→list shows the
corrector, not the original) + **409** double-supersede. `cases` stays **501**.
**Teardown:** `TRUNCATE investment_rounds RESTART IDENTITY CASCADE` (append-only
rows have no delete route — #890 teardown lesson) and close any owned pool.

### Task 7: Client hook + serializer

`client/src/lib/investment-round-edit-model.ts` (framework-free, mirror
`cash-event-edit-model.ts`): map currency **label → ISO-4217** and JS **number →
DecimalString**; `roundDate` stays date-only.
`client/src/hooks/useCreateRound.ts` (TanStack mutation) POSTs with
`Content-Type: application/json` (avoids the makeApp 415 body-less guard) and a
generated `Idempotency-Key`. **TDD:** serializer unit test (label→ISO,
2.5→"2.5", date-only preserved). No live UI mount (deferred).

### Task 8: Feature flag

Add to `flags/registry.yaml` (mirror `enable_operations_hub` shape):
`enable_investment_rounds`, `default: false`, all environments `false`,
`exposeToClient: true`, `risk: medium`, `owner: 'gp-team'`, `dependencies: []`,
`expiresAt: '2026-12-31'`. Regenerate: `npx tsx scripts/generate-flag-types.ts`
(confirm exact invocation) and commit the regenerated
`shared/generated/flag-types.ts` + `flag-defaults.ts`. Mount-gate the (future)
client surface on it.

### Task 9: Folded hygiene (reversible only)

- Verify-then-prune worktrees: for each of `Updog_restore_lp_dashboard_runtime`,
  `updog-pr864-ci-fix`, `Updog_restore_pr881_ci` run
  `git -C <wt> status --porcelain` (must be empty) and confirm no commits ahead
  of the merged SHA, then `git worktree remove <wt>`.
- Delete merged local branches (`git branch --merged main` minus `main`).
- Archive the 3 loose docs **only** after running the CLAUDE.md Archive Gate per
  file (git-log landed/obsolete + grep feature-gone + not-an-active-handoff) and
  citing the three checks for each in the PR body; apply the Derivability Test
  to `CRITICAL-REVIEW-secondary-surface-governance.md` (keep if non-derivable).
- **Do NOT touch the 136 stashes.**

---

## Verification (whole milestone)

- `npm run check` (baseline:check), `npm run lint` (incl.
  `guard:route-imports`), targeted `vitest run` for unit suites — all green.
- Integration suite does **not** run on a feature PR automatically (test-smart
  skips, test-full is main-gated). Dispatch it:
  `gh workflow run ci-unified.yml --ref <branch> -f run_full_suite=true`, then
  grep the **Test-integration** log for `investment-scenario-capability` and the
  migrations test.
- `CI Gate Status` is the required check.
- ADR-023 already amended (decision 5) — done in `cde71d74`.

---

## Self-review

- **Spec coverage:** PR-0 = precondition; Tasks 1-8 = spec Steps 1-8 (Task
  1=table, 2=hash util [enables Step 3 idempotency], 3=contract, 4=service,
  5=routes, 6=integration test, 7=hook, 8=flag); Task 9 = reversible hygiene.
  Supersede covered in Tasks 1/3/4/5/6. No spec requirement unmapped.
- **Placeholder scan:** locked interfaces + per-task file lists are concrete;
  the few "confirm exact path" notes (Testcontainers helper, flag-gen
  invocation) are verification instructions, not deferred logic — the
  implementer confirms by grep, the design is fixed.
- **Type consistency:** `createRound` result-kind union (Task 4) ↔ route status
  mapping (Task 5) ↔ integration assertions (Task 6) all use the same kinds;
  `MoneyStringSchema` imported everywhere (never redeclared);
  `supersedesRoundId` named identically in contract/service/route/test.
- **Granularity caveat:** Tasks 1-9 are summarized at the change-unit level (not
  every micro-step) because each mirrors a named, already-merged precedent file;
  expand each into write-test→fail→implement→pass→commit steps at execution time
  using the cited precedent as the literal template.
