# CI Triage (GitHub Actions)

## Quick checks

```bash
gh pr checks <pr> --json name,state,link
gh run view <run_id> --log-failed
gh api "/repos/nikhillinit/Updog_restore/actions/runs/<run_id>/jobs?per_page=100"
```

## Job-specific logs

```bash
gh run view <run_id> --job <job_id> --log-failed
```

## Notes

- If a check is external (e.g., Vercel), record the URL and treat it as out of scope for Actions triage.
- Use `gh run list --workflow=<workflow.yml>` to find recent runs of a specific workflow.
- SARIF uploads may fail silently if the file doesn't exist; check hashFiles guards.
