# Architecture Decision Records

This file documents key architectural and technical decisions made during the development of the Press On Ventures fund modeling platform.

---

## AI Orchestrator for Multi-Model Code Review

**Date:** 2025-10-05
**Status:** ✅ Implemented
**Decision:** Build in-repo AI orchestrator instead of external MCP server

### Context

Previously used `multi-ai-collab` MCP server for parallel AI queries (Claude, GPT, Gemini).

Security review identified supply-chain risks:
- Code executed from outside repository
- No cryptographic verification (TOFU - Trust On First Use)
- Unclear enable/disable state across 37 commits
- API keys stored in plaintext files
- No audit trail of AI calls

The MCP server did provide value:
- 6x speedup via parallel execution
- Cross-AI validation caught incorrect recommendations
- Specialized expertise (Gemini for architecture, GPT for best practices, DeepSeek for security)
- Delivered 744 lines of production-ready code

### Decision

Replace external MCP with in-repo orchestrator (`server/services/ai-orchestrator.ts`):

**Implementation:**
- All code version-controlled and auditable
- File-based budget tracking (no Redis dependency required)
- JSONL audit logging (`logs/multi-ai.jsonl`)
- Environment-based secrets (no plaintext files)
- Gitleaks pre-commit hook for secret scanning
- Cost calculation with env-based pricing

**API Endpoints:**
- `POST /api/ai/ask` - Query multiple AI models in parallel
- `GET /api/ai/usage` - Get current usage statistics

**Frontend Hooks:**
- `useAskAllAIs()` - TanStack Query mutation for AI queries
- `useAIUsage()` - Real-time usage statistics
- Optional `AIUsageWidget` component for visibility

### Consequences

**Positive:**
- ✅ Eliminates supply-chain risk entirely
- ✅ Same parallelization benefits (6x speedup preserved)
- ✅ Full control over logic, costs, and audit trail
- ✅ Simple deployment (no external dependencies)
- ✅ Production-ready with retry/timeout logic
- ✅ Budget enforcement (200 calls/day default)

**Negative:**
- ❌ Need to maintain provider integrations ourselves
- ❌ No built-in UI (using custom React hooks instead)
- ❌ Manual updates when providers change APIs

**Trade-offs Accepted:**
- File-based budget vs Redis → Simpler, sufficient for current scale
- Manual provider updates vs automatic MCP updates → Security over convenience
- In-repo code vs external server → Auditability over ease of installation

### Implementation Details

**New Files Created:**
- `server/services/ai-orchestrator.ts` - Core orchestration logic (350 lines)
- `server/routes/ai.ts` - Express API endpoints
- `client/src/hooks/useAI.ts` - React hooks for TanStack Query
- `client/src/components/admin/AIUsageWidget.tsx` - Optional UI widget

**Modified Files:**
- `server/app.ts` - Registered AI routes
- `.env.local.example` - Added AI configuration section
- `.husky/pre-commit` - Added Gitleaks secret scanning
- `package.json` - Added `p-limit` and `gitleaks` dependencies

**Configuration:**
- Daily call limit: 200 (configurable via `AI_DAILY_CALL_LIMIT`)
- Cost tracking per model with env-based pricing
- File-based persistence (`logs/ai-budget.json`)
- Audit logging with prompt hashing for privacy

**Security Measures:**
- Gitleaks pre-commit hook prevents accidental key commits
- Environment-based secrets (no files)
- JSONL audit log tracks all AI interactions
- Budget enforcement prevents runaway costs
- Retry logic with exponential backoff
- Timeout protection (10s per model)

### Usage Example

```typescript
// From React component
import { useAskAllAIs } from '@/hooks/useAI';

function CodeReviewPanel() {
  const { mutate: askAI, data: results, isPending } = useAskAllAIs();

  const handleReview = () => {
    askAI({
      prompt: 'Review this code for security issues: ...',
      tags: ['code-review', 'security'],
      models: ['claude', 'gpt', 'gemini'], // Optional: select specific models
    });
  };

  return (
    <div>
      <button onClick={handleReview} disabled={isPending}>
        Get AI Review
      </button>
      {results?.map((result) => (
        <div key={result.model}>
          <h3>{result.model}</h3>
          {result.error ? (
            <p>Error: {result.error}</p>
          ) : (
            <p>{result.text}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

### References

- [MCP_MULTI_AI_INCIDENT_REPORT.md](./MCP_MULTI_AI_INCIDENT_REPORT.md) - Complete security incident analysis
- [PARALLEL_EXECUTION_SUMMARY.md](./PARALLEL_EXECUTION_SUMMARY.md) - Multi-AI parallel execution outcomes
- [SECURITY_REVIEW_EVALUATION.md](./SECURITY_REVIEW_EVALUATION.md) - Multi-AI security validation

### Future Considerations

1. **If file-based budget becomes insufficient:**
   - Migrate to Redis-based tracking
   - Add distributed locking for multi-instance deployments

2. **If cost tracking needs improvement:**
   - Add provider-specific billing APIs
   - Implement real-time cost alerting
   - Track costs per user/project

3. **If we need more AI providers:**
   - Add support for Anthropic Claude Code
   - Integrate DeepSeek for specialized reasoning
   - Consider local models (Ollama) for sensitive data

---

*For more architectural decisions, see individual decision records in `docs/decisions/`*
