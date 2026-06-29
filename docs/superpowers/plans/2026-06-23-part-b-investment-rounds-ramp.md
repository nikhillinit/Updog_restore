# Part B — `enable_investment_rounds` Dev→Staging Ramp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ramp the `enable_investment_rounds` feature flag through dev and
staging only (config + one regression test + manual smoke), leaving production
OFF, so the investment-rounds vertical is proven on real data before the prod
gate.

**Architecture:** Config-only ramp. The backend rounds API + supersede are
already mounted (`server/app.ts:215`) and fund-scoped by PR-H1. The live UI
(`portfolio-company-summary.tsx:75`) gates on
`useFlag('enable_investment_rounds')`, which resolves through
`client/src/shared/useFlags.ts` in priority order: runtime override
(`?ff_…`/localStorage) → `VITE_ENABLE_INVESTMENT_ROUNDS` build env →
`ALL_FLAGS[key].enabled` (static `false`) → `false`. **The live UI never reads
`flags/registry.yaml` or the generated defaults.** Therefore the per-environment
client lever is the `VITE_*` build env, NOT the registry and NOT the global
`ALL_FLAGS.enabled` bit.

**Tech Stack:** Vite + React client, YAML flag registry + codegen
(`npx tsx scripts/generate-flag-types.ts`), Vitest (jsdom client project),
Drizzle/Postgres, `npx tsx scripts/seed-db.ts` for investment seed data.

**Source of corrections:** This plan supersedes
`.claude/artifacts/part-b-handoff.md` where the two diverge. Corrections
verified in the Hermes debate (`.claude/artifacts/part-b-debate.md`): (1) the
live UI lever is `VITE_*`, not a per-env branch in `flag-definitions.ts` (that
branch does not exist); (2) the investment seeder is `scripts/seed-db.ts`, NOT
the handoff's non-existent `server/seed-db.ts`, and NOT
`server/seed-demo-data.ts` (which seeds no investments).

---

## File Structure

| File                                                                  | Responsibility                                                                                       | Action                                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `tests/unit/flags/enable-investment-rounds.test.tsx`                  | Pin the corrected resolver model: dev-on via `VITE_*`, prod-off, global-default-stays-false tripwire | Modify (extend)                                                                    |
| `flags/registry.yaml`                                                 | Declared per-env source of truth + server/generated surface                                          | Modify (dev, later staging → true; prod stays false)                               |
| `shared/generated/flag-defaults.ts`, `shared/generated/flag-types.ts` | Generated server/default surface                                                                     | Regenerate via `npm run flags:generate`                                            |
| `.env.development`                                                    | Dev build env — the live-UI lever for dev                                                            | Modify (add `VITE_ENABLE_INVESTMENT_ROUNDS=true`)                                  |
| `.env.production`                                                     | Prod build env — explicit prod-off, matches existing `VITE_ENABLE_*=false` rows                      | Modify (add `VITE_ENABLE_INVESTMENT_ROUNDS=false`)                                 |
| Staging deploy env (`.env.staging`/Vercel staging)                    | Staging build env — staging lever                                                                    | Modify in Task 5 only (gated on PR-H2 in flight)                                   |
| `shared/feature-flags/flag-definitions.ts`                            | Client `ALL_FLAGS` registry                                                                          | **DO NOT EDIT** — `enabled` MUST stay `false`. Flipping it is the prod-leak NO-GO. |

**Do NOT in this PR:** add new `docs/**/*.md` (triggers `router-index` regen /
"Validate Discovery Routing"); add new `tests/integration/**` (won't auto-run on
the PR — needs
`gh workflow run ci-unified.yml --ref <branch> -f run_full_suite=true`). This
plan doc itself is a working artifact; if you commit it, regenerate
`docs/_generated/router-index.json` in a separate commit, or keep it out of the
feature PR.

---

## Task 1: Pin the corrected resolver model with regression tests

The existing test already guards `ALL_FLAGS.enabled===false` (line 18 — the
prod-leak tripwire) and the localStorage override. Extend it to pin the `VITE_*`
env lever, which is the actual dev/staging mechanism the rest of this plan
relies on. These are regression guards: they assert existing behavior so it
cannot silently break.

**Files:**

- Modify: `tests/unit/flags/enable-investment-rounds.test.tsx`

- [ ] **Step 1: Replace the test file with the extended guard suite**

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ALL_FLAGS } from '@shared/feature-flags/flag-definitions';
import { useFlag } from '@/shared/useFlags';

// Regression guards for the Part B ramp. The live UI resolves the flag via
// client/src/shared/useFlags.ts in priority order:
//   runtime (?ff_/localStorage) ?? VITE_ENABLE_INVESTMENT_ROUNDS ?? ALL_FLAGS.enabled ?? false
// The per-environment lever is the VITE_* build env, NOT a per-env branch in
// flag-definitions.ts (none exists) and NOT the global ALL_FLAGS.enabled bit
// (flipping that enables prod too — the NO-GO tripwire below).
describe('enable_investment_rounds flag registration', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('is registered in ALL_FLAGS and the global default stays OFF (prod-leak tripwire)', () => {
    expect(Object.keys(ALL_FLAGS)).toContain('enable_investment_rounds');
    expect(ALL_FLAGS['enable_investment_rounds']?.enabled).toBe(false);
  });

  it('defaults OFF but is runtime-overridable (manual dev verification)', () => {
    const off = renderHook(() => useFlag('enable_investment_rounds'));
    expect(off.result.current).toBe(false);

    window.localStorage.setItem('ff_enable_investment_rounds', '1');
    const on = renderHook(() => useFlag('enable_investment_rounds'));
    expect(on.result.current).toBe(true);
  });

  it('VITE_ENABLE_INVESTMENT_ROUNDS=true is the per-environment ON lever (dev/staging)', () => {
    vi.stubEnv('VITE_ENABLE_INVESTMENT_ROUNDS', 'true');
    const { result } = renderHook(() => useFlag('enable_investment_rounds'));
    expect(result.current).toBe(true);
  });

  it('VITE_ENABLE_INVESTMENT_ROUNDS=false takes precedence over the default (prod build resolves OFF)', () => {
    vi.stubEnv('VITE_ENABLE_INVESTMENT_ROUNDS', 'false');
    const { result } = renderHook(() => useFlag('enable_investment_rounds'));
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run the suite to verify it passes (pins existing behavior)**

Run:
`npx vitest run tests/unit/flags/enable-investment-rounds.test.tsx --project=client`
Expected: PASS, 4 tests. (If the two `vi.stubEnv` cases fail, the resolver does
not read `import.meta.env` as documented — STOP and re-verify
`client/src/shared/useFlags.ts:58-75` before proceeding; the whole ramp depends
on this lever.)

- [ ] **Step 3: Confirm the tripwire bites (negative control)**

Temporarily edit `shared/feature-flags/flag-definitions.ts:263` `enabled: false`
→ `enabled: true`, re-run the command from Step 2. Expected: the first test
FAILS (`enabled` to be false). Revert the edit immediately and re-run — back to
PASS. This proves the prod-leak guard is live.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/flags/enable-investment-rounds.test.tsx
git commit -m "test(flags): pin enable_investment_rounds VITE env lever + prod-leak tripwire"
```

---

## Task 2: Flip the dev registry surface and regenerate

This updates the declared source-of-truth and the generated server/default
surface so they don't drift. It does NOT, by itself, render the live UI (that's
Task 3) — but keeping it consistent avoids a later mismatch and matches the
roadmap's non-prod-eligibility posture.

**Files:**

- Modify: `flags/registry.yaml:108-111`
- Regenerate: `shared/generated/flag-defaults.ts`,
  `shared/generated/flag-types.ts`

- [ ] **Step 1: Set development true, staging/production false**

In `flags/registry.yaml`, change the `enable_investment_rounds` environments
block (currently `:108-111`):

```yaml
environments:
  development: true
  staging: false
  production: false
```

(Only `development` flips in this task. `staging` is Task 5; `production` must
remain `false`.)

- [ ] **Step 2: Regenerate the flag surfaces**

Run: `npm run flags:generate` Expected: console logs
`Generating flag-types.ts...`, `Generating flag-defaults.ts...`, and a flag
count line (e.g. `Found 34 flags, Found 0 deprecated flags`).

- [ ] **Step 3: Verify the generated diff is scoped and prod stays false**

Run:
`git diff --stat shared/generated/ && git grep -n "enable_investment_rounds" -- shared/generated/flag-defaults.ts`
Expected: only `shared/generated/flag-defaults.ts` (and possibly
`flag-types.ts`) changed; the `enable_investment_rounds` defaults reflect
`development: true`, `production: false`. No other flag changed.

- [ ] **Step 4: Typecheck**

Run: `npm run check` Expected: PASS (0 errors). If the local node_modules is
degraded and this false-fails, rely on the PR-event CI typecheck (per memory
`feedback_local_typecheck_false_green_trust_ci`).

- [ ] **Step 5: Commit**

```bash
git add flags/registry.yaml shared/generated/flag-defaults.ts shared/generated/flag-types.ts
git commit -m "feat(flags): enable enable_investment_rounds in development registry surface"
```

---

## Task 3: Wire the dev VITE lever and the explicit prod-off lever

This is the change that actually renders the live UI in dev builds, and
explicitly pins prod OFF.

**Files:**

- Modify: `.env.development`
- Modify: `.env.production`

- [ ] **Step 1: Add the dev ON lever**

Append to `.env.development`:

```
VITE_ENABLE_INVESTMENT_ROUNDS=true
```

- [ ] **Step 2: Add the explicit prod OFF lever (mirrors existing
      `VITE_ENABLE_*=false` rows)**

Append to `.env.production` (next to the existing
`VITE_ENABLE_OPERATIONS_HUB=false` / `VITE_ENABLE_LP_REPORTING=false` lines):

```
VITE_ENABLE_INVESTMENT_ROUNDS=false
```

- [ ] **Step 3: Verify the env lever resolves in a dev-mode build**

Run:
`npx vitest run tests/unit/flags/enable-investment-rounds.test.tsx --project=client`
Expected: PASS, 4 tests (the env-lever cases from Task 1 already cover the
resolver; this re-confirms nothing regressed).

- [ ] **Step 4: Commit**

```bash
git add .env.development .env.production
git commit -m "feat(flags): VITE_ENABLE_INVESTMENT_ROUNDS=true dev / =false prod"
```

---

## Task 4: Dev smoke against real Postgres + seeded investments

Verification task — proves the create→list→supersede→flag-off vertical on real
data. Not committed code. **Memory mode seeds zero investments →
empty-state-only false-green; this MUST run on Postgres.**

**Files:** none (manual verification).

- [ ] **Step 1: Bring up a Postgres dev DB and apply schema**

Ensure `DATABASE_URL` in `.env.development`/`.env.local` points at a running
Postgres (not memory mode), then: Run: `npm run db:push` Expected: schema sync
completes without error.

- [ ] **Step 2: Seed investments with the verified seeder**

Run: `npx tsx scripts/seed-db.ts` Expected: console logs
`[DONE] Created investments: N` (N ≥ 3) — these are companies[0,1,2]. (Do NOT
use `server/seed-demo-data.ts` — it seeds funds/metrics but no investment rows.)

- [ ] **Step 3: Confirm investment rows exist for a known fundId**

Start the app (`npm run dev`) and run:
`curl "http://localhost:5000/api/investments?fundId=<seededFundId>" -H "Authorization: Bearer <dev-token>"`
Expected: a non-empty JSON array. Record the `fundId` and a `companyId` for the
next step. (PR-H1 makes `fundId` REQUIRED — a bare `/api/investments` returns
`400 fund_scope_required`.)

- [ ] **Step 4: Smoke the lifecycle on the live page**

Navigate to `/portfolio/company/<companyId>` for a seeded company. Verify in
order:

1. The Investment Rounds section renders (dev build →
   `VITE_ENABLE_INVESTMENT_ROUNDS=true`).
2. CREATE a round (new-round dialog → `useCreateRound`; an `Idempotency-Key` is
   sent automatically).
3. LIST shows it (current-only).
4. SUPERSEDE it (create a correcting round with `supersedesRoundId`) → old row
   drops from the list, new row shows the "corrected" badge.
5. Append `?ff_enable_investment_rounds=0` to the URL → the entire section
   disappears (no UI, no calls).

- [ ] **Step 5: Capture the dev-ramp proof**

Save the `fundId`, `companyId`, and the create/supersede transcript (curl output
or screenshots) to `.claude/artifacts/part-b-dev-smoke.md`. This is the evidence
input for the staging decision and the eventual PR-H3 posture proof. (Artifacts
under `.claude/artifacts/**` are not docs-routing-tracked.)

---

## Task 5: Staging ramp — GATED on PR-H2 in flight

Do NOT start this task unless PR-H2 is actually in progress. A staging flag with
no prod line-of-sight goes stale (Claude-lane shelf-life finding). If H2 is not
in flight, STOP after Task 4 and report.

**Files:**

- Modify: `flags/registry.yaml:108-111` (staging → true)
- Regenerate: `shared/generated/*`
- Modify: staging deploy env (`.env.staging` or Vercel staging project) —
  `VITE_ENABLE_INVESTMENT_ROUNDS=true`

- [ ] **Step 1: Flip staging in the registry**

In `flags/registry.yaml`, set:

```yaml
environments:
  development: true
  staging: true
  production: false
```

- [ ] **Step 2: Regenerate and verify prod still false**

Run: `npm run flags:generate` Then:
`git grep -n "enable_investment_rounds" -- shared/generated/flag-defaults.ts`
Expected: staging now reflects true, `production: false` unchanged.

- [ ] **Step 3: Set the staging build env lever**

Add `VITE_ENABLE_INVESTMENT_ROUNDS=true` to the staging deployment environment
(staging `.env`/Vercel staging env vars). Leave prod unset/false.

- [ ] **Step 4: Typecheck + commit the registry change**

Run: `npm run check` Expected: PASS.

```bash
git add flags/registry.yaml shared/generated/flag-defaults.ts shared/generated/flag-types.ts
git commit -m "feat(flags): enable enable_investment_rounds in staging registry surface"
```

- [ ] **Step 5: Deploy to staging and re-run the lifecycle smoke**

Deploy the branch to staging. Confirm the staging fund has investment rows first
(`scripts/seed-db.ts` against the staging DB, or an existing seeded fund), then
repeat Task 4 Step 4 on staging. Soak.

- [ ] **Step 6: Report prod preconditions (do NOT flip prod)**

In the PR description / handoff, list the prod-ramp preconditions and STOP:

- PR-H1, PR-H2, PR-H3 merged.
- PR-H3 production-flag-posture test green.
- Target prod fund confirmed to have investment rows.
- `flags/registry.yaml` `production: true` + regenerate, AND
  `VITE_ENABLE_INVESTMENT_ROUNDS=true` in the prod build env.

---

## CI / Merge notes

- `flags/**` and `shared/**` are classified `code` in
  `.github/path-filters.yml`, so the PR triggers `check` + `test-affected` (the
  Task 1 tests run). Required merge check: **CI Gate Status**.
- Do not flip the global `ALL_FLAGS.enabled` bit in
  `shared/feature-flags/flag-definitions.ts` — the Task 1 tripwire reds if you
  do, and it would enable prod.

---

## Self-Review

**1. Spec coverage** (vs the debate synthesis GO conditions):

- registry dev/staging flip + regenerate → Task 2 / Task 5. ✓
- `VITE_*` per-env lever, prod-off → Task 3 / Task 5 Step 3. ✓
- keep `ALL_FLAGS.enabled=false` → enforced by Task 1 tripwire + File Structure
  DO-NOT-EDIT. ✓
- Postgres + `scripts/seed-db.ts`, confirm rows before asserting → Task 4 Steps
  1-3. ✓
- prove the live UI renders (not just metadata) → Task 4 Step 4. ✓
- capture smoke evidence → Task 4 Step 5. ✓
- stop at staging, gate staging on H2, report prod preconditions → Task 5 gate +
  Step 6. ✓
- avoid new docs / new integration tests on the PR → File Structure note. ✓

**2. Placeholder scan:** No TBD/"handle edge cases"/"similar to".
`<seededFundId>`/`<companyId>`/`<dev-token>` are runtime values produced by Task
4 Steps 2-3, not unfilled plan content.

**3. Type consistency:** `useFlag('enable_investment_rounds')`,
`VITE_ENABLE_INVESTMENT_ROUNDS`, `ff_enable_investment_rounds`,
`supersedesRoundId`, and the generated paths
`shared/generated/flag-defaults.ts`/`flag-types.ts` are used identically across
tasks and match the verified source.
