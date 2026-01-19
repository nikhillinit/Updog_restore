---
status: ACTIVE
last_updated: 2026-01-19
---

# Portfolio Route v1 - Frozen API Contracts

**Status:** ✅ Frozen (Immutable) **Version:** 1.0.0 **Created:** 2025-11-08
**Schema Reference:** `shared/schema.ts` lines 125-207 **Phase:** Phase 1
(Database Schema Complete)

---

## Table of Contents

1. [Contract Overview](#contract-overview)
2. [InvestmentLotV1 Contract](#investmentlotv1-contract)
3. [ForecastSnapshotV1 Contract](#forecastsnapshotv1-contract)
4. [ReserveAllocationV1 Contract](#reserveallocationv1-contract)
5. [API Usage Examples](#api-usage-examples)
6. [Contract Invariants](#contract-invariants)
7. [Migration Strategy](#migration-strategy)

---

## Contract Overview

### Purpose of Frozen Contracts

Frozen API contracts provide **stability guarantees** for client applications:

- **Immutability**: Once frozen, v1 contracts never change field types,
  nullability, or semantics
- **Versioning**: Breaking changes require a new version (v2, v3, etc.)
- **Backward Compatibility**: v1 endpoints remain available for 12 months after
  v2 release
- **Type Safety**: TypeScript + Zod schemas ensure compile-time and runtime
  validation

### Version Strategy

```
v1 (Current)
├─ Frozen: 2025-11-08
├─ Supported: Indefinitely (primary version)
└─ Breaking changes → create v2

v2 (Future)
├─ Breaking changes only
├─ v1 deprecated but supported for 12 months
└─ Migration guide published with v2 release
```

### Contract Guarantees

Each frozen contract guarantees:

1. **Field Types**: Never change (e.g., `bigint` stays `bigint`)
2. **Nullability**: Never change (e.g., `nullable` stays `nullable`)
3. **Constraints**: Never relax (e.g., enum values never removed)
4. **Additive-Only**: New optional fields allowed, never required fields
5. **Semantic Stability**: Field meanings never change

---

## InvestmentLotV1 Contract

### Purpose

Represents a single investment transaction (initial purchase, follow-on, or
secondary acquisition) with granular lot-level tracking for accurate cost basis
and MOIC calculations.

**Why this design?**

- **Lot-level granularity**: Enables MOIC calculations by lot type (critical for
  follow-on return analysis)
- **BigInt precision**: Prevents floating-point errors in financial calculations
  (>$90M amounts)
- **Optimistic locking**: Prevents concurrent update conflicts via `version`
  field
- **Idempotency**: Prevents duplicate transactions via `idempotencyKey`

### TypeScript Type Definition

```typescript
/**
 * InvestmentLotV1 - Frozen contract for investment lot records
 *
 * Represents a single investment transaction with lot-level granularity
 * for accurate cost basis and MOIC calculations.
 *
 * @see shared/schema.ts lines 125-143
 */
export interface InvestmentLotV1 {
  /**
   * Unique identifier for the investment lot
   * @format uuid
   */
  id: string;

  /**
   * Foreign key to the parent investment record
   * @see investments table
   */
  investmentId: number;

  /**
   * Type of investment transaction
   * @enum 'initial' | 'follow_on' | 'secondary'
   */
  lotType: InvestmentLotType;

  /**
   * Share price in cents (USD cents)
   * @example 150000n = $1,500.00 per share
   * @invariant Always non-negative
   */
  sharePriceCents: bigint;

  /**
   * Number of shares acquired in this lot
   * @precision 18 digits total, 8 decimal places
   * @example "1234.56789012" (supports fractional shares)
   * @invariant Always positive
   */
  sharesAcquired: string;

  /**
   * Total cost basis in cents (USD cents)
   * @example 1850000000n = $18,500,000.00
   * @invariant Must equal sharePriceCents * sharesAcquired (within rounding tolerance)
   * @invariant Always non-negative
   */
  costBasisCents: bigint;

  /**
   * Optimistic locking version
   * @default 1
   * @invariant Increments on every update
   */
  version: number;

  /**
   * Idempotency key for duplicate request prevention
   * @nullable
   * @example "inv-lot-2024-01-15-abc123"
   * @uniqueness Unique when non-null (partial unique index)
   */
  idempotencyKey: string | null;

  /**
   * Record creation timestamp (UTC with timezone)
   * @format ISO 8601 with timezone
   * @example "2025-11-08T10:30:00.000Z"
   */
  createdAt: Date;

  /**
   * Record last update timestamp (UTC with timezone)
   * @format ISO 8601 with timezone
   * @example "2025-11-08T14:45:00.000Z"
   */
  updatedAt: Date;
}

/**
 * Investment lot type enumeration
 */
export enum InvestmentLotType {
  /** Initial investment in a company */
  INITIAL = 'initial',
  /** Follow-on investment in existing portfolio company */
  FOLLOW_ON = 'follow_on',
  /** Secondary purchase (buying existing shares) */
  SECONDARY = 'secondary',
}
```

### Zod Schema Skeleton

```typescript
import { z } from 'zod';

/**
 * Zod schema for InvestmentLotV1 validation
 *
 * Implementation planned for Phase 2.2 (API route integration)
 */
export const InvestmentLotV1Schema = z
  .object({
    id: z.string().uuid(),
    investmentId: z.number().int().positive(),

    lotType: z.enum(['initial', 'follow_on', 'secondary']),

    // BigInt validation pattern
    sharePriceCents: z.bigint().nonnegative(),

    // Decimal validation (stored as string)
    sharesAcquired: z.string().regex(/^\d+(\.\d{1,8})?$/),

    costBasisCents: z.bigint().nonnegative(),

    version: z.number().int().positive(),
    idempotencyKey: z.string().min(1).max(255).nullable(),

    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict(); // Reject unknown fields

/**
 * Insert schema (omits auto-generated fields)
 */
export const InsertInvestmentLotV1Schema = InvestmentLotV1Schema.omit({
  id: true,
  version: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Make idempotencyKey required for inserts (best practice)
  idempotencyKey: z.string().min(1).max(255),
});

/**
 * Update schema (requires version for optimistic locking)
 */
export const UpdateInvestmentLotV1Schema = InvestmentLotV1Schema.partial()
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    version: z.number().int().positive(), // Required for optimistic locking
  });
```

### Field Definitions

| Field             | Type          | Nullable | Default             | Constraint                                 | Index              |
| ----------------- | ------------- | -------- | ------------------- | ------------------------------------------ | ------------------ |
| `id`              | UUID          | No       | `gen_random_uuid()` | Primary Key                                | ✓                  |
| `investmentId`    | Integer       | No       | -                   | FK to `investments.id`                     | ✓ (composite)      |
| `lotType`         | Text          | No       | -                   | `IN ('initial', 'follow_on', 'secondary')` | ✓ (composite)      |
| `sharePriceCents` | BigInt        | No       | -                   | ≥ 0                                        | -                  |
| `sharesAcquired`  | Decimal(18,8) | No       | -                   | > 0                                        | -                  |
| `costBasisCents`  | BigInt        | No       | -                   | ≥ 0                                        | -                  |
| `version`         | Integer       | No       | `1`                 | ≥ 1                                        | -                  |
| `idempotencyKey`  | Text(255)     | Yes      | `NULL`              | Unique when non-null                       | ✓ (partial unique) |
| `createdAt`       | Timestamp+TZ  | No       | `NOW()`             | -                                          | -                  |
| `updatedAt`       | Timestamp+TZ  | No       | `NOW()`             | -                                          | -                  |

### Database Constraints

```sql
-- Check constraint: lotType must be valid enum value
CONSTRAINT investment_lots_lot_type_check
  CHECK (lot_type IN ('initial', 'follow_on', 'secondary'))

-- Partial unique index: idempotencyKey unique when non-null
CREATE UNIQUE INDEX investment_lots_idempotency_unique_idx
  ON investment_lots (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Composite index: fast lookups by investment + lot type
CREATE INDEX investment_lots_investment_lot_type_idx
  ON investment_lots (investment_id, lot_type);
```

---

## ForecastSnapshotV1 Contract

### Purpose

Represents a point-in-time snapshot of fund forecasts with async calculation
support. Captures fund state, portfolio state, and calculated metrics for
historical analysis and scenario comparison.

**Why this design?**

- **Async calculation**: Status field tracks long-running calculations
  (`pending` → `calculating` → `complete`)
- **Deduplication**: `sourceHash` prevents duplicate snapshots from identical
  input states
- **State capture**: Three-tier state storage (fund, portfolio, metrics) enables
  time-travel debugging
- **JSONB flexibility**: Metrics schema can evolve without migration (within v1
  contract)

### TypeScript Type Definition

```typescript
/**
 * ForecastSnapshotV1 - Frozen contract for forecast snapshot records
 *
 * Represents a point-in-time snapshot of fund forecasts with async
 * calculation support and full state capture for historical analysis.
 *
 * @see shared/schema.ts lines 151-176
 */
export interface ForecastSnapshotV1 {
  /**
   * Unique identifier for the snapshot
   * @format uuid
   */
  id: string;

  /**
   * Foreign key to the parent fund record
   * @see funds table
   */
  fundId: number;

  /**
   * Human-readable snapshot name
   * @example "Q4 2024 Conservative Scenario"
   * @maxLength 255
   */
  name: string;

  /**
   * Calculation status
   * @enum 'pending' | 'calculating' | 'complete' | 'error'
   * @default 'pending'
   * @invariant Status transitions are monotonic (no backwards transitions)
   */
  status: ForecastSnapshotStatus;

  /**
   * Hash of source data for deduplication
   * @nullable
   * @format SHA-256 hex string
   * @example "a3f5b8c9d2e1f4a7b6c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9"
   * @uniqueness Unique per fund when non-null
   */
  sourceHash: string | null;

  /**
   * Calculated metrics (output of async calculation)
   * @nullable
   * @example { "expectedMOIC": 3.2, "expectedIRR": 0.25, "probabilityDPI1x": 0.95 }
   * @schema Flexible JSON object (schema can evolve within v1)
   */
  calculatedMetrics: Record<string, unknown> | null;

  /**
   * Captured fund state at snapshot time
   * @nullable
   * @example { "commitmentSize": 100000000, "vintage": 2024, "managementFee": 0.02 }
   */
  fundState: Record<string, unknown> | null;

  /**
   * Captured portfolio state at snapshot time
   * @nullable
   * @example { "companies": [...], "totalInvested": 50000000 }
   */
  portfolioState: Record<string, unknown> | null;

  /**
   * Captured metrics state at snapshot time
   * @nullable
   * @example { "dpi": 0.5, "rvpi": 2.1, "tvpi": 2.6 }
   */
  metricsState: Record<string, unknown> | null;

  /**
   * Timestamp when snapshot was created (not when calculation completed)
   * @format ISO 8601 with timezone
   * @example "2025-11-08T10:30:00.000Z"
   */
  snapshotTime: Date;

  /**
   * Optimistic locking version
   * @default 1
   * @invariant Increments on every update
   */
  version: number;

  /**
   * Idempotency key for duplicate request prevention
   * @nullable
   * @example "snapshot-2024-q4-conservative-abc123"
   * @uniqueness Unique when non-null (partial unique index)
   */
  idempotencyKey: string | null;

  /**
   * Record creation timestamp (UTC with timezone)
   * @format ISO 8601 with timezone
   */
  createdAt: Date;

  /**
   * Record last update timestamp (UTC with timezone)
   * @format ISO 8601 with timezone
   */
  updatedAt: Date;
}

/**
 * Forecast snapshot status enumeration
 */
export enum ForecastSnapshotStatus {
  /** Snapshot created, calculation not started */
  PENDING = 'pending',
  /** Calculation in progress */
  CALCULATING = 'calculating',
  /** Calculation completed successfully */
  COMPLETE = 'complete',
  /** Calculation failed with error */
  ERROR = 'error',
}
```

### Zod Schema Skeleton

```typescript
import { z } from 'zod';

/**
 * Zod schema for ForecastSnapshotV1 validation
 */
export const ForecastSnapshotV1Schema = z
  .object({
    id: z.string().uuid(),
    fundId: z.number().int().positive(),

    name: z.string().min(1).max(255),
    status: z.enum(['pending', 'calculating', 'complete', 'error']),

    // SHA-256 hex string pattern
    sourceHash: z
      .string()
      .length(64)
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),

    // Flexible JSON objects (schema evolves within v1)
    calculatedMetrics: z.record(z.unknown()).nullable(),
    fundState: z.record(z.unknown()).nullable(),
    portfolioState: z.record(z.unknown()).nullable(),
    metricsState: z.record(z.unknown()).nullable(),

    snapshotTime: z.date(),
    version: z.number().int().positive(),
    idempotencyKey: z.string().min(1).max(255).nullable(),

    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

/**
 * Insert schema (omits auto-generated fields)
 */
export const InsertForecastSnapshotV1Schema = ForecastSnapshotV1Schema.omit({
  id: true,
  status: true, // Defaults to 'pending'
  version: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  idempotencyKey: z.string().min(1).max(255), // Required for inserts
});

/**
 * Update schema (requires version for optimistic locking)
 */
export const UpdateForecastSnapshotV1Schema = ForecastSnapshotV1Schema.partial()
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    version: z.number().int().positive(), // Required for optimistic locking
  })
  .refine(
    (data) => {
      // Enforce monotonic status transitions
      const validTransitions: Record<string, string[]> = {
        pending: ['calculating', 'error'],
        calculating: ['complete', 'error'],
        complete: [], // Terminal state
        error: [], // Terminal state
      };
      // Validation logic in Phase 2.2
      return true;
    },
    { message: 'Invalid status transition' }
  );
```

### Field Definitions

| Field               | Type         | Nullable | Default             | Constraint                                           | Index                |
| ------------------- | ------------ | -------- | ------------------- | ---------------------------------------------------- | -------------------- |
| `id`                | UUID         | No       | `gen_random_uuid()` | Primary Key                                          | ✓                    |
| `fundId`            | Integer      | No       | -                   | FK to `funds.id`                                     | ✓ (composite)        |
| `name`              | Text(255)    | No       | -                   | Length 1-255                                         | -                    |
| `status`            | Text         | No       | `'pending'`         | `IN ('pending', 'calculating', 'complete', 'error')` | -                    |
| `sourceHash`        | Text(64)     | Yes      | `NULL`              | SHA-256 hex, unique per fund                         | ✓ (composite unique) |
| `calculatedMetrics` | JSONB        | Yes      | `NULL`              | Valid JSON                                           | -                    |
| `fundState`         | JSONB        | Yes      | `NULL`              | Valid JSON                                           | -                    |
| `portfolioState`    | JSONB        | Yes      | `NULL`              | Valid JSON                                           | -                    |
| `metricsState`      | JSONB        | Yes      | `NULL`              | Valid JSON                                           | -                    |
| `snapshotTime`      | Timestamp+TZ | No       | -                   | -                                                    | ✓ (composite desc)   |
| `version`           | Integer      | No       | `1`                 | ≥ 1                                                  | -                    |
| `idempotencyKey`    | Text(255)    | Yes      | `NULL`              | Unique when non-null                                 | ✓ (partial unique)   |
| `createdAt`         | Timestamp+TZ | No       | `NOW()`             | -                                                    | -                    |
| `updatedAt`         | Timestamp+TZ | No       | `NOW()`             | -                                                    | -                    |

### Database Constraints

```sql
-- Check constraint: status must be valid enum value
CONSTRAINT forecast_snapshots_status_check
  CHECK (status IN ('pending', 'calculating', 'complete', 'error'))

-- Partial unique index: idempotencyKey unique when non-null
CREATE UNIQUE INDEX forecast_snapshots_idempotency_unique_idx
  ON forecast_snapshots (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Composite unique index: sourceHash unique per fund when non-null
CREATE UNIQUE INDEX forecast_snapshots_source_hash_unique_idx
  ON forecast_snapshots (source_hash, fund_id)
  WHERE source_hash IS NOT NULL;

-- Composite index: fast lookups by fund + recent snapshots
CREATE INDEX forecast_snapshots_fund_time_idx
  ON forecast_snapshots (fund_id, snapshot_time DESC);

-- Index: deduplication queries
CREATE INDEX forecast_snapshots_source_hash_idx
  ON forecast_snapshots (source_hash);
```

---

## ReserveAllocationV1 Contract

### Purpose

Links reserve allocation decisions to forecast snapshots, capturing planned
reserve amounts, allocation scores, and rationale for each portfolio company.

**Why this design?**

- **Snapshot linkage**: Ties reserve decisions to specific forecast scenarios
  for comparison
- **Priority ranking**: Supports prioritization algorithms via `priority` and
  `allocationScore`
- **Audit trail**: `rationale` field captures decision logic for
  compliance/review
- **BigInt precision**: Prevents rounding errors in reserve calculations (>$90M
  reserves)

### TypeScript Type Definition

```typescript
/**
 * ReserveAllocationV1 - Frozen contract for reserve allocation records
 *
 * Represents a reserve allocation decision for a portfolio company within
 * a specific forecast snapshot, including allocation score and rationale.
 *
 * @see shared/schema.ts lines 184-204
 */
export interface ReserveAllocationV1 {
  /**
   * Unique identifier for the reserve allocation
   * @format uuid
   */
  id: string;

  /**
   * Foreign key to the parent forecast snapshot
   * @see forecast_snapshots table
   */
  snapshotId: string;

  /**
   * Foreign key to the portfolio company
   * @see portfolio_companies table
   */
  companyId: number;

  /**
   * Planned reserve amount in cents (USD cents)
   * @example 5000000000n = $50,000,000.00
   * @invariant Always non-negative
   */
  plannedReserveCents: bigint;

  /**
   * Allocation score for prioritization algorithms
   * @nullable
   * @precision 10 digits total, 6 decimal places
   * @example "0.856234" (normalized 0-1 score)
   * @range Typically 0.0 to 1.0 (but not enforced)
   */
  allocationScore: string | null;

  /**
   * Priority ranking within snapshot
   * @nullable
   * @example 1 = highest priority, 10 = lowest priority
   * @usage Lower number = higher priority
   */
  priority: number | null;

  /**
   * Human-readable rationale for allocation decision
   * @nullable
   * @example "Strong traction, 3x revenue growth, Series B imminent"
   * @maxLength Unlimited (but recommend <1000 chars for UI)
   */
  rationale: string | null;

  /**
   * Optimistic locking version
   * @default 1
   * @invariant Increments on every update
   */
  version: number;

  /**
   * Idempotency key for duplicate request prevention
   * @nullable
   * @example "reserve-alloc-snapshot123-company456-abc"
   * @uniqueness Unique when non-null (partial unique index)
   */
  idempotencyKey: string | null;

  /**
   * Record creation timestamp (UTC with timezone)
   * @format ISO 8601 with timezone
   */
  createdAt: Date;

  /**
   * Record last update timestamp (UTC with timezone)
   * @format ISO 8601 with timezone
   */
  updatedAt: Date;
}
```

### Zod Schema Skeleton

```typescript
import { z } from 'zod';

/**
 * Zod schema for ReserveAllocationV1 validation
 */
export const ReserveAllocationV1Schema = z
  .object({
    id: z.string().uuid(),
    snapshotId: z.string().uuid(),
    companyId: z.number().int().positive(),

    // BigInt validation
    plannedReserveCents: z.bigint().nonnegative(),

    // Decimal validation (stored as string)
    allocationScore: z
      .string()
      .regex(/^\d+(\.\d{1,6})?$/)
      .nullable(),

    priority: z.number().int().positive().nullable(),
    rationale: z.string().max(2000).nullable(), // Soft limit for UI

    version: z.number().int().positive(),
    idempotencyKey: z.string().min(1).max(255).nullable(),

    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

/**
 * Insert schema (omits auto-generated fields)
 */
export const InsertReserveAllocationV1Schema = ReserveAllocationV1Schema.omit({
  id: true,
  version: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  idempotencyKey: z.string().min(1).max(255), // Required for inserts
});

/**
 * Update schema (requires version for optimistic locking)
 */
export const UpdateReserveAllocationV1Schema =
  ReserveAllocationV1Schema.partial()
    .omit({
      id: true,
      createdAt: true,
      updatedAt: true,
    })
    .extend({
      version: z.number().int().positive(), // Required for optimistic locking
    });
```

### Field Definitions

| Field                 | Type          | Nullable | Default             | Constraint                     | Index                  |
| --------------------- | ------------- | -------- | ------------------- | ------------------------------ | ---------------------- |
| `id`                  | UUID          | No       | `gen_random_uuid()` | Primary Key                    | ✓                      |
| `snapshotId`          | UUID          | No       | -                   | FK to `forecast_snapshots.id`  | ✓ (composite)          |
| `companyId`           | Integer       | No       | -                   | FK to `portfolio_companies.id` | ✓ (single + composite) |
| `plannedReserveCents` | BigInt        | No       | -                   | ≥ 0                            | -                      |
| `allocationScore`     | Decimal(10,6) | Yes      | `NULL`              | -                              | -                      |
| `priority`            | Integer       | Yes      | `NULL`              | -                              | ✓ (composite)          |
| `rationale`           | Text          | Yes      | `NULL`              | -                              | -                      |
| `version`             | Integer       | No       | `1`                 | ≥ 1                            | -                      |
| `idempotencyKey`      | Text(255)     | Yes      | `NULL`              | Unique when non-null           | ✓ (partial unique)     |
| `createdAt`           | Timestamp+TZ  | No       | `NOW()`             | -                              | -                      |
| `updatedAt`           | Timestamp+TZ  | No       | `NOW()`             | -                              | -                      |

### Database Constraints

```sql
-- Partial unique index: idempotencyKey unique when non-null
CREATE UNIQUE INDEX reserve_allocations_idempotency_unique_idx
  ON reserve_allocations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Composite index: fast lookups by snapshot + company
CREATE INDEX reserve_allocations_snapshot_company_idx
  ON reserve_allocations (snapshot_id, company_id);

-- Single index: lookups by company across snapshots
CREATE INDEX reserve_allocations_company_idx
  ON reserve_allocations (company_id);

-- Composite index: priority-based queries within snapshot
CREATE INDEX reserve_allocations_priority_idx
  ON reserve_allocations (snapshot_id, priority);
```

---

## API Usage Examples

### InvestmentLotV1 Examples

#### POST /api/v1/investments/:investmentId/lots - Create Lot

**Request:**

```typescript
POST /api/v1/investments/42/lots
Content-Type: application/json

{
  "lotType": "follow_on",
  "sharePriceCents": "250000", // $2,500.00 per share (sent as string to avoid JSON number precision loss)
  "sharesAcquired": "1000.50000000",
  "costBasisCents": "250125000", // $2,501,250.00
  "idempotencyKey": "inv-lot-2024-01-15-abc123"
}
```

**Response (201 Created):**

```typescript
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "investmentId": 42,
  "lotType": "follow_on",
  "sharePriceCents": "250000",
  "sharesAcquired": "1000.50000000",
  "costBasisCents": "250125000",
  "version": 1,
  "idempotencyKey": "inv-lot-2024-01-15-abc123",
  "createdAt": "2025-11-08T10:30:00.000Z",
  "updatedAt": "2025-11-08T10:30:00.000Z"
}
```

**Idempotent Retry (same idempotencyKey):**

```typescript
POST /api/v1/investments/42/lots
Content-Type: application/json

{
  "lotType": "follow_on",
  "sharePriceCents": "250000",
  "sharesAcquired": "1000.50000000",
  "costBasisCents": "250125000",
  "idempotencyKey": "inv-lot-2024-01-15-abc123" // Same key
}

// Response: 200 OK (not 201) with original lot data
{
  "id": "550e8400-e29b-41d4-a716-446655440000", // Same ID
  "investmentId": 42,
  // ... rest of original lot
}
```

#### GET /api/v1/investments/:investmentId/lots - List Lots

**Request:**

```typescript
GET /api/v1/investments/42/lots?lotType=follow_on
```

**Response (200 OK):**

```typescript
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "investmentId": 42,
      "lotType": "follow_on",
      "sharePriceCents": "250000",
      "sharesAcquired": "1000.50000000",
      "costBasisCents": "250125000",
      "version": 1,
      "idempotencyKey": "inv-lot-2024-01-15-abc123",
      "createdAt": "2025-11-08T10:30:00.000Z",
      "updatedAt": "2025-11-08T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

#### PUT /api/v1/lots/:id - Update Lot (Optimistic Locking)

**Request:**

```typescript
PUT /api/v1/lots/550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "sharePriceCents": "260000", // Updated price
  "costBasisCents": "260130000", // Recalculated cost basis
  "version": 1 // Current version (required for optimistic locking)
}
```

**Response (200 OK):**

```typescript
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "investmentId": 42,
  "lotType": "follow_on",
  "sharePriceCents": "260000",
  "sharesAcquired": "1000.50000000",
  "costBasisCents": "260130000",
  "version": 2, // Incremented
  "idempotencyKey": "inv-lot-2024-01-15-abc123",
  "createdAt": "2025-11-08T10:30:00.000Z",
  "updatedAt": "2025-11-08T14:45:00.000Z" // Updated
}
```

**Conflict (Stale Version):**

```typescript
PUT /api/v1/lots/550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "sharePriceCents": "260000",
  "version": 1 // Stale (current version is 2)
}

// Response: 409 Conflict
{
  "error": "Version conflict",
  "message": "Record has been modified by another request. Expected version 1, found version 2.",
  "currentVersion": 2
}
```

---

### ForecastSnapshotV1 Examples

#### POST /api/v1/funds/:fundId/snapshots - Create Snapshot

**Request:**

```typescript
POST /api/v1/funds/5/snapshots
Content-Type: application/json

{
  "name": "Q4 2024 Conservative Scenario",
  "sourceHash": "a3f5b8c9d2e1f4a7b6c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9ab",
  "fundState": {
    "commitmentSize": 100000000,
    "vintage": 2024,
    "managementFee": 0.02
  },
  "portfolioState": {
    "companies": 12,
    "totalInvestedCents": "5000000000"
  },
  "metricsState": {
    "dpi": 0.5,
    "rvpi": 2.1,
    "tvpi": 2.6
  },
  "snapshotTime": "2025-11-08T10:30:00.000Z",
  "idempotencyKey": "snapshot-2024-q4-conservative-abc"
}
```

**Response (201 Created):**

```typescript
{
  "id": "660e8400-e29b-41d4-a716-446655440111",
  "fundId": 5,
  "name": "Q4 2024 Conservative Scenario",
  "status": "pending", // Default status
  "sourceHash": "a3f5b8c9d2e1f4a7b6c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9ab",
  "calculatedMetrics": null, // Not calculated yet
  "fundState": {
    "commitmentSize": 100000000,
    "vintage": 2024,
    "managementFee": 0.02
  },
  "portfolioState": {
    "companies": 12,
    "totalInvestedCents": "5000000000"
  },
  "metricsState": {
    "dpi": 0.5,
    "rvpi": 2.1,
    "tvpi": 2.6
  },
  "snapshotTime": "2025-11-08T10:30:00.000Z",
  "version": 1,
  "idempotencyKey": "snapshot-2024-q4-conservative-abc",
  "createdAt": "2025-11-08T10:30:00.000Z",
  "updatedAt": "2025-11-08T10:30:00.000Z"
}
```

**Duplicate Detection (same sourceHash):**

```typescript
POST /api/v1/funds/5/snapshots
Content-Type: application/json

{
  "name": "Q4 2024 Conservative Scenario (Retry)",
  "sourceHash": "a3f5b8c9d2e1f4a7b6c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9ab", // Same hash
  "fundState": { /* ... */ },
  "snapshotTime": "2025-11-08T10:30:00.000Z",
  "idempotencyKey": "snapshot-2024-q4-conservative-xyz" // Different key
}

// Response: 409 Conflict (duplicate sourceHash for same fund)
{
  "error": "Duplicate snapshot",
  "message": "A snapshot with the same source data already exists for this fund.",
  "existingSnapshotId": "660e8400-e29b-41d4-a716-446655440111"
}
```

#### PATCH /api/v1/snapshots/:id/status - Update Calculation Status

**Request (Worker updates status):**

```typescript
PATCH /api/v1/snapshots/660e8400-e29b-41d4-a716-446655440111/status
Content-Type: application/json

{
  "status": "calculating",
  "version": 1
}
```

**Response (200 OK):**

```typescript
{
  "id": "660e8400-e29b-41d4-a716-446655440111",
  "fundId": 5,
  "name": "Q4 2024 Conservative Scenario",
  "status": "calculating", // Updated
  "version": 2, // Incremented
  "updatedAt": "2025-11-08T10:31:00.000Z"
  // ... rest of snapshot
}
```

**Request (Calculation complete):**

```typescript
PATCH /api/v1/snapshots/660e8400-e29b-41d4-a716-446655440111/status
Content-Type: application/json

{
  "status": "complete",
  "calculatedMetrics": {
    "expectedMOIC": 3.2,
    "expectedIRR": 0.25,
    "probabilityDPI1x": 0.95
  },
  "version": 2
}
```

**Response (200 OK):**

```typescript
{
  "id": "660e8400-e29b-41d4-a716-446655440111",
  "fundId": 5,
  "name": "Q4 2024 Conservative Scenario",
  "status": "complete", // Terminal state
  "calculatedMetrics": {
    "expectedMOIC": 3.2,
    "expectedIRR": 0.25,
    "probabilityDPI1x": 0.95
  },
  "version": 3, // Incremented
  "updatedAt": "2025-11-08T10:35:00.000Z"
  // ... rest of snapshot
}
```

**Invalid Status Transition:**

```typescript
PATCH /api/v1/snapshots/660e8400-e29b-41d4-a716-446655440111/status
Content-Type: application/json

{
  "status": "pending", // Backwards transition (complete → pending)
  "version": 3
}

// Response: 400 Bad Request
{
  "error": "Invalid status transition",
  "message": "Cannot transition from 'complete' to 'pending'. Terminal states cannot be reversed.",
  "currentStatus": "complete",
  "requestedStatus": "pending"
}
```

---

### ReserveAllocationV1 Examples

#### POST /api/v1/snapshots/:snapshotId/allocations - Create Allocation

**Request:**

```typescript
POST /api/v1/snapshots/660e8400-e29b-41d4-a716-446655440111/allocations
Content-Type: application/json

{
  "companyId": 78,
  "plannedReserveCents": "5000000000", // $50M
  "allocationScore": "0.856234",
  "priority": 1,
  "rationale": "Strong traction, 3x revenue growth, Series B imminent",
  "idempotencyKey": "reserve-alloc-snapshot660-company78-abc"
}
```

**Response (201 Created):**

```typescript
{
  "id": "770e8400-e29b-41d4-a716-446655440222",
  "snapshotId": "660e8400-e29b-41d4-a716-446655440111",
  "companyId": 78,
  "plannedReserveCents": "5000000000",
  "allocationScore": "0.856234",
  "priority": 1,
  "rationale": "Strong traction, 3x revenue growth, Series B imminent",
  "version": 1,
  "idempotencyKey": "reserve-alloc-snapshot660-company78-abc",
  "createdAt": "2025-11-08T10:40:00.000Z",
  "updatedAt": "2025-11-08T10:40:00.000Z"
}
```

#### GET /api/v1/snapshots/:snapshotId/allocations - List Allocations

**Request:**

```typescript
GET /api/v1/snapshots/660e8400-e29b-41d4-a716-446655440111/allocations?orderBy=priority
```

**Response (200 OK):**

```typescript
{
  "data": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440222",
      "snapshotId": "660e8400-e29b-41d4-a716-446655440111",
      "companyId": 78,
      "plannedReserveCents": "5000000000",
      "allocationScore": "0.856234",
      "priority": 1,
      "rationale": "Strong traction, 3x revenue growth, Series B imminent",
      "version": 1,
      "idempotencyKey": "reserve-alloc-snapshot660-company78-abc",
      "createdAt": "2025-11-08T10:40:00.000Z",
      "updatedAt": "2025-11-08T10:40:00.000Z"
    },
    {
      "id": "880e8400-e29b-41d4-a716-446655440333",
      "companyId": 92,
      "priority": 2,
      // ... rest of allocation
    }
  ],
  "total": 2
}
```

---

## Contract Invariants

### Universal Invariants (All Contracts)

1. **Timestamps**
   - Always UTC with timezone (`2025-11-08T10:30:00.000Z`)
   - `createdAt` never changes after creation
   - `updatedAt` updates on every modification
   - `createdAt ≤ updatedAt` always true

2. **Version (Optimistic Locking)**
   - Starts at 1 on creation
   - Increments by exactly 1 on each update
   - Never decreases
   - Updates fail if client version ≠ current version (409 Conflict)

3. **Idempotency Key**
   - Nullable (optional for GET, recommended for POST/PUT)
   - Unique when non-null (partial unique index)
   - Format: `{entity}-{context}-{uuid}` (e.g., `inv-lot-2024-01-15-abc123`)
   - Duplicate requests with same key return 200 OK (not 201) with original data

4. **UUIDs**
   - Generated by database (`gen_random_uuid()`)
   - Never null
   - Never reused (even after deletion)

5. **Foreign Keys**
   - Always reference existing records (database enforces)
   - Cascade delete behavior (parent deletion deletes children)

### InvestmentLotV1 Invariants

1. **Financial Precision**
   - `sharePriceCents ≥ 0` (never negative)
   - `costBasisCents ≥ 0` (never negative)
   - `sharesAcquired > 0` (always positive, at least 0.00000001)
   - `costBasisCents ≈ sharePriceCents × sharesAcquired` (within ±1 cent
     rounding tolerance)

2. **Lot Type**
   - Exactly one of: `'initial'`, `'follow_on'`, `'secondary'`
   - Never changes after creation (immutable)

3. **Decimal Precision**
   - `sharesAcquired`: max 18 digits total, 8 decimal places
   - Stored as string to prevent JSON precision loss

### ForecastSnapshotV1 Invariants

1. **Status Transitions**
   - Monotonic (no backwards transitions):
     - `pending` → `calculating` or `error`
     - `calculating` → `complete` or `error`
     - `complete` → (terminal, no transitions)
     - `error` → (terminal, no transitions)

2. **Calculation State**
   - `status = 'pending'` → `calculatedMetrics = null`
   - `status = 'complete'` → `calculatedMetrics ≠ null`
   - `status = 'error'` → `calculatedMetrics = null`

3. **Source Hash**
   - SHA-256 hex string (64 characters, lowercase hex)
   - Unique per fund when non-null
   - Two snapshots with same `sourceHash` for same fund = duplicate (409
     Conflict)

4. **State Capture**
   - `fundState`, `portfolioState`, `metricsState` captured at `snapshotTime`
   - States never change after creation (immutable)
   - JSONB schema can evolve within v1 (additive-only)

### ReserveAllocationV1 Invariants

1. **Financial Precision**
   - `plannedReserveCents ≥ 0` (never negative)
   - Reserve ≤ fund remaining capital (enforced in business logic, not database)

2. **Priority Ranking**
   - `priority` typically 1-N within snapshot (lower = higher priority)
   - No uniqueness constraint (ties allowed)
   - Null priority = unranked

3. **Allocation Score**
   - Typically 0.0 to 1.0 (normalized)
   - No database constraint (allows custom scoring algorithms)
   - Null score = not scored

4. **Snapshot Consistency**
   - One allocation per (snapshotId, companyId) pair (enforced in business
     logic)
   - Allocations immutable after snapshot status = 'complete'

---

## Migration Strategy

### Adding Fields to v1 Contracts

**Allowed (Non-Breaking):**

- Adding optional fields (nullable or with defaults)
- Adding new enum values (backwards-compatible)
- Relaxing validation (e.g., max length 255 → 500)

**Example:**

```sql
-- Adding optional field to InvestmentLotV1 (non-breaking)
ALTER TABLE investment_lots
ADD COLUMN acquisition_date DATE NULL;

-- TypeScript contract updated (additive)
export interface InvestmentLotV1 {
  // ... existing fields
  acquisitionDate?: Date; // Optional field
}
```

**Not Allowed (Breaking):**

- Removing fields
- Changing field types (e.g., `bigint` → `integer`)
- Changing nullability (e.g., nullable → non-nullable)
- Removing enum values
- Changing field semantics

### Creating v2 Contracts

**When to create v2:**

- Breaking changes required (type changes, removed fields, semantic changes)
- Major refactoring that affects multiple contracts
- Contract proven inadequate for new use cases

**Migration process:**

1. Freeze v1 contracts (no more changes)
2. Create new schema files:
   - `shared/schema-v2.ts` (database schema)
   - `docs/api/contracts/portfolio-route-v2.md` (documentation)
3. Implement v2 endpoints alongside v1:
   - `/api/v1/lots` (continue supporting)
   - `/api/v2/lots` (new contract)
4. Publish migration guide:
   - Field mapping (v1 → v2)
   - Code examples
   - Breaking changes list
   - Timeline (v1 deprecation date)
5. Support v1 for 12 months after v2 release

**Example v2 breaking change:**

```typescript
// v1 (frozen)
export interface InvestmentLotV1 {
  sharePriceCents: bigint; // In cents
}

// v2 (new contract)
export interface InvestmentLotV2 {
  sharePriceUsd: number; // In dollars (breaking change)
}

// Migration guide
function migrateV1toV2(lotV1: InvestmentLotV1): InvestmentLotV2 {
  return {
    ...lotV1,
    sharePriceUsd: Number(lotV1.sharePriceCents) / 100, // Cents → dollars
  };
}
```

### Deprecation Policy

1. **Announcement**
   - Minimum 6 months notice before v1 deprecation
   - Email notifications to all API consumers
   - Deprecation warnings in API responses:
     ```typescript
     // Response headers
     X-API-Version: v1
     X-API-Deprecated: true
     X-API-Sunset: 2026-06-01T00:00:00Z
     Warning: 299 - "API v1 will be deprecated on 2026-06-01. Migrate to v2."
     ```

2. **Support Timeline**
   - v2 release: 2025-12-01
   - v1 maintenance mode: 2025-12-01 to 2026-06-01 (6 months)
   - v1 deprecation: 2026-06-01 to 2026-12-01 (6 months)
   - v1 sunset: 2026-12-01 (v1 endpoints return 410 Gone)

3. **Maintenance Mode**
   - Critical security fixes only
   - No new features
   - No performance optimizations
   - Bug fixes case-by-case

---

## Version History

| Version | Date       | Changes                                                                             | Author       |
| ------- | ---------- | ----------------------------------------------------------------------------------- | ------------ |
| 1.0.0   | 2025-11-08 | Initial frozen contracts (InvestmentLotV1, ForecastSnapshotV1, ReserveAllocationV1) | Phase 1 Team |

---

## References

- **Database Schema**: `shared/schema.ts` lines 125-207
- **Phase 1 Documentation**: `docs/api/fund-allocations-phase1b.md`
- **Migration Guide**: `migrations/0002_lot_level_moic_schema.sql`
- **Zod Validation**: (To be implemented in Phase 2.2)
- **API Routes**: (To be implemented in Phase 2.2)

---

## Appendix: Design Rationale

### Why BigInt for Financial Fields?

JavaScript's `Number` type uses IEEE 754 double-precision floating-point, which
loses precision for values >$9 quadrillion (2^53). For venture capital funds
managing >$90M, precision errors accumulate:

```typescript
// ❌ Precision loss with Number
const sharePriceDollars = 1500.0;
const shares = 1000.5;
const costBasis = sharePriceDollars * shares;
// costBasis = 1500750.0000000002 (floating-point error)

// ✅ Exact precision with BigInt (cents)
const sharePriceCents = 150000n;
const shares = 100050n; // 1000.50 shares × 100 (store as integer)
const costBasisCents = (sharePriceCents * shares) / 100n;
// costBasisCents = 150075000n (exact)
```

### Why Optimistic Locking?

Prevents lost updates in concurrent scenarios:

```typescript
// Scenario: Two users update same lot simultaneously
// User A reads lot (version=1)
// User B reads lot (version=1)
// User A updates lot (version=1 → 2) ✅
// User B updates lot (version=1) ❌ 409 Conflict (stale version)
```

Without optimistic locking, User B's update would overwrite User A's changes
(lost update problem).

### Why Partial Unique Index for IdempotencyKey?

PostgreSQL best practice for optional unique fields:

```sql
-- ❌ Standard unique index (null = null = duplicate violation)
CREATE UNIQUE INDEX idx ON table (idempotency_key);

-- ✅ Partial unique index (nulls ignored, non-nulls unique)
CREATE UNIQUE INDEX idx ON table (idempotency_key)
WHERE idempotency_key IS NOT NULL;
```

Allows multiple null `idempotencyKey` values (optional field) while enforcing
uniqueness for non-null values.

### Why Source Hash for Snapshots?

Prevents duplicate calculations from identical input states:

```typescript
// Client creates snapshot with same fund state
// Hash input: fundState + portfolioState + metricsState
// Hash output: "a3f5b8..." (deterministic)

// Duplicate snapshot attempt with same hash:
// 409 Conflict → return existing snapshot (avoid redundant work)
```

Saves computation time and database storage for expensive calculations (Monte
Carlo simulations, etc.).

---

**Document Status:** ✅ Frozen **Last Updated:** 2025-11-08 **Next Review:**
Before Phase 2 API implementation
