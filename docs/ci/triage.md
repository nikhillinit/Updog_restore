---
status: ACTIVE
last_updated: 2026-01-19
---

# CI Triage (GitHub Actions)

## Quick checks

```bash
(
collect_ci_triage() {
  case ${PR_NUMBER:-} in
    ''|*[!0-9]*) printf '%s\n' 'PR_NUMBER must contain decimal digits only' >&2; return 2 ;;
  esac
  case $PR_NUMBER in
    *[1-9]*) ;;
    *) printf '%s\n' 'PR_NUMBER must be greater than zero' >&2; return 2 ;;
  esac
  case ${RUN_ID:-} in
    ''|*[!0-9]*) printf '%s\n' 'RUN_ID must contain decimal digits only' >&2; return 2 ;;
  esac
  case $RUN_ID in
    *[1-9]*) ;;
    *) printf '%s\n' 'RUN_ID must be greater than zero' >&2; return 2 ;;
  esac

  ci_triage_status=0
  gh pr checks "$PR_NUMBER" --json name,state,link || ci_triage_status=$?
  gh run view "$RUN_ID" --log-failed || {
    ci_command_status=$?
    if [ "$ci_triage_status" -eq 0 ]; then ci_triage_status=$ci_command_status; fi
  }
  gh api "/repos/nikhillinit/Updog_restore/actions/runs/${RUN_ID}/jobs?per_page=100" || {
    ci_command_status=$?
    if [ "$ci_triage_status" -eq 0 ]; then ci_triage_status=$ci_command_status; fi
  }
  return "$ci_triage_status"
}

collect_ci_triage
)
```

## Job-specific logs

```bash
(
collect_job_log() {
  case ${RUN_ID:-} in
    ''|*[!0-9]*) printf '%s\n' 'RUN_ID must contain decimal digits only' >&2; return 2 ;;
  esac
  case $RUN_ID in
    *[1-9]*) ;;
    *) printf '%s\n' 'RUN_ID must be greater than zero' >&2; return 2 ;;
  esac
  case ${JOB_ID:-} in
    ''|*[!0-9]*) printf '%s\n' 'JOB_ID must contain decimal digits only' >&2; return 2 ;;
  esac
  case $JOB_ID in
    *[1-9]*) ;;
    *) printf '%s\n' 'JOB_ID must be greater than zero' >&2; return 2 ;;
  esac

  gh run view "$RUN_ID" --job "$JOB_ID" --log-failed
}

collect_job_log
)
```

## Notes

- If a check is external (e.g., Vercel), record the URL and treat it as out of
  scope for Actions triage.
- Use `gh run list --workflow=<workflow.yml>` to find recent runs of a specific
  workflow.
- SARIF uploads may fail silently if the file doesn't exist; check hashFiles
  guards.
