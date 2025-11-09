# Existing Express.js Route Patterns Analysis

**Date:** 2025-11-08
**Purpose:** Document existing route patterns to inform Portfolio Route implementation
**Analyzed Files:** 30+ route files, 20+ middleware files, database utilities

---

## Table of Contents

1. [Route Structure Patterns](#1-route-structure-patterns)
2. [Validation Patterns](#2-validation-patterns)
3. [Error Handling Patterns](#3-error-handling-patterns)
4. [Database Patterns](#4-database-patterns)
5. [Pagination Patterns](#5-pagination-patterns)
6. [Response Format Patterns](#6-response-format-patterns)
7. [Reusable Utilities](#7-reusable-utilities)
8. [Recommended Patterns for Portfolio Route](#8-recommended-patterns-for-portfolio-route)
9. [Anti-Patterns to Avoid](#9-anti-patterns-to-avoid)

---

## 1. Route Structure Patterns

### 1.1 File Organization

**Pattern:** Single file per domain/resource with Express Router
```typescript
// Example: server/routes/allocations.ts
import { Router } from 'express';
const router = Router();

// All routes for this resource
router.get('/funds/:fundId/allocations/latest', ...);
router.post('/funds/:fundId/allocations', ...);

export default router;
```

**Mounting Strategy:**
```typescript
// server/app.ts
import allocationsRouter from './routes/allocations.js';
app.use('/api', allocationsRouter);  // Path prefix applied at app level
```

**Key Findings:**
- Routes use **relative paths** (e.g., `/funds/:fundId/allocations`)
- **Path prefixes** (`/api`) applied in `app.ts`, not in route files
- **Default export** of router instance
- **Named imports** for middleware and utilities

### 1.2 Route Organization Within File

**Pattern:** Logical grouping with JSDoc comments
```typescript
// ============================================================================
// Validation Schemas
// ============================================================================
const UpdateAllocationRequestSchema = z.object({...});

// ============================================================================
// Type Definitions
// ============================================================================
interface UpdateAllocationResponse {...}

// ============================================================================
// Helper Functions
// ============================================================================
async function verifyFundExists(...) {...}

// ============================================================================
// Route Handlers
// ============================================================================
router.get('/funds/:fundId/allocations/latest', asyncHandler(async (req, res) => {
  // Implementation
}));

// ============================================================================
// Error Handler
// ============================================================================
router.use((err, req, res, next) => {...});
```

**Benefits:**
- Clear separation of concerns
- Easy navigation with section headers
- Validators and types near usage

---

## 2. Validation Patterns

### 2.1 Inline Zod Validation (Most Common)

**Pattern:** Validate at the start of handler with `safeParse`
```typescript
// Example from allocations.ts
router.get('/funds/:fundId/companies', asyncHandler(async (req, res) => {
  // 1. Validate path params
  const paramValidation = FundIdParamSchema.safeParse(req.params);
  if (!paramValidation.success) {
    return res.status(400).json({
      error: 'invalid_fund_id',
      message: 'Fund ID must be a positive integer',
      details: paramValidation.error.format()
    });
  }

  const { fundId } = paramValidation.data;

  // 2. Validate query params
  const queryResult = CompanyListQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({
      error: 'invalid_query_parameters',
      message: 'Invalid query parameters',
      details: queryResult.error.format()
    });
  }

  const query = queryResult.data;
  // ... use validated data
}));
```

**Schema Patterns:**
```typescript
// Path parameter validation with regex + transform
const FundIdParamSchema = z.object({
  fundId: z.string().regex(/^\d+$/).transform(Number),
});

// Query parameter validation with coercion + defaults
const CompanyListQuerySchema = z.object({
  cursor: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('50')
    .refine(val => val >= 1 && val <= 200, {
      message: 'Limit must be between 1 and 200'
    }),
  q: z.string().max(255).optional(),
  sortBy: z.enum(['exit_moic_desc', 'planned_reserves_desc', 'name_asc'])
    .default('exit_moic_desc'),
});

// Body validation with refinement
const UpdateAllocationRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  updates: z.array(CompanyAllocationUpdateSchema).min(1).max(100),
}).refine(
  (data) => data.updates.every(update => {
    if (update.allocation_cap_cents !== null) {
      return update.allocation_cap_cents >= update.planned_reserves_cents;
    }
    return true;
  }),
  { message: "allocation_cap_cents must be >= planned_reserves_cents" }
);
```

**Key Techniques:**
- `z.coerce.number()` for query params (strings → numbers)
- `z.string().transform(Number)` for path params
- `.default()` for optional params with defaults
- `.refine()` for cross-field validation
- `.optional()` and `.nullable()` for optional fields

### 2.2 Middleware-Based Validation (Less Common)

**Pattern:** Reusable validation middleware
```typescript
// server/middleware/validation.ts
export function validateRequest(schemas: ValidationSchemas) {
  return (req, res, next) => {
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Request body validation failed',
          details: { validationErrors: result.error.issues },
        });
      }
      req.body = result.data;  // Replace with validated data
    }
    // ... similar for query and params
    next();
  };
}

// Usage
router.post('/endpoint',
  validateRequest({ body: MySchema }),
  async (req, res) => {
    // req.body is already validated
  }
);
```

**Trade-offs:**
- **Middleware:** More reusable, cleaner handlers, but less flexible
- **Inline:** More verbose, but allows custom error messages per route

### 2.3 Custom Validation Utilities

**Pattern:** Type-safe number parsing
```typescript
// server/lib/number.ts
import { toNumber, NumberParseError } from '@shared/number';

try {
  const fundId = toNumber(req.params.id, 'fund ID', {
    integer: true,
    min: 1
  });
} catch (err) {
  if (err instanceof NumberParseError) {
    return res.status(400).json({
      error: 'Invalid fund ID',
      message: err.message
    });
  }
  throw err;
}
```

---

## 3. Error Handling Patterns

### 3.1 AsyncHandler Wrapper (Recommended)

**Pattern:** Wrap async handlers to catch errors
```typescript
// server/middleware/async.ts
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error('Async handler error:', error);

      if (res.headersSent) {
        return next(error);
      }

      const apiError: ApiError = {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      };

      res.status(500).json(apiError);
    });
  };
}

// Usage
router.get('/endpoint', asyncHandler(async (req, res) => {
  // Errors are automatically caught and handled
  const data = await someAsyncOperation();
  res.json(data);
}));
```

**Benefits:**
- No try-catch needed in handlers
- Consistent error responses
- Prevents unhandled promise rejections

### 3.2 Try-Catch with Custom Error Mapping

**Pattern:** Manual error handling with status code mapping
```typescript
// Example from fund-config.ts
app.put("/api/funds/:id/draft", async (req, res) => {
  try {
    const fundId = toNumber(req.params.id, 'fund ID', { integer: true, min: 1 });

    const validation = draftConfigSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Draft configuration is invalid.',
        details: validation.error.flatten(),
      });
    }

    // ... business logic

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Draft save error:', error);
    const apiError: ApiError = {
      error: 'Failed to save draft',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res.status(500).json(apiError);
  }
});
```

### 3.3 Custom Error Types with Status Codes

**Pattern:** Throw errors with statusCode property
```typescript
// Example from allocations.ts
async function verifyFundExists(client: PoolClient, fundId: number): Promise<void> {
  const fundCheck = await client.query('SELECT id FROM funds WHERE id = $1', [fundId]);

  if (fundCheck.rows.length === 0) {
    const error: any = new Error(`Fund ${fundId} not found`);
    error.statusCode = 404;
    throw error;
  }
}

// Caught by route error handler
router.use((err, req, res, next) => {
  if (err.statusCode === 409 && err.conflicts) {
    return res.status(409).json({
      error: 'Version conflict',
      message: err.message,
      conflicts: err.conflicts,
    });
  }

  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  next(err);  // Pass to global error handler
});
```

### 3.4 Error Response Format

**Standard ApiError Interface:**
```typescript
// shared/types.ts
interface ApiError {
  error: string;           // Error code/category (e.g., 'validation_error')
  message: string;         // Human-readable message
  details?: unknown;       // Additional context (validation errors, etc.)
  correlationId?: string;  // Request tracking ID
  requestId?: string;      // Alternative to correlationId
}
```

**Common Error Responses:**
```typescript
// 400 - Validation Error
{
  error: 'invalid_query_parameters',
  message: 'Invalid query parameters',
  details: { /* Zod error format */ }
}

// 404 - Not Found
{
  error: 'fund_not_found',
  message: 'Fund with ID 123 not found or has no companies'
}

// 409 - Conflict (Optimistic Locking)
{
  error: 'Version conflict',
  message: '2 companies have been updated by another user',
  conflicts: [
    { company_id: 5, expected_version: 3, actual_version: 4 }
  ]
}

// 500 - Internal Error
{
  error: 'Internal server error',
  message: 'Database connection failed',
  correlationId: 'abc-123-def'
}
```

---

## 4. Database Patterns

### 4.1 Connection Handling

**Drizzle ORM (Preferred for queries):**
```typescript
// server/db.ts - Auto-configured based on environment
import { db } from '../db';

// Simple query
const results = await db
  .select()
  .from(portfolioCompanies)
  .where(eq(portfolioCompanies.fundId, fundId))
  .orderBy(desc(portfolioCompanies.id));

// Query with joins (relational API)
const fund = await db.query.funds.findFirst({
  where: eq(funds.id, fundId),
  with: { companies: true }
});
```

**PostgreSQL Pool (For raw queries and transactions):**
```typescript
// server/db/pg-circuit.ts
import { pool, transaction, query } from '../db/pg-circuit';

// Raw query with circuit breaker protection
const result = await query<CompanyRow>(
  'SELECT * FROM portfoliocompanies WHERE fund_id = $1',
  [fundId]
);

// Transaction wrapper
const result = await transaction(async (client) => {
  await client.query('BEGIN');
  // ... multiple queries
  await client.query('COMMIT');
  return result;
});
```

### 4.2 Transaction Patterns

**Pattern 1: Manual Transaction (Full Control)**
```typescript
// Example from allocations.ts
const result = await transaction(async (client) => {
  // 1. Verify fund exists (with lock)
  await verifyFundExists(client, fundId);

  // 2. Verify companies belong to fund
  await verifyCompaniesInFund(client, fundId, companyIds);

  // 3. Update with row-level locking
  for (const update of updates) {
    const versionCheck = await client.query(
      `SELECT allocation_version FROM portfoliocompanies
       WHERE fund_id = $1 AND id = $2 FOR UPDATE`,
      [fundId, update.company_id]
    );

    if (versionCheck.rows[0].allocation_version !== expectedVersion) {
      throw { statusCode: 409, conflicts: [...] };
    }

    await client.query(
      `UPDATE portfoliocompanies SET ... WHERE ... RETURNING *`,
      [...]
    );
  }

  // 4. Log audit event
  await logAllocationEvent(client, fundId, userId, updates);

  return { success: true, new_version: expectedVersion + 1 };
});
```

**Pattern 2: Optimistic Locking**
```typescript
// Check version before update
SELECT allocation_version FROM portfoliocompanies
WHERE fund_id = $1 AND id = $2 FOR UPDATE;

// Update only if version matches
UPDATE portfoliocompanies
SET ..., allocation_version = allocation_version + 1
WHERE fund_id = $1 AND id = $2 AND allocation_version = $3
RETURNING allocation_version;
```

**Pattern 3: Row-Level Locking**
```sql
-- Acquire lock to prevent concurrent updates
SELECT ... FROM table WHERE ... FOR UPDATE;

-- Perform updates within transaction
UPDATE table SET ... WHERE ...;
```

### 4.3 Query Building with Drizzle

**Dynamic WHERE Conditions:**
```typescript
import { eq, and, lt, sql, desc, asc } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

// Build conditions array
const conditions: SQL[] = [eq(portfolioCompanies.fundId, fundId)];

// Add optional filters
if (query.cursor) {
  conditions.push(lt(portfolioCompanies.id, query.cursor));
}

if (query.status) {
  conditions.push(eq(portfolioCompanies.status, query.status));
}

// Search filter (raw SQL)
if (query.q) {
  conditions.push(
    sql`LOWER(${portfolioCompanies.name}) LIKE LOWER(${'%' + query.q + '%'})`
  );
}

// Execute query
const results = await db
  .select()
  .from(portfolioCompanies)
  .where(and(...conditions))
  .orderBy(desc(portfolioCompanies.id))
  .limit(limit);
```

**Dynamic ORDER BY:**
```typescript
let orderBy: SQL[];
switch (query.sortBy) {
  case 'exit_moic_desc':
    orderBy = [
      sql`${portfolioCompanies.exitMoicBps} DESC NULLS LAST`,
      desc(portfolioCompanies.id)
    ];
    break;
  case 'name_asc':
    orderBy = [
      asc(portfolioCompanies.name),
      desc(portfolioCompanies.id)
    ];
    break;
  default:
    orderBy = [desc(portfolioCompanies.id)];
}

const results = await db.select().from(table).orderBy(...orderBy);
```

### 4.4 Circuit Breaker Protection

**Pattern:** Automatic circuit breaker for database operations
```typescript
// server/db/pg-circuit.ts
export async function query<T>(text: string, params?: any[]): Promise<QueryResult<T>> {
  // Skip circuit breaker if disabled
  if (process.env.CB_DB_ENABLED === 'false') {
    return _query<T>(text, params);
  }

  return dbBreaker.run(
    () => _query<T>(text, params),
    async () => ({ rows: [] as T[], ... })  // Fallback
  );
}

// Metrics tracking
function recordMetrics(metrics: QueryMetrics) {
  if (metrics.duration > 1000) {
    console.warn(`[PG] Slow query (${metrics.duration}ms): ${metrics.query}`);
  }
  if (metrics.error) {
    console.error(`[PG] Query error: ${metrics.error.message}`);
  }
}
```

---

## 5. Pagination Patterns

### 5.1 Cursor-Based Pagination (Recommended)

**Pattern:** Use ID cursor for consistent results
```typescript
// Query schema with cursor
const CompanyListQuerySchema = z.object({
  cursor: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('50')
    .refine(val => val >= 1 && val <= 200),
});

// Query implementation
const conditions: SQL[] = [eq(portfolioCompanies.fundId, fundId)];

// Cursor pagination (id < cursor for DESC ordering)
if (query.cursor !== undefined) {
  conditions.push(lt(portfolioCompanies.id, query.cursor));
}

// Fetch limit + 1 to detect if there are more results
const fetchLimit = query.limit + 1;

const results = await db
  .select()
  .from(portfolioCompanies)
  .where(and(...conditions))
  .orderBy(desc(portfolioCompanies.id))  // MUST order by cursor field
  .limit(fetchLimit);

// Check if we have more results
const hasMore = results.length > query.limit;
const companies = hasMore ? results.slice(0, query.limit) : results;

// Get next cursor (last item's ID)
const nextCursor = hasMore && companies.length > 0
  ? companies[companies.length - 1].id.toString()
  : null;

// Response
const response: CompanyListResponse = {
  companies: companies.map(row => ({ ... })),
  pagination: {
    next_cursor: nextCursor,
    has_more: hasMore,
    // total_count omitted for performance
  }
};
```

**Benefits:**
- Consistent results even with concurrent inserts/deletes
- No page drift issues
- Better performance than offset for large datasets

**Cursor Direction:**
- `DESC` ordering: Use `id < cursor` (newer items first)
- `ASC` ordering: Use `id > cursor` (older items first)

### 5.2 Offset-Based Pagination (Simpler, Less Common)

**Pattern:** Traditional limit/offset
```typescript
const TransactionQueryParams = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// Sort and paginate
const fundTransactions = allTransactions
  .sort((a, b) => b.plannedDate - a.plannedDate)
  .slice(queryParams.offset, queryParams.offset + queryParams.limit);

const response = {
  transactions: fundTransactions,
  pagination: {
    total: allTransactions.length,
    limit: queryParams.limit,
    offset: queryParams.offset,
    hasMore: queryParams.offset + queryParams.limit < allTransactions.length,
  }
};
```

**Trade-offs:**
- Simpler to understand
- Easier to jump to specific pages
- Subject to page drift with concurrent changes
- Slower for large offsets

### 5.3 Pagination in POST Requests

**Pattern:** Pagination in request body for complex filters
```typescript
// reserves-api.ts
const ReserveCalculationRequestSchema = z.object({
  body: ReserveAllocationInputSchema,
  query: z.object({
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  }).optional(),
});

const { body: input, query: options } = validatedRequest;

const pagination = options
  ? { limit: options.limit ?? 100, offset: options.offset ?? 0 }
  : undefined;

const result = await engine.calculate(input, pagination);
```

---

## 6. Response Format Patterns

### 6.1 Success Response Formats

**Simple Data Response:**
```typescript
// GET /api/funds/:fundId/allocations/latest
{
  fund_id: 123,
  companies: [...],
  metadata: {
    total_planned_cents: 5000000,
    total_deployed_cents: 2000000,
    companies_count: 15,
    last_updated_at: "2025-11-08T12:34:56Z"
  }
}
```

**Wrapped Success Response:**
```typescript
// POST /api/cashflow/:fundId/transactions
{
  success: true,
  data: { id: "tx_123", ... },
  timestamp: "2025-11-08T12:34:56Z"
}
```

**Success with Metadata:**
```typescript
// POST /api/reserves/calculate
{
  success: true,
  data: { allocations: [...], ... },
  metadata: {
    correlationId: "abc-123",
    processingTime: 156,
    timestamp: "2025-11-08T12:34:56Z",
    approval: { id: "appr_456", signatures: 2 }
  }
}
```

**Paginated Response:**
```typescript
// GET /api/funds/:fundId/companies
{
  companies: [
    { id: 1, name: "Company A", ... },
    { id: 2, name: "Company B", ... }
  ],
  pagination: {
    next_cursor: "12345",
    has_more: true
    // total_count omitted for performance
  }
}
```

### 6.2 Error Response Formats

**See Section 3.4** for complete error response patterns.

### 6.3 HTTP Status Codes

**Standard Usage:**
```typescript
200 OK               // Successful GET, PUT, DELETE
201 Created          // Successful POST (resource created)
202 Accepted         // Async operation queued (not complete yet)
400 Bad Request      // Validation error, malformed request
401 Unauthorized     // Missing or invalid authentication
403 Forbidden        // Authenticated but not authorized
404 Not Found        // Resource doesn't exist
409 Conflict         // Optimistic locking failure, concurrent update
415 Unsupported Media Type  // Content-Type is not application/json
429 Too Many Requests       // Rate limit exceeded
500 Internal Server Error   // Unexpected server error
```

**Examples:**
```typescript
// 201 Created with Location header
res.status(201).json({ id: fundId });

// 202 Accepted for async operations
res.setHeader('Retry-After', '2');
res.setHeader('Location', `/api/operations/${key}`);
return res.status(202).json({ status: 'in-progress', key });

// 409 Conflict with conflict details
return res.status(409).json({
  error: 'Version conflict',
  message: '2 companies have been updated',
  conflicts: [...]
});
```

---

## 7. Reusable Utilities

### 7.1 Middleware

**Location:** `server/middleware/`

| Middleware | Purpose | Usage |
|------------|---------|-------|
| `asyncHandler` | Wrap async handlers to catch errors | `router.get('/', asyncHandler(async (req, res) => {...}))` |
| `validateRequest` | Validate body/query/params with Zod | `router.post('/', validateRequest({ body: Schema }), ...)` |
| `requireAuth` | JWT authentication | `router.use(requireAuth())` |
| `requestId` | Generate request correlation ID | `app.use(requestId)` |
| `idempotency` | Prevent duplicate POST requests | `router.post('/', idempotency, ...)` |
| `requireApproval` | Dual-approval for high-risk operations | `router.post('/', requireApproval({ minApprovals: 2 }), ...)` |

### 7.2 Database Utilities

**Location:** `server/db/pg-circuit.ts`

| Function | Purpose | Example |
|----------|---------|---------|
| `query<T>(sql, params)` | Execute query with circuit breaker | `await query<Row>('SELECT ...', [id])` |
| `queryOne<T>(sql, params)` | Get first row or null | `await queryOne('SELECT ...', [id])` |
| `transaction<T>(callback)` | Execute queries in transaction | `await transaction(async (client) => {...})` |
| `withBackoff<T>(fn, opts)` | Retry with exponential backoff | `await withBackoff(() => query(...))` |
| `healthCheck()` | Database health check | `const { healthy, latency } = await healthCheck()` |
| `getPoolStats()` | Connection pool statistics | `const { totalCount, idleCount } = getPoolStats()` |

### 7.3 Validation Utilities

**Location:** `shared/number.ts`

```typescript
import { toNumber, NumberParseError } from '@shared/number';

try {
  const fundId = toNumber(req.params.id, 'fund ID', {
    integer: true,
    min: 1
  });
} catch (err) {
  if (err instanceof NumberParseError) {
    return res.status(400).json({
      error: 'Invalid fund ID',
      message: err.message
    });
  }
  throw err;
}
```

### 7.4 Logging Utilities

**Location:** `server/lib/logger.ts`

```typescript
import { logger } from '../lib/logger';

logger.info('Reserve calculation request received', {
  correlationId,
  portfolioSize: input.portfolio.length,
  availableReserves: input.availableReserves
});

logger.error('Reserve calculation failed', {
  correlationId,
  error: error.message,
  duration
});
```

### 7.5 API Error Utilities

**Location:** `server/lib/apiError.ts`

```typescript
import { sendApiError, httpCodeToAppCode } from '../lib/apiError';

sendApiError(res, 400, {
  error: 'Validation failed',
  code: 'VALIDATION_ERROR',
  requestId: context.requestId
});
```

---

## 8. Recommended Patterns for Portfolio Route

### 8.1 Overall Structure

```typescript
/**
 * Portfolio Management API Routes
 * Provides CRUD operations for portfolio companies with lot-level MOIC tracking
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async';
import { transaction } from '../db/pg-circuit';
import { db } from '../db';
import { portfolioCompanies, portfolioLots } from '@shared/schema';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const FundIdParamSchema = z.object({
  fundId: z.string().regex(/^\d+$/).transform(Number),
});

const CompanyIdParamSchema = z.object({
  companyId: z.string().regex(/^\d+$/).transform(Number),
});

const CreateCompanySchema = z.object({
  name: z.string().min(1).max(255),
  sector: z.string().min(1).max(100),
  // ... more fields
});

const UpdateCompanySchema = CreateCompanySchema.partial().omit({
  fundId: true,
});

// ============================================================================
// Type Definitions
// ============================================================================

interface CompanyWithLots {
  id: number;
  name: string;
  lots: Array<{
    id: number;
    invested_cents: number;
    moic_bps: number | null;
  }>;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function verifyFundExists(client: PoolClient, fundId: number): Promise<void> {
  const result = await client.query('SELECT id FROM funds WHERE id = $1', [fundId]);
  if (result.rows.length === 0) {
    const error: any = new Error(`Fund ${fundId} not found`);
    error.statusCode = 404;
    throw error;
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/funds/:fundId/portfolio/companies
 * List portfolio companies with optional filtering and pagination
 */
router.get('/funds/:fundId/portfolio/companies', asyncHandler(async (req, res) => {
  // Validate path params
  const { fundId } = FundIdParamSchema.parse(req.params);

  // Validate query params
  const queryResult = ListCompaniesQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({
      error: 'invalid_query_parameters',
      message: 'Invalid query parameters',
      details: queryResult.error.format()
    });
  }

  const query = queryResult.data;

  // Build query conditions
  const conditions: SQL[] = [eq(portfolioCompanies.fundId, fundId)];

  // Add filters...

  // Execute query
  const results = await db
    .select()
    .from(portfolioCompanies)
    .where(and(...conditions))
    .orderBy(desc(portfolioCompanies.id))
    .limit(query.limit + 1);

  // Format response
  const hasMore = results.length > query.limit;
  const companies = hasMore ? results.slice(0, query.limit) : results;

  return res.status(200).json({
    companies: companies.map(formatCompany),
    pagination: {
      next_cursor: hasMore ? companies[companies.length - 1].id.toString() : null,
      has_more: hasMore
    }
  });
}));

/**
 * POST /api/funds/:fundId/portfolio/companies
 * Create a new portfolio company
 */
router.post('/funds/:fundId/portfolio/companies', asyncHandler(async (req, res) => {
  const { fundId } = FundIdParamSchema.parse(req.params);

  const bodyValidation = CreateCompanySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return res.status(400).json({
      error: 'invalid_request_body',
      message: 'Invalid company data',
      details: bodyValidation.error.format()
    });
  }

  const companyData = bodyValidation.data;

  const result = await transaction(async (client) => {
    // Verify fund exists
    await verifyFundExists(client, fundId);

    // Insert company
    const [company] = await client.query(
      `INSERT INTO portfoliocompanies (fund_id, name, sector, ...)
       VALUES ($1, $2, $3, ...) RETURNING *`,
      [fundId, companyData.name, companyData.sector, ...]
    );

    return company;
  });

  return res.status(201).json({
    success: true,
    data: formatCompany(result)
  });
}));

// ... more routes

// ============================================================================
// Error Handler
// ============================================================================

router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.message
    });
  }
  next(err);
});

export default router;
```

### 8.2 Key Recommendations

1. **Use `asyncHandler` wrapper** for all async routes
2. **Validate with Zod** at the start of each handler
3. **Use cursor-based pagination** for list endpoints
4. **Use transactions** for multi-step operations
5. **Return typed responses** with consistent format
6. **Use helper functions** for common validations (e.g., `verifyFundExists`)
7. **Add JSDoc comments** for all routes
8. **Use route-level error handler** for custom error responses
9. **Log important operations** with correlation IDs
10. **Use `asyncHandler` instead of try-catch** unless you need custom error handling

### 8.3 Route Registration

```typescript
// server/app.ts
import portfolioRouter from './routes/portfolio.js';

app.use('/api', portfolioRouter);
```

This mounts the router at `/api`, so routes defined as `/funds/:fundId/portfolio/companies` become `/api/funds/:fundId/portfolio/companies`.

---

## 9. Anti-Patterns to Avoid

### 9.1 Missing Validation

**❌ Bad:**
```typescript
router.get('/funds/:fundId/companies', async (req, res) => {
  const fundId = Number(req.params.fundId);  // No validation!
  const results = await db.query('SELECT * FROM companies WHERE fund_id = $1', [fundId]);
  res.json(results.rows);
});
```

**✅ Good:**
```typescript
router.get('/funds/:fundId/companies', asyncHandler(async (req, res) => {
  const { fundId } = FundIdParamSchema.parse(req.params);
  // ... validated fundId is guaranteed to be a positive number
}));
```

### 9.2 Inconsistent Error Responses

**❌ Bad:**
```typescript
// Different error formats in different routes
return res.status(400).json({ message: 'Invalid ID' });
return res.status(400).json({ error: 'Validation failed', details: {...} });
return res.status(400).send('Bad request');
```

**✅ Good:**
```typescript
// Consistent ApiError format
return res.status(400).json({
  error: 'invalid_fund_id',
  message: 'Fund ID must be a positive integer',
  details: validationError.format()
});
```

### 9.3 No Transaction for Multi-Step Operations

**❌ Bad:**
```typescript
// Updates can partially succeed, leaving inconsistent state
const company = await db.insert(portfolioCompanies).values({...});
const lot = await db.insert(portfolioLots).values({...});  // Fails here!
await db.insert(fundEvents).values({...});  // Never runs
```

**✅ Good:**
```typescript
const result = await transaction(async (client) => {
  const company = await client.query('INSERT INTO portfoliocompanies ...');
  const lot = await client.query('INSERT INTO portfoliolots ...');
  await client.query('INSERT INTO fund_events ...');
  return { company, lot };
});
```

### 9.4 Hardcoded Configuration

**❌ Bad:**
```typescript
const limit = 50;  // Hardcoded
const maxRetries = 3;  // Hardcoded
```

**✅ Good:**
```typescript
const limit = z.string()
  .regex(/^\d+$/)
  .transform(Number)
  .default('50')  // Configurable default
  .refine(val => val >= 1 && val <= 200);

const maxRetries = parseInt(process.env.MAX_RETRIES || '3', 10);
```

### 9.5 Offset Pagination for Large Datasets

**❌ Bad:**
```typescript
// Slow for large offsets, subject to page drift
const results = await db
  .select()
  .from(portfolioCompanies)
  .limit(100)
  .offset(10000);  // Scans 10,000 rows!
```

**✅ Good:**
```typescript
// Use cursor-based pagination
const results = await db
  .select()
  .from(portfolioCompanies)
  .where(lt(portfolioCompanies.id, cursor))
  .limit(100);
```

### 9.6 Ignoring Response Headers

**❌ Bad:**
```typescript
// Missing important headers
return res.status(202).json({ status: 'in-progress' });
```

**✅ Good:**
```typescript
res.setHeader('Retry-After', '2');
res.setHeader('Location', `/api/operations/${key}`);
return res.status(202).json({ status: 'in-progress', key });
```

### 9.7 No Correlation IDs for Async Operations

**❌ Bad:**
```typescript
// Can't track async operations
await queue.add('calculate', { fundId });
return res.status(202).json({ status: 'queued' });
```

**✅ Good:**
```typescript
const correlationId = uuidv4();
await queue.add('calculate', { fundId, correlationId });

logger.info('Calculation queued', { correlationId, fundId });

return res.status(202).json({
  status: 'queued',
  correlationId,
  statusUrl: `/api/operations/${correlationId}`
});
```

### 9.8 Not Using Circuit Breakers

**❌ Bad:**
```typescript
// Direct database calls without protection
const result = await pool.query('SELECT ...', [id]);
```

**✅ Good:**
```typescript
// Circuit breaker protection built-in
import { query } from '../db/pg-circuit';
const result = await query<Row>('SELECT ...', [id]);
```

### 9.9 Missing Optimistic Locking for Concurrent Updates

**❌ Bad:**
```typescript
// Race condition - last write wins!
const company = await getCompany(id);
company.allocation += 100000;
await updateCompany(company);
```

**✅ Good:**
```typescript
// Optimistic locking with version check
UPDATE portfoliocompanies
SET allocation = allocation + 100000,
    allocation_version = allocation_version + 1
WHERE id = $1 AND allocation_version = $2
RETURNING *;

// Check if update succeeded (rowCount > 0)
```

### 9.10 Not Sanitizing Error Messages for Production

**❌ Bad:**
```typescript
catch (error) {
  // Exposes internal details in production!
  return res.status(500).json({
    error: error.message,
    stack: error.stack
  });
}
```

**✅ Good:**
```typescript
catch (error) {
  console.error('Internal error:', error);

  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : error.message;

  return res.status(500).json({
    error: 'Internal server error',
    message,
    correlationId: req.rid
  });
}
```

---

## Summary

### Core Patterns to Follow

1. **Route Structure:** Single file per resource, Router instance, default export
2. **Validation:** Inline Zod validation with `safeParse`, return 400 on failure
3. **Error Handling:** Use `asyncHandler` wrapper, consistent `ApiError` format
4. **Database:** Use transactions for multi-step ops, circuit breaker for queries
5. **Pagination:** Cursor-based for list endpoints, return `next_cursor` and `has_more`
6. **Responses:** Consistent format with `success`, `data`, `metadata` or `pagination`

### Reusable Components

- `asyncHandler` - Wrap all async route handlers
- `transaction` - Execute multi-step operations atomically
- `query` - Execute queries with circuit breaker protection
- `FundIdParamSchema` - Validate and parse fund ID path params
- `verifyFundExists` - Helper to check fund existence and throw 404

### Anti-Patterns to Avoid

- ❌ No validation on inputs
- ❌ Inconsistent error response formats
- ❌ Missing transactions for multi-step updates
- ❌ Hardcoded configuration values
- ❌ Offset pagination for large datasets
- ❌ Missing correlation IDs for async operations
- ❌ No optimistic locking for concurrent updates
- ❌ Exposing internal error details in production

---

**Next Steps:**
1. Use this document as a reference when implementing Portfolio Route
2. Copy validation schemas from `allocations.ts` for similar patterns
3. Copy helper functions like `verifyFundExists` for reusability
4. Follow the recommended route structure in Section 8.1
5. Test with the existing test patterns (check `/tests/api/` for examples)
