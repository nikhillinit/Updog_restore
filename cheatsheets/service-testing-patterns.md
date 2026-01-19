---
status: ACTIVE
last_updated: 2026-01-19
---

# Service Testing Patterns

Guide for testing service and API layers with proper isolation.

## Architecture Layers

```
Routes (HTTP) → Service (Business Logic) → Database
```

**Test Isolation:**
- **API Tests**: Mock service, test HTTP handling
- **Service Tests**: Mock database, test business logic
- **Integration Tests**: Real database, test end-to-end

---

## Service Layer Tests

### What to Test
- ✅ Business logic correctness
- ✅ Database query orchestration
- ✅ Error handling (domain errors)
- ✅ Caching behavior
- ✅ Performance (parallel queries)

### What to Mock
- Database (Drizzle ORM methods)
- External APIs
- Logger (optional)
- Cache (optional)

### Pattern

```typescript
import { MyService } from '../../../server/services/my-service';

// Mock database module
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  query: {
    myTable: {
      findFirst: vi.fn(),
      findMany: vi.fn()
    }
  }
};

vi.mock('../../../server/db', () => ({
  db: mockDb
}));

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService(mockDb as any);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();    // Important: Restores original implementations
  });

  it('should perform business logic', async () => {
    // Setup mock database responses
    mockDb.select.mockReturnValue({
      from: vi.fn().mockResolvedValue([{ id: 1, data: 'test' }])
    });

    // Call service method
    const result = await service.getData(1);

    // Assert business logic
    expect(result).toEqual({ id: 1, data: 'test' });
    expect(mockDb.select).toHaveBeenCalled();
  });
});
```

**Example:** `tests/unit/services/time-travel-analytics.test.ts`

---

## API Layer Tests

### What to Test
- ✅ HTTP parameter parsing (query, body, params)
- ✅ Service method calls (correct arguments)
- ✅ Response formatting (status codes, JSON structure)
- ✅ HTTP error handling (4xx, 5xx)

### What to Mock
- Service layer methods
- Validation middleware (optional)
- Authentication middleware (optional)

### Pattern

```typescript
import request from 'supertest';
import express from 'express';
import { MyService } from '../../../server/services/my-service';

// Mock service module
const mockService = {
  getData: vi.fn(),
  createData: vi.fn()
};

vi.mock('../../../server/services/my-service', () => ({
  MyService: vi.fn(() => mockService)
}));

describe('My API', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/my-route', createMyRouter(mockService));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle GET request', async () => {
    // Setup mock service response
    mockService.getData.mockResolvedValue({ id: 1, data: 'test' });

    // Make HTTP request
    const response = await request(app)
      .get('/api/my-route/1')
      .expect(200);

    // Assert HTTP handling
    expect(mockService.getData).toHaveBeenCalledWith(1);
    expect(response.body).toEqual({ id: 1, data: 'test' });
  });
});
```

**Example:** `tests/unit/api/time-travel-api.test.ts`

---

## Common Testing Patterns

### Testing Async Operations

```typescript
it('should handle async operations', async () => {
  mockService.asyncMethod.mockResolvedValue(result);
  const response = await request(app).get('/endpoint');
  expect(response.status).toBe(200);
});
```

### Testing Error Cases

```typescript
it('should handle service errors', async () => {
  mockService.method.mockRejectedValue(new NotFoundError('Not found'));
  const response = await request(app).get('/endpoint');
  expect(response.status).toBe(404);
});
```

### Testing Parallel Queries

```typescript
it('should execute queries in parallel', async () => {
  const calls: number[] = [];
  mockDb.select.mockImplementation(() => {
    calls.push(Date.now());
    return { from: vi.fn().mockResolvedValue([]) };
  });

  await service.getParallelData();

  // Calls should be within 10ms (parallel, not sequential)
  expect(calls[1] - calls[0]).toBeLessThan(10);
});
```

### Testing Caching

```typescript
it('should cache results', async () => {
  const mockCache = { get: vi.fn(), set: vi.fn() };
  const service = new MyService(mockDb, mockCache);

  // First call - cache miss
  mockCache.get.mockResolvedValue(null);
  await service.getData(1);
  expect(mockCache.set).toHaveBeenCalled();

  // Second call - cache hit
  mockCache.get.mockResolvedValue(JSON.stringify({ cached: true }));
  const result = await service.getData(1);
  expect(result).toEqual({ cached: true });
});
```

### Testing Database Query Chains

For Drizzle ORM queries, create proper mock chains:

```typescript
function createMockQueryChain(result: any) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(result),
    then: (resolve: any) => resolve(result)  // Make it thenable
  };
}

mockDb.select.mockReturnValue(createMockQueryChain([{ id: 1 }]));
```

---

## Anti-Patterns to Avoid

### ❌ Mock Service in Service Tests

```typescript
// DON'T: This tests nothing
class MockService { ... }
const service = new MockService();
```

### ✅ Import Real Service, Mock Database

```typescript
// DO: Tests real implementation
import { RealService } from '../../../server/services/real-service';
const service = new RealService(mockDb);
```

---

### ❌ Mock Database in API Tests

```typescript
// DON'T: Tests service implementation details
vi.mock('../../../server/db');
```

### ✅ Mock Service in API Tests

```typescript
// DO: Tests HTTP handling only
vi.mock('../../../server/services/my-service');
```

---

### ❌ Forget Mock Cleanup

```typescript
// DON'T: Mocks leak between tests
afterEach(() => {
  vi.clearAllMocks(); // Only clears call history!
});
```

### ✅ Restore Original Implementations

```typescript
// DO: Prevents mock pollution
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks(); // Restores original implementations
});
```

---

### ❌ Test Multiple Layers Together

```typescript
// DON'T: Integration test disguised as unit test
it('should save to database via service via route', async () => {
  // Tests route + service + database = not a unit test
});
```

### ✅ Test One Layer at a Time

```typescript
// DO: Proper unit test boundaries
it('should call service.save with correct params', async () => {
  mockService.save.mockResolvedValue({ id: 1 });
  // Only tests route → service interaction
});
```

---

## Testing Checklist

### Service Tests
- [ ] Import real service class
- [ ] Mock database module
- [ ] Test business logic correctness
- [ ] Test error handling
- [ ] Test caching (if applicable)
- [ ] Add `vi.restoreAllMocks()` in `afterEach`

### API Tests
- [ ] Mock service layer
- [ ] Test HTTP parameter parsing
- [ ] Verify service called with correct arguments
- [ ] Test response status codes
- [ ] Test response body format
- [ ] Test error responses
- [ ] Add `vi.restoreAllMocks()` in `afterEach`

---

## Project-Specific Patterns

### Testing with Drizzle ORM

```typescript
// Mock Drizzle query builder pattern
mockDb.select.mockReturnValue({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      orderBy: vi.fn(() => Promise.resolve([]))
    }))
  }))
});
```

### Testing with Express Routes

```typescript
// Create test app with router
const app = express();
app.use(express.json());
app.use('/api/timeline', createTimelineRouter(mockService));
```

### Testing Cache Integration

```typescript
// Mock cache from app.locals
app.locals.cache = {
  get: vi.fn(),
  set: vi.fn()
};
```

---

## See Also

- [CLAUDE.md](../CLAUDE.md) - Testing conventions
- [DECISIONS.md](../DECISIONS.md) - Service layer architecture decision
- Example: `server/services/time-travel-analytics.ts`
- Example: `tests/unit/services/time-travel-analytics.test.ts`
- Example: `tests/unit/api/time-travel-api.test.ts`
