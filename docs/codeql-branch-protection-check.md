# CodeQL Branch Protection Check Procedure

**Priority:** P0 - Critical Configuration Verification

## Background

The external review identified a potential branch protection deadlock risk with
CodeQL:

- CodeQL workflow runs on `push` to main AND `pull_request` to main
- If CodeQL is a required status check, it could create merge deadlocks
- Need to verify GitHub branch protection settings

## Current CodeQL Configuration

File: `.github/workflows/codeql.yml`

```yaml
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
  schedule: [{ cron: '0 3 * * 1' }] # Weekly Monday 3 AM
```

## Verification Steps

### 1. Check GitHub Branch Protection Settings

Navigate to: `https://github.com/[owner]/[repo]/settings/branches`

Verify the `main` branch protection rule:

**Required Status Checks:**

- Check if "CodeQL" is listed as a required check
- Check if "Require branches to be up to date before merging" is enabled

### 2. Recommended Configuration

**Option A: CodeQL as Required Check (Recommended)**

- Keep CodeQL in required checks list
- **CRITICAL:** Change trigger to PR only:
  ```yaml
  on:
    pull_request: { branches: [main] }
    schedule: [{ cron: '0 3 * * 1' }]
  ```
- Remove `push` trigger to avoid deadlock

**Option B: CodeQL as Optional Check**

- Remove CodeQL from required checks
- Keep current triggers (push + PR + schedule)
- Treat as advisory security scanning

**Option C: Separate Workflows**

- `codeql-pr.yml` - Runs on PR, required check
- `codeql-main.yml` - Runs on push to main, optional monitoring
- Schedule in main workflow only

## Deadlock Scenario

What causes deadlock:

1. Developer opens PR against main
2. CodeQL workflow starts (triggered by `pull_request`)
3. Branch protection requires "CodeQL" check to pass
4. Branch protection requires branch to be "up to date with base"
5. Developer merges another PR to main
6. Original PR now "out of date" - requires rebase/merge
7. Developer updates PR branch
8. CodeQL workflow restarts (new commits)
9. Meanwhile, CodeQL on main completes (triggered by `push`)
10. CodeQL check is now "stale" because it ran on old main commit
11. **DEADLOCK:** Can't merge because check is stale, but updating branch
    restarts check

## Fix Applied (if needed)

Document any changes made:

- [ ] Branch protection settings updated
- [ ] CodeQL workflow triggers modified
- [ ] Required checks list updated

## Verification

After any changes:

1. Create test PR
2. Verify CodeQL runs and completes
3. Merge test PR to main
4. Confirm no deadlock occurs
5. Check CodeQL runs on main (if push trigger kept)

## Related Files

- `.github/workflows/codeql.yml` - CodeQL workflow
- `.github/CI-PHILOSOPHY.md` - CI/CD strategy
- `.github/workflows/security-scan.yml` - Other security checks

## References

- GitHub Docs:
  [Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- CodeQL Action: [github/codeql-action](https://github.com/github/codeql-action)
