---
status: ACTIVE
last_updated: 2026-01-19
---

# Idempotency and Request Deduplication Guide

This guide explains how to use idempotency keys and request deduplication to ensure exactly-once processing and prevent duplicate operations.

## Overview

Two complementary middleware components protect against duplicate processing:

1. **Idempotency Middleware**: Uses explicit keys to ensure exactly-once processing
2. **Deduplication Middleware**: Automatically detects and prevents duplicate requests

## Idempotency Middleware

### How It Works

The idempotency middleware caches responses for requests with idempotency keys, returning the cached response for duplicate requests.

```
Client → Request with Idempotency-Key → Server
                                           ↓
                                    Check Cache
                                     ↙        ↘
                              Cached       Not Cached
                                ↓              ↓
                          Return Cached    Process Request
                                              ↓
                                         Cache Response
                                              ↓
                                        Return Response
```

### Usage

#### Basic Setup

```typescript
import { idempotency } from './middleware/idempotency';

// Apply to all routes
app.use(idempotency());

// Or apply to specific routes
app.post('/api/funds', idempotency(), createFundHandler);
app.post('/api/transactions', idempotency(), processTransactionHandler);
```

#### Configuration Options

```typescript
app.use(idempotency({
  ttl: 300,                          // Cache TTL in seconds (default: 300)
  prefix: 'idem',                    // Redis key prefix
  memoryFallback: true,              // Use memory if Redis unavailable
  includeStatusCodes: [200, 201],    // Status codes to cache
  skipPaths: ['/health', '/metrics'], // Paths to skip
  generateKey: (req) => {            // Custom key generator
    return req.headers['x-request-id'];
  }
}));
```

### Client Usage

#### Using Idempotency Keys

```typescript
// Client-side example
const response = await fetch('/api/funds', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': 'unique-key-123' // Unique per operation
  },
  body: JSON.stringify({
    name: 'Growth Fund',
    size: 50000000
  })
});

// Retry with same key returns cached response
const retryResponse = await fetch('/api/funds', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': 'unique-key-123' // Same key
  },
  body: JSON.stringify({
    name: 'Growth Fund',
    size: 50000000
  })
});

// retryResponse will have X-Idempotent-Replay: true header
```

#### Generating Idempotency Keys

```typescript
// UUID-based (recommended)
import { v4 as uuidv4 } from 'uuid';
const idempotencyKey = uuidv4();

// Timestamp + Random
const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Business-logic based
const idempotencyKey = `fund-${userId}-${fundName}-${Date.now()}`;

// Hash-based
import crypto from 'crypto';
const idempotencyKey = crypto
  .createHash('sha256')
  .update(JSON.stringify({ userId, operation, timestamp }))
  .digest('hex');
```

### Response Headers

| Header | Description |
|--------|-------------|
| `X-Idempotency-Key` | The idempotency key used |
| `X-Idempotent-Replay` | `true` if response was cached |

## Request Deduplication Middleware

### How It Works

The deduplication middleware automatically generates a hash from the request and caches responses, preventing duplicate processing of identical requests.

```
Request → Generate Hash → Check Cache
                            ↙      ↘
                      Cached    Not Cached
                         ↓           ↓
                  Return Cached   Process
                                     ↓
                                Cache Response
```

### Usage

#### Basic Setup

```typescript
import { dedupe } from './middleware/dedupe';

// Apply to all routes
app.use(dedupe());

// Or apply to specific routes
app.post('/api/simulations', dedupe(), runSimulationHandler);
app.put('/api/calculations', dedupe(), performCalculationHandler);
```

#### Configuration Options

```typescript
app.use(dedupe({
  ttl: 300,                          // Cache TTL in seconds
  prefix: 'dedupe',                  // Redis key prefix
  methods: ['POST', 'PUT'],          // Methods to dedupe
  memoryFallback: true,              // Use memory if Redis unavailable
  useSingleflight: true,             // Coalesce concurrent requests
  skipPaths: ['/api/reports'],       // Paths to skip
  includeHeaders: ['X-User-Id'],     // Headers to include in hash
  hashAlgorithm: 'sha256'            // Hash algorithm
}));
```

### Deduplication Hash Components

The deduplication hash is generated from:
- HTTP Method
- Request Path
- Query Parameters
- Request Body
- User ID (if authenticated)
- Specified Headers (if configured)

### Response Headers

| Header | Description |
|--------|-------------|
| `X-Dedup-Key` | First 8 chars of dedup hash |
| `X-Request-Dedup` | `true` if cached, `inflight` if coalesced |
| `X-Dedup-Count` | Number of deduplicated requests |

## Singleflight Pattern

The deduplication middleware includes singleflight pattern support to coalesce concurrent identical requests:

```typescript
// Multiple concurrent identical requests
const promises = [
  fetch('/api/simulations', { method: 'POST', body }),
  fetch('/api/simulations', { method: 'POST', body }),
  fetch('/api/simulations', { method: 'POST', body })
];

// Only one request is processed
// Others wait and receive the same response
const responses = await Promise.all(promises);
```

## Combined Usage

Use both middleware for maximum protection:

```typescript
// Idempotency for explicit control
app.use(idempotency({
  ttl: 3600, // 1 hour for idempotency
}));

// Deduplication for automatic protection
app.use(dedupe({
  ttl: 300,  // 5 minutes for deduplication
  useSingleflight: true
}));

// Critical endpoints get both protections
app.post('/api/payments', async (req, res) => {
  // Protected by:
  // 1. Idempotency key (if provided)
  // 2. Automatic deduplication
  // 3. Singleflight coalescing
  
  await processPayment(req.body);
  res.json({ success: true });
});
```

## Best Practices

### When to Use Idempotency Keys

Use idempotency keys for:
- Financial transactions
- Resource creation (funds, accounts)
- Critical state changes
- Operations with side effects

### When to Use Deduplication

Use deduplication for:
- Expensive calculations
- Report generation
- Simulations
- Read-heavy operations

### Key Generation Best Practices

1. **Use UUIDs for true idempotency**
   ```typescript
   headers['Idempotency-Key'] = uuidv4();
   ```

2. **Include user context**
   ```typescript
   headers['Idempotency-Key'] = `${userId}-${operationId}-${timestamp}`;
   ```

3. **Make keys meaningful**
   ```typescript
   headers['Idempotency-Key'] = `create-fund-${fundName}-${date}`;
   ```

4. **Store keys for audit**
   ```typescript
   await audit.log({
     operation: 'create-fund',
     idempotencyKey,
     userId,
     timestamp
   });
   ```

### TTL Configuration

| Operation Type | Recommended TTL | Reason |
|---------------|-----------------|---------|
| Payments | 24 hours | Allow retries for failed payments |
| Resource Creation | 1 hour | Prevent accidental duplicates |
| Calculations | 5 minutes | Cache expensive computations |
| Reports | 15 minutes | Balance freshness and performance |

### Error Handling

```typescript
// Client-side retry with idempotency
async function createFundWithRetry(data, maxRetries = 3) {
  const idempotencyKey = uuidv4();
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('/api/funds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey // Same key for retries
        },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      // Check if cached response
      if (response.headers.get('X-Idempotent-Replay') === 'true') {
        console.log('Received cached response');
        return await response.json();
      }
      
      throw new Error(`Request failed: ${response.status}`);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
}
```

## Monitoring

### Metrics to Track

1. **Cache Hit Rate**
   ```typescript
   const idempotentReplays = responses.filter(r => 
     r.headers['X-Idempotent-Replay'] === 'true'
   ).length;
   
   const hitRate = idempotentReplays / totalRequests;
   ```

2. **Deduplication Rate**
   ```typescript
   const dedupedRequests = responses.filter(r =>
     r.headers['X-Request-Dedup'] === 'true'
   ).length;
   
   const dedupRate = dedupedRequests / totalRequests;
   ```

3. **Singleflight Coalescing**
   ```typescript
   const coalescedRequests = responses.filter(r =>
     r.headers['X-Request-Dedup'] === 'inflight'
   ).length;
   ```

### Status Endpoints

```typescript
// Check idempotency status
GET /api/admin/idempotency/status

Response:
{
  "status": "active",
  "stats": {
    "memoryCacheSize": 42,
    "ttl": 300,
    "memoryFallbackEnabled": true
  }
}

// Check deduplication status
GET /api/admin/dedupe/status

Response:
{
  "status": "active",
  "stats": {
    "memoryCacheSize": 15,
    "inflightRequests": 3,
    "ttl": 300,
    "memoryFallbackEnabled": true
  }
}
```

## Testing

### Testing Idempotency

```typescript
describe('Idempotency', () => {
  it('should handle duplicate requests', async () => {
    const key = 'test-123';
    
    // First request
    const response1 = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', key)
      .send({ name: 'Test Fund' });
    
    expect(response1.status).toBe(201);
    
    // Duplicate request
    const response2 = await request(app)
      .post('/api/funds')
      .set('Idempotency-Key', key)
      .send({ name: 'Different Name' }); // Different payload
    
    // Should return cached response
    expect(response2.body).toEqual(response1.body);
    expect(response2.headers['x-idempotent-replay']).toBe('true');
  });
});
```

### Testing Deduplication

```typescript
describe('Deduplication', () => {
  it('should prevent duplicate processing', async () => {
    const payload = { calculation: 'complex' };
    
    // Launch concurrent requests
    const responses = await Promise.all([
      request(app).post('/api/calculate').send(payload),
      request(app).post('/api/calculate').send(payload),
      request(app).post('/api/calculate').send(payload)
    ]);
    
    // Only one should be processed
    const processed = responses.filter(r => 
      !r.headers['x-request-dedup']
    );
    
    expect(processed).toHaveLength(1);
  });
});
```

## Troubleshooting

### Common Issues

1. **Cache not working**
   - Check Redis connection
   - Verify TTL settings
   - Ensure memory fallback is enabled

2. **Duplicate processing still occurring**
   - Verify middleware order (idempotency before dedup)
   - Check if endpoints are configured correctly
   - Ensure keys are being generated properly

3. **Performance degradation**
   - Monitor cache size
   - Adjust TTL values
   - Consider Redis cluster for high load

4. **Singleflight not coalescing**
   - Ensure requests are truly identical
   - Check timing (requests must be concurrent)
   - Verify `useSingleflight` is enabled

## Summary

- **Idempotency**: Explicit control with client-provided keys
- **Deduplication**: Automatic protection based on request signature
- **Singleflight**: Coalesces concurrent identical requests
- **Combined**: Use both for critical operations
- **Monitoring**: Track cache hits and deduplication rates
- **Testing**: Ensure proper behavior under various scenarios