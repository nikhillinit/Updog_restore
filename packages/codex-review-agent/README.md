# Codex Review Agent

Real-time code review agent using MCP multi-AI consensus reviews.

## Features

✨ **Real-time file watching** - Automatically reviews code as you save files
🤖 **Multi-AI consensus** - Reviews from Gemini, OpenAI, and DeepSeek
🎯 **Smart filtering** - Excludes node_modules, dist, build artifacts
⚡ **Debounced reviews** - Waits 1s after save to avoid spam
📊 **Detailed reporting** - Clear severity levels and actionable suggestions

## Quick Start

```bash
# Start the review agent
npm run review:watch

# Show help
npm run review:help
```

## How It Works

1. **File Watching**: Monitors `client/src`, `server`, and `shared` directories
2. **Change Detection**: Detects saves to `.ts`, `.tsx`, `.js`, `.jsx` files
3. **Multi-AI Review**: Sends code to 3 AI providers via MCP
4. **Consensus Generation**: Aggregates findings and generates consensus
5. **Display Results**: Shows issues grouped by severity

## Review Output Example

```
================================================================================
📊 Codex Review: client/src/components/Dashboard.tsx
================================================================================

✅ GOOD: Code looks good with minimal issues

🔵 LOW (1):
  1. [openai] Remove console.log statements before committing

ℹ️ INFO (1):
  1. [gemini] TODO comment found - consider creating a ticket

================================================================================
```

## Severity Levels

| Severity | Icon | Description |
|----------|------|-------------|
| **CRITICAL** | 🔴 | Security vulnerabilities, data loss risks |
| **HIGH** | 🟠 | Performance issues, major bugs |
| **MEDIUM** | 🟡 | Code quality, maintainability |
| **LOW** | 🔵 | Minor improvements, style |
| **INFO** | ℹ️ | Suggestions, best practices |

## Configuration

The agent is configured in [scripts/codex-review-watch.ts](../../scripts/codex-review-watch.ts):

```typescript
const agent = new CodexReviewAgent({
  name: 'codex-review-agent',
  watchPaths: ['client/src', 'server', 'shared'],
  aiProviders: ['gemini', 'openai', 'deepseek'],
  debounceMs: 1000,
  excludePatterns: [
    /node_modules/,
    /\.git/,
    /dist/,
    /build/,
    // ... etc
  ],
});
```

## In-Repo AI Orchestrator Integration

The agent now uses the **in-repo AI orchestrator** instead of the external MCP server for code reviews. This provides:

- ✅ **Zero supply-chain risk** - All code is version-controlled
- ✅ **Budget controls** - Daily call limits and cost tracking
- ✅ **Audit logging** - JSONL logs of all AI interactions
- ✅ **Same AI models** - Claude, GPT, Gemini, DeepSeek

The `callMCPCodeReview` method in [CodexReviewAgent.ts](src/CodexReviewAgent.ts) calls the in-repo orchestrator API:

```typescript
private async callMCPCodeReview(
  provider: string,
  filePath: string,
  content: string
): Promise<ReviewIssue[]> {
  const response = await fetch('http://localhost:5000/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `Review this code for security issues...`,
      models: [provider],
      tags: ['code-review', 'codex-agent'],
    }),
  });
  // Parse and return structured issues
}
```

**Requirements:**
- API server must be running on `http://localhost:5000`
- AI API keys configured in `.env.local`
- See [AI_ORCHESTRATOR_IMPLEMENTATION.md](../../AI_ORCHESTRATOR_IMPLEMENTATION.md) for setup

## Architecture

Built on the [BaseAgent](../agent-core/src/BaseAgent.ts) framework with:

- ✅ Retry logic with exponential backoff
- ✅ Metrics collection (Prometheus)
- ✅ Structured logging (JSON)
- ✅ Health monitoring
- ✅ ETag caching

## Comparison to GitHub Codex Bot

| Feature | Codex Bot (GitHub) | Codex Review Agent |
|---------|-------------------|-------------------|
| **Timing** | PR review | Real-time (on save) |
| **Feedback Loop** | Hours | Seconds |
| **Context** | Full PR diff | Single file |
| **AI Providers** | 1 (ChatGPT) | 4 (Claude, GPT, Gemini, DeepSeek) |
| **Consensus** | No | Yes |
| **Local** | No | Yes |
| **Supply Chain** | External (GitHub) | In-repo (auditable) |
| **Budget Control** | No | Yes (daily limits) |

## Development

```bash
# Build the package
cd packages/codex-review-agent
npm run build

# Watch mode
npm run dev
```

## Related

- [GitHub Codex Bot findings](../../docs/code-review/CODEX-BOT-FINDINGS-SUMMARY.md)
- [Codex fixes execution summary](../../docs/action-plans/CODEX-FIXES-EXECUTION-SUMMARY.md)
- [BaseAgent framework](../agent-core/README.md)
- [MCP multi-AI collaboration](../../CLAUDE.md#ai-augmented-development)
