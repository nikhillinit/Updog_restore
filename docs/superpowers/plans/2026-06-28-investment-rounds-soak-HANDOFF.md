---
title: Investment Rounds Controlled Soak Proof — Cloud Session Handoff
date: 2026-06-28
status: HANDOFF
baseline_head: 9026db77d0b4f52efd86a673e11af92aaacb5aa1
audience: cloud Claude session (fresh GitHub checkout, no local Docker/Hermes)
---

# Investment Rounds Controlled Soak Proof — Cloud Session Handoff

> Transient handoff brief, intentionally branch-scoped. It is a task spec for a fresh
> cloud session to pull from the repo; it is not meant to merge to `main`. Delete the
> branch once the soak-proof PR lands.

## Done already (do not redo)

P0 release-gate lint unblock landed in **PR #943** (merge commit `9026db77`,
2026-06-28). `.remember/**` is in `eslint.config.js` global ignores (`:56`) and
`npm run lint` is green on `main`. Do not depend on Hermes/Codex orchestration in the cloud
session: `orchestrate.js` is tracked in the repo, but its toolchain (Docker, model routing,
local `node_modules`/API keys) may be absent or non-functional in a fresh checkout, and there
is no Docker. Work the GitHub repo directly — implement, then open a PR.

## Your milestone — P1: Investment Rounds Controlled Soak Proof

Goal: PROVE the already-landed investment-rounds contracts behave under a controlled
soak, add the missing test coverage, and document the enable levers. This is
proof + tests, **not** new schema or new features.

### Hard constraints

- Keep the `enable_investment_rounds` flag **default OFF globally and OFF in production**.
  Never flip it on for prod.
- Local/staging enable levers only (resolution order: `?ff_enable_investment_rounds=1` query
  or `localStorage['ff_enable_investment_rounds']='1'` runtime override, then
  `VITE_ENABLE_INVESTMENT_ROUNDS=true` build-time, else default OFF).
- `scripts/seed-db.ts` is NOT an enable lever — it only seeds sample fund/company/investment
  DATA so the enabled UI has something to render. Enable the flag separately via the levers above.
- Valuation, performance, and bulk investment-round paths stay **UNSUPPORTED** — do not
  build them.

### Start here (scope is drift-prone — verify before coding)

1. Re-grep current `main` for every touchpoint below. Line numbers are stale and recent
   PRs (#939/#941/#942) removed/archived files — confirm what still exists by symbol name,
   not line number:
   - `client/src/shared/useFlags.ts`
   - `shared/feature-flags/flag-definitions.ts` (the `ALL_FLAGS` list)
   - `flags/registry.yaml`
   - `client/src/app/app-routes.tsx`
   - `client/src/pages/portfolio-company-summary.tsx`
   - `server/routes/investments.ts`
   - `tests/integration/investment-scenario-capability.test.ts` — **REUSE**: already covers
     create / replay / conflict / missing-idempotency / cross-fund-denial / listing / supersede
   - `tests/unit/flags/enable-investment-rounds.test.tsx`
   - `tests/unit/pages/portfolio-company-summary.rounds.test.tsx`
   - `tests/unit/components/investments/investment-rounds-section.test.tsx`
2. Write a short plan (problem, exact files, test list) at
   `docs/superpowers/plans/2026-06-28-investment-rounds-soak.md`, then implement against it.

### Project gotchas that will bite you (load-bearing)

- Client tests MUST live in `tests/unit/**` — co-located `client/src/**/*.test.tsx` are
  NEVER run by CI. Client flags MUST be registered in `flag-definitions.ts` `ALL_FLAGS` or
  `useFlag` is silently always-false.
- DB-backed integration tests run dual-mode: use **Neon via `TEST_DATABASE_URL`** (NOT
  testcontainers/Docker, which isn't available in the cloud session).
- A NEW `tests/integration/*.test.ts` does NOT run on its own PR (gated to `main`). To
  exercise it: `gh workflow run ci-unified.yml --ref <your-branch> -f run_full_suite=true`.
  CI builds the test DB via `db:push`.
- LIVE PROD = Vercel = `makeApp` (`server/app.ts`). A route mounted ONLY on
  `routes.ts`/`registerRoutes` 404s in prod. If you touch routes, mount on `makeApp` and add
  a mount-parity test (pin to a guard 400 on non-numeric `fundId`, not `status!=404`;
  `makeApp` returns 415 on body-less POST/PUT/PATCH so send `.send({})`).
- RLS does NOT enforce prod investment scope — guard fund scope IN the handler
  (`parseFundIdParam` strict-rejects anything not matching `/^[1-9]\d*$/`).
- Use `z.enum()` not `z.string()` for known-domain fields. No `any`. No emoji.
  Conventional commits.

### Merge / CI rules

- `main` requires the **"CI Gate Status"** aggregator check and rebase-before-merge.
- A ~1-minute docs-only CI run is vacuous green — wait for a full (~7m) run before claiming
  proof.
- Local `npm run check`/`lint` can false-green on a degraded toolchain; trust CI.
- Adding any `docs/**/*.md` requires regenerating the router index
  (`npm run docs:routing:generate`) or the "Validate Discovery Routing" check fails.

### Definition of done

A PR off latest `main` that (a) keeps the flag off in prod, (b) adds the controlled-soak
proof tests (reusing `investment-scenario-capability.test.ts`), (c) documents the enable
levers, (d) is green on a FULL `ci-unified` run.

## Deferred (not this task — mention only)

Systemic eslint↔gitignore sync via `@eslint/compat` `includeIgnoreFile` — blocked because
it reads only the ROOT `.gitignore` and `.remember` is nested-gitignored. Separate ticket.
