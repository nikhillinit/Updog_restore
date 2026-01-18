---
type: reflection
id: REFL-017
title: CI Workflow Permission Errors
status: DRAFT
date: 2026-01-18
version: 1
severity: low
wizard_steps: []
error_codes: [HttpError, 404, 403]
components: [ci, github-actions, permissions]
keywords: [github-actions, permissions, pull-requests, write, GITHUB_TOKEN, workflow]
test_file: tests/regressions/REFL-017.test.ts
superseded_by: null
---

# Reflection: CI Workflow Permission Errors

## 1. The Anti-Pattern (The Trap)

**Context:** GitHub Actions workflows that try to comment on PRs or modify repository content fail with cryptic "HttpError: Not Found" errors when they lack required permissions.

**How to Recognize This Trap:**
1.  **Error Signal:** `HttpError: Not Found` or `HttpError: Resource not accessible by integration` from GitHub API calls in CI
2.  **Code Pattern:** Workflow YAML without explicit permissions:
    ```yaml
    # ANTI-PATTERN
    name: Bundle Size Check
    on: pull_request

    jobs:
      check:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - run: npm run build
          - uses: some-action/pr-comment@v1
            # Fails: no permission to comment on PR
    ```
3.  **Mental Model:** "GITHUB_TOKEN has all necessary permissions by default." Since 2021, GitHub Actions uses restrictive default permissions for security.

**Financial Impact:** CI jobs fail silently or with misleading errors. Teams waste time debugging "Not Found" errors that are actually permission issues.

> **DANGER:** Do NOT assume workflows have write access without explicit permission grants.

## 2. The Verified Fix (The Principle)

**Principle:** Explicitly declare minimum required permissions in workflow YAML.

**Implementation Pattern:**
1.  Add `permissions` block at job or workflow level
2.  Use least-privilege: only grant permissions actually needed
3.  Document why each permission is required

```yaml
# VERIFIED IMPLEMENTATION

name: Bundle Size Check
on: pull_request

# Workflow-level permissions (applies to all jobs)
permissions:
  contents: read        # Required for checkout
  pull-requests: write  # Required for PR comments

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm run build

      # Now has permission to comment
      - name: Comment bundle size
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: 'Bundle size: 150KB'
            })

# Alternative: Job-level permissions (more granular)
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - run: npm run build

  comment:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Comment on PR
        uses: actions/github-script@v7
        # ...
```

**Common Permissions:**
| Permission | Use Case |
|------------|----------|
| `contents: read` | Checkout code |
| `contents: write` | Push commits, create releases |
| `pull-requests: write` | Comment on PRs, update PR status |
| `issues: write` | Create/update issues |
| `packages: write` | Publish to GitHub Packages |

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-017.test.ts` validates permission checking
*   **Source Session:** Jan 8-18 2026 - Bundle size PR comment failures
*   **GitHub Docs:** https://docs.github.com/en/actions/security-guides/automatic-token-authentication
