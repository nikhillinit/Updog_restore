---
name: 'Phase 1 Issue #3: SSE Streaming + Cancellation'
about: Production-hardened Server-Sent Events with reconnection and backpressure
labels: enhancement, ai-agents, phase-1, ux
milestone: Agent Foundation Phase 1
---

## Summary

Production-hardened **Server-Sent Events** streaming for long-running agent
operations with cancellation, reconnection, and backpressure handling.

**Estimate:** 5 points

## Acceptance Criteria

### SSE Endpoint (`GET /api/agents/stream/:runId`)

- [ ] Events: `status`, `delta`, `partial`, `complete`, `error`
- [ ] CORS headers for SSE
- [ ] **Keepalive:** Send `:keepalive\n\n` every 25-30s
- [ ] **Reconnection:** Include `retry: 10000` in stream; support
      `Last-Event-ID` header
- [ ] **Flush immediately:** Send headers before first event
- [ ] **Cache control:** `Cache-Control: no-cache, no-transform` (prevent proxy
      buffering)
- [ ] **Backpressure:** Server tracks open connections; closes on job end or
      5-min idle
- [ ] **Memory cap:** Per-run limit (10 MB buffered events)

### Cancellation (`DELETE /api/agents/run/:runId`)

- [ ] Sets Redis cancel token (`ai:run:${runId}:cancel`, TTL 5m)
- [ ] Returns 204 on success, 404 if run not found
- [ ] Workers check cancel flag per step (every 5s or at task boundaries)

### Client Hook (`useAgentStream`)

- [ ] **Fix TypeScript errors:** Correct logger metadata format
- [ ] **Reconnection:** Exponential backoff with jitter on disconnect
- [ ] **Last-Event-ID:** Send header on reconnect
- [ ] Exposes
      `{ status, partials, lastEventId, cancel, isComplete, bytesReceived }`

### Metrics

- [ ] `ai_stream_connections_active` (gauge)
- [ ] `ai_stream_ttfb_milliseconds` (histogram)
- [ ] `ai_stream_duration_milliseconds` (histogram)
- [ ] `ai_stream_bytes_sent_total` (counter)
- [ ] `ai_stream_clients_gauge` (gauge)

### Integration Test

- [ ] Start stream → receive events → cancel → verify cleanup
- [ ] Disconnect → reconnect with `Last-Event-ID` → receive missed events

## Tasks

- [ ] Wire `server/agents/stream.ts` to Redis pubsub/BullMQ
- [ ] Add SSE hardening (retry, keepalive, no-transform, flush)
- [ ] Implement per-run memory caps + cleanup
- [ ] Wire `server/agents/cancel.ts` to Redis
- [ ] Fix TypeScript errors in `useAgentStream.ts`
- [ ] Add reconnection logic with backoff + jitter
- [ ] Add `Last-Event-ID` support
- [ ] Wire into `FundContext` or wizard
- [ ] Add tests + edge case documentation

## TypeScript Fixes

```typescript
// client/src/hooks/useAgentStream.ts
logger.error('Agent run error', { runId, errorData: data }); // ✅
logger.error('SSE connection error', { runId }); // ✅
logger.error('Failed to cancel', { runId, errorMessage }); // ✅
```

## Files to Create

- `server/agents/__tests__/stream.test.ts`
- `server/agents/__tests__/cancel.test.ts`
- `docs/sse-edge-cases.md`

## Related ADRs

- [ADR-0003: Streaming Architecture](../docs/adr/0003-streaming-architecture.md)
