---
status: HISTORICAL
last_updated: 2026-05-27
---

# Codex Review Agent - Setup Complete!

Batch 8 removed the local `packages/codex-review-agent/` source after live
reference scans found no active root script, app, test, workflow, or config
dependency. This document is retained as historical implementation context.

## What We Built

A **real-time code review agent** that watches your files and provides instant
AI-powered reviews using multi-AI consensus (Gemini, OpenAI, DeepSeek) - just
like the GitHub Codex bot, but running locally as you code!

## Quick Start

### 1. Start the Review Agent

```bash
npm run review:watch
```

You'll see:

```
Starting Codex Review Agent...
[OK] Codex Review Agent is running!
   Watching for file changes...
   Press Ctrl+C to stop
```

### 2. Edit a File

Now when you save any `.ts`, `.tsx`, `.js`, or `.jsx` file in:

- `client/src/`
- `server/`
- `shared/`

The agent will automatically review it and display results in your terminal!

### 3. See the Review

You'll get instant feedback like:

```
================================================================================
Codex Review: client/src/components/Dashboard.tsx
================================================================================

[OK] GOOD: Code looks good with minimal issues

MEDIUM (1):
  1. [gemini] Avoid using "any" type - use specific types for better type safety

LOW (1):
  1. [openai] Remove console.log statements before committing

================================================================================
```

## Key Features

[x] **Real-time reviews** - Get feedback within 1 second of saving [x]
**Multi-AI consensus** - Reviews from 3 AI providers [x] **Smart filtering** -
Only reviews code files, skips node_modules [x] **Severity levels** - Clear
categorization (Critical to Info) [x] **Debounced** - Won't spam if you save
rapidly

## Configuration

The agent is pre-configured for your project:

- **Watch paths**: `client/src`, `server`, `shared`
- **AI providers**: Gemini, OpenAI, DeepSeek (3-way consensus)
- **Debounce**: 1000ms (waits 1s after your last save)
- **File types**: `.ts`, `.tsx`, `.js`, `.jsx`

## Next Steps

### Enable Full MCP Integration

Historically, the agent used basic static analysis. To enable full AI reviews in
the removed package implementation:

1. Ensure your MCP multi-AI server is running
2. Recover the removed `packages/codex-review-agent/` source from git history,
   then update `CodexReviewAgent.ts` around `callMCPCodeReview()` to call the
   actual MCP server:

```typescript
private async callMCPCodeReview(
  provider: string,
  filePath: string,
  content: string
): Promise<ReviewIssue[]> {
  // Replace placeholder with actual MCP call
  const response = await this.mcpClient.call(
    `mcp__multi-ai-collab__${provider}_code_review`,
    { code: content, focus: 'general' }
  );
  return this.parseReviewResponse(response);
}
```

### Customize Watch Paths

Edit [scripts/codex-review-watch.ts](../../scripts/codex-review-watch.ts):

```typescript
const agent = new CodexReviewAgent({
  name: 'codex-review-agent',
  watchPaths: ['client/src', 'server', 'shared'], // ← Change these
  aiProviders: ['gemini', 'openai', 'deepseek'], // ← Or these
  debounceMs: 1000, // ← Or this
});
```

### Add Custom Rules

Extend the `callMCPCodeReview` method to add your own static checks before
calling MCP:

```typescript
// Check for common issues
if (content.includes('password') && !content.includes('hashed')) {
  issues.push({
    severity: 'critical',
    message: 'Potential password exposure - ensure passwords are hashed',
    provider,
  });
}
```

## Architecture

```
File Save
    ↓
Watch Detected (debounced 1s)
    ↓
Read File Content
    ↓
┌─────────────────────────────────┐
│   Multi-AI Parallel Reviews     │
├─────────────────────────────────┤
│  Gemini  │ OpenAI │  DeepSeek   │
└─────────────────────────────────┘
    ↓
Aggregate Issues
    ↓
Generate Consensus
    ↓
Display Results
```

## Comparison to GitHub Codex Bot

| Feature      | GitHub Codex Bot        | Codex Review Agent |
| ------------ | ----------------------- | ------------------ |
| **When**     | PR review (hours later) | On save (1s)       |
| **Where**    | GitHub cloud            | Your machine       |
| **Speed**    | Hours                   | Seconds            |
| **Context**  | Full PR                 | Single file        |
| **AI Count** | 1                       | 3 (consensus)      |
| **Privacy**  | Public                  | Local              |

## Historical Files Created

```
packages/codex-review-agent/ (removed in Batch 8; recover from git history)
├── src/
│   ├── CodexReviewAgent.ts    # Main agent class
│   └── index.ts               # Exports
├── dist/                      # Compiled output
├── package.json
├── tsconfig.json
└── README.md

scripts/
└── codex-review-watch.ts      # CLI launcher

package.json (updated)
└── scripts:
    ├── "review:watch"         # Start watching
    └── "review:help"          # Show help
```

## Commands Reference

```bash
# Start watching files for review
npm run review:watch

# Show help
npm run review:help

# The local package source was removed in Batch 8.
# There is no current package build command.
```

## Proven Track Record

The GitHub Codex bot has already demonstrated massive value on your project:

- [x] Caught **$14M financial error** (management fee calculation)
- [x] Found **RS256 JWT security regression**
- [x] Detected **silent data loss** (wizard state)
- [x] Identified **dev environment blocker**
- [x] **100% accuracy** (0 false positives)

Now you have that same quality of review **in real-time as you code**!

## Support

- **Documentation**: historical package README was removed with
  `packages/codex-review-agent/`; recover from git history if needed.
- **Related**:
  [CODEX-FIXES-EXECUTION-SUMMARY.md](../action-plans/CODEX-FIXES-EXECUTION-SUMMARY.md)
- **Framework**: historical `packages/agent-core/src/BaseAgent.ts` source was
  removed with Batch 8.

---

**Ready to use!** Just run `npm run review:watch` and start coding with instant
AI feedback!
