# Reserve Engine API Documentation

## Overview

The Reserve Engine API provides deterministic capital allocation calculations for venture capital fund portfolio construction. It calculates optimal initial deal counts and follow-on capital allocation based on total allocated capital, graduation rates, and follow-on strategies.

The engine uses a **binary search algorithm** to solve:
```
initial_capital + follow_on_capital = total_allocated_capital
```

## Base URL

```
Production:  https://api.pressonventures.com/v1
Staging:     https://staging-api.pressonventures.com/v1
Development: http://localhost:5000/api/v1
```

## Authentication

All endpoints (except `/reserve/health`) require Bearer token authentication:

```http
Authorization: Bearer <your-jwt-token>
```

### Getting a Token

Tokens are issued via the main authentication endpoint:

```bash
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 604800
}
```

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/reserve/calculate` | 100 requests | 15 minutes |
| `/reserve/optimize` | 10 requests | 5 minutes |
| `/reserve/scenarios/*` | 100 requests | 15 minutes |

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `Retry-After`: Seconds to wait (included on 429 responses)

## Endpoints

### 1. Calculate Reserve Allocation

Calculate optimal reserve allocation for a fund.

**Endpoint:** `POST /reserve/calculate`

**Request Body:**

```typescript
{
  fundId: string;                    // Unique fund identifier
  totalAllocatedCapital: number;     // Total capital to allocate (dollars)
  initialCheckSize: number;          // Initial check size per deal (dollars)
  entryStage: string;                // Entry stage: "Pre-Seed" | "Seed" | "Series A" | etc.
  stages: Array<{
    name: string;                    // Stage name
    roundSize: number;               // Typical round size (dollars)
    graduationRate: number;          // % graduating to next stage (0-100)
  }>;
  followOnStrategy: Array<{
    stage: string;                   // Target follow-on stage
    checkSize: number;               // Follow-on check size (dollars)
    participationRate: number;       // % of deals participated (0-100)
    strategy?: string;               // "maintain_ownership" | "fixed_amount" | "pro_rata"
  }>;
  metadata?: Record<string, any>;    // Optional metadata
}
```

**Example Request:**

```bash
curl -X POST https://api.pressonventures.com/v1/reserve/calculate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fundId": "fund_abc123",
    "totalAllocatedCapital": 20000000,
    "initialCheckSize": 500000,
    "entryStage": "Seed",
    "stages": [
      {
        "name": "Seed",
        "roundSize": 3000000,
        "graduationRate": 40
      },
      {
        "name": "Series A",
        "roundSize": 8000000,
        "graduationRate": 50
      }
    ],
    "followOnStrategy": [
      {
        "stage": "Series A",
        "checkSize": 1000000,
        "participationRate": 100,
        "strategy": "maintain_ownership"
      }
    ]
  }'
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "initialDeals": 12,
    "initialCapital": 6000000,
    "followOnCapital": 14000000,
    "totalCapitalDeployed": 20000000,
    "stageBreakdown": [
      {
        "stageName": "Seed",
        "dealsEntering": 12,
        "graduationRate": 40,
        "dealsGraduating": 4.8,
        "followOnCheckSize": 1000000,
        "participationRate": 100,
        "followOnInvestments": 4.8,
        "capitalDeployed": 4800000
      }
    ]
  },
  "metadata": {
    "correlationId": "req_abc123",
    "processingTime": 45,
    "timestamp": "2025-10-02T10:30:00Z",
    "version": "1.0.0"
  }
}
```

**Response Headers:**

```
X-Request-ID: req_abc123
X-Calculation-Duration: 45
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1696248000
```

### 2. Optimize Reserve Allocation

Run optimization across multiple scenarios to find the best allocation strategy.

**Endpoint:** `POST /reserve/optimize`

**Request Body:**

```typescript
{
  fundId: string;
  totalAllocatedCapital: number;
  constraints: {
    minInitialCheckSize?: number;
    maxInitialCheckSize?: number;
    allowedEntryStages?: string[];
    maxFollowOnRatio?: number;        // Max ratio of follow-on to initial (0-1)
  };
  optimizationGoals: Array<
    "maximize_deals" |
    "maximize_ownership" |
    "minimize_risk" |
    "maximize_returns"
  >;
  scenarios?: ReserveCalculationRequest[];  // Optional pre-defined scenarios
}
```

**Example Request:**

```bash
curl -X POST https://api.pressonventures.com/v1/reserve/optimize \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fundId": "fund_abc123",
    "totalAllocatedCapital": 20000000,
    "constraints": {
      "minInitialCheckSize": 250000,
      "maxInitialCheckSize": 1000000,
      "allowedEntryStages": ["Seed", "Series A"],
      "maxFollowOnRatio": 0.7
    },
    "optimizationGoals": ["maximize_deals", "maximize_ownership"]
  }'
```

**Response (200 OK):**

```json
{
  "success": true,
  "optimalScenario": {
    "initialDeals": 15,
    "initialCapital": 7500000,
    "followOnCapital": 12500000,
    "totalCapitalDeployed": 20000000,
    "stageBreakdown": [...]
  },
  "allScenarios": [
    {
      "scenarioId": "scenario_1",
      "score": 0.95,
      "result": { ... }
    },
    {
      "scenarioId": "scenario_2",
      "score": 0.88,
      "result": { ... }
    }
  ],
  "metadata": {
    "correlationId": "req_xyz789",
    "processingTime": 234,
    "timestamp": "2025-10-02T10:35:00Z"
  }
}
```

### 3. Get Scenario Results

Retrieve previously calculated scenario results.

**Endpoint:** `GET /reserve/scenarios/{scenarioId}`

**Path Parameters:**
- `scenarioId` (string, required): Unique scenario identifier

**Example Request:**

```bash
curl -X GET https://api.pressonventures.com/v1/reserve/scenarios/scenario_abc123 \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**

```json
{
  "scenarioId": "scenario_abc123",
  "fundId": "fund_abc123",
  "result": {
    "initialDeals": 12,
    "initialCapital": 6000000,
    "followOnCapital": 14000000,
    "totalCapitalDeployed": 20000000,
    "stageBreakdown": [...]
  },
  "input": {
    "fundId": "fund_abc123",
    "totalAllocatedCapital": 20000000,
    ...
  },
  "metadata": {
    "correlationId": "req_def456",
    "processingTime": 12,
    "timestamp": "2025-10-02T10:40:00Z"
  },
  "createdAt": "2025-10-02T10:30:00Z",
  "expiresAt": "2025-10-03T10:30:00Z"
}
```

**Response (404 Not Found):**

```json
{
  "success": false,
  "error": "Scenario not found",
  "code": "NOT_FOUND",
  "correlationId": "req_def456",
  "timestamp": "2025-10-02T10:40:00Z"
}
```

### 4. Health Check

Check API health and availability.

**Endpoint:** `GET /reserve/health`

**Authentication:** Not required

**Example Request:**

```bash
curl -X GET https://api.pressonventures.com/v1/reserve/health
```

**Response (200 OK):**

```json
{
  "status": "healthy",
  "timestamp": "2025-10-02T10:45:00Z",
  "version": "1.0.0",
  "service": "reserve-engine"
}
```

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "error": "Invalid request parameters",
  "code": "BAD_REQUEST",
  "correlationId": "req_abc123",
  "timestamp": "2025-10-02T10:30:00Z"
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Authentication required",
  "code": "UNAUTHORIZED",
  "correlationId": "req_abc123",
  "timestamp": "2025-10-02T10:30:00Z"
}
```

### 422 Validation Error

```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "validationErrors": [
    {
      "field": "totalAllocatedCapital",
      "constraint": "minimum",
      "value": "-1000000",
      "message": "Must be greater than 0"
    },
    {
      "field": "entryStage",
      "constraint": "enum",
      "value": "Series E",
      "message": "Must be one of: Pre-Seed, Seed, Series A, Series B, Series C, Series D"
    }
  ],
  "correlationId": "req_abc123",
  "timestamp": "2025-10-02T10:30:00Z"
}
```

### 429 Rate Limit Exceeded

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 900,
  "limit": 100,
  "remaining": 0,
  "correlationId": "req_abc123",
  "timestamp": "2025-10-02T10:30:00Z"
}
```

Response Headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1696248900
Retry-After: 900
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Internal server error",
  "code": "INTERNAL_ERROR",
  "correlationId": "req_abc123",
  "timestamp": "2025-10-02T10:30:00Z"
}
```

## TypeScript Client Usage

### Installation

The TypeScript client is included in the shared types:

```typescript
import {
  ReserveEngineClient,
  createReserveEngineClient
} from '@/api/reserve-engine-client';
```

### Basic Usage

```typescript
import { createReserveEngineClient } from '@/api/reserve-engine-client';

// Create client
const client = createReserveEngineClient({
  baseUrl: 'https://api.pressonventures.com/v1',
  apiKey: 'your-jwt-token',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
});

// Calculate reserve allocation
try {
  const result = await client.calculateReserveAllocation({
    fundId: 'fund_abc123',
    totalAllocatedCapital: 20000000,
    initialCheckSize: 500000,
    entryStage: 'Seed',
    stages: [
      {
        name: 'Seed',
        roundSize: 3000000,
        graduationRate: 40,
      },
    ],
    followOnStrategy: [
      {
        stage: 'Series A',
        checkSize: 1000000,
        participationRate: 100,
      },
    ],
  });

  console.log('Initial deals:', result.data.initialDeals);
  console.log('Total capital deployed:', result.data.totalCapitalDeployed);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.response.validationErrors);
  } else if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded, retry after:', error.response.retryAfter);
  } else {
    console.error('Request failed:', error);
  }
}
```

### React Hook Usage

```typescript
import { useReserveEngineClient } from '@/api/reserve-engine-client';

function MyComponent() {
  const client = useReserveEngineClient('your-jwt-token');

  const handleCalculate = async () => {
    const result = await client.calculateReserveAllocation({
      // ... request params
    });

    // Use result
  };

  return <button onClick={handleCalculate}>Calculate</button>;
}
```

### Error Handling

```typescript
import {
  ValidationError,
  RateLimitError,
  AuthenticationError,
  NotFoundError,
  ReserveEngineError,
} from '@/api/reserve-engine-client';

try {
  const result = await client.calculateReserveAllocation(request);
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation errors
    error.response.validationErrors.forEach(err => {
      console.error(`${err.field}: ${err.message}`);
    });
  } else if (error instanceof RateLimitError) {
    // Handle rate limiting
    const retryAfter = error.response.retryAfter;
    console.log(`Retry after ${retryAfter} seconds`);
  } else if (error instanceof AuthenticationError) {
    // Handle auth errors
    console.error('Authentication failed, redirecting to login...');
  } else if (error instanceof NotFoundError) {
    // Handle not found
    console.error('Resource not found');
  } else if (error instanceof ReserveEngineError) {
    // Handle other API errors
    console.error('API error:', error.message);
  } else {
    // Handle network/unknown errors
    console.error('Unknown error:', error);
  }
}
```

### Request Cancellation

```typescript
const controller = new AbortController();

const result = await client.calculateReserveAllocation(
  request,
  { signal: controller.signal }
);

// Cancel the request
controller.abort();
```

### Custom Timeout

```typescript
const result = await client.calculateReserveAllocation(
  request,
  { timeout: 60000 } // 60 second timeout
);
```

## Best Practices

### 1. Input Validation

Always validate inputs before sending to the API:

```typescript
import { validateReserveCalculationRequest } from '@shared/types/reserve-engine';

if (!validateReserveCalculationRequest(request)) {
  throw new Error('Invalid request format');
}

const result = await client.calculateReserveAllocation(request);
```

### 2. Correlation IDs

Use correlation IDs for request tracing:

```typescript
const correlationId = response.metadata.correlationId;
console.log('Request ID:', correlationId); // Use for support/debugging
```

### 3. Rate Limit Handling

Implement exponential backoff for rate limits:

```typescript
const client = createReserveEngineClient({
  baseUrl: API_URL,
  apiKey: token,
  onRateLimit: (response) => {
    console.warn('Rate limited, retry after:', response.retryAfter);
    // Implement backoff strategy
  },
});
```

### 4. Error Logging

Log errors with correlation IDs for debugging:

```typescript
const client = createReserveEngineClient({
  baseUrl: API_URL,
  apiKey: token,
  onError: (error) => {
    console.error('API Error:', {
      correlationId: error.correlationId,
      code: error.code,
      message: error.error,
    });
  },
});
```

### 5. Idempotency

For critical operations, implement idempotency keys:

```typescript
const result = await client.calculateReserveAllocation(request, {
  headers: {
    'Idempotency-Key': generateUniqueKey(),
  },
});
```

## Calculation Algorithm

The Reserve Engine uses a binary search algorithm to find the optimal number of initial deals:

1. **Initialize bounds**: `low = 0`, `high = totalCapital / initialCheckSize`
2. **Binary search loop**:
   - Calculate `guess = (low + high) / 2`
   - Calculate total required capital for `guess` deals (including follow-ons)
   - If required < allocated: `low = guess` (can afford more deals)
   - If required > allocated: `high = guess` (too expensive)
   - Converge when `|high - low| < 0.01`
3. **Return solution**: `floor(low)` as optimal number of deals

The algorithm guarantees:
- **Deterministic results**: Same inputs always produce same outputs
- **Fast convergence**: ~100 iterations maximum
- **Capital conservation**: Never exceeds total allocated capital

## Support

For API support, contact:
- Email: engineering@pressonventures.com
- Documentation: https://docs.pressonventures.com/api/reserve-engine
- Status: https://status.pressonventures.com
