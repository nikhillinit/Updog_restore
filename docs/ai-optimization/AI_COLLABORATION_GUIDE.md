# AI Collaboration Methods - Complete Guide

**Date:** October 5, 2025 **Status:** ✅ Production Ready **Features:** Debate,
Consensus, Sequential/Parallel Collaboration

---

## Overview

The AI Orchestrator now supports **advanced collaboration patterns** that enable
multiple AIs to work together, debate topics, build consensus, and solve complex
problems.

### Available Methods

1. **`/api/ai/debate`** - Two AIs debate a topic (parallel execution)
2. **`/api/ai/consensus`** - All AIs vote/recommend (parallel execution)
3. **`/api/ai/collaborate`** - Multiple AIs solve problems (sequential or
   parallel)

All methods support **budget tracking**, **cost calculation**, and **audit
logging**.

---

## 1. AI Debate

**Have two AIs debate a topic with opening and counter-arguments.**

### Endpoint

```
POST /api/ai/debate
```

### Request Body

```json
{
  "topic": "Should we use microservices or monolith for a startup?",
  "ai1": "claude", // Optional, default: "claude"
  "ai2": "gpt", // Optional, default: "gpt"
  "tags": ["architecture", "debate"] // Optional
}
```

### Response

```json
{
  "success": true,
  "result": {
    "topic": "Should we use microservices or monolith for a startup?",
    "ai1": "claude",
    "ai2": "gpt",
    "opening": {
      "model": "claude",
      "text": "I argue for monolith because...",
      "cost_usd": 0.0045,
      "elapsed_ms": 2300
    },
    "counter": {
      "model": "gpt",
      "text": "I counter-argue for microservices because...",
      "cost_usd": 0.0003,
      "elapsed_ms": 1800
    },
    "totalCost": 0.0048,
    "elapsedMs": 2400
  }
}
```

### curl Example

```bash
curl -X POST http://localhost:5000/api/ai/debate \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "React vs Vue for our next project",
    "ai1": "claude",
    "ai2": "deepseek"
  }'
```

### Use Cases

- **Architecture decisions** - Debate microservices vs monolith
- **Technology choices** - Compare React vs Vue, SQL vs NoSQL
- **Design patterns** - MVC vs MVVM
- **Strategy decisions** - Build vs buy, cloud vs on-prem

### Performance

- **Execution:** Parallel (both AIs run simultaneously)
- **Time:** ~2-3 seconds (same as single AI call)
- **Cost:** ~$0.005 per debate

---

## 2. AI Consensus

**Get recommendations from all AIs and generate consensus.**

### Endpoint

```
POST /api/ai/consensus
```

### Request Body

```json
{
  "question": "What's the best caching strategy for our API?",
  "options": "Redis, Memcached, in-memory, CDN", // Optional
  "models": ["claude", "gpt", "gemini", "deepseek"], // Optional
  "tags": ["caching", "consensus"] // Optional
}
```

### Response

```json
{
  "success": true,
  "result": {
    "question": "What's the best caching strategy for our API?",
    "options": "Redis, Memcached, in-memory, CDN",
    "responses": [
      {
        "model": "claude",
        "text": "I recommend Redis because...",
        "cost_usd": 0.0045,
        "elapsed_ms": 2100
      },
      {
        "model": "gpt",
        "text": "Redis is ideal for...",
        "cost_usd": 0.0003,
        "elapsed_ms": 1900
      },
      {
        "model": "gemini",
        "text": "Consider Redis with...",
        "cost_usd": 0,
        "elapsed_ms": 1800
      },
      {
        "model": "deepseek",
        "text": "Redis offers...",
        "cost_usd": 0.0002,
        "elapsed_ms": 2000
      }
    ],
    "consensus": "✅ All 4 AIs provided recommendations",
    "totalCost": 0.005,
    "elapsedMs": 2200
  }
}
```

### curl Example

```bash
curl -X POST http://localhost:5000/api/ai/consensus \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Should we migrate to TypeScript?",
    "options": "Yes, No, Gradual migration",
    "models": ["claude", "gpt", "gemini", "deepseek"]
  }'
```

### Use Cases

- **Team decisions** - Get multiple perspectives before deciding
- **Risk assessment** - All AIs evaluate risks independently
- **Technology evaluation** - Consensus on best tool/framework
- **Code review validation** - Multiple AIs agree on recommendations

### Performance

- **Execution:** Parallel (all AIs run simultaneously)
- **Time:** ~2-3 seconds (4 AI responses)
- **Cost:** ~$0.006 per consensus (all 4 models)

---

## 3. Collaborative Solve

**Multiple AIs collaborate to solve complex problems.**

### Endpoint

```
POST /api/ai/collaborate
```

### Request Body

```json
{
  "problem": "Design a scalable event-driven architecture for order processing",
  "approach": "sequential", // "sequential" or "parallel"
  "models": ["claude", "gpt", "gemini", "deepseek"], // Optional
  "tags": ["architecture", "design"] // Optional
}
```

### Response (Sequential)

```json
{
  "success": true,
  "result": {
    "problem": "Design a scalable event-driven architecture...",
    "approach": "sequential",
    "steps": [
      {
        "model": "claude",
        "text": "Step 1: Start with event sourcing pattern...",
        "cost_usd": 0.006,
        "elapsed_ms": 2800
      },
      {
        "model": "gpt",
        "text": "Step 2: Building on Claude's event sourcing, add CQRS...",
        "cost_usd": 0.0004,
        "elapsed_ms": 2200
      },
      {
        "model": "gemini",
        "text": "Step 3: Enhancing the CQRS pattern, implement saga...",
        "cost_usd": 0,
        "elapsed_ms": 2100
      },
      {
        "model": "deepseek",
        "text": "Step 4: For the saga pattern, consider compensation...",
        "cost_usd": 0.0003,
        "elapsed_ms": 2400
      }
    ],
    "totalCost": 0.0067,
    "elapsedMs": 9500
  }
}
```

### Sequential vs Parallel

#### Sequential (Default)

- **How it works:** Each AI builds on previous AI's insights
- **Best for:** Complex problems requiring iterative refinement
- **Time:** ~2-3s × number of AIs (9-12s for 4 AIs)
- **Output:** Cohesive, building solution

**Example:**

```bash
curl -X POST http://localhost:5000/api/ai/collaborate \
  -H "Content-Type: application/json" \
  -d '{
    "problem": "Optimize database query performance for 1M+ records",
    "approach": "sequential",
    "models": ["claude", "gpt", "gemini"]
  }'
```

#### Parallel

- **How it works:** All AIs analyze independently
- **Best for:** Getting diverse perspectives quickly
- **Time:** ~2-3s (all AIs run simultaneously)
- **Output:** Multiple independent solutions

**Example:**

```bash
curl -X POST http://localhost:5000/api/ai/collaborate \
  -H "Content-Type: application/json" \
  -d '{
    "problem": "Find bugs in this authentication flow",
    "approach": "parallel",
    "models": ["claude", "gpt", "deepseek"]
  }'
```

### Use Cases

**Sequential Approach:**

- Architecture design (each layer builds on previous)
- Refactoring plans (step-by-step transformation)
- Complex algorithm design
- Multi-stage optimization

**Parallel Approach:**

- Bug finding (diverse perspectives)
- Brainstorming solutions
- Code review (multiple independent opinions)
- Risk identification

---

## Comparison: All Methods

| Method                       | AIs     | Execution  | Time   | Cost    | Best For                  |
| ---------------------------- | ------- | ---------- | ------ | ------- | ------------------------- |
| **debate**                   | 2       | Parallel   | ~2-3s  | ~$0.005 | Exploring both sides      |
| **consensus**                | All (4) | Parallel   | ~2-3s  | ~$0.006 | Team decisions            |
| **collaborate (parallel)**   | All (4) | Parallel   | ~2-3s  | ~$0.006 | Diverse perspectives      |
| **collaborate (sequential)** | All (4) | Sequential | ~9-12s | ~$0.007 | Iterative problem solving |

---

## Using with Claude Code Agents

You can combine these methods with Claude Code's agent system for **even more
powerful workflows**:

### Example: Multi-Stage Architecture Review

```markdown
Claude: "Please use parallel agents to review this architecture:

Agent 1: Get consensus on database choice

- POST to /api/ai/consensus
- Question: 'Best database for event sourcing?'
- Options: 'PostgreSQL, MongoDB, EventStoreDB'

Agent 2: Debate messaging patterns

- POST to /api/ai/debate
- Topic: 'RabbitMQ vs Kafka for order events'
- ai1: claude, ai2: gpt

Agent 3: Collaborative scaling strategy

- POST to /api/ai/collaborate
- Problem: 'Scale to 10,000 orders/sec'
- Approach: sequential

Synthesize all three results into final recommendation."
```

### Example: Sequential Code Analysis

```bash
# Step 1: All AIs review independently (parallel)
curl -X POST http://localhost:5000/api/ai/consensus \
  -d '{"question":"Review this code for issues","options":"security, performance, maintainability"}'

# Step 2: Get consensus on top issue
# (use top issue from step 1)

# Step 3: Collaborative solution (sequential)
curl -X POST http://localhost:5000/api/ai/collaborate \
  -d '{"problem":"Fix the XSS vulnerability","approach":"sequential"}'
```

---

## Cost & Budget

All collaboration methods respect the **daily budget limit** (default: 200
calls/day).

### Cost Breakdown

**Per Collaboration Type:**

- Debate: ~2 AI calls = ~$0.005
- Consensus (4 AIs): ~4 AI calls = ~$0.006
- Collaborate Parallel (4 AIs): ~4 AI calls = ~$0.006
- Collaborate Sequential (4 AIs): ~4 AI calls = ~$0.007

**Daily Budget (200 calls):**

- ~40 debates
- ~50 consensus queries
- ~50 parallel collaborations
- ~50 sequential collaborations

### Budget Tracking

Check remaining budget:

```bash
curl http://localhost:5000/api/ai/usage
```

Response:

```json
{
  "calls_today": 45,
  "limit": 200,
  "remaining": 155,
  "total_cost_usd": 0.28
}
```

---

## Audit Logs

All collaboration methods are logged to `logs/multi-ai.jsonl`:

### Debate Log Entry

```json
{
  "ts": "2025-10-05T22:30:15Z",
  "level": "info",
  "event": "ask_all_ais",
  "prompt_hash": "abc123...",
  "models": ["claude"],
  "tags": ["debate", "opening"],
  "elapsed_ms": 2300,
  "calls_today": 46,
  "total_cost_usd": 0.0045,
  "successful": 1,
  "failed": 0
}
```

### Query Logs

```bash
# View all debates
cat logs/multi-ai.jsonl | jq 'select(.tags[] | contains("debate"))'

# View all consensus queries
cat logs/multi-ai.jsonl | jq 'select(.tags[] | contains("consensus"))'

# View all collaborations
cat logs/multi-ai.jsonl | jq 'select(.tags[] | contains("collaborative"))'
```

---

## Error Handling

All endpoints return consistent error responses:

### Validation Error (400)

```json
{
  "success": false,
  "error": "Invalid request",
  "details": [
    {
      "path": ["topic"],
      "message": "String must contain at least 1 character(s)"
    }
  ]
}
```

### Budget Exceeded (500)

```json
{
  "success": false,
  "error": "Daily AI call limit reached (200/200)"
}
```

### AI Error (Partial Success)

```json
{
  "success": true,
  "result": {
    "consensus": "⚠️ 3/4 AIs responded successfully",
    "responses": [
      { "model": "claude", "text": "..." },
      { "model": "gpt", "error": "Timeout after 10000ms" },
      { "model": "gemini", "text": "..." },
      { "model": "deepseek", "text": "..." }
    ]
  }
}
```

---

## Best Practices

### 1. Choose the Right Method

- **Quick decisions?** → Use **consensus** (parallel, fast)
- **Explore tradeoffs?** → Use **debate** (2 AIs, opposing views)
- **Complex problem?** → Use **collaborate sequential** (iterative refinement)
- **Diverse ideas?** → Use **collaborate parallel** (independent perspectives)

### 2. Select Appropriate Models

**For Architecture/Design:**

- Debate: Claude vs Gemini (both excel at system design)
- Consensus: All 4 models
- Sequential: Claude → GPT → Gemini (building complexity)

**For Code Review:**

- Parallel: All 4 (diverse bug detection)
- Consensus: Claude, GPT, DeepSeek (code-focused)

**For Creative/Brainstorming:**

- Debate: GPT vs Gemini (creative thinking)
- Parallel: All 4 (maximum diversity)

### 3. Use Tags for Organization

```json
{
  "tags": ["sprint-3", "architecture", "caching-decision"]
}
```

Then query logs:

```bash
cat logs/multi-ai.jsonl | jq 'select(.tags[] | contains("sprint-3"))'
```

### 4. Monitor Costs

```bash
# Check daily spend
curl http://localhost:5000/api/ai/usage | jq '.total_cost_usd'

# Adjust budget if needed
export AI_DAILY_CALL_LIMIT=500  # In .env.local
```

---

## Quick Reference

### Start Services

```bash
npm run dev  # Starts API on http://localhost:5000
```

### API Endpoints Summary

| Endpoint              | Method | Purpose        | Execution           |
| --------------------- | ------ | -------------- | ------------------- |
| `/api/ai/ask`         | POST   | Basic query    | Parallel            |
| `/api/ai/debate`      | POST   | Two AI debate  | Parallel            |
| `/api/ai/consensus`   | POST   | All AIs vote   | Parallel            |
| `/api/ai/collaborate` | POST   | Solve together | Sequential/Parallel |
| `/api/ai/usage`       | GET    | Budget stats   | N/A                 |

### Example Workflow

```bash
# 1. Check budget
curl http://localhost:5000/api/ai/usage

# 2. Get consensus on approach
curl -X POST http://localhost:5000/api/ai/consensus \
  -H "Content-Type: application/json" \
  -d '{"question":"Best approach for real-time notifications?"}'

# 3. Debate top 2 options
curl -X POST http://localhost:5000/api/ai/debate \
  -H "Content-Type: application/json" \
  -d '{"topic":"WebSockets vs Server-Sent Events"}'

# 4. Collaborative implementation plan
curl -X POST http://localhost:5000/api/ai/collaborate \
  -H "Content-Type: application/json" \
  -d '{"problem":"Implement WebSocket notifications","approach":"sequential"}'
```

---

## Troubleshooting

### "Daily limit reached"

```bash
# Check usage
curl http://localhost:5000/api/ai/usage

# Increase limit in .env.local
AI_DAILY_CALL_LIMIT=500

# Restart server
npm run dev
```

### "Timeout after 10000ms"

- Retry the request (automatic retry logic included)
- Check API key is valid
- Reduce prompt complexity

### "Model not available"

```bash
# Check which models are configured
cat .env.local | grep -E "ANTHROPIC|OPENAI|GOOGLE|DEEPSEEK"
```

---

## Related Documentation

- **[AI_ORCHESTRATOR_IMPLEMENTATION.md](./AI_ORCHESTRATOR_IMPLEMENTATION.md)** -
  Core orchestrator guide
- **[CODEX_AGENT_MIGRATION.md](./CODEX_AGENT_MIGRATION.md)** - Codex Review
  Agent integration
- **[DECISIONS.md](./DECISIONS.md)** - Architecture decisions

---

**Status:** ✅ All collaboration methods production-ready!

**Next:** Use these powerful multi-AI workflows to make better decisions faster!
