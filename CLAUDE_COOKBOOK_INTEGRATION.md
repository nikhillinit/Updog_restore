# Claude Cookbook Integration Plan

This document tracks integration of patterns from the [Anthropic Claude Cookbooks](https://github.com/anthropics/claude-cookbooks) into our Updog project.

## ✅ Implemented Patterns

### 1. Evaluator-Optimizer Pattern ⭐ NEW
**Status**: ✅ Complete
**Location**: `packages/test-repair-agent/src/TestRepairAgent.ts`
**Documentation**: `packages/test-repair-agent/EVALUATOR_OPTIMIZER.md`

**What it does**:
- Iteratively improves test repairs through evaluation feedback loop
- Validates repairs against 3 criteria: testPasses, noRegressions, followsConventions
- Max 3 iterations with early stopping on PASS evaluation

**Impact**:
- 40-60% → 70-85% estimated repair success rate
- Prevents regressions (detects `any`, `@ts-ignore`, etc.)
- Enforces project conventions automatically

**Demo**: `cd packages/test-repair-agent && npx tsx demo-evaluator-optimizer.ts`

---

## 🟡 Partially Implemented

### 2. Orchestrator-Workers Pattern
**Status**: 🟡 75% Complete
**Current**: Multi-AI MCP with `collaborative_solve`, `ask_all_ais`
**Missing**: Formal orchestrator that dynamically delegates based on task complexity

**What we have**:
```typescript
// Multi-AI tools available
mcp.ask_gemini(prompt)           // Fast, cheap
mcp.openai_think_deep(topic)     // Deep reasoning
mcp.grok_code_review(code)       // Code analysis
mcp.deepseek_debug(error)        // Debugging
```

**What we need**:
```typescript
// Orchestrator that routes intelligently
const orchestrator = new TaskOrchestrator();

// Analyze complexity, delegate to right worker
if (task.complexity < 5) {
  return orchestrator.delegate('gemini', task);  // Fast
} else {
  return orchestrator.delegate('openai', task);  // Powerful
}
```

**Next Step**: Create `packages/agent-core/src/Orchestrator.ts`

---

### 3. Multi-LLM Parallelization
**Status**: 🟡 50% Complete
**Current**: Batch test execution, parallel MCP calls
**Missing**: Parallel model comparison for same task

**What we have**:
- `mcp.ask_all_ais(prompt)` - Sequential calls to all models
- Test runner batches tests in parallel

**What we need**:
- True parallel execution with result aggregation
- Consensus building across model outputs

---

## 🔴 Not Yet Implemented

### 4. Prompt Caching ⭐ HIGH PRIORITY
**Status**: ❌ Not Started
**Expected Impact**: 85% latency reduction, 90% cost reduction

**Use Cases**:
1. Cache project context (CLAUDE.md, DECISIONS.md, schema files)
2. Cache test suite structure for repair agent
3. Cache API documentation for route generation

**Implementation**:
```typescript
// Add cache_control to prompts
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4',
  messages: [{
    role: 'user',
    content: [
      {
        type: 'text',
        text: projectContext,
        cache_control: { type: 'ephemeral' }  // ← Cache this
      },
      {
        type: 'text',
        text: userQuery
      }
    ]
  }],
  headers: {
    'anthropic-beta': 'prompt-caching-2024-07-31'
  }
});
```

**Priority**: Implement in `packages/agent-core/BaseAgent.ts`

---

### 5. Routing Pattern
**Status**: ❌ Not Started
**Expected Impact**: Better AI model utilization, cost optimization

**Concept**: Route tasks to the most appropriate AI based on task characteristics

**Routing Logic**:
```typescript
class AIRouter {
  route(task: Task): AIModel {
    // TypeScript errors → DeepSeek (code-focused)
    if (task.type === 'typescript-error') return 'deepseek';

    // React components → GPT-4 (frontend expertise)
    if (task.type === 'react-component') return 'openai';

    // Performance → Gemini (optimization)
    if (task.type === 'performance') return 'gemini';

    // Complex reasoning → OpenAI o1
    if (task.complexity > 8) return 'openai-o1';

    // Default → Grok (systems thinking)
    return 'grok';
  }
}
```

**Priority**: Create `packages/agent-core/src/Router.ts`

---

### 6. Automated Evaluations
**Status**: ❌ Not Started
**Expected Impact**: Measure agent effectiveness, prevent regressions

**Concept**: Systematically evaluate AI agent performance

**Implementation**:
```typescript
// tests/ai-agents/test-repair-eval.ts
const evaluation = await evaluateAgent({
  agent: 'test-repair',
  testCases: [
    { failure: knownSyntaxError, expectedFix: 'add semicolon' },
    { failure: knownRuntimeError, expectedFix: 'null check' }
  ],
  successCriteria: {
    passRate: 0.85,
    avgIterations: 2,
    avgTime: 30000
  }
});

// Track over time
recordMetric('test-repair-success-rate', evaluation.passRate);
```

**Priority**: Create `tests/ai-agents/` evaluation suite

---

### 7. Prompt Chaining (Formalized)
**Status**: ❌ Not Started (we do this ad-hoc)
**Expected Impact**: More maintainable agent workflows

**Current**: Implicit chaining in test runner → repair agent → patch applier

**Proposed**: Explicit chain definitions
```typescript
const testRepairChain = defineChain([
  { agent: 'classifier', input: 'testError', output: 'errorType' },
  { agent: 'fixer', input: 'errorType', output: 'proposedFix' },
  { agent: 'evaluator', input: 'proposedFix', output: 'evaluation' },
  { agent: 'optimizer', input: 'evaluation', output: 'optimizedFix' },
  { agent: 'applier', input: 'optimizedFix', output: 'result' }
]);

await executeChain(testRepairChain, { testError: failureMessage });
```

**Priority**: Low (current ad-hoc approach works)

---

## 📊 Priority Roadmap

### Phase 1: Quick Wins (1-2 weeks)
1. ✅ **Evaluator-Optimizer** - DONE
2. ⭐ **Prompt Caching** - 85% latency reduction
3. **Routing Pattern** - Better AI utilization

### Phase 2: Enhanced Intelligence (2-4 weeks)
4. **Orchestrator-Workers** - Formal task delegation
5. **Automated Evaluations** - Agent performance tracking
6. **Multi-LLM Parallelization** - True parallel execution

### Phase 3: Advanced Features (1-2 months)
7. **RAG for Investment Data** - Vector search for portfolio queries
8. **Vision for Charts** - Parse pitch decks, extract data from graphs
9. **JSON Mode** - Structured outputs for API responses

---

## 🎯 Immediate Next Actions

### Action 1: Add Prompt Caching to BaseAgent
**File**: `packages/agent-core/src/BaseAgent.ts`
**Effort**: 2-4 hours
**Impact**: Massive (5-7x faster agent operations)

### Action 2: Create AI Router
**File**: `packages/agent-core/src/Router.ts`
**Effort**: 4-6 hours
**Impact**: Better model selection, cost optimization

### Action 3: Formalize Orchestrator
**File**: `packages/agent-core/src/Orchestrator.ts`
**Effort**: 6-8 hours
**Impact**: Dynamic task delegation to multi-AI workers

---

## 📚 Resources

- [Claude Cookbooks](https://github.com/anthropics/claude-cookbooks)
- [Agent Patterns](https://github.com/anthropics/claude-cookbooks/tree/main/patterns/agents)
- [Prompt Caching Guide](https://github.com/anthropics/claude-cookbooks/blob/main/misc/prompt_caching.ipynb)
- [Building Effective Agents](https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/README.md)

---

## 🔄 Updates

- **2025-01-XX**: Implemented Evaluator-Optimizer pattern in test-repair-agent
- **Next**: Prompt caching integration for BaseAgent
