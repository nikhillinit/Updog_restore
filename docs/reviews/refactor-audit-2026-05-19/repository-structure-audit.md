---
status: REFERENCE
last_updated: 2026-05-20
owner: Core Team
categories: [reviews, refactor, repository-structure]
keywords: [repository-structure, audit, cleanup, docs]
source_of_truth: false
related:
  - docs/governance/2026-05-19-refactor-roadmap.md
---

# Updog_restore Repository Structure Audit Report

> Reference status: this raw audit is supporting evidence. Use
> `docs/governance/2026-05-19-refactor-roadmap.md` for the canonical execution
> order.

## Repository: Updog_restore (POVC Fund-Modeling Platform Monorepo)

**Total Files**: 5,577 | **Code Files**: 2,511 | **Size**: 222MB | **Markdown
Files**: 1,741

---

## 2026-05-19 Verification Update

This report was reconciled against the latest solo/internal refactor plan in
`Updog_restore_Best_Approach_Solo_Internal.md`. The original audit still
captures useful smell categories, but several deletion recommendations are stale
and must be treated as historical evidence, not execution instructions.

| Area                               | Current verified state                                                                                                                                        | Execution correction                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NPM scripts                        | 86 root `package.json` scripts                                                                                                                                | Classify and retire wave/phase aliases; target <=50 before pursuing <=30.                                                                                      |
| `scripts/`                         | 385 files recursively, 295 at `scripts/` root                                                                                                                 | Delete or externalize only after command/reference scans. Prefer deletion over `scripts/archive/`.                                                             |
| GitHub Actions                     | 16 workflow files                                                                                                                                             | Consolidate after mapping required vs optional checks.                                                                                                         |
| TypeScript configs                 | 5 root configs: `tsconfig.json`, client, server, shared, eslint                                                                                               | Keep `tsconfig.shared.json` until script/extends references are removed. The older 11-config finding is superseded.                                            |
| Vitest configs                     | 6 root configs; `vitest.config.mjs` is the current `test:unit` entry                                                                                          | Extract shared aliases first; delete `vitest.config.mjs` last, only after package scripts no longer reference it.                                              |
| `docs/phase0-runner*.txt`          | Absent                                                                                                                                                        | No deletion work remains; keep ignore/prevention only if generation can recur.                                                                                 |
| Root `archive/`                    | Absent                                                                                                                                                        | Do not execute old `/archive` deletion steps. Audit `_archive/` separately if it enters scope.                                                                 |
| `docs/archive/`                    | Ignored working-tree content: 5 files, about 20.1MB                                                                                                           | Curate file by file if intentionally tracked; do not blanket-delete as a tracked docs tree.                                                                    |
| `docs/references/attached_assets/` | 222 tracked files; working tree currently has 220 after two deletions                                                                                         | Still an early externalization/deletion candidate after reference classification.                                                                              |
| Root `src/`                        | One tracked file: `src/core/routes/ia.ts`, referenced by route-story tests                                                                                    | Not an orphan directory; preserve until route metadata consumers are migrated.                                                                                 |
| `.env.test`                        | No committed `.env.test`; ignored `.env.test.local` exists                                                                                                    | Add `.env.test` only after loader/CI behavior is verified.                                                                                                     |
| Route refactor gates               | Branch-local `deal-pipeline` endpoint contracts added; branch-local route-surface inventory records metrics/RUM aliases, auth posture, and external ownership | Service extraction and mount cleanup can proceed one boundary at a time after the branch lands; do not remove observability aliases without consumer evidence. |

**Superseding rules:** use a cleanup manifest, run reference scans before each
deletion batch, preserve route URLs, keep active test/config entrypoints until
replacements are proven, and use git history/tags instead of committed
quarantine/archive folders.

**Latest work note:** The 2026-05-19 execution branch
`codex/refactor-plan-execution` in
`C:\dev\Updog_restore\.worktrees\refactor-plan-execution` adds deal-pipeline
contract tests and expands route surface inventory. It also fixes deal-pipeline
idempotency middleware registration by instantiating the middleware before
attaching mutating routes. These are safety gates for the next
service-extraction slice, not broad repository cleanup, and they are not yet
merged into this main workspace.

## Summary of Findings

| Severity      | Count                   | Categories                                              |
| ------------- | ----------------------- | ------------------------------------------------------- |
| P0 (Critical) | 4 active + 1 superseded | Config sprawl, doc asset bloat, active boundary cleanup |
| P1 (High)     | 7                       | Directory chaos, duplicate topics, config bloat         |
| P2 (Medium)   | 6                       | Organization, dependency issues                         |
| P3 (Low)      | 4                       | Minor cleanup                                           |

**Waste Estimate**: Current deletion volume is TBD until the cleanup manifest
classifies references. The older ~42MB estimate is superseded because the root
`archive/` directory and `docs/phase0-runner*.txt` logs are already absent;
remaining known candidates are tracked `docs/references/attached_assets/`,
ignored `docs/archive/` content if it is intentionally retained, script sprawl,
and redundant config entrypoints proven unreferenced.

---

## P0 (Critical) Issues

### P0-1: TypeScript Config Set — 5 Active Root Configs

- **Category**: Configuration
- **Evidence**:
  - Current root configs: `tsconfig.json`, `tsconfig.client.json`,
    `tsconfig.server.json`, `tsconfig.shared.json`, `tsconfig.eslint.json`
  - `tsconfig.shared.json` is still referenced by tooling/scripts and should not
    be deleted until those references are removed
  - Older audit evidence for 11 root configs is no longer current
- **Impact**: Reduced but still meaningful build/tooling surface area; config
  removal must preserve active script and `extends` contracts.
- **Recommendation**: Current root state is already down to 5 configs. Keep
  `tsconfig.json`, `tsconfig.client.json`, `tsconfig.server.json`, and
  `tsconfig.shared.json` as active boundaries; keep `tsconfig.eslint.json` only
  if ESLint needs broader includes. Delete only configs proven unreferenced by
  script and `extends` scans. The older 11-config deletion list is superseded.

### P0-2: Vitest Config Set — 6 Root Configs

- **Category**: Configuration
- **Evidence**:
  - Current root configs: `vitest.config.mjs`, `vitest.config.base.ts`,
    `vitest.config.int.ts`, `vitest.config.phase0-dbproof.ts`,
    `vitest.config.quarantine.ts`, `vitest.config.testcontainers.ts`
  - There is no current root `vitest.config.ts` or `vitest.config.route-int.ts`
  - `package.json` still selects configs via `--config`; `test:unit` currently
    uses `vitest.config.mjs`
- **Impact**: Duplicate aliases/setup remain across the active configs, but the
  current cleanup path is migration first and deletion last.
- **Recommendation**: Treat `vitest.config.mjs` as the current unit-test entry
  because `npm run test:unit` references it. First extract shared aliases/setup,
  then consolidate integration/quarantine/testcontainer variants by migration.
  Delete `vitest.config.mjs` last, after `test:unit` and package scripts no
  longer reference it. Do not rely on Vitest tag filtering until version/CLI
  support is verified.

### P0-3: Documentation Asset Bloat — Attached Assets Still Tracked

- **Category**: Documentation
- **Evidence**:
  - `docs/references/attached_assets/` remains tracked with 222 files in the
    index; the working tree currently has 220 after two deletions
  - `docs/phase0-runner*.txt` is already absent
  - Root `archive/` is already absent
  - `docs/archive/` is currently ignored working-tree content: 5 files totaling
    about 20.1MB
- **Impact**: Tracked attached assets remain a real repo-weight and review-noise
  problem. The old archive/log deletion items are no longer current execution
  work.
- **Recommendation**:
  1. Record `docs/phase0-runner*.txt` as already absent.
  2. Classify references to `docs/references/attached_assets/`, then delete
     unused assets or externalize useful assets to LFS/object storage/docs CDN.
  3. Curate the ignored `docs/archive/` working-tree content file by file only
     if it is intentionally brought back into tracked docs.
  4. Do not treat `docs/archive/` as a tracked duplicate of root `/archive`;
     root `archive/` is absent in the current tree.

### P0-4: Root Archive Directory — Already Absent in Current Tree

- **Category**: Historical Documentation Cleanup
- **Evidence**: Current verification finds no root `archive/` path. A root
  `_archive/` directory exists, but that is a distinct target and was not part
  of this audit's original evidence.
- **Impact**: No current action remains for the old root `archive/` finding.
- **Recommendation**: Do not run the old `/archive` deletion steps. If
  `_archive/` becomes cleanup scope, classify it in the manifest and scan
  references separately.

### P0-5: Root-Level `src/` Route Metadata Mirror — Active Consumer Exists

- **Category**: Organization
- **Evidence**:
  - Current tracked root `src/` contains one file: `src/core/routes/ia.ts`
  - Route-story tests import it via `tests/unit/app/legacy-route-map.test.ts`
    and `tests/unit/app/ia-route-story.test.ts`
  - Related docs also reference the IA route map
- **Impact**: The root `src/` boundary is still confusing, but it is not safe to
  delete as dead code.
- **Recommendation**: Preserve `src/core/routes/ia.ts` until consumers are
  migrated to a clearer route metadata module. Add/keep route contract tests
  before moving it, then remove the root `src/` directory only after imports and
  docs are updated.

---

## P1 (High) Issues

### P1-1: Duplicate ADR Directories — 3 Locations for Same Content

- **Category**: Documentation
- **Evidence**:
  - Root `/ADR/` — 2 files: `ADR-001-Selector-Contract.md`,
    `ADR-002-Feature-Flags-and-IA.md`
  - `docs/adr/` — 19 files: `0001-evaluator-metrics.md` through
    `ADR-010-RESERVED.md`
  - `docs/archive/2025-q4/default-parameters/ADR/` — contains another ADR-001
- **Impact**: ADRs scattered across 3 directories. Root ADR has only 2 files;
  docs/adr has 19. No single source of truth.
- **Recommendation**: Merge root `/ADR/` into `docs/adr/`. Create index. Delete
  archived duplicate. **Consolidate to 1 location**.

### P1-2: Topic Directory Triplication — Same Concepts in 2-3 Places

- **Category**: Organization
- **Evidence**: | Topic | Root | docs/ | server/ | client/src/ |
  |-------|------|-------|---------|-------------| | schemas | `schema/` (8) |
  `docs/schemas/` (7) | — | `client/src/schemas/` (2) | | runbooks | `runbooks/`
  (7) | `docs/runbooks/` (11) | — | — | | cheatsheets | `cheatsheets/` (42) |
  `docs/skills/` (42) | — | — | | security | — | `docs/security/` (8) |
  `server/security/` (2) | — | | observability | `observability/` (6) |
  `docs/observability/` (14) | `server/observability/` (8) | — | | migration |
  `migrations/` (28) | — | `server/migrations/` (45) | — | | db | `db/` (7) | —
  | `server/db/` (24) | — | | monitoring | `monitoring/` (8) | — |
  `client/src/monitoring/` (2) | — |
- **Impact**: Finding anything requires checking 2-3 locations. Massive
  context-switching overhead.
- **Recommendation**: Consolidate each topic to a single canonical location. Use
  symlinks or docs references, not duplication.

### P1-3: AI Tool Directory Sprawl — 8 AI-Related Directories

- **Category**: Organization
- **Evidence**:
  - `ai/` — 24 files (root-level AI tools)
  - `ai-logs/` — 2 files
  - `ai-utils/` — 24 files
  - `prompts/` — 6 files
  - `docs/agents/` — 3 files
  - `docs/ai-optimization/` — 8 files
  - `.claude/` — 226 files (2.3MB — full Claude skill library with 30+ skill
    directories)
  - `.taskmaster/` — 5 files
- **Impact**: 8 directories for AI-related content. No clear separation of
  concerns.
- **Recommendation**: Consolidate into `ai-tools/` or `.ai/` directory with
  subdirs: `skills/`, `prompts/`, `logs/`, `utils/`. Move `.claude/skills/`
  under this umbrella. **Potential reduction**: 8 dirs → 1 dir.

### P1-4: Duplicate Monitoring/Observability in 3 Places

- **Category**: Organization
- **Evidence**:
  - `monitoring/` — 8 files (root)
  - `observability/` — 6 files (root)
  - `docs/observability/` — 14 files
  - `server/observability/` — 8 files
  - `server/monitoring/` — 2 files (wait, 6 above... let me re-check)
  - `k6/` — 5 files (load testing, separate from monitoring)
- **Impact**: 5 locations for monitoring/observability content. Unclear which is
  active.
- **Recommendation**: Consolidate to `observability/` (root for shared) +
  `server/observability/` (server-specific). Merge `monitoring/` into
  `observability/`. Merge `k6/` into `observability/load-testing/`.

### P1-5: `.config/` Directory — 1.7MB, Not Dotfiles

- **Category**: Organization
- **Evidence**:
  - `.config/` — 1.7MB, contains `semgrep_rules.json` and other security configs
  - Root has 50+ dotfiles already (`.prettierrc`, `.eslintrc`, etc.)
  - Name violates convention — `.config/` should be for application config, not
    repo tooling
- **Impact**: Misleading directory name. 1.7MB of security rules that should be
  in `tools/security/` or `infra/security/`.
- **Recommendation**: Rename to `tools/security-configs/` or merge into
  `infra/`.

### P1-6: `repo/` Directory — 241 Files of External Project

- **Category**: Dead Code
- **Evidence**:
  - `repo/` — 241 files, 4.9MB
  - Contains `.bmad-core/` (agent teams, workflows) and `BMAD-METHOD/` (full
    sub-project with its own package.json)
  - `repo/web-bundles/` — agents, teams, expansion-packs for web bundles
  - Has own `package.json` — appears to be a separate project vendored into this
    repo
- **Impact**: 241 files (4.9MB) of what appears to be a separate
  methodology/project. Creates confusion about what code is actually part of
  Updog.
- **Recommendation**: Extract `repo/` to a separate repository. If needed as
  reference, use a git submodule. **Savings**: 241 files, 4.9MB.

### P1-7: 17 package.json Files — Only 6 Active Packages

- **Category**: Dependencies
- **Evidence**:
  - Root: `package.json` (224 total dependencies)
  - Active packages: `packages/agent-core/`,
    `packages/bundle-optimization-agent/`, `packages/codex-review-agent/`,
    `packages/memory-manager/`, `packages/test-repair-agent/` (5 files)
  - **Dead packages** in `archive/2026-q1/unused-code/packages/` (3 files)
  - **External project**: `repo/BMAD-METHOD/package.json` (2 files — root +
    tools/installer)
  - **Vendored code**: `archive/2025-10-07/directories-backup/` (4 package.json
    files from other projects)
  - `tests/chaos/wasm-simulator/package.json`,
    `tools/eslint-plugin-rls/package.json`
- **Impact**: 17 package.json files — only 6 represent active code. npm install
  may pick up wrong package.json in nested directories.
- **Recommendation**: Delete archived/vendored package.json files. **Savings**:
  11 stale package.json files removed.

---

## P2 (Medium) Issues

### P2-1: Test Directory Sprawl — 715 Files, 55+ Unit Subdirs

- **Category**: Organization
- **Evidence**:
  - `tests/unit/` has 55 subdirectories — extreme flatness
  - Includes `tests/unit/phase2a/`, `tests/unit/phase2b/`, `tests/unit/phase3/`
    — test org by project phase (not feature)
  - `tests/perf/` (3 files) + `tests/performance/` (2 files) — duplicate
  - `tests/e2e/` (54 files) alongside `tests/synthetics/` — unclear distinction
  - `tests/quarantine/` — quarantined tests (should be in config, not directory)
  - `tests/chaos/` — chaos tests with nested `wasm-simulator/` (its own
    package.json)
  - `tests/k6/` — load tests at root, separate from `tests/load/`
- **Impact**: Tests organized by phase, not feature. Hard to find relevant
  tests. Phase-named directories imply temporary.
- **Recommendation**: Reorganize only where it improves config consolidation or
  domain clarity. Keep quarantine explicit with reason, TTL, and exit condition;
  do not hide quarantine state only in config.

### P2-2: Docker Compose Proliferation — 5 Files, 656 Lines

- **Category**: Configuration
- **Evidence**:
  - `docker-compose.yml` (76 lines) — base
  - `docker-compose.dev.yml` (55 lines)
  - `docker-compose.rls.yml` (315 lines) — Row-Level Security testing
  - `docker-compose.observability.yml` (110 lines)
  - `docker-compose.chaos.yml` (100 lines)
  - Plus 4 Dockerfiles: `Dockerfile` (64), `Dockerfile.railway` (44),
    `Dockerfile.simple` (35), `Dockerfile.worker` (150)
- **Impact**: 9 docker-related files. The `docker-compose.rls.yml` (315 lines)
  is 48% of all compose config.
- **Recommendation**: Merge compose files using profiles (`docker-compose.yml`
  with `--profile dev/rls/obs/chaos`). Consolidate Dockerfiles to 2 max.

### P2-3: `.omx/` Directory — 120KB of Sprint Artifacts

- **Category**: Dead Code
- **Evidence**:
  - `.omx/` — 11 files: `proofs/phase-1b-*.md`, `plans/*.md`, `context/*.md`
  - Contains sprint-specific artifacts:
    `prd-next-sprint-lp-reporting-package-render-model-20260510.md`
- **Impact**: Sprint artifacts committed to repo. Should be in
  wiki/Confluence/external docs.
- **Recommendation**: Move to sprint documentation system. Delete from repo.
  **Savings**: 11 files.

### P2-4: GitHub Workflow Sprawl — 12 Workflow Files

- **Category**: Configuration
- **Evidence**:
  - `.github/workflows/`: `code-quality.yml`, `codeql.yml`,
    `core-validation.yml`, `ci-unified.yml`, `docs-routing-check.yml`,
    `docs-validate.yml`, `security-tests.yml`, `skip-counter.yml`,
    `testcontainers-ci.yml`, `verify-strategic-docs.yml`
  - Plus: `.github/labeler.yml`, `.github/merge-queue.yml`,
    `.github/dependabot.yml`, `.github/codeql-config.yml`
- **Impact**: 12 workflows + 4 config files. Some may be redundant (code-quality
  vs ci-unified).
- **Recommendation**: Audit and consolidate. Merge docs-\* workflows. Disable
  stale workflows.

### P2-5: 10+ `.env*` Files at Root

- **Category**: Configuration
- **Evidence**:
  - `.env.development`, `.env.production`, `.env.vercel`, `.env.preact`,
    `.env.react`
  - `.env.example`, `.env.local.example`, `.env.development.example`,
    `.env.rls.example`, `.env.staging.example`, `.env.vercel.example`
- **Impact**: 11 env files at root. Pattern suggests environment config sprawl.
- **Recommendation**: Consolidate examples to a single `.env.example` with
  comments for all environments. Keep only `.env.development` and
  `.env.production` as active files.

### P2-6: `client/src/` Has 31 Top-Level Directories — Too Flat

- **Category**: Organization
- **Evidence**:
  - 31 subdirectories under `client/src/`: `adapters`, `ai`, `api`, `app`,
    `assets`, `components`, `config`, `contexts`, `core`, `debug`, `domain`,
    `engines`, `features`, `hooks`, `lib`, `machines`, `metrics`, `monitoring`,
    `pages`, `providers`, `schemas`, `selectors`, `services`, `shared`, `state`,
    `stores`, `styles`, `theme`, `types`, `utils`, `workers`
  - `lib/` (92 files) + `utils/` (30 files) — unclear separation
  - `features/` (5 files) + `components/` (390 files) — components not organized
    by feature
  - `types/` (13 files) + `schemas/` (2 files) — overlapping concepts
  - `hooks/` (58 files) + `machines/` (1 file) — state management split
- **Impact**: Feature discovery is difficult. `components/` has 390 files —
  likely flat organization inside too.
- **Recommendation**: Adopt feature-based colocation. Merge `types/`+`schemas/`,
  `lib/`+`utils/`, consolidate state management dirs.

---

## P3 (Low) Issues

### P3-1: Empty-ish Dot Directories — 12 Files Total

- **Category**: Dead Code
- **Evidence**: `.a5c/` (1 file), `.backup/` (1 file), `.zap/` (1 file),
  `.zencoder/` (1 file), `.devcontainer/` (1 file), `.husky/` (4 files) = 9
  files across 6 dirs
- **Recommendation**: Remove `.backup/` (stale single file), `.a5c/`, `.zap/`,
  `.zencoder/` (empty/one-file dirs). **Savings**: 4 directories removed.

### P3-2: `docs/notebooklm-sources/` — 22 Files, Single-Purpose

- **Category**: Documentation
- **Evidence**: 22 files in `cohorts/`, `monte-carlo/`, `pacing/`, `reserves/` —
  appear to be NotebookLM training data
- **Recommendation**: Move to `.ai/notebooklm/` or external knowledge base.

### P3-3: `archive/2025-10-07/directories-backup/repo/web-bundles/` — Game Dev Content

- **Category**: Dead Code
- **Evidence**: Contains `bmad-2d-phaser-game-dev/`, `bmad-2d-unity-game-dev/`,
  `bmad-infrastructure-devops/` — entire other projects with `agents/`,
  `teams/`, package.json files
- **Recommendation**: This is an embedded copy of an entirely different project.
  Delete immediately. **Savings**: ~100+ files, ~2MB.

### P3-4: `PATCHES/` Directory — 2 Files

- **Category**: Dead Code
- **Evidence**: `app-modifications.md`, `sidebar-modifications.md` — appear to
  be manual patch notes
- **Recommendation**: Move to docs or delete if changes are already applied.
  **Savings**: 2 files.

---

## Overall Statistics

### Configuration Files (Root Level)

| Type                | Count   | Total Lines      | Notes                                                     |
| ------------------- | ------- | ---------------- | --------------------------------------------------------- |
| tsconfig\*.json     | 5       | Current root set | Keep active boundaries; remove only proven-unused configs |
| vitest.config\*     | 6       | Current root set | `vitest.config.mjs` is active unit entry; delete last     |
| playwright.config\* | 2       | Current root set | Consolidate only after project/profile mapping            |
| eslint.config\*     | 2       | ~250             | OK (main + security)                                      |
| docker-compose\*    | 5       | 656              | Could use profiles                                        |
| Dockerfile\*        | 4       | 293              | 2 too many                                                |
| .env\*              | 11      | ~200             | 5-6 too many                                              |
| **TOTAL**           | **~55** | **~2,881**       | **~40 files could be consolidated**                       |

### Dead/Orphaned Directories

| Directory                 | Files                        | Size    | Action                                                |
| ------------------------- | ---------------------------- | ------- | ----------------------------------------------------- |
| `archive/`                | 0 current                    | n/a     | Already absent; no deletion action                    |
| `docs/archive/`           | 5 ignored working-tree files | ~20.1MB | Curate only if intentionally tracked                  |
| `docs/phase0-runner*.txt` | 0 current                    | n/a     | Already absent                                        |
| `repo/`                   | 241                          | 4.9MB   | Extract to separate repo                              |
| `.claude/`                | 226                          | 2.3MB   | Consolidate with ai-tools                             |
| `.config/`                | -                            | 1.7MB   | Rename/rehome                                         |
| `.planning/`              | 57                           | 1.3MB   | Move to external docs                                 |
| `src/` (root)             | 1 tracked                    | -       | Active route metadata mirror; migrate before deleting |
| `.backup/`                | 1                            | -       | Delete                                                |
| **TOTAL DELETABLE**       | **TBD**                      | **TBD** | Requires cleanup manifest and reference scans         |

### Documentation by Type

| Type           | Files | Size  | Notes                                |
| -------------- | ----- | ----- | ------------------------------------ |
| `.md` files    | 772   | -     | In docs/ alone                       |
| Images/PDFs    | ~200  | ~50MB | Mostly in references/attached_assets |
| `.txt` dumps   | ~50   | ~21MB | Baselines, logs                      |
| Auto-generated | ~100  | -     | \_generated/, notebooklm-sources     |

### Active vs Stale Package.json

| Location                   | Count | Status              |
| -------------------------- | ----- | ------------------- |
| Root                       | 1     | Active              |
| `packages/*/`              | 5     | Active (but sparse) |
| `tools/eslint-plugin-rls/` | 1     | Active              |
| `archive/`                 | 7     | Stale (delete)      |
| `repo/`                    | 2     | External project    |
| `tests/chaos/`             | 1     | Specialized         |

---

## Top 10 Recommended Actions (Priority Order)

1. **Capture baseline and cleanup manifest** - make deletion eligibility
   explicit before changing files.
2. **Classify `docs/references/attached_assets/`** - delete unused assets or
   externalize useful assets after reference scans.
3. **Curate ignored `docs/archive/` content** - only if it is intentionally
   reintroduced to tracked docs.
4. **Consolidate npm scripts** - retire wave/phase aliases after canonical
   commands exist.
5. **Preserve `src/core/routes/ia.ts` until migrated** - route-story tests
   currently depend on it.
6. **Consolidate Vitest aliases/configs by migration** - keep
   `vitest.config.mjs` until `test:unit` no longer needs it.
7. **Keep `tsconfig.shared.json` until references are removed** - do not delete
   active boundary configs.
8. **Decouple `packages/*` from scripts/tsconfigs before deleting or
   extracting**.
9. **Replace pre-push orchestration before deleting `scripts/pre-push.mjs`**.
10. **Add/fill domain truth tests before product-code semantic refactors**.

**Updated estimate:** do not claim safe bulk deletion until the cleanup manifest
classifies each target, records references, and names rollback validation.
