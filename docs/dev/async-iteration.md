---
title: "Async Iteration Utilities"
description: "Safe, type‑centric alternatives to native array methods"
lastUpdated: 2025‑07‑28
---

# Async Iteration Utilities - Production Guide

> Replace problematic `forEach` patterns with proper async iteration utilities

## Problem Statement
The original code has issues with async operations inside `forEach`:
```typescript
// ❌ BROKEN: forEach ignores promises, causes "[object Promise]" errors
forEach(cohorts, async cohort => {
  await processCohort(cohort); // This doesn't work as expected
});
```

The `forEach` method doesn't wait for promises to resolve, leading to unpredictable execution order and "[object Promise]" errors.

---

## API Reference

Import from: `@/utils/async-iteration`

| Function | Description | Use Case |
|----------|-------------|----------|
| `forEachAsync()` | Sequential async iteration | Default replacement for forEach |
| `processAsync()` | Configurable parallel/sequential/batch processing | High-performance scenarios |
| `mapAsync()` | Async mapping with result aggregation | Transform arrays asynchronously |
| `filterAsync()` | Async filtering | Filter with async predicates |
| `findAsync()` | Async find | Find with async predicates |
| `reduceAsync()` | Async reduce | Accumulate with async operations |
| `safeArray()` | Safe array wrapper | Ensure valid arrays |

### Core Functions

```typescript
// Sequential processing (safest, recommended default)
await forEachAsync(items, async (item) => {
  await processItem(item);
});

// Configurable processing with options
await processAsync(items, async (item) => {
  await processItem(item);
}, {
  parallel: true,          // false = sequential, true = parallel
  batchSize: 10,          // items per batch (when parallel)
  continueOnError: false, // true = continue on failures
  delayBetweenBatches: 100 // ms delay between batches
});

// Async mapping
const results = await mapAsync(items, async (item) => {
  return await transformItem(item);
});
```

---

## Usage Patterns

### Quick Fix (Recommended)
Replace the original problematic pattern:

```typescript
// ❌ OLD: Broken forEach
forEach(cohorts, cohort => {
  // … process each cohort …
});

// ✅ NEW: Safe sequential processing
import { forEachAsync, safeArray } from '@/utils/async-iteration';

await forEachAsync(safeArray(cohorts), async (cohort) => {
  // … process each cohort safely …
});
```

### Decision Matrix

| Scenario | Pattern | Why |
|----------|---------|-----|
| **Default use case** | `forEachAsync()` | Sequential, predictable, safe |
| **Independent operations** | `processAsync({parallel: true})` | Faster parallel execution |
| **Large datasets** | `processAsync({parallel: true, batchSize: 10})` | Prevents resource exhaustion |
| **Error tolerance** | `processAsync({continueOnError: true})` | Continues processing failures |
| **Rate limiting** | `processAsync({delayBetweenBatches: 100})` | Respects API limits |

### Real Examples

```typescript
// Cohort processing
await forEachAsync(safeArray(this.cohorts), async (cohort) => {
  await updateCohortMetrics(cohort);
  await validateCohortData(cohort);
});

// High-throughput with batching
await processAsync(largeDataset, async (item) => {
  await expensiveOperation(item);
}, {
  parallel: true,
  batchSize: 5,
  continueOnError: true,
  delayBetweenBatches: 50
});

// Transform with error handling
const results = await mapAsync(items, async (item) => {
  return await apiCall(item);
});
```

---

## Anti-Patterns to Avoid

```typescript
// ❌ BAD: forEach with async/await
cohorts.forEach(async (cohort) => {
  await processCohort(cohort); // Promises ignored, no error handling
});

// ❌ BAD: forEach with promises  
cohorts.forEach((cohort) => {
  return processCohort(cohort); // Returns ignored
});

// ❌ BAD: map without awaiting
const results = cohorts.map(async (cohort) => {
  return await processCohort(cohort); // Array of pending promises
});

// ❌ BAD: Unhandled Promise.all failures
await Promise.all(cohorts.map(processCohort)); // One failure kills all
```

---

## Error Handling Patterns

### Fail-Fast (Default)
```typescript
try {
  await forEachAsync(items, async (item) => {
    await riskyOperation(item);
  });
} catch (error) {
  // First error stops processing
  console.error('Processing failed:', error);
}
```

### Error-Resilient
```typescript
const results = await processAsync(items, async (item) => {
  await riskyOperation(item);
}, { continueOnError: true });

// All items attempted, errors logged automatically
```

### Custom Error Handling
```typescript
interface ProcessResult<T> {
  successes: T[];
  failures: Array<{ item: T; error: Error }>;
}

async function processWithResults<T>(
  items: T[], 
  processor: (item: T) => Promise<void>
): Promise<ProcessResult<T>> {
  const successes: T[] = [];
  const failures: Array<{ item: T; error: Error }> = [];

  await forEachAsync(items, async (item) => {
    try {
      await processor(item);
      successes.push(item);
    } catch (error) {
      failures.push({ item, error: error as Error });
    }
  });

  return { successes, failures };
}
```

---

## Performance Guidelines

| Strategy | Speed | Resource Usage | Error Handling | Best For |
|----------|-------|----------------|----------------|----------|
| **Sequential** | Slowest | Minimal | Simple | Dependent operations, debugging |
| **Parallel** | Fastest | High | Complex | Independent operations, small datasets |
| **Batched** | Balanced | Controlled | Configurable | Large datasets, API rate limits |

### Benchmarking
```typescript
// Test with your actual data
console.time('sequential');
await forEachAsync(items, processor);
console.timeEnd('sequential');

console.time('parallel');
await processAsync(items, processor, { parallel: true });
console.timeEnd('parallel');
```

---

## Testing Examples

```typescript
// Jest test for sequential ordering
test('forEachAsync processes items in order', async () => {
  const order: number[] = [];
  await forEachAsync([1, 2, 3], async (num) => {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    order.push(num);
  });
  expect(order).toEqual([1, 2, 3]);
});

// Test error handling
test('processAsync continues on error when configured', async () => {
  const results: number[] = [];
  await processAsync([1, 2, 3], async (num) => {
    if (num === 2) throw new Error('Test error');
    results.push(num);
  }, { continueOnError: true });
  
  expect(results).toEqual([1, 3]); // 2 skipped due to error
});
```

---

## Migration Checklist

- [ ] Replace all `forEach` with `forEachAsync` for async operations
- [ ] Add proper error handling with try/catch or `continueOnError`
- [ ] Consider using `processAsync` for performance-critical paths
- [ ] Wrap potentially undefined arrays with `safeArray()`
- [ ] Add tests for async iteration behavior
- [ ] Benchmark performance for large datasets
