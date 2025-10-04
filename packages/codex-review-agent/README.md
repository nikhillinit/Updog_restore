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

## MCP Integration

The agent uses the MCP multi-AI server for code reviews. Currently uses placeholder static analysis - to enable full AI reviews, implement the `callMCPCodeReview` method in [CodexReviewAgent.ts](src/CodexReviewAgent.ts):

```typescript
private async callMCPCodeReview(
  provider: string,
  filePath: string,
  content: string
): Promise<ReviewIssue[]> {
  // TODO: Replace with actual MCP server call
  // const response = await mcpClient.call(
  //   `mcp__multi-ai-collab__${provider}_code_review`,
  //   { code: content, focus: 'general' }
  // );
  // return parseReviewResponse(response);
}
```

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
| **AI Providers** | 1 (ChatGPT) | 3 (Gemini, OpenAI, DeepSeek) |
| **Consensus** | No | Yes |
| **Local** | No | Yes |

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
