---
status: ACTIVE
last_updated: 2026-01-19
---

# Runbook — Incident Response
- User impact first (synthetics & RUM).
- If critical path failing: **rollback** (see rollback.md).
- Check breaker states; confirm memory-mode fallback.
- Capture OTel trace exemplars & slow-query logs.
- Post-mortem within 48h with owners & due dates.
