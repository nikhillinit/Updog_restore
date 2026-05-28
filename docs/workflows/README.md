---
status: ACTIVE
last_updated: 2026-05-28
---

# GitHub Actions Workflows Inventory

## Overview

This README is a lightweight, repo-verified index of the workflow files
currently present in `.github/workflows`.

**Verified on**: 2026-05-28

- **Total tracked workflow YAML files**: `19`
- **Source of truth**: `.github/workflows/*.yml`
- **Active GitHub registry**: May contain deleted historical workflows and
  GitHub-generated workflows such as Dependabot, Pages, or Copilot entries.
  Treat registry cleanup as an operations task separate from YAML refactors.
- **Historical machine-readable snapshot**:
  `docs/archive/2026-q2/generated-inventory-snapshots/inventory.generated.json`

Older roll-up metrics in this file, including YAML line totals, secret counts,
status tallies, badge-consumer counts, and consolidation targets, were removed
because they no longer matched the live repository.

## Files in This Directory

- Historical snapshot:
  `docs/archive/2026-q2/generated-inventory-snapshots/inventory.generated.json`
- No live machine-readable workflow inventory is currently checked in under
  `docs/workflows/`
- `CONSOLIDATION_PLAN_V2.md` - Historical consolidation planning
- `CONSOLIDATION_PLAN_V3_FINAL.md` - Historical consolidation planning
- `PAIRED-AGENT-VALIDATION.md` - Historical validation notes
- `PRODUCTION_SCRIPTS.md` - Production-script reference
- `README.md` - This repo-verified workflow index

## Current Workflow Files

The repository currently contains these workflow files:

1. `archive-guard.yml`
2. `bundle-size-check.yml`
3. `ci-unified.yml`
4. `claude-code-review.yml`
5. `claude.yml`
6. `code-quality.yml`
7. `codeql.yml`
8. `core-validation.yml`
9. `dependency-validation.yml`
10. `dockerfile-lint.yml`
11. `docs-routing-check.yml`
12. `docs-validate.yml`
13. `reflection-validate.yml`
14. `security-scan.yml`
15. `security-tests.yml`
16. `skip-counter.yml`
17. `testcontainers-ci.yml`
18. `verify-strategic-docs.yml`
19. `zap-baseline.yml`

## Batch 11 Classification

Batch 11 classified the tracked workflow inventory before any CI consolidation.
No workflow was deleted in this batch.

Live evidence from 2026-05-28:

- `git ls-files .github/workflows` returned the 19 files listed above.
- `Get-ChildItem .github/workflows -File` returned 19 tracked `.yml` files.
- GitHub branch protection for `main` is enabled, but `required_status_checks`
  is `null`.
- `gh api repos/nikhillinit/Updog_restore/rulesets` returned `[]`.
- The GitHub Actions registry still contains deleted historical and dynamic
  workflows, so registry state is not safe-deletion evidence for tracked YAML.

Required-check relevance below uses the live branch-protection evidence. `None`
means the workflow is not currently required by GitHub branch protection or a
repository ruleset; it does not prove the workflow is unused by external status
consumers.

| Workflow                    | Purpose / jobs                                                                                                                                                                              | Triggers                                                                                           | Permissions / secrets                                                                                                             | Required-check relevance                                          | Duplicate or overlap                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `archive-guard.yml`         | Blocks tracked archive/backup directories (`archive-guard`)                                                                                                                                 | PRs touching archive/backup/governance guard paths; manual                                         | `contents: read`; no secrets                                                                                                      | None                                                              | Overlaps `ci-unified.yml` Governance Guards archive/large-file checks                                     |
| `bundle-size-check.yml`     | Builds base and PR branches, compares bundle-size reports, comments on PR (`build-base`, `build-pr`, `compare`)                                                                             | PRs to `main` or `feat/iteration-a-deterministic-engine` touching client/shared/build budget paths | `contents: read`, `pull-requests: write`; no secrets                                                                              | None                                                              | Overlaps `ci-unified.yml` build/bundle check, but adds base-vs-PR comparison and comments                 |
| `ci-unified.yml`            | Main CI fanout and pass-through gate (`changes`, docs links, typecheck/lint/unit-fast, affected/full tests, build, dependency, security, memory, guards, quality summary, `CI Gate Status`) | PRs to `main`/`develop`; pushes to `main`; manual inputs                                           | `actions: read`, `contents: read`, `pull-requests: write`, `security-events: write`; no secrets                                   | Planned required-check candidate after parity, not required today | Owns most overlap by design; future consolidation target                                                  |
| `claude-code-review.yml`    | Label-gated Claude PR review (`changes`, `claude-review`)                                                                                                                                   | PR opened/synchronized/ready/reopened                                                              | Job grants `contents: read`, `pull-requests: read`, `issues: read`, `id-token: write`; `CLAUDE_CODE_OAUTH_TOKEN`                  | None                                                              | Distinct AI review lane; shares change detection with `ci-unified.yml`                                    |
| `claude.yml`                | Comment/issue-triggered Claude responder (`claude`)                                                                                                                                         | Issue comments, PR review comments, issue opened/assigned, PR reviews containing `@claude`         | Job grants `contents: read`, `pull-requests: read`, `issues: read`, `id-token: write`, `actions: read`; `CLAUDE_CODE_OAUTH_TOKEN` | None                                                              | Distinct interactive AI lane                                                                              |
| `code-quality.yml`          | Manual code-quality metric counts (`metrics`)                                                                                                                                               | Manual only                                                                                        | `contents: read`; no secrets                                                                                                      | None                                                              | Overlaps `ci-unified.yml` PR Code Quality Metrics                                                         |
| `codeql.yml`                | CodeQL code scanning (`changes`, `analyze`)                                                                                                                                                 | Push to `main`; PRs to `main`; weekly schedule; manual                                             | `actions: read`, `contents: read`, `security-events: write`; no secrets                                                           | None                                                              | Overlaps security reporting surface but owns CodeQL analysis                                              |
| `core-validation.yml`       | Manual `npm run validate:core` with DB setup (`validate-core`)                                                                                                                              | Manual only                                                                                        | Not declared; no secrets                                                                                                          | None                                                              | Overlaps `ci-unified.yml` full-test `validate-core` matrix group                                          |
| `dependency-validation.yml` | Weekly/manual Windows dependency and doctor validation (`validate-windows`)                                                                                                                 | Weekly schedule; manual                                                                            | Not declared; no secrets                                                                                                          | None                                                              | Overlaps `ci-unified.yml` Linux dependency validation but covers Windows                                  |
| `dockerfile-lint.yml`       | Hadolint SARIF upload for Dockerfiles (`hadolint`)                                                                                                                                          | PR/push touching Dockerfiles or this workflow                                                      | `contents: read`, `security-events: write`; no secrets                                                                            | None                                                              | Adjacent to `security-scan.yml` container scan, but checks Dockerfile lint                                |
| `docs-routing-check.yml`    | Regenerates/checks discovery routing artifacts (`validate-routing`)                                                                                                                         | Docs/routing path PRs and pushes to `main`; manual                                                 | Not declared; no secrets                                                                                                          | None                                                              | Overlaps docs validation generally, but owns generated router freshness                                   |
| `docs-validate.yml`         | Waterfall/domain docs validation and PR comment (`validate-waterfall-docs`)                                                                                                                 | PRs touching waterfall truth/docs/scripts; manual                                                  | `contents: read`, `pull-requests: write`; no secrets                                                                              | None                                                              | Distinct domain-doc validation; overlaps docs lanes only by category                                      |
| `reflection-validate.yml`   | Reflection/skill validation (`validate-reflections`)                                                                                                                                        | PRs touching `docs/skills`, REFL regressions, or skill management script; manual                   | `contents: read`; no secrets                                                                                                      | None                                                              | Distinct skill/REFL policy lane                                                                           |
| `security-scan.yml`         | Deep security scan, SARIF uploads, license check, OWASP dependency-check, SBOM, pass-through status (`security-scan`)                                                                       | Weekly schedule; manual; PRs to `main`/`develop`; pushes to `main`                                 | `contents: read`, `security-events: write`; `NVD_API_KEY`                                                                         | None                                                              | Overlaps `ci-unified.yml` PR Light Security for npm audit/Trivy, but owns deeper scheduled scans and SBOM |
| `security-tests.yml`        | Manual security integration tests with Postgres/Redis (`security`)                                                                                                                          | Manual only                                                                                        | Not declared; no secrets                                                                                                          | None                                                              | Overlaps `ci-unified.yml` Security Integration Tests                                                      |
| `skip-counter.yml`          | Counts `.skip`/`.todo` and enforces quarantine threshold (`count-skips`)                                                                                                                    | PRs touching tests/Vitest config                                                                   | Not declared; no secrets                                                                                                          | None                                                              | Adjacent to test governance; no equivalent enforcement in `ci-unified.yml`                                |
| `testcontainers-ci.yml`     | Docker-managed Testcontainers integration suite (`testcontainers`)                                                                                                                          | PR labeled `test:docker` or `test:integration`; manual                                             | Not declared; no secrets                                                                                                          | None                                                              | Distinct Docker/Testcontainers lane, separate from DB service tests in `ci-unified.yml`                   |
| `verify-strategic-docs.yml` | Remark, emoji, link, and summary checks for strategic analysis docs (`verify-docs`)                                                                                                         | PR/push touching `docs/analysis`, `.remarkrc.mjs`, or `package.json`                               | Not declared; no secrets                                                                                                          | None                                                              | Overlaps docs link/emoji concerns but targets strategic analysis docs                                     |
| `zap-baseline.yml`          | OWASP ZAP baseline scan (`zap_scan`)                                                                                                                                                        | Weekly schedule; manual                                                                            | Not declared; `ZAP_BASE_URL`                                                                                                      | None; registry was `disabled_manually` at review time             | Distinct DAST lane; overlaps security category only                                                       |

### Classification Decisions

| Workflow                    | Classification            | Deletion blocker                                                                                                     | Safe-deletion evidence |
| --------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `archive-guard.yml`         | Consolidate later         | `ci-unified.yml` overlap exists, but replacement status behavior and external status consumers are not settled       | None sufficient        |
| `bundle-size-check.yml`     | Consolidate later         | Base-vs-PR comparison, PR comments, and write permissions are not replaced by `ci-unified.yml`                       | None sufficient        |
| `ci-unified.yml`            | Keep                      | Main CI/gate owner and planned required-check candidate                                                              | Not applicable         |
| `claude-code-review.yml`    | Keep                      | Label-gated AI review uses Claude OAuth and job-level permissions                                                    | Not applicable         |
| `claude.yml`                | Keep                      | Interactive `@claude` issue/PR workflow uses Claude OAuth and event-specific permissions                             | Not applicable         |
| `code-quality.yml`          | Delete candidate, blocked | Manual metric workflow may still be used from Actions UI; no owner decision or replacement command has been recorded | None sufficient        |
| `codeql.yml`                | Keep                      | Owns CodeQL/security-events upload and scheduled code scanning                                                       | Not applicable         |
| `core-validation.yml`       | Consolidate later         | Manual `validate:core` entry point may be used for release/debug runs                                                | None sufficient        |
| `dependency-validation.yml` | Keep                      | Windows scheduled dependency validation is distinct from Linux CI dependency validation                              | Not applicable         |
| `dockerfile-lint.yml`       | Keep                      | Dockerfile SARIF lint has no exact replacement in security scan                                                      | Not applicable         |
| `docs-routing-check.yml`    | Keep                      | Owns generated routing artifact freshness                                                                            | Not applicable         |
| `docs-validate.yml`         | Keep                      | Owns waterfall/domain documentation validation and PR comments                                                       | Not applicable         |
| `reflection-validate.yml`   | Keep                      | Owns reflection and skill index validation                                                                           | Not applicable         |
| `security-scan.yml`         | Keep                      | Owns scheduled deep scans, SARIF uploads, license checks, dependency-check, and SBOM                                 | Not applicable         |
| `security-tests.yml`        | Consolidate later         | Manual security-test trigger and environment differ from `ci-unified.yml`; keep until manual replacement is proven   | None sufficient        |
| `skip-counter.yml`          | Keep                      | Owns skip/quarantine threshold enforcement                                                                           | Not applicable         |
| `testcontainers-ci.yml`     | Keep                      | Owns label-gated/manual Docker/Testcontainers validation                                                             | Not applicable         |
| `verify-strategic-docs.yml` | Consolidate later         | Strategic-doc-specific lint/link/emoji summary is not replaced by routing checks                                     | None sufficient        |
| `zap-baseline.yml`          | Keep                      | Distinct DAST workflow; deletion needs security/ops sign-off even though the registry is disabled                    | Not applicable         |

Batch 11 outcome: no workflow has enough safe-deletion evidence for removal. The
next CI cleanup step is a separate consolidation decision pass using this
classification map, with branch-protection/status-consumer policy resolved
before any YAML deletion or required-check migration.

## Post-Batch 11 Candidate Pass: `code-quality.yml`

The first deletion-candidate pass after Batch 11 evaluated `code-quality.yml`
from clean `main` at `e7699495105e7c257887bbeb0ee24374f02413e3`.

Fresh evidence from 2026-05-28:

- `git status --short --branch` returned `## main...origin/main`.
- `git ls-files .github/workflows` still returned the same 19 tracked workflow
  files.
- GitHub branch protection for `main` still returned
  `required_status_checks: null`; repository rulesets still returned `[]`.
- The GitHub Actions registry still lists `Code Quality Metrics` at
  `.github/workflows/code-quality.yml` with state `active`.
- The latest registry run sample for `code-quality.yml` was successful but
  historical: the newest listed run was created on `2026-05-21T11:24:54Z`, and
  the sample includes earlier `push` / `pull_request` events from before the
  current manual-only workflow shape.
- `ci-unified.yml` has an overlapping `quality-summary` job named
  `Code Quality Metrics`, but it is PR-only and runs only for heavy CI-relevant
  PRs. It comments on PRs; it does not replace the manual Actions UI summary
  entry owned by `code-quality.yml`.

Decision: do not delete `code-quality.yml` in this slice. The workflow remains
`Delete candidate, blocked` until a maintainer confirms the manual Actions entry
is no longer needed, or an equivalent manual command/reporting path is
documented and external status-consumer risk is resolved.

Next evidence needed before deletion:

1. Owner policy for retiring or keeping the manual `Code Quality Metrics`
   Actions entry.
2. Replacement behavior for manual metric reporting, if the manual entry is
   still useful.
3. A status-consumer check for dashboards, scripts, badges, or automations that
   may refer to `Code Quality Metrics` or `.github/workflows/code-quality.yml`.
4. A fresh branch-protection, ruleset, tracked-workflow, and Actions-registry
   check on the deletion branch.

## Inventory Format

When a workflow inventory is regenerated, it should follow a shape like this:

```json
{
  "workflow": "workflow-name.yml",
  "lines": 123,
  "lastModified": "2026-04-18",
  "hasOnTrigger": true,
  "secretsCount": 0,
  "badgeConsumers": 0,
  "workflowCallConsumers": 0,
  "status": "ACTIVE"
}
```

### Field Descriptions

- **workflow**: Workflow filename
- **lines**: YAML line count at inventory time
- **lastModified**: Last modified date recorded by the inventory generator
- **hasOnTrigger**: Whether the workflow defines an `on:` trigger
- **secretsCount**: Secret references counted by the inventory generator
- **badgeConsumers**: Number of badge or doc references counted
- **workflowCallConsumers**: Number of inbound workflow calls counted
- **status**: Inventory status assigned by the generator

## Maintenance Notes

- This README should only claim metrics that are easy to verify from the live
  repo.
- Use `CI Unified / CI Gate Status` as the planned required branch-protection
  check after parity. Do not require standalone path-filtered workflows unless
  they are proven to report a status for every PR shape.
- If you need exact trigger, secret, or workflow-call statistics, regenerate the
  machine-readable inventory instead of hand-editing this file.
- If the workflow file count changes, update the verified count and file list in
  this README.

## Quick Verification Commands

```powershell
# Count workflow files
(Get-ChildItem -Path '.github/workflows' -File | Measure-Object).Count

# List current workflow files
Get-ChildItem -Path '.github/workflows' -File | Sort-Object Name |
  Select-Object -ExpandProperty Name
```
