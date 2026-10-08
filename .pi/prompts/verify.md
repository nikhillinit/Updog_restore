---
description: Verify current changes with the repo's graduated gates
argument-hint: '[focus]'
---

Verify the uncommitted and branch-local changes in this repository. Focus:
${@:-all changed paths}.

1. Inventory: run `git status --porcelain` and
   `git diff --stat origin/main...HEAD` plus `git diff --stat`. List changed
   paths. Note net added lines; flag any growth the task does not explain
   (duplicate helpers, unused abstractions, dead code).
2. Lint: `npm run lint`. On failure run `npm run lint:fix`, then re-run
   `npm run lint`.
3. Types: `npm run check`. Fix targeted errors only; do not widen baselines.
4. Tests: run the targeted Vitest files for changed code first
   (`npx vitest run <paths>`). Run `npm test` only when targeted tests pass but
   suspicion remains, or when test infrastructure, shared mocks, or fixtures
   changed. If `.pi/extensions/` changed, also run
   `node --experimental-strip-types --test .pi/extensions/updog-guard/*.test.ts`
   (Vitest and ESLint do not cover `.pi/`).
5. Financial paths: if any changed path is financial per
   `scripts/ci/classify-change-paths.mjs` (`isFinancialPath`), run
   `npm run phoenix:truth` and name the truth assertion that covers the change.
6. Risk-domain proof
   (docs/governance/solo-internal-change-and-production-policy.md,
   "Consequence-specific proof"): for durable writes, queues, auth, or schema,
   state which required proof exists in tests and which is missing.

Report a table: command, exit status, duration, one-line result. Classify any
failure as product, test defect, infrastructure, or environment. Do not rerun a
failing command until it passes without changing anything; do not commit or
push.
