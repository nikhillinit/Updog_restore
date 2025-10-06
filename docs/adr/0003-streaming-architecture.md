# ADR-0003: Streaming Architecture for Long-Running Operations

## Status
Accepted (2025-10-06)

## Context
Scenario optimization and reserve analysis can take seconds. Users need responsiveness (TTFB) and the ability to cancel runs from the wizard and dashboard.

## Decision
- Use **Server-Sent Events (SSE)** for one-way, low-overhead streaming:
  - Endpoint: `GET /api/agents/stream/:runId`
  - Events: `status`, `partial`, `delta`, `complete`, `error`
  - Keepalive: comment ping every 30s
- Cancellation:
  - `DELETE /api/agents/run/:runId` sets a cancel flag (Redis TTL 5m)
  - Workers check `ai:run:{runId}:cancel` per step and stop gracefully
- Observability:
  - `ai_stream_connections_active` gauge
  - `ai_stream_ttfb_ms` histogram
  - `ai_stream_duration_ms` histogram
- Lifecycle:
  - Cleanup disconnected streams after 5 minutes
  - Idempotent completion (safe to call complete twice)

## Consequences
- **Pros**: Simple infra, firewall-friendly, fast to ship.
- **Cons**: No client → server duplex; if later needed, migrate hot-paths to WebSockets.

## Alternatives Considered
- WebSockets — more complex, not needed for Phase 1.
- HTTP polling — wasteful and poor UX.

## Related
- [ADR-0002](0002-token-budgeting.md) (Budgeting)
- [ADR-0001](0001-evaluator-metrics.md) (Evaluator metrics)
