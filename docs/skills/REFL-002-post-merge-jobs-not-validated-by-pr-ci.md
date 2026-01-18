---
type: reflection
id: REFL-002
title: Post-Merge Jobs Not Validated by PR CI
status: VERIFIED
date: 2026-01-18
version: 1
severity: high
wizard_steps: []
error_codes: []
components: [ci, github-actions, workflows]
keywords: [post-merge, pr-ci, push-only, workflow-conditions, report-metrics]
test_file: tests/regressions/REFL-002.test.ts
superseded_by: null
---

# Reflection: Post-Merge Jobs Not Validated by PR CI

## 1. The Anti-Pattern (The Trap)

**Context:** CI workflows have jobs that only run on push to main, not on PR checks. Changes to these jobs or their inputs are not validated until after merge.

**How to Recognize This Trap:**
1.  **Error Signal:** Post-merge failures that weren't caught by PR CI checks
2.  **Code Pattern:** Job conditions like:
    ```yaml
    report-metrics:
      if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    ```
3.  **Mental Model:** Assuming "all green in PR CI means safe to merge" - ignoring jobs that only run on push.

**Financial Impact:** Schema changes to CI artifacts (e.g., `bundle-metrics.json`) can break post-merge reporting. Dashboards and metrics pipelines fail silently or report garbage data, masking performance regressions in production.

> **DANGER:** Do NOT assume PR CI validates all workflow jobs. Check for push-only conditions before modifying shared artifacts.

## 2. The Verified Fix (The Principle)

**Principle:** Audit workflow conditions before modifying shared artifacts.

**Implementation Pattern:**
1.  Before changing any CI artifact format, search for all consumers
2.  Identify jobs with `github.event_name == 'push'` conditions
3.  Test schema compatibility manually or add validation
4.  Document post-merge-only jobs in CI documentation

```yaml
# VERIFIED IMPLEMENTATION
# Add schema validation BEFORE uploading artifacts

- name: Validate bundle-metrics schema
  run: |
    # Ensure backward compatibility with existing consumers
    jq -e '(.size | type=="number") and (.timestamp | type=="string")' bundle-metrics.json >/dev/null
    echo "Schema validation passed"

- name: Upload metrics
  uses: actions/upload-artifact@v4
  with:
    name: bundle-metrics
    path: bundle-metrics.json
```

**Backward-Compatible Schema Pattern:**
```json
{
  "size": 158549,          // number - for legacy jq consumers
  "timestamp": "...",      // string - ISO 8601
  "entries": [...]         // array - new field for future use
}
```

**Key Learnings:**
1. Jobs with `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` are invisible to PR CI
2. Schema changes must maintain backward compatibility
3. Add validation before artifact upload to catch format regressions

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-002.test.ts` validates workflow condition detection
*   **Source Session:** `docs/plans/2026-01-15-ci-routing-bundle-fix/findings.md` - Discovery 3
*   **Example:** `report-metrics` job in `performance-gates.yml` line 225 expects `{"size": number}`
