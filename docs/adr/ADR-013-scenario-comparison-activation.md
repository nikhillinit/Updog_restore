---
status: ACTIVE
last_updated: 2026-01-19
---

# ADR-013: Scenario Comparison Tool Activation

**Status:** Proposed
**Date:** 2025-12-28
**Decision Makers:** Product Team, Technical Team
**Tags:** #scenario-comparison #feature-activation #product-decision

---

## Context

The Scenario Comparison API (`server/routes/scenario-comparison.ts`) is a complete implementation that allows users to compare multiple VC fund scenarios side-by-side. The code is production-ready but currently **not registered** in the route system, pending product team approval.

### Current State

- **Implementation**: Complete (462 lines)
- **Endpoints**:
  - `POST /api/portfolio/comparisons` - Create ephemeral comparison
  - `GET /api/portfolio/comparisons/:id` - Retrieve cached comparison
- **Features**:
  - Compare up to 5 scenarios against a baseline
  - Support for 14 comparison metrics (MOIC, IRR, TVPI, DPI, etc.)
  - Redis caching with 5-minute TTL for ephemeral comparisons
  - Zod validation for all inputs
  - Authorization middleware (simplified for 5-person internal tool)
- **Dependencies**: Redis (optional), ComparisonService, Drizzle ORM

### Why This Needs Product Decision

1. **UX Impact**: Introduces new workflow for scenario comparison
2. **Data Model**: Uses ephemeral Redis caching (Phase 1), with persistence planned (Phase 2)
3. **Feature Scope**: Needs product alignment on which metrics to expose
4. **User Education**: May require documentation or onboarding

### Technical Readiness

| Criterion | Status |
|-----------|--------|
| Code complete | Yes |
| Unit tests | Partial (service layer) |
| Integration tests | No |
| API documentation | In-code (JSDoc) |
| Security review | Pending |
| Performance profiling | Pending |

---

## Decision Required

**Product team must decide:**

1. **Activate for all users?** Or gradual rollout via feature flag?
2. **Which metrics to expose?** Currently 14 metrics defined - are all needed?
3. **Ephemeral only (Phase 1)?** Or wait for persistence (Phase 2)?
4. **User documentation needed?** In-app guidance vs separate docs?

---

## Proposed Implementation Plan

### Option A: Immediate Activation (Recommended)

1. Add feature flag: `ENABLE_SCENARIO_COMPARISON` (default: true)
2. Register route in `server/routes.ts`
3. Add basic smoke tests
4. Deploy with monitoring

**Effort**: 2-4 hours
**Risk**: Low (ephemeral comparisons, no data persistence)

### Option B: Full Phase 1 + 2 Before Activation

1. Complete persistence layer (Phase 2)
2. Add comprehensive test suite
3. Create user documentation
4. Security review
5. Performance profiling

**Effort**: 2-3 weeks
**Risk**: Very low (but delays value delivery)

---

## Consequences

### If Activated (Option A)

**Positive:**
- Users can immediately compare scenarios
- Validates product-market fit before investing in persistence
- Enables feedback collection for Phase 2 requirements

**Negative:**
- Comparisons are ephemeral (5-min TTL) - users cannot save
- May need future migration path when persistence added

### If Delayed (Option B)

**Positive:**
- Complete feature set from day one
- No user confusion about ephemeral vs saved comparisons

**Negative:**
- 2-3 week delay in value delivery
- Over-engineering risk (building persistence before validating need)

---

## Alternatives Considered

### Alternative 1: Remove the Feature

**Rationale**: Unused code is tech debt
**Decision**: Rejected - code is complete and valuable, just needs activation

### Alternative 2: Client-Side Only Comparison

**Rationale**: No server-side infrastructure needed
**Decision**: Rejected - server-side enables persistence, caching, and audit trail

---

## Action Required

**Product owner to provide:**

1. Approval to proceed with Option A or B
2. List of approved metrics (or "all 14")
3. User communication plan (if any)

**Deadline**: [To be set by product team]

---

## Implementation Checklist (Post-Approval)

- [ ] Add feature flag to `server/config/features.ts`
- [ ] Register route in `server/routes.ts`
- [ ] Create smoke test for route availability
- [ ] Update CHANGELOG.md
- [ ] Notify users (if required)

---

## References

- **Code**: [`server/routes/scenario-comparison.ts`](../../server/routes/scenario-comparison.ts)
- **Service**: [`server/services/comparison-service.ts`](../../server/services/comparison-service.ts)
- **Related ADR**: [ADR-004: Waterfall Naming](./ADR-004-waterfall-names.md)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-12-28 | Initial ADR creation | Claude Code |

---

**Review Cycle**: Upon product decision
**Next Review**: Pending product approval
