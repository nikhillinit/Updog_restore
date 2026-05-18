# Cleanup Manifest

Status: Phase 0 baseline captured and verified; Phase 1 generated-log cleanup
validated Created: 2026-05-18 Plan:
`.omx/plans/prd-refactor-red-team-consensus-20260518.md` Test spec:
`.omx/plans/test-spec-refactor-red-team-consensus-20260518.md`

This manifest is the execution gate for refactor cleanup. A candidate may not be
deleted or moved until its evidence, validation, and rollback columns are
updated with current proof.

## Baseline Evidence

Generated under `.audit/`:

- `git-files.before.txt`
- `node-version.txt`
- `npm-version.txt`
- `package-script-count.before.txt`
- `package-scripts.before.txt`
- `workflows.before.txt`
- `env-files.before.txt`
- `schema-config.before.txt`
- `refs-packages.txt`
- `refs-modeling-wizard-machine.txt`
- `refs-attached-assets.txt`
- `refs-phase0-runner.txt`
- `env-usage.before.txt`
- `routes.before.txt`
- `refs-archives.txt`

Notes:

- Package script count is 96.
- Workflow inventory contains 16 files.
- `docs/shared/agent-tiers.md` was requested by the Ralph skill, but that path
  does not exist in this repository. Phase 0 implementation was kept local;
  architect verification was delegated after the baseline was captured.
- `rg` encountered access-denied entries under
  `docs/observability/archive/2025-10-06/`; archive cleanup must treat those
  paths as blocked until permissions are understood.

## Candidate Matrix

| Candidate                                        | Evidence                                                                                                                                                                                           |   Risk | Action                                                                                                 | Required Validation                                                                                                                    | Rollback                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `docs/phase0-runner*.txt`                        | `.audit/refs-phase0-runner.txt` contained only access-denied scan messages; `.audit/phase1-rg-phase0-runner.log` confirms no references to the deleted filenames outside the ignored archive path. |    Low | Deleted the three tracked generated logs and added `docs/.gitignore` to prevent reintroduction.        | `npm run check`, `npm run build:prod`, and `npm run docs:check-links` passed after deletion.                                           | Rollback tag: `pre-phase0-runner-cleanup-2026-05-18`; restore deleted files from the tag if needed. |
| `docs/references/attached_assets/**`             | `.audit/refs-attached-assets.txt` shows references in generated router index files and scan access-denied messages.                                                                                | Medium | Blocked until references are classified as generated-index-only or docs-runtime links.                 | `npm run docs:routing:generate` or documented index refresh path; `npm run docs:check-links`; `npm run check`; `npm run build:prod`.   | Git restore plus regenerated routing index.                                                         |
| Classified stale archive subsets                 | `.audit/refs-archives.txt` exists; scan hit access-denied docs observability archive files.                                                                                                        | Medium | Blocked by default. Only delete named subsets after reference and permission classification.           | Targeted `rg` for the exact subset; `npm run check`; `npm run build:prod`; docs link check if docs paths are touched.                  | Git restore from deletion commit or pre-cleanup tag.                                                |
| `client/src/machines/modeling-wizard.machine.ts` | `.audit/refs-modeling-wizard-machine.txt` shows runtime imports in `client/src/hooks/useModelingWizard.ts`, `WizardShell.tsx`, and multiple unit tests.                                            |   High | Do not delete. Reclassify as live migration backlog.                                                   | Future migration requires replacement path, targeted wizard tests, `npm run test:unit`, and fund setup smoke.                          | Revert migration commit.                                                                            |
| `packages/agent-core/**`                         | `.audit/refs-packages.txt` shows references in `client/src/ai/ConversationMemory.ts`, `client/tsconfig.json`, `package.json`, and `.github/CODEOWNERS`.                                            |   High | Do not delete. Reclassify as live dependency decoupling backlog.                                       | Future migration requires replacement/export path, `npm run check`, `npm run test:unit`, and conversation memory import/runtime tests. | Revert migration commit.                                                                            |
| `.github/workflows/*.yml`                        | `.audit/workflows.before.txt` lists 16 workflows.                                                                                                                                                  |   High | Do not consolidate or delete until a 16-row disposition table exists.                                  | Local check/lint/test/build plus green replacement CI run before deletion or trigger reduction.                                        | Restore workflow file and branch protection setting.                                                |
| Tracked env files                                | `.audit/env-files.before.txt` lists tracked non-template env names including `.env.production`, `.env.vercel`, `.env.react`, `.env.preact`, and `.railway.env`.                                    |   High | Do not consolidate until classified and scanned. Stop and rotate externally if real secrets are found. | Secret scan, value allowlist, `npm run check`; test env values must be localhost/test placeholders.                                    | Restore template files; rotate any exposed secret externally.                                       |
| Drizzle schema layout                            | `.audit/schema-config.before.txt` records `drizzle.config.ts` pointing at `shared/schema.ts`, `shared/schema-lp-reporting.ts`, and `shared/schema-lp-sprint3.ts`.                                  |   High | Schema rename removed from default scope. Separate plan required if reopened.                          | `npx drizzle-kit check --config drizzle.config.ts`; scratch migration generation and SQL inspection.                                   | Revert schema/config changes; apply backward SQL if migration landed.                               |
| Wave/phase scripts                               | `.audit/package-scripts.before.txt` records current scripts.                                                                                                                                       | Medium | Defer until canonical replacements are defined and green.                                              | `npm run check`; `npm run lint`; `npm run test:unit`; `npm run build:prod`.                                                            | Restore `package.json` script entries.                                                              |

## Phase 0 Baseline Command Ledger

Command outputs and exit codes are recorded under `.audit/`.

| Command                | Exit | Evidence                                                                                                                                  |
| ---------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run doctor:quick` |    0 | `.audit/npm-run-doctor-quick.log`, `.audit/npm-run-doctor-quick.exit`                                                                     |
| `npm run check`        |    0 | `.audit/npm-run-check.log`, `.audit/npm-run-check.exit`; TypeScript baseline reported 0 current errors.                                   |
| `npm run lint`         |    0 | `.audit/npm-run-lint.log`, `.audit/npm-run-lint.exit`; console and eslint-disable ratchets passed.                                        |
| `npm run test:unit`    |    0 | `.audit/npm-run-test-unit.log`, `.audit/npm-run-test-unit.exit`; 445 files passed, 6 skipped; 5766 tests passed, 92 skipped.              |
| `npm run build:prod`   |    0 | `.audit/npm-run-build-prod.log`, `.audit/npm-run-build-prod.exit`; client and server builds completed, with existing chunk-size warnings. |
| `npm run bundle:check` |    0 | `.audit/npm-run-bundle-check.log`, `.audit/npm-run-bundle-check.exit`; all bundle budgets passed.                                         |

Summary file:

- `.audit/baseline-command-summary.txt`

## Ralph Deslop And Post-Deslop Verification

Deslop scope:

- `cleanup-manifest.md`

Change made:

- Updated the notes section after architect verification so it no longer stated
  that no delegation had occurred.

Post-deslop command outputs and exit codes are recorded under `.audit/`.

| Command                | Exit | Evidence                                                                                                                                                          |
| ---------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`        |    0 | `.audit/post-deslop-npm-run-check.log`, `.audit/post-deslop-npm-run-check.exit`                                                                                   |
| `npm run lint`         |    0 | `.audit/post-deslop-npm-run-lint.log`, `.audit/post-deslop-npm-run-lint.exit`                                                                                     |
| `npm run test:unit`    |    0 | `.audit/post-deslop-npm-run-test-unit.log`, `.audit/post-deslop-npm-run-test-unit.exit`; 445 files passed, 6 skipped; 5766 tests passed, 92 skipped.              |
| `npm run build:prod`   |    0 | `.audit/post-deslop-npm-run-build-prod.log`, `.audit/post-deslop-npm-run-build-prod.exit`; client and server builds completed, with existing chunk-size warnings. |
| `npm run bundle:check` |    0 | `.audit/post-deslop-npm-run-bundle-check.log`, `.audit/post-deslop-npm-run-bundle-check.exit`; all bundle budgets passed.                                         |

Summary file:

- `.audit/post-deslop-command-summary.txt`

## Phase 1 Generated-Log Cleanup Ledger

Deleted files:

- `docs/phase0-runner-baseline.txt`
- `docs/phase0-runner-post-harvest-baseline.txt`
- `docs/phase0-runner-v2.31-baseline.txt`

Added guard:

- `docs/.gitignore` ignores future `phase0-runner*.txt` generated logs.

Rollback tag:

- `pre-phase0-runner-cleanup-2026-05-18`

Command outputs and exit codes are recorded under `.audit/`.

| Command                    | Exit | Evidence                                                                                                                                                |
| -------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filename reference gate    |    0 | `.audit/phase1-rg-phase0-runner.log`, `.audit/phase1-rg-phase0-runner.exit`; no references to deleted filenames outside the ignored archive path.       |
| `npm run check`            |    0 | `.audit/phase1-npm-run-check.log`, `.audit/phase1-npm-run-check.exit`; TypeScript baseline reported 0 current errors.                                   |
| `npm run build:prod`       |    0 | `.audit/phase1-npm-run-build-prod.log`, `.audit/phase1-npm-run-build-prod.exit`; client and server builds completed, with existing chunk-size warnings. |
| `npm run docs:check-links` |    0 | `.audit/phase1-npm-run-docs-check-links.log`, `.audit/phase1-npm-run-docs-check-links.exit`; all checked links passed.                                  |

Further cleanup candidates remain blocked unless their candidate rows are
updated with current evidence, validation, and rollback paths.

## Phase 1 Deslop And Post-Deslop Verification

Deslop scope:

- `cleanup-manifest.md`
- `docs/.gitignore`

Change made:

- Tightened the `docs/.gitignore` comment for the generated phase runner
  diagnostics rule.

Post-deslop command outputs and exit codes are recorded under `.audit/`.

| Command                    | Exit | Evidence                                                                                                                                                                        |
| -------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`            |    0 | `.audit/phase1-post-deslop-npm-run-check.log`, `.audit/phase1-post-deslop-npm-run-check.exit`; TypeScript baseline reported 0 current errors.                                   |
| `npm run lint`             |    0 | `.audit/phase1-post-deslop-npm-run-lint.log`, `.audit/phase1-post-deslop-npm-run-lint.exit`; console and eslint-disable ratchets passed.                                        |
| `npm run test:unit`        |    0 | `.audit/phase1-post-deslop-npm-run-test-unit.log`, `.audit/phase1-post-deslop-npm-run-test-unit.exit`; 445 files passed, 6 skipped; 5766 tests passed, 92 skipped.              |
| `npm run build:prod`       |    0 | `.audit/phase1-post-deslop-npm-run-build-prod.log`, `.audit/phase1-post-deslop-npm-run-build-prod.exit`; client and server builds completed, with existing chunk-size warnings. |
| `npm run bundle:check`     |    0 | `.audit/phase1-post-deslop-npm-run-bundle-check.log`, `.audit/phase1-post-deslop-npm-run-bundle-check.exit`; all bundle budgets passed.                                         |
| `npm run docs:check-links` |    0 | `.audit/phase1-post-deslop-npm-run-docs-check-links.log`, `.audit/phase1-post-deslop-npm-run-docs-check-links.exit`; all checked links passed.                                  |

Summary file:

- `.audit/phase1-post-deslop-command-summary.txt`

## Ralph Architect Verification

Final tranche verdict:

- APPROVE for Phase 0 baseline plus eligible Phase 1 generated-log cleanup.

Verifier notes:

- The diff stayed inside the generated-log cleanup lane.
- Product code, package files, CI workflows, env files, schema files, assets,
  archives, and attached assets were not changed.
- Remaining candidates stay blocked until separately classified.
- This closes only the current Ralph tranche; it does not complete the full
  multi-phase refactor program.
