---
status: ACTIVE
last_updated: 2026-01-19
---

# CI Triage (GitHub Actions)

## Quick checks

```bash
(
: "${PR_NUMBER:?PR_NUMBER is required}"
: "${RUN_ID:?RUN_ID is required}"
gh pr checks "$PR_NUMBER" --json name,state,link
gh run view "$RUN_ID" --log-failed
gh api "/repos/nikhillinit/Updog_restore/actions/runs/${RUN_ID}/jobs?per_page=100"
)
```

## Job-specific logs

```bash
(
: "${RUN_ID:?RUN_ID is required}"
: "${JOB_ID:?JOB_ID is required}"
gh run view "$RUN_ID" --job "$JOB_ID" --log-failed
)
```

## Notes

- If a check is external (e.g., Vercel), record the URL and treat it as out of scope for Actions triage.
- Use `gh run list --workflow=<workflow.yml>` to find recent runs of a specific workflow.
- SARIF uploads may fail silently if the file doesn't exist; check hashFiles guards.
