---
status: ACTIVE
last_updated: 2026-01-19
---

# Reserve Engine API - Architecture Diagram

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   React Application (TypeScript)                                 │
│   ┌─────────────────────────────────────────────────────┐       │
│   │  ReserveEngineClient                                │       │
│   │  - calculateReserveAllocation()                      │       │
│   │  - optimizeReserveAllocation()                       │       │
│   │  - getScenario()                                     │       │
│   │  - healthCheck()                                     │       │
│   └─────────────────────────────────────────────────────┘       │
│                           │                                       │
│                           │ HTTPS/JSON + Bearer Auth             │
│                           ▼                                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                         API GATEWAY                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Express.js Middleware Chain                                    │
│   ┌─────────────────────────────────────────────────────┐       │
│   │  1. Authentication (JWT Bearer Token)               │       │
│   │  2. Rate Limiting (express-rate-limit)              │       │
│   │  3. Request Validation (Zod schemas)                │       │
│   │  4. Correlation ID (requestId middleware)           │       │
│   │  5. Error Handling (custom error middleware)        │       │
│   └─────────────────────────────────────────────────────┘       │
│                           │                                       │
│                           ▼                                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      RESERVE ENGINE CORE                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Capital Allocation Solver (Binary Search Algorithm)            │
│   ┌─────────────────────────────────────────────────────┐       │
│   │  solveCapitalAllocation()                            │       │
│   │  ├─ Initialize: low=0, high=totalCapital/checkSize  │       │
│   │  ├─ Loop: guess = (low + high) / 2                  │       │
│   │  ├─ Calculate: requiredCapital(guess)               │       │
│   │  ├─ Adjust: if req < total → low=guess              │       │
│   │  │          else → high=guess                        │       │
│   │  ├─ Converge: |high-low| < 0.01                     │       │
│   │  └─ Return: floor(low) as optimal deals             │       │
│   └─────────────────────────────────────────────────────┘       │
│                           │                                       │
│                           ▼                                       │
│   ┌─────────────────────────────────────────────────────┐       │
│   │  calculateRequiredCapital()                          │       │
│   │  ├─ Initial capital = deals × checkSize             │       │
│   │  ├─ For each stage:                                  │       │
│   │  │   - Graduation: deals × rate                     │       │
│   │  │   - Follow-on: graduated × participation         │       │
│   │  │   - Capital: follow-ons × checkSize              │       │
│   │  └─ Return: initial + Σ(follow-on capital)          │       │
│   └─────────────────────────────────────────────────────┘       │
│                           │                                       │
│                           ▼                                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      RESPONSE LAYER                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Response Formatting & Caching                                  │
│   ┌─────────────────────────────────────────────────────┐       │
│   │  Response Metadata:                                  │       │
│   │  - correlationId (req_abc123)                        │       │
│   │  - processingTime (45ms)                             │       │
│   │  - timestamp (ISO 8601)                              │       │
│   │  - version (1.0.0)                                   │       │
│   └─────────────────────────────────────────────────────┘       │
│                           │                                       │
│                           ▼                                       │
│   ┌─────────────────────────────────────────────────────┐       │
│   │  Redis Cache (Optional, 24h TTL)                     │       │
│   │  - Scenario results                                  │       │
│   │  - Optimization results                              │       │
│   └─────────────────────────────────────────────────────┘       │
│                           │                                       │
│                           ▼                                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY LAYER                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Monitoring & Metrics                                           │
│   ┌─────────────────────────────────────────────────────┐       │
│   │  Prometheus Metrics:                                 │       │
│   │  - reserve_engine_requests_total                     │       │
│   │  - reserve_engine_request_duration_seconds           │       │
│   │  - reserve_engine_errors_total                       │       │
│   │  - reserve_engine_rate_limit_exceeded_total          │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                   │
│   ┌─────────────────────────────────────────────────────┐       │
│   │  Logging (Winston):                                  │       │
│   │  - Request/response logs                             │       │
│   │  - Error logs with stack traces                      │       │
│   │  - Performance logs                                  │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## Files Overview

```
reserve-engine/
│
├── server/api/specs/
│   └── reserve-engine.openapi.yaml    ← OpenAPI 3.0 specification
│
├── shared/types/
│   └── reserve-engine.ts              ← TypeScript types & validators
│
├── client/src/api/
│   └── reserve-engine-client.ts       ← Type-safe API client
│
├── server/routes/
│   └── reserve-engine.md              ← API usage documentation
│
├── client/src/core/
│   └── capitalAllocationSolver.ts     ← Binary search algorithm
│
└── docs/
    ├── RESERVE_ENGINE_SPEC.md         ← Technical specification
    └── RESERVE_ENGINE_DELIVERY.md     ← Delivery summary
```

## Key Design Principles

1. **Type Safety First**
   - TypeScript throughout
   - Shared types between client/server
   - Runtime validation with Zod

2. **Error Handling**
   - Consistent error schema
   - Detailed error types
   - Correlation IDs for tracing

3. **Performance**
   - Binary search O(log n) algorithm
   - Response caching (Redis)
   - Rate limiting per endpoint

4. **Developer Experience**
   - OpenAPI specification
   - Auto-generated types
   - Comprehensive documentation
   - React hooks included

5. **Production Ready**
   - Authentication (JWT)
   - Rate limiting
   - Monitoring (Prometheus)
   - Error logging
   - Health checks
