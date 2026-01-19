---
status: ACTIVE
last_updated: 2026-01-19
---

# Migration Guide: Native Memory Tool Integration

**Version**: 1.0.0
**Date**: 2025-11-05
**Author**: Claude (Sonnet 4.5)

## Overview

This guide helps you migrate from the existing Redis-only conversation memory system to the new hybrid memory system with Claude's native memory tool and cross-conversation pattern learning.

## What's Changing

### Before (Redis-Only)

```typescript
// Old system
const agent = new MyAgent({
  name: 'my-agent',
  enableConversationMemory: true,  // Redis only
});

await agent.execute(input, 'operation', {
  continuationId: threadId,  // Session memory
});
```

**Limitations:**
- ❌ No cross-session learning
- ❌ No pattern persistence
- ❌ Manual context truncation
- ❌ Single-tenant only

### After (Hybrid Memory + Pattern Learning)

```typescript
// New system (backward compatible!)
const agent = new MyAgent({
  name: 'my-agent',
  enableConversationMemory: true,   // Existing feature (still works)
  enableNativeMemory: true,          // NEW: Claude's memory tool
  enablePatternLearning: true,       // NEW: Cross-session learning
  tenantId: 'user:project',          // NEW: Multi-tenant isolation
});

await agent.execute(input, 'operation', {
  continuationId: threadId,
  tenantId: 'user:project',          // NEW: Explicit tenant
});
```

**Benefits:**
- ✅ Cross-session learning (patterns persist)
- ✅ Automatic context management
- ✅ Multi-tenant isolation
- ✅ Hybrid storage (Redis speed + Native persistence)

## Migration Paths

### Path 1: No Changes (Recommended for Most Users)

**Who**: Teams not ready for pattern learning or multi-tenancy

**Action**: **None required** - All new features are opt-in

**Result**: Existing agents continue working exactly as before

```typescript
// This still works perfectly
const agent = new MyAgent({
  name: 'my-agent',
  enableConversationMemory: true,
});
```

---

### Path 2: Add Native Memory Tool (Minimal Change)

**Who**: Teams wanting persistent memory without pattern learning

**Action**: Add `enableNativeMemory: true`

**Changes Required**:
1. Update agent config
2. Set `ENABLE_NATIVE_MEMORY=true` in `.env`
3. No code changes needed

```diff
const agent = new MyAgent({
  name: 'my-agent',
  enableConversationMemory: true,
+ enableNativeMemory: true,
});
```

**Impact**: Memory operations now use Claude's native tool (slower writes, persistent reads)

---

### Path 3: Full Pattern Learning (Recommended for AI Agents)

**Who**: Teams building autonomous agents that improve over time

**Action**: Enable full feature set

**Changes Required**:

1. **Update Agent Config**:
```diff
const agent = new MyAgent({
  name: 'my-agent',
  enableConversationMemory: true,
+ enableNativeMemory: true,
+ enablePatternLearning: true,
+ tenantId: 'user123:project456',
});
```

2. **Update Environment Variables**:
```bash
# .env
ENABLE_NATIVE_MEMORY=true
ENABLE_PATTERN_LEARNING=true
DEFAULT_TENANT_ID=default
```

3. **Update Execution Calls** (if using multi-tenancy):
```diff
await agent.execute(input, 'operation', {
  continuationId: threadId,
+ tenantId: 'user:project',
});
```

4. **Initialize Pattern Learning** (optional - for manual pattern management):
```typescript
import { PatternLearningEngine, getStorage } from '@agent-core';

const patternEngine = new PatternLearningEngine(
  getStorage(),
  'user:project'
);

// Record patterns manually
await patternEngine.recordPattern(result, context);

// Retrieve patterns
const patterns = await patternEngine.getRelevantPatterns({
  operation: 'test-repair',
  fileTypes: ['.ts'],
});
```

---

## Step-by-Step Migration

### Step 1: Install Dependencies (if needed)

No new dependencies required! All components are already included in `@agent-core`.

### Step 2: Update Configuration

**Option A: Environment Variables**
```bash
# .env
ENABLE_NATIVE_MEMORY=true
ENABLE_CONTEXT_CLEARING=true
ENABLE_PATTERN_LEARNING=true
```

**Option B: Agent Config**
```typescript
const agent = new MyAgent({
  enableNativeMemory: process.env.ENABLE_NATIVE_MEMORY === 'true',
  enablePatternLearning: process.env.ENABLE_PATTERN_LEARNING === 'true',
  tenantId: process.env.TENANT_ID || 'default',
});
```

### Step 3: Add Tenant Context (Multi-Tenant Only)

If you need multi-user/multi-project isolation:

```typescript
import { TenantContextProvider } from '@agent-core';

// Wrap agent execution in tenant context
await TenantContextProvider.run(
  {
    tenantId: 'user123:project456',
    userId: 'user123',
    projectId: 'project456',
    permissions: {
      canAccessGlobalMemory: false,
      canAccessProjectMemory: true,
      canWriteMemory: true,
      canUsePatternLearning: true,
      canSharePatterns: true,
    },
  },
  async () => {
    // All agent operations here are tenant-scoped
    const result = await agent.execute(input, 'operation');
  }
);
```

### Step 4: Test the Migration

Run your existing tests - they should all pass:

```bash
npm test
```

If any fail, check:
1. Agent config is correct
2. Environment variables are set
3. Tenant context is properly initialized

### Step 5: Monitor Performance

Track these metrics after migration:

```typescript
import { TokenBudgetManager, MemoryEventBus } from '@agent-core';

// Monitor token usage
const budget = new TokenBudgetManager(8192);
const allocated = budget.allocate();
console.log('Token allocation:', allocated);

// Monitor memory events
const bus = MemoryEventBus.getInstance();
bus.on('pattern_learned', (event) => {
  console.log('Pattern learned:', event.patternId, event.confidence);
});
```

---

## Common Migration Scenarios

### Scenario 1: Single-User Application

**Before:**
```typescript
const agent = new TestRepairAgent({
  name: 'test-repair',
  enableConversationMemory: true,
});
```

**After:**
```typescript
const agent = new TestRepairAgent({
  name: 'test-repair',
  enableConversationMemory: true,
  enablePatternLearning: true,  // Learn from past repairs
  tenantId: 'single-user',       // Fixed tenant ID
});
```

---

### Scenario 2: Multi-Tenant SaaS

**Before:**
```typescript
function createAgent(userId: string) {
  return new MyAgent({
    name: 'my-agent',
    enableConversationMemory: true,
  });
}
```

**After:**
```typescript
function createAgent(userId: string, projectId: string) {
  return new MyAgent({
    name: 'my-agent',
    enableConversationMemory: true,
    enableNativeMemory: true,
    enablePatternLearning: true,
    tenantId: `${userId}:${projectId}`,  // Composite tenant ID
  });
}

// Usage
const agent = createAgent('user123', 'project456');
```

---

### Scenario 3: Express Middleware

**Before:**
```typescript
app.use((req, res, next) => {
  req.agent = new MyAgent({
    name: 'api-agent',
    enableConversationMemory: true,
  });
  next();
});
```

**After:**
```typescript
import { TenantContextProvider } from '@agent-core';

app.use((req, res, next) => {
  const context = TenantContextProvider.fromRequest(req);

  TenantContextProvider.run(context, () => {
    req.agent = new MyAgent({
      name: 'api-agent',
      enableConversationMemory: true,
      enableNativeMemory: true,
      enablePatternLearning: true,
      tenantId: context.tenantId,
    });
    next();
  });
});
```

---

## Rollback Plan

If you encounter issues, rollback is simple:

### Immediate Rollback (Config Only)

```diff
const agent = new MyAgent({
  name: 'my-agent',
  enableConversationMemory: true,
- enableNativeMemory: true,
- enablePatternLearning: true,
- tenantId: 'user:project',
});
```

**Impact**: Reverts to Redis-only behavior immediately

### Full Rollback (Code Changes)

If you added tenant context or pattern learning code:

1. Remove `TenantContextProvider.run()` wrappers
2. Remove pattern learning imports
3. Remove tenant ID from execution calls
4. Restart application

**Data Impact**: No data loss - Redis memory remains intact

---

## Performance Impact

### Memory Usage

| Component | Before | After | Change |
|-----------|--------|-------|--------|
| Redis | ~50KB/thread | ~50KB/thread | No change |
| Native Memory | N/A | ~10KB/pattern | New |
| Pattern Storage | N/A | ~5KB/pattern | New |
| **Total** | ~50KB | ~65KB | +30% |

### Latency

| Operation | Before | After | Change |
|-----------|--------|-------|--------|
| Cache hit | ~1ms | ~1ms | No change |
| Cache miss | ~50ms | ~50ms | No change |
| Pattern retrieval | N/A | ~10-30ms | New |
| Memory tool use | N/A | ~100-200ms | New |

### Token Usage

With context clearing enabled:

- **Before**: Manual truncation required
- **After**: Automatic clearing saves 3K+ tokens per clear
- **Budget allocation**: 30% history, 15% memory, 10% patterns, 40% response

---

## Troubleshooting

### Issue 1: Memory Tool Not Working

**Symptom**: Memory operations don't persist

**Solution**:
```typescript
// Check configuration
const response = await askClaude(prompt, {
  enableMemory: true,  // ← Must be true
  tenantId: 'user:project',
});

// Verify environment
console.log('ENABLE_NATIVE_MEMORY:', process.env.ENABLE_NATIVE_MEMORY);
```

### Issue 2: Patterns Not Learning

**Symptom**: Patterns aren't being recorded

**Solution**:
```typescript
// Ensure pattern learning is enabled
const agent = new MyAgent({
  enablePatternLearning: true,  // ← Must be true
  tenantId: 'user:project',     // ← Must be set
});

// Check storage implementation
const storage = getStorage();
console.log('Storage type:', storage.constructor.name);
```

### Issue 3: Tenant Isolation Broken

**Symptom**: Users see each other's data

**Solution**:
```typescript
// Verify tenant context is set
await TenantContextProvider.run(
  {
    tenantId: 'user:project',  // ← Must be unique per user+project
    permissions: {
      canAccessGlobalMemory: false,  // ← Restrict global access
    },
  },
  async () => {
    // Check context
    const ctx = TenantContextProvider.require();
    console.log('Active tenant:', ctx.tenantId);
  }
);
```

### Issue 4: High Token Usage

**Symptom**: Token costs increased

**Solution**:
```typescript
// Enable context clearing
const response = await askClaude(prompt, {
  enableContextClearing: true,  // ← Automatic cleanup
});

// Adjust budget allocation
const budget = new TokenBudgetManager(8192, {
  memoryRetrievalPercent: 0.10,  // ← Reduce from 15%
  patternContextPercent: 0.05,   // ← Reduce from 10%
});
```

---

## Testing Checklist

Before deploying to production:

- [ ] Existing tests pass without modifications
- [ ] Agent executes with new config (no errors)
- [ ] Memory operations work (create, read, update, delete)
- [ ] Pattern learning records patterns successfully
- [ ] Tenant isolation verified (users can't see each other's data)
- [ ] Token usage is acceptable (< 20% increase)
- [ ] Performance is acceptable (< 50ms latency increase)
- [ ] Rollback plan tested (can revert in < 5 minutes)

---

## Getting Help

### Documentation

- [NATIVE-MEMORY-INTEGRATION.md](./NATIVE-MEMORY-INTEGRATION.md) - Complete integration guide
- [packages/agent-core/demo-native-memory.ts](./packages/agent-core/demo-native-memory.ts) - Working examples
- [CHANGELOG.md](./CHANGELOG.md) - Recent changes

### Code Examples

- **Tool Handler**: `packages/agent-core/src/ToolHandler.ts`
- **Pattern Learning**: `packages/agent-core/src/PatternLearning.ts`
- **Hybrid Memory**: `packages/agent-core/src/HybridMemoryManager.ts`
- **Tenant Context**: `packages/agent-core/src/TenantContext.ts`

### Support

- Check [TROUBLESHOOTING](#troubleshooting) section above
- Run demo: `npx ts-node packages/agent-core/demo-native-memory.ts`
- Review test examples: `packages/agent-core/src/__tests__/`

---

## Summary

### Quick Migration (5 minutes)

```typescript
// 1. Update config
const agent = new MyAgent({
  enableNativeMemory: true,
  enablePatternLearning: true,
  tenantId: 'your-tenant-id',
});

// 2. Test
npm test

// 3. Deploy
npm run build && npm start
```

### Full Migration (30 minutes)

1. Update all agent configs (5 min)
2. Add tenant context wrappers (10 min)
3. Configure environment variables (5 min)
4. Run tests and fix issues (5 min)
5. Monitor performance and rollback if needed (5 min)

**Recommendation**: Start with Path 2 (native memory only), then upgrade to Path 3 (full pattern learning) once comfortable.

---

**Last Updated**: 2025-11-05
**Migration Support**: Available until 2026-01-01
