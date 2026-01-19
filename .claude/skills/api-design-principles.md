---
status: ACTIVE
last_updated: 2026-01-19
---

# API Design Principles

## Overview

REST API design principles for building intuitive, scalable, and maintainable
APIs using Express + TypeScript + Zod + BullMQ. Focused on VC fund modeling
endpoints with async job processing, optimistic locking, and consistent
validation.

## When to Use

- Designing new REST endpoints for fund/portfolio/scenario operations
- Refactoring existing API routes for consistency
- Establishing API design standards across the team
- Reviewing API specifications before implementation
- Creating OpenAPI/Swagger documentation

## Core Principles

### 1. Resource-Oriented Architecture

**Use nouns for resources, HTTP methods for actions**:

```typescript
// GOOD: Resource-based
GET    /api/funds/:fundId
POST   /api/funds
PATCH  /api/funds/:fundId
DELETE /api/funds/:fundId

// BAD: Action-based
POST   /api/getFund
POST   /api/createFund
POST   /api/updateFund
```

### 2. HTTP Method Semantics

```typescript
// GET: Retrieve (idempotent, safe, cacheable)
GET /api/funds/:fundId

// POST: Create new resource (non-idempotent)
POST /api/funds
Headers: Idempotency-Key for safety

// PATCH: Partial update (idempotent with version check)
PATCH /api/funds/:fundId
Body: { version: 5, name: "New Name" }

// DELETE: Remove (idempotent)
DELETE /api/funds/:fundId
```

### 3. Hierarchical Resource Nesting

```typescript
// Collection under parent resource
GET /api/funds/:fundId/allocations

// Specific resource
GET /api/funds/:fundId/allocations/:allocationId

// Limit nesting to 2 levels maximum
// BAD: /api/funds/:fundId/portfolios/:portfolioId/companies/:companyId/valuations
// GOOD: /api/companies/:companyId/valuations
```

## VC Fund Platform Patterns

### Fund Management Endpoints

```typescript
// Fund CRUD
router.get('/api/funds', getFunds); // List with pagination
router.get('/api/funds/:fundId', getFundById); // Single fund
router.post('/api/funds', createFund); // Create with validation
router.patch('/api/funds/:fundId', updateFund); // Partial update + version
router.delete('/api/funds/:fundId', deleteFund); // Soft delete

// Fund-specific operations
router.get('/api/funds/:fundId/performance', getFundPerformance);
router.post('/api/funds/:fundId/close', closeFund); // State transition
```

### Waterfall Calculation Endpoints

```typescript
// Synchronous calculation (fast, < 100ms)
router.post('/api/waterfalls/calculate', calculateWaterfall);
Body: { type: 'AMERICAN', hurdle: 0.08, carryPercent: 0.20, proceeds: 150000000 }

// Validation with Zod
const requestSchema = z.object({
  type: z.enum(['AMERICAN', 'EUROPEAN']),
  hurdle: z.number().min(0).max(1),
  carryPercent: z.number().min(0).max(0.30),
  proceeds: z.number().positive()
});
```

### Monte Carlo Simulation Endpoints (Async)

```typescript
// POST to start async job (returns 202 Accepted)
router.post('/api/simulations', createMonteCarloJob);
Response: 202 Accepted
Headers: {
  'Location': '/api/simulations/job-123',
  'Retry-After': '30'
}
Body: {
  jobId: 'job-123',
  status: 'pending',
  estimatedDuration: 45
}

// GET to check job status
router.get('/api/simulations/:jobId', getSimulationStatus);
Response: 200 OK (if complete) or 202 Accepted (if pending)

// DELETE to cancel job
router.delete('/api/simulations/:jobId', cancelSimulation);
```

## Validation with Zod

### Request Validation Pattern

```typescript
import { z } from 'zod';

// Path parameters
const FundIdParamSchema = z.object({
  fundId: z.string().uuid(),
});

// Query parameters with defaults
const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// Request body with cross-field validation
const CreateFundSchema = z
  .object({
    name: z.string().min(1).max(255),
    committedCapital: z.number().positive(),
    managementFeePercent: z.number().min(0).max(0.05),
    carryPercent: z.number().min(0).max(0.3),
  })
  .refine((data) => data.managementFeePercent + data.carryPercent <= 0.35, {
    message: 'Total fees cannot exceed 35%',
  });

// Middleware usage
router.post(
  '/api/funds',
  validateRequest({ body: CreateFundSchema }),
  createFund
);
```

## Optimistic Locking for Concurrent Updates

### Version Field Pattern

```typescript
// PATCH request must include current version
PATCH /api/funds/:fundId
Body: {
  version: 5,  // Current version from GET
  name: "Updated Name"
}

// Update logic with version check
async function updateFund(req, res) {
  const { fundId } = req.params;
  const { version, ...updates } = req.body;

  // Row-level lock + version check
  const result = await db.execute(
    `UPDATE funds
     SET name = $1, version = version + 1
     WHERE id = $2 AND version = $3
     RETURNING *`,
    [updates.name, fundId, version]
  );

  if (result.rowCount === 0) {
    // Version mismatch = concurrent modification
    return res.status(409).json({
      error: 'Conflict',
      code: 'VERSION_MISMATCH',
      message: 'Resource was modified by another request'
    });
  }

  res.json(result.rows[0]);
}
```

## Idempotency for Safety

### Idempotency-Key Header

```typescript
// Client sends unique key with POST/PATCH
POST /api/funds
Headers: {
  'Idempotency-Key': 'client-generated-uuid'
}

// Middleware checks for duplicate
async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  // Check if request already processed
  const cached = await redis.get(`idempotency:${key}`);
  if (cached) {
    return res.status(200).json(JSON.parse(cached));
  }

  // Store response after processing
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    redis.setex(`idempotency:${key}`, 3600, JSON.stringify(data));
    return originalJson(data);
  };

  next();
}
```

## Error Handling

### Structured Error Responses

```typescript
// Validation error (400)
{
  "error": "Validation Error",
  "code": "VALIDATION_FAILED",
  "details": [
    {
      "field": "committedCapital",
      "message": "Must be a positive number"
    }
  ]
}

// Not found (404)
{
  "error": "Not Found",
  "code": "FUND_NOT_FOUND",
  "message": "Fund with ID abc-123 does not exist"
}

// Conflict (409)
{
  "error": "Conflict",
  "code": "VERSION_MISMATCH",
  "message": "Resource was modified concurrently"
}

// Server error (500)
{
  "error": "Internal Server Error",
  "code": "INTERNAL_ERROR",
  "correlationId": "req-xyz-789"
}
```

### asyncHandler for Error Catching

```typescript
// Wrapper for automatic error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Usage
router.get(
  '/api/funds/:fundId',
  asyncHandler(async (req, res) => {
    const fund = await getFund(req.params.fundId);
    if (!fund) {
      throw new NotFoundError('Fund not found');
    }
    res.json(fund);
  })
);
```

## Pagination

### Cursor-Based Pagination (Recommended)

```typescript
// Request
GET /api/funds?limit=20&cursor=abc123

// Response
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "nextCursor": "def456",
    "hasMore": true
  }
}

// Implementation
async function getFunds(req, res) {
  const { limit, cursor } = PaginationQuerySchema.parse(req.query);

  const funds = await db.execute(
    `SELECT * FROM funds
     WHERE (cursor IS NULL OR id > $1)
     ORDER BY id
     LIMIT $2 + 1`,  // Fetch one extra to check hasMore
    [cursor, limit]
  );

  const hasMore = funds.length > limit;
  const data = hasMore ? funds.slice(0, limit) : funds;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  res.json({
    data,
    pagination: { limit, nextCursor, hasMore }
  });
}
```

## Integration with Other Skills

### With pattern-recognition

**Detect API Inconsistencies**:

```markdown
Pattern Analysis: API Route Naming

Inconsistencies found:

- /api/fund/:id (singular)
- /api/allocations (plural) → Standardize to plural for collections

- GET /api/calculate-waterfall (verb in path)
- POST /api/waterfalls/calculate (noun path + verb action) → Standardize to POST
  /resource/action
```

### With brainstorming

**Design New Endpoint**:

```
User: "We need an API for scenario comparison"

Brainstorming (Socratic):
1. What resources are involved? (scenarios, comparisons)
2. Is this a new resource or operation? (operation on existing scenarios)
3. Sync or async? (fast, < 1s → sync)
4. Input format? (array of scenarioIds)

Design:
POST /api/scenarios/compare
Body: { scenarioIds: ['id1', 'id2', 'id3'] }
Response: { deltas: {...}, charts: {...} }
```

### With systematic-debugging

**Debug API Mismatch**:

```
Issue: Frontend expects 'fundId' but API returns 'id'

1. Check Zod schema (should define field names)
2. Check response transformer
3. Check OpenAPI spec vs implementation
4. Standardize on camelCase throughout
```

## Best Practices Summary

### Resource Naming

- Use plural nouns for collections (`/api/funds`)
- Limit nesting to 2 levels
- Use kebab-case for URLs (`/api/monte-carlo-simulations`)

### HTTP Methods

- GET: Retrieve (idempotent, cacheable)
- POST: Create (use Idempotency-Key)
- PATCH: Partial update (with version field)
- DELETE: Remove (idempotent)

### Validation

- Zod schemas at endpoint level
- Cross-field validation with `.refine()`
- Consistent error format

### Concurrency

- Optimistic locking with version fields
- Idempotency-Key for POST/PATCH
- 409 Conflict for version mismatch

### Async Operations

- 202 Accepted with Location header
- BullMQ for long-running jobs
- Retry-After header for polling

### Error Responses

- Structured JSON with error codes
- Correlation IDs for tracing
- Zod validation details in 400 responses

## Integration with Other Skills

- **pattern-recognition**: Detect API inconsistencies
- **brainstorming**: Design new endpoints
- **systematic-debugging**: Debug API mismatches
- **verification-before-completion**: Validate API spec before merge
