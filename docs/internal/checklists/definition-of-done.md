---
status: ACTIVE
last_updated: 2026-01-19
---

# Tiny DoD Template (10 Lines)

Use this template as a footer for every Phase 3 documentation file:

```markdown
## Definition of Done

**Security/Reliability:** Input validation at [X]; [Y]s timeout; [Z]x retry w/
backoff **Observability:** Log `{[fields]}`; metric: `[name]`; span: `[name]`
**Performance:** Target p95 < [X]ms; cache: staleTime=[Y]s ([data type])
**Example:** `[command]` → [expected result] **Ownership:** DRI=you; next
review: [date+6mo]
```

## Instructions

Replace bracketed placeholders with actual values:

- **[X]**: Specific validation point (e.g., "route entry", "service layer",
  "engine input")
- **[Y]s**: Timeout duration in seconds
- **[Z]x**: Number of retry attempts
- **[fields]**: Structured log fields (e.g., `userId, fundId, operation`)
- **[name]**: Metric or span name from Prometheus/OpenTelemetry
- **[X]ms**: Performance target in milliseconds
- **[Y]s**: Cache staleTime in seconds
- **[data type]**: What's being cached (e.g., "fund data", "portfolio
  companies")
- **[command]**: Runnable example command
- **[expected result]**: What should happen when command runs
- **[date+6mo]**: Six months from documentation creation date

## Example (Complete DoD)

```markdown
## Definition of Done

**Security/Reliability:** Input validation at route entry; 30s timeout; 3x retry
w/ exponential backoff **Observability:** Log
`{fundId, userId, operation, duration_ms}`; metric: `api_funds_requests_total`;
span: `funds.create` **Performance:** Target p95 < 200ms; cache: staleTime=60s
(fund metadata) **Example:** `curl -X POST /api/funds -d '{"name":"Fund IV"}'` →
`{"id":"fund_123","status":"created"}` **Ownership:** DRI=you; next review:
2025-05-06
```

## Quality Checks

Before marking documentation complete:

1. ✅ All 5 DoD sections present
2. ✅ No bracketed placeholders remaining
3. ✅ Example command is copy-paste ready
4. ✅ Review date is exactly 6 months from today
5. ✅ Performance targets are realistic (based on actual metrics)
