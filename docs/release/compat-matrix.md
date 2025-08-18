# Release Compatibility Matrix
| PR/Feature | Depends on | Can ship alone? | Fallback if reverted | Data migration type |
|---|---|---|---|---|
| #61 Breakers | — | Yes | Disable `CIRCUIT_BREAKER=false` | None |
| #63 Readiness | #61 | Yes | Remove readiness gating in ingress | None |
| #66 Pool tuning | #61 | Yes | Revert pool params | None |
| #64 Idempotency | — | Yes | Disable middleware via flag | Cache key TTL cleanup |
| #67 API v2 | #65 | Yes (if v1 kept) | Route default to v1 | Expand/contract |
| #62 Headers | — | Yes (canary) | Rollback header set | None |
| #70 PG chaos | #61,#63, baseline | No | N/A | None |
