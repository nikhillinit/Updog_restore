---
type: reflection
id: REFL-012
title: Fire-and-Forget Async Creates Race Conditions
status: DRAFT
date: 2026-01-18
version: 1
severity: high
wizard_steps: []
error_codes: [ERR_RACE_CONDITION, ERR_DUPLICATE_REQUEST]
components: [server, middleware, idempotency, redis]
keywords: [fire-and-forget, async, race-condition, idempotency, storeResponse, await, mutex]
test_file: tests/regressions/REFL-012.test.ts
superseded_by: null
---

# Reflection: Fire-and-Forget Async Creates Race Conditions

## 1. The Anti-Pattern (The Trap)

**Context:** Idempotency middleware that stores responses for deduplication uses fire-and-forget `storeResponse()` calls, allowing subsequent requests to arrive before storage completes.

**How to Recognize This Trap:**
1.  **Error Signal:** Flaky test failures with "duplicate request processed" errors; intermittent duplicate operations in production
2.  **Code Pattern:** Calling async storage without awaiting:
    ```typescript
    // ANTI-PATTERN
    async function handleRequest(req, res) {
      const result = await processRequest(req);
      storeResponse(req.idempotencyKey, result); // No await!
      return res.json(result);
    }
    ```
3.  **Mental Model:** "Storage is fast, the next request won't arrive before it completes." In reality, under load or with slow storage, requests can interleave.

**Financial Impact:** Duplicate financial transactions (payments, transfers, trades) cause accounting discrepancies. In fund operations, double-processing a capital call or distribution creates immediate LP relationship damage.

> **DANGER:** Do NOT use fire-and-forget for operations that guard against duplicates.

## 2. The Verified Fix (The Principle)

**Principle:** Sequential consistency for idempotency - await all storage operations before releasing the request.

**Implementation Pattern:**
1.  Always `await` storage operations in idempotency middleware
2.  Use mutex/queue for concurrent access to same key
3.  Consider optimistic locking with retry for high-contention scenarios

```typescript
// VERIFIED IMPLEMENTATION

// Option 1: Await storage before responding
async function handleRequest(req: Request, res: Response) {
  const key = req.headers['idempotency-key'] as string;

  // Check for existing response
  const cached = await getStoredResponse(key);
  if (cached) {
    return res.status(200).json(cached);
  }

  // Process request
  const result = await processRequest(req);

  // CRITICAL: Await storage before responding
  await storeResponse(key, result);

  return res.json(result);
}

// Option 2: Use mutex for same-key requests
import { Mutex } from 'async-mutex';

const keyMutexes = new Map<string, Mutex>();

async function getKeyMutex(key: string): Promise<Mutex> {
  if (!keyMutexes.has(key)) {
    keyMutexes.set(key, new Mutex());
  }
  return keyMutexes.get(key)!;
}

async function handleRequestWithMutex(req: Request, res: Response) {
  const key = req.headers['idempotency-key'] as string;
  const mutex = await getKeyMutex(key);

  const release = await mutex.acquire();
  try {
    // Now guaranteed sequential access for this key
    const cached = await getStoredResponse(key);
    if (cached) {
      return res.status(200).json(cached);
    }

    const result = await processRequest(req);
    await storeResponse(key, result);
    return res.json(result);
  } finally {
    release();
  }
}
```

**Key Learnings:**
1. Fire-and-forget is only safe for truly idempotent operations (logging, metrics)
2. Any operation that guards against duplicates MUST be awaited
3. Test with artificial delays to expose race conditions

## 3. Evidence

*   **Test Coverage:** `tests/regressions/REFL-012.test.ts` validates sequential storage
*   **Source Session:** Jan 8-18 2026 - Idempotency-dedupe test failures
*   **Related Files:** `server/middleware/idempotency.ts`
