# CI Workflow Cleanup Plan

## Context

Audit of 15 workflows found 10 issues: broken steps, dead code, redundancy,
undocumented workflows, and unused artifacts. This plan groups fixes into
risk-ordered batches.

## Decision: Keep vs Merge vs Delete

| Workflow                | Verdict         | Rationale                                                                     |
| ----------------------- | --------------- | ----------------------------------------------------------------------------- |
| ci-unified.yml          | KEEP + FIX      | Central pipeline, has 3 fixable issues                                        |
| code-quality.yml        | KEEP (trimmed)  | PR metrics comment is unique value; remove redundant lint/tsc                 |
| security-tests.yml      | KEEP            | Path-triggered security tests fill gap ci-unified doesn't cover without label |
| zap-baseline.yml        | KEEP (guarded)  | Useful when secret configured; add early-exit guard                           |
| reflection-validate.yml | KEEP + DOCUMENT | Working, just undocumented                                                    |
| skip-counter.yml        | KEEP + DOCUMENT | Working, just undocumented                                                    |
| All others              | NO CHANGES      | Not in scope                                                                  |

## Batch 1: Fix broken/dead code in ci-unified.yml (safe, no behavior change)

### 1a. Remove dead security-test step (lines 435-438)

The `hashFiles('tests/security/**/*.test.ts')` gate always returns empty because
`tests/security/` doesn't exist — tests live in `tests/integration/security/`.
The step never executes. The standalone `security-tests.yml` already handles
this correctly via `npm run test:security` which targets
`tests/integration/security`.

**Action:** Delete lines 435-438 entirely. The `npm audit` step above (line 433)
remains. Security test coverage is handled by `security-tests.yml`.

### 1b. Remove broken alert-drills job (lines 475-531)

Service container bind mounts reference `${{ github.workspace }}/monitoring/*`
but services start before `actions/checkout`, so workspace is empty. Job is
manual-trigger only (`run_alert_drills` input) and has never succeeded.

**Action:** Delete the entire `alert-drills` job (lines 475-531). Also remove
the `run_alert_drills` workflow_dispatch input (lines 24-28). If alert drilling
is needed later, rebuild it with proper ordering (checkout first, then start
services via docker-compose in a step rather than GHA service containers).

### 1c. Remove unused production-build artifact upload (lines 404-412)

Uploaded with 7-day retention, never downloaded by any job or workflow.

**Action:** Delete lines 404-412. The build step itself remains — only the
artifact upload is removed.

## Batch 2: Trim code-quality.yml redundancy

### 2a. Remove type-safety-check job (lines 276-359)

This entire job runs `tsc --project tsconfig.strict.json --noEmit` with `exit 0`
— it can never fail. It also does an `any`-type grep analysis. Both are
informational-only, the artifact is never downloaded, and the strict check is
not actionable. The quality-gate job already runs tsc and counts `any` types.

**Action:** Delete the `type-safety-check` job entirely.

### 2b. Remove quality-reports artifact (lines 263-274)

The `quality-reports` artifact (metrics-report.md, fixes-report.md,
eslint-results.txt, typecheck-results.txt) is uploaded but never downloaded. The
PR comment already contains all the same information.

**Action:** Delete lines 263-274.

## Batch 3: Guard zap-baseline.yml against missing secret

### 3a. Add early-exit when ZAP_BASE_URL is not configured

Currently fails silently on weekly schedule if secret is missing.

**Action:** Add a guard step before the ZAP scan:

```yaml
- name: Check ZAP configuration
  id: config
  run: |
    if [ -z "${{ secrets.ZAP_BASE_URL }}" ]; then
      echo "skip=true" >> $GITHUB_OUTPUT
      echo "::notice::ZAP_BASE_URL secret not configured, skipping scan"
    fi
- name: ZAP Baseline Scan
  if: steps.config.outputs.skip != 'true'
  ...
```

## Batch 4: Document reflection-validate.yml and skip-counter.yml

### 4a. Update CI-CD-STATUS-REPORT.md

- Add both workflows to the documented list
- Update count from 13 to 15
- Categorize: reflection-validate.yml under "Documentation Workflows" (3 -> 4),
  skip-counter.yml under "Core Quality Gates" (5 -> 6)
- Fix header counts to match

## Batch 5: Remove remaining unused artifacts across workflows

Review each unused artifact and remove if truly unconsumed:

| Artifact                    | Workflow               | Action                                   |
| --------------------------- | ---------------------- | ---------------------------------------- |
| quality-reports             | code-quality.yml       | DELETE (Batch 2b)                        |
| type-safety-reports         | code-quality.yml       | DELETE (Batch 2a removes job)            |
| validation-report           | docs-validate.yml      | KEEP (useful for debugging doc failures) |
| discovery-routing-artifacts | docs-routing-check.yml | KEEP (useful for debugging)              |
| dependency-check-reports    | security-scan.yml      | KEEP (compliance artifact)               |
| sbom-cyclonedx              | security-scan.yml      | KEEP (compliance artifact)               |

Only 2 artifacts removed (both via Batch 2). The rest serve debugging or
compliance purposes even if not programmatically consumed.

## Files Modified

| File                                 | Changes                                                                |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `.github/workflows/ci-unified.yml`   | Remove dead security step, alert-drills job, production-build artifact |
| `.github/workflows/code-quality.yml` | Remove type-safety-check job and quality-reports artifact              |
| `.github/workflows/zap-baseline.yml` | Add secret guard                                                       |
| `docs/CI-CD-STATUS-REPORT.md`        | Add 2 undocumented workflows, fix counts                               |

## Not In Scope

- **security-tests.yml redundancy**: Keep as-is. ci-unified requires label,
  security-tests.yml triggers on file paths — complementary, not duplicative.
- **code-quality.yml quality-gate job**: Keep as-is. The PR comment with metrics
  table is unique value not in ci-unified.
- **Memory-mode job in ci-unified**: `test:memory` and `verify:no-redis` scripts
  exist. Manual-trigger only. Working correctly.

## Verification

After all changes:

1. `grep -r "alert-drill" .github/` should return nothing
2. `grep -r "tests/security/" .github/` should return nothing
3. `grep -r "production-build" .github/` should return nothing
4. `grep -r "type-safety" .github/workflows/code-quality.yml` should return
   nothing
5. Workflow count in CI-CD-STATUS-REPORT.md matches actual file count (15)

## Risk Assessment

All changes are deletions of dead/broken code or additions of guards. No
behavioral changes to working CI paths. The CI gate job (ci-unified.yml:654-699)
depends on `check`, `test-affected`, `test-full`, `build`, and `guards` — none
of which are modified except `build` (removing the unused artifact upload, build
step itself untouched).
