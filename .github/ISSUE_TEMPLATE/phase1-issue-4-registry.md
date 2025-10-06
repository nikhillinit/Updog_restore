---
name: 'Phase 1 Issue #4: AgentRegistry + Capability Routing'
about: Centralized agent registry with health tracking and auto-discovery
labels: enhancement, ai-agents, phase-1
milestone: Agent Foundation Phase 1
---

## Summary

Centralized agent registry with capability-based selection, health tracking, and
tolerant auto-discovery.

**Estimate:** 3 points

## Acceptance Criteria

- [ ] `Capability` enum: `scenario.optimize`, `explain.lp`, `data.quality`,
      `reserve.analyze`
- [ ] `AgentDescriptor` with:
  - `version` (semver)
  - `last_heartbeat_at` (timestamp)
  - `success_ratio_1h` / `success_ratio_24h` (health metrics)
  - Cost/quality metadata
- [ ] `AgentRegistry`:
  - `register()`, `list()`, `selectByCapability(cap, constraints?)`
  - Selection prefers healthy + cheap agents; falls back on constraint violation
- [ ] `bootstrapAgents()`:
  - Seeds default agents (scenario-optimizer, lp-explainer, data-validator)
  - Auto-discovery from `auto-discovery/` with error tolerance (skip bad modules
    with warning)
- [ ] Unit tests cover capability matching, constraint filtering, health-based
      ranking
- [ ] Call `bootstrapAgents()` on server startup

## Tasks

- [ ] Add health fields to `AgentDescriptor` type
- [ ] Implement health-based ranking in `selectByCapability`
- [ ] Add fallback logic when no agents meet constraints
- [ ] Implement tolerant auto-discovery
- [ ] Add tests: `ai/registry/__tests__/AgentRegistry.test.ts`
- [ ] Wire `bootstrapAgents()` into server startup
- [ ] Document agent registration format

## Files to Create

- `ai/registry/__tests__/AgentRegistry.test.ts`
- `docs/agent-registration-format.md`

## Server Startup Wiring

```typescript
// In server/bootstrap.ts:
import { bootstrapAgents } from '@/ai/registry/bootstrap';

bootstrapAgents();
logger.info('Agent registry initialized');
```
