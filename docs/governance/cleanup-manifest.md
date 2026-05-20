---
status: ACTIVE
last_updated: 2026-05-20
owner: Core Team
review_cadence: P14D
categories: [governance, cleanup, refactor]
keywords: [cleanup-manifest, refactor, audit, deletion, migration]
source_of_truth: true
related:
  - docs/governance/2026-05-19-refactor-roadmap.md
---

# Cleanup Manifest

This manifest is the current cleanup candidate register for the refactor
roadmap. It classifies what can be deleted, externalized, migrated, or left
alone, and records what must be checked before each action.

## Refresh Evidence

Refreshed on 2026-05-20 from read-only repository scans:

| Evidence                             | Current result                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Branch state                         | `main...origin/main`; local unstaged `.claude/discovery.md` only                                                |
| `docs/references/attached_assets/**` | 220 tracked files; directory exists                                                                             |
| `docs/phase0-runner*.txt`            | 0 tracked files                                                                                                 |
| root `archive/**`                    | 0 tracked files; root `archive/` absent                                                                         |
| `docs/archive/**`                    | 0 tracked files; local `docs/archive/` directory exists                                                         |
| root `src/**`                        | 1 tracked file: `src/core/routes/ia.ts`                                                                         |
| `repo/**`                            | 0 tracked files; root `repo/` absent                                                                            |
| `packages/**`                        | 122 tracked files                                                                                               |
| `package.json` scripts               | 80 scripts; stale wave5/wave6 aliases retired; `guard:scripts:check` blocks new legacy wave/phase/slice aliases |
| `.github/workflows/*`                | 16 tracked workflow files                                                                                       |
| `scripts/**`                         | 381 tracked files after adding the script-alias guardrail                                                       |
| dot/tooling directories              | `.backup`, `.a5c`, `.zap`, `.zencoder`, `PATCHES`, and `.omx` have tracked files                                |

## Candidate Register

| Candidate                                                       | Evidence                                                                                                                                                                 |    Risk | Current classification                | Required next action                                                                                                          | Validation before change                                                                                         | Rollback                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------: | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `.audit/`                                                       | Ignored local audit artifacts exist; `.gitignore` ignores `.audit/`                                                                                                      |     Low | Local evidence only, do not commit    | Keep local or regenerate as needed; do not stage bare `.exit` files                                                           | `git status --short` shows no `.audit/` files staged                                                             | n/a                                       |
| `docs/phase0-runner*.txt`                                       | 0 tracked files                                                                                                                                                          |     Low | Closed cleanup item                   | No file deletion remains; keep docs ignore only if generation can recur                                                       | `git ls-files 'docs/phase0-runner*.txt'` returns empty                                                           | n/a                                       |
| `docs/references/attached_assets/`                              | 220 tracked files remain                                                                                                                                                 | Low-Med | Active cleanup target                 | Classify each asset group as referenced, externalize-worthy, or deletable                                                     | Reference scan excluding the asset directory; `npm run docs:routing:check`; targeted docs/link review            | Git revert; external copy if externalized |
| root `archive/`                                                 | 0 tracked files; directory absent                                                                                                                                        |     Low | Closed cleanup item                   | No action except removing stale references when touched                                                                       | `git ls-files 'archive/**'` returns empty                                                                        | n/a                                       |
| `docs/archive/`                                                 | 0 tracked files; local directory exists                                                                                                                                  | Low-Med | Local/untracked content only          | Do not blanket-delete; inspect only if intentionally adding or cleaning local docs                                            | `git status --short --ignored docs/archive`; docs link check if tracked docs change                              | Local backup or git tag if tracked later  |
| root `src/`                                                     | 1 tracked file: `src/core/routes/ia.ts`; no active import refs found in latest targeted scan                                                                             |     Med | Candidate after verification          | Confirm route metadata mirror is unused, then delete or move to canonical route metadata location                             | `npm run check`; `npm run test:unit`; route/story tests if changed                                               | Git revert                                |
| `client/src/machines/modeling-wizard.machine.ts`                | File is tracked; exports `modelingWizardMachine`; imported by wizard tests and type-imported by `WizardShell`                                                            |    High | Keep                                  | Do not delete during cleanup; only migrate behind explicit behavior tests                                                     | `npm run check`; targeted modeling-wizard tests; fund setup smoke                                                | Git revert                                |
| `repo/` / `repo/BMAD-METHOD`                                    | 0 tracked files; root `repo/` absent                                                                                                                                     |     Low | Closed filesystem cleanup item        | Clean stale documentation references only when touching affected docs                                                         | Docs routing/link check if references change                                                                     | n/a                                       |
| `packages/*`                                                    | 122 tracked files; package references appear in docs/scripts/config surfaces                                                                                             |     Med | Decouple before delete/extract        | Build reference map by package; remove script/tsconfig/docs coupling before deleting any package                              | `npm run check`; `npm run test:unit`; `npm run build:prod`                                                       | Git revert or tag                         |
| `package.json` wave/phase scripts                               | 80 scripts total; 9 legacy aliases allowed by `.baselines/script-alias-policy.json`; stale wave5/wave6 aliases retired; `npm run guard:scripts:check` blocks new aliases |     Med | Active DX cleanup target with ratchet | Classify remaining allowed legacy aliases by owner: active gate, short-lived alias, or stale historical alias                 | `npm run guard:scripts:check`; existing replacement command passes; `npm run docs:routing:check` if docs updated | Git revert                                |
| `scripts/**`                                                    | 381 tracked files after adding `scripts/guardrails/script-alias-policy.mjs`                                                                                              |     Med | Active DX cleanup target              | Classify reusable scripts versus one-off migration/fix scripts; delete only after reference scan                              | `npm run check`; affected npm scripts; shellcheck/lint where applicable                                          | Git revert                                |
| `.github/workflows/*`                                           | 16 tracked workflow files                                                                                                                                                |     Med | Active CI cleanup target              | Compare each workflow against `docs/workflows/README.md`; consolidate duplicate checks only after triggers/secrets are mapped | CI dry run where available; `npm run check`; `npm run lint`; `npm run test:unit`                                 | Git revert                                |
| `vitest.config.mjs` and Vitest configs                          | `test:unit` uses `vitest.config.mjs`; testcontainers workflow uses `vitest.config.testcontainers.ts`; phase0 DB proof script uses `vitest.config.phase0-dbproof.ts`      |     Med | Keep until migrated                   | Extract shared aliases first; delete configs only after owning script/workflow changes                                        | `npm run test:unit`; affected integration/quarantine/testcontainer commands                                      | Git revert                                |
| TypeScript config variants                                      | `tsconfig.shared.json` is referenced by scripts and baseline tooling                                                                                                     |     Med | Conservative cleanup only             | Delete only configs proven unused by `extends`, scripts, workflows, and editor/build paths                                    | `npm run check`; `npm run build:prod`; relevant script checks                                                    | Git revert                                |
| `.backup/`, `.a5c/`, `.zap/`, `.zencoder/`, `PATCHES/`, `.omx/` | Each has tracked files                                                                                                                                                   |     Med | Inventory before action               | Classify owner/runtime coupling per directory; no blanket deletion                                                            | Tool-specific checks or docs routing check depending on touched files                                            | Git revert                                |

## Refresh Protocol

When refreshing this manifest:

1. Re-run tracked-file counts with `git ls-files`.
2. Re-run reference scans for the affected candidates.
3. Update only evidence-backed counts and classifications.
4. Keep local audit logs under `.audit/`; do not commit raw command logs unless
   the artifact has durable institutional value.
5. If docs are added, moved, or deleted, run `npm run docs:routing:generate` and
   `npm run docs:routing:check`.
