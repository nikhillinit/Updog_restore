---
type: reflection
id: REFL-029
title: GitHub Actions Secrets in if Expressions Invalidate Workflows
status: DRAFT
date: 2026-03-17
version: 1
severity: medium
wizard_steps: []
error_codes: [ERR_WORKFLOW_INVALID, ERR_NO_JOB_LOGS]
components: [ci, github-actions, workflow, secrets, zap]
keywords:
  [
    github-actions,
    workflow-validation,
    secrets,
    if-expression,
    env-guard,
    zap,
    no-jobs,
  ]
test_file: tests/regressions/REFL-029.test.ts
superseded_by: null
---

# Reflection: GitHub Actions Secrets in if Expressions Invalidate Workflows

## 1. The Anti-Pattern (The Trap)

**Context:** A workflow tries to skip optional work when a secret is unset by
putting `secrets.MY_SECRET` directly inside a workflow or job `if:` expression.
GitHub validates the workflow before any runner work starts, and this pattern
can cause the entire run to fail as a workflow-definition error instead of
cleanly skipping the optional job.

**How to Recognize This Trap:**

1. **Error Signal:** The Actions UI shows "This run likely failed because of a
   workflow file issue." `gh run view <id>` returns a failed run with zero jobs,
   and `gh run view <id> --log-failed` returns `log not found`.
2. **Code Pattern:** Optional job gating written like this:

   ```yaml
   jobs:
     optional_scan:
       if: ${{ secrets.ZAP_BASE_URL != '' }}
       runs-on: ubuntu-latest
   ```

3. **Mental Model:** Assuming `secrets.*` is safe anywhere expressions are
   supported. In practice, secret handling is more restricted than normal
   expression contexts, so a "skip if missing" guard can invalidate the whole
   workflow.

**Financial Impact:** Required branch checks fail before any useful work runs.
Teams waste time trying to fetch nonexistent runner logs, scheduled security
jobs silently stop providing coverage, and merges are blocked by CI noise
instead of code failures.

> **DANGER:** Do NOT reference `secrets.*` directly in workflow or job `if:`
> conditions when the goal is to skip optional work.

## 2. The Verified Fix (The Principle)

**Principle:** Resolve secrets into `env` or step outputs first, then gate later
steps on those values. Skip optional work inside the job, not by putting
`secrets.*` directly in the job-level condition.

**Implementation Pattern:**

1. Copy the secret into job `env`
2. Add an explicit skip step for the unset case
3. Gate the real action step on `env.*` or step outputs

```yaml
# VERIFIED IMPLEMENTATION
jobs:
  zap_scan:
    runs-on: ubuntu-latest
    env:
      ZAP_BASE_URL: ${{ secrets.ZAP_BASE_URL }}
    steps:
      - name: Skip when ZAP_BASE_URL is not configured
        if: ${{ env.ZAP_BASE_URL == '' }}
        run:
          echo "Skipping ZAP baseline scan because ZAP_BASE_URL is not
          configured."

      - name: ZAP Baseline Scan
        if: ${{ env.ZAP_BASE_URL != '' }}
        uses: zaproxy/action-baseline@v0.12.0
        with:
          target: ${{ env.ZAP_BASE_URL }}
          rules_file_name: '.zap/rules.tsv'
          fail_action: true
          cmd_options: '-a'
```

**Key Learnings:**

1. A run with zero jobs and no failed-job logs is often a workflow-definition
   failure, not a runner failure
2. The right debugging path is metadata first: `gh run view`, then workflow YAML
3. Optional security workflows should degrade to an explicit skip, not a hard
   failure, when their required secret is absent

## 3. Evidence

- **Source Session:** 2026-03-17 CI triage after push to `main`
- **GitHub Actions Runs:** `23224844394`, `23223711713`, `23213864085`
- **Workflow Affected:**
  [zap-baseline.yml](/C:/dev/Updog_restore/.github/workflows/zap-baseline.yml)
- **Verified Fix:** Job-level `env` plus step-level guards replaced the invalid
  `if: ${{ secrets.ZAP_BASE_URL != '' }}`
- **Related:** REFL-017 (CI workflow permissions), REFL-002 (post-merge jobs not
  validated by PR CI)
