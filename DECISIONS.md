# Architecture Decision Records

This file documents key architectural and technical decisions made during the
development of the Press On Ventures fund modeling platform.

---

## Official Claude Code Plugins Over Custom BMad Infrastructure

**Date:** 2025-10-18 **Status:** ✅ Implemented **Decision:** Archive BMad
infrastructure, adopt official Claude Code plugins

### Context

In July 2025, we experimented with the BMad (Build, Measure, Automate, Deploy)
methodology:

- Installed 27 BMad slash commands (10 agent personas + 17 task workflows)
- Commands located in `repo/.claude/commands/BMad/`
- Encountered unrelated technical errors during initial adoption
- Workflow was dropped entirely and never resumed

BMad required extensive infrastructure that was never implemented:

- `.bmad-core/` directory with configuration
- `core-config.yaml` for project settings
- Story files (`*.story.md`) with specific naming patterns
  (`{epicNum}.{storyNum}.story.md`)
- Sharded PRD structure with epic files
- BMad-specific checklists and templates

Meanwhile, our project developed superior alternatives:

- **Custom development commands**: `/test-smart`, `/fix-auto`, `/deploy-check`,
  `/perf-guard`, `/dev-start`
- **Memory management system**: `/log-change`, `/log-decision`,
  `/create-cheatsheet`
- **Documentation structure**: CLAUDE.md, CHANGELOG.md, DECISIONS.md,
  cheatsheets/
- **11-agent AI system**: `packages/agent-core/` with specialized agents (test
  repair, bundle optimization, dependency analysis, etc.)

Anthropic released official Claude Code plugins that supersede BMad
functionality:

- **PR Review Toolkit** - 6 specialized review agents
- **Feature Development Plugin** - Structured 7-phase workflow with code
  exploration and architecture design
- **Commit Commands Plugin** - Git workflow automation

### Decision

**Archive all BMad infrastructure** (moved to
`archive/2025-10-18/bmad-infrastructure/`) and adopt official Claude Code
plugins.

**Rationale:**

1. **Zero Active Usage:** BMad tried once in July 2025, dropped entirely since
   then
2. **Missing Infrastructure:** No `.bmad-core/`, `core-config.yaml`, or
   `*.story.md` files exist
3. **Superior Replacements:** Official plugins are maintained by Anthropic,
   better integrated, more polished
4. **Reduced Complexity:** Eliminates 27 unused commands, simplifies onboarding
5. **Active Alternatives:** Our custom commands (`/test-smart`, `/fix-auto`,
   etc.) are actively used and domain-specific

### Consequences

**Positive:**

- ✅ Official plugins maintained by Anthropic (no maintenance burden)
- ✅ Better integration with Claude Code core features
- ✅ 6 specialized PR review agents (vs generic BMad personas)
- ✅ Structured feature development workflow (7 phases with approval gates)
- ✅ Git automation (`/commit`, `/commit-push-pr`, `/clean_gone`)
- ✅ Reduced cognitive load (27 fewer unused commands)
- ✅ Cleaner codebase (228KB reclaimed)

**Negative:**

- ❌ Need to learn new plugin commands (minimal - similar to BMad)
- ❌ Plugin installation required (one-time setup)

**Trade-offs Accepted:**

- BMad flexibility vs official plugin structure → Structure wins (proven
  workflows)
- Custom personas vs specialized agents → Specialized agents win
  (comment-analyzer, pr-test-analyzer, silent-failure-hunter,
  type-design-analyzer, code-reviewer, code-simplifier)
- Sprint planning automation vs manual planning → Manual planning sufficient for
  current team size

### Implementation Details

**Archived Files:**

- 10 agent personas: architect.md, analyst.md, bmad-master.md, dev.md,
  bmad-orchestrator.md, pm.md, po.md, qa.md, sm.md, ux-expert.md
- 17 task workflows: create-next-story.md, brownfield-create-epic.md,
  execute-checklist.md, index-docs.md, shard-doc.md, and 12 more

**Archive Location:** `archive/2025-10-18/bmad-infrastructure/`

**Archive Method:** `git mv` to preserve full file history

**Comprehensive Documentation:** `archive/2025-10-18/ARCHIVE_MANIFEST.md` with
rollback instructions

**Recommended Plugin Installations:**

1. **PR Review Toolkit** - Provides 6 review agents:
   - `comment-analyzer` - Comment accuracy vs code
   - `pr-test-analyzer` - Test coverage quality analysis
   - `silent-failure-hunter` - Error handling validation
   - `type-design-analyzer` - TypeScript type design review
   - `code-reviewer` - CLAUDE.md compliance and bug detection
   - `code-simplifier` - Code clarity and refactoring

2. **Feature Development Plugin** - 7-phase workflow:
   - Phase 1: Discovery (clarify requirements)
   - Phase 2: Codebase Exploration (2-3 `code-explorer` agents in parallel)
   - Phase 3: Clarifying Questions (fill gaps before design)
   - Phase 4: Architecture Design (2-3 `code-architect` agents with multiple
     approaches)
   - Phase 5: Implementation (with approval gates)
   - Phase 6: Quality Review (3 `code-reviewer` agents in parallel)
   - Phase 7: Summary (document decisions)

3. **Commit Commands Plugin** - Git automation:
   - `/commit` - Auto-generate commit message
   - `/commit-push-pr` - Commit, push, and create PR in one step
   - `/clean_gone` - Clean up stale branches

**What Remains Active:**

- Custom commands: `/test-smart`, `/fix-auto`, `/deploy-check`, `/perf-guard`,
  `/dev-start`
- Memory commands: `/log-change`, `/log-decision`, `/create-cheatsheet`
- 11-agent AI system in `packages/`
- AI Orchestrator (`server/services/ai-orchestrator.ts`)
- Prompt Improver Hook (`~/.claude/hooks/improve-prompt.py`)
- Documentation structure (CLAUDE.md, CHANGELOG.md, DECISIONS.md, cheatsheets/)

### Rollback Plan

If needed, restore BMad infrastructure:

```bash
git mv archive/2025-10-18/bmad-infrastructure/agents/*.md repo/.claude/commands/BMad/agents/
git mv archive/2025-10-18/bmad-infrastructure/tasks/*.md repo/.claude/commands/BMad/tasks/
```

Full details in `archive/2025-10-18/ARCHIVE_MANIFEST.md`

### Verification

- ✅ Zero active imports of BMad commands found
- ✅ No `.bmad-core/` directory exists
- ✅ No `*.story.md` files exist
- ✅ No `core-config.yaml` exists
- ✅ All 27 files successfully moved to archive
- ✅ Git history preserved via `git mv`
- ✅ Zero breaking changes (BMad was optional slash commands)

---

## AI Orchestrator for Multi-Model Code Review

**Date:** 2025-10-05 **Status:** ✅ Implemented **Decision:** Build in-repo AI
orchestrator instead of external MCP server

### Context

Previously used `multi-ai-collab` MCP server for parallel AI queries (Claude,
GPT, Gemini).

Security review identified supply-chain risks:

- Code executed from outside repository
- No cryptographic verification (TOFU - Trust On First Use)
- Unclear enable/disable state across 37 commits
- API keys stored in plaintext files
- No audit trail of AI calls

The MCP server did provide value:

- 6x speedup via parallel execution
- Cross-AI validation caught incorrect recommendations
- Specialized expertise (Gemini for architecture, GPT for best practices,
  DeepSeek for security)
- Delivered 744 lines of production-ready code

### Decision

Replace external MCP with in-repo orchestrator
(`server/services/ai-orchestrator.ts`):

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

- [MCP_MULTI_AI_INCIDENT_REPORT.md](./MCP_MULTI_AI_INCIDENT_REPORT.md) -
  Complete security incident analysis
- [PARALLEL_EXECUTION_SUMMARY.md](./PARALLEL_EXECUTION_SUMMARY.md) - Multi-AI
  parallel execution outcomes
- [SECURITY_REVIEW_EVALUATION.md](./SECURITY_REVIEW_EVALUATION.md) - Multi-AI
  security validation

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

## Prompt Improver Hook Internalization

**Date:** 2025-10-18 **Status:** ✅ Implemented **Decision:** Internalize prompt
improvement hook instead of external dependency

### Context

Discovered
[severity1/claude-code-prompt-improver](https://github.com/severity1/claude-code-prompt-improver),
a UserPromptSubmit hook that:

- Intercepts vague prompts before execution
- Wraps them with evaluation instructions
- Uses Claude's `AskUserQuestion` tool for targeted clarification
- Reduces back-and-forth, improves first-attempt outcomes

**Value proposition:**

- Time savings: Eliminates 5-10 clarification rounds per week
- Quality improvement: Better context for complex domain tasks (VC modeling,
  fund analytics)
- Minimal overhead: ~250 tokens per wrapped prompt (~4% of 200k context)

**Security considerations:**

- External GitHub dependency (no package manager)
- Manual installation from remote repository
- No cryptographic verification
- Difficult to audit changes upstream

### Decision

Internalize the hook into our repository following the AI Orchestrator pattern:

**Implementation:**

- All code version-controlled at `~/.claude/hooks/improve-prompt.py`
- Enhanced with project-specific context (engines, patterns, commands)
- JSONL audit logging (`~/.claude/logs/prompt-improvements.jsonl`)
- Analytics script for identifying documentation gaps
- MIT license preserved (attribution maintained)

**Project-Specific Enhancements:**

- **Architecture context:** Frontend/backend/shared layers, key engines
- **Domain patterns:** AMERICAN vs EUROPEAN waterfalls, reserve/pacing/cohort
  engines
- **Custom commands:** `/test-smart`, `/fix-auto`, `/deploy-check`, slash
  commands
- **Bypass patterns:** npm, git, docker commands (no evaluation needed)
- **Logging:** Track which prompts need clarification to improve CLAUDE.md

**Configuration Location:**

- Hook script: `~/.claude/hooks/improve-prompt.py`
- Settings: `~/.claude/settings.json` (UserPromptSubmit hook)
- Logs: `~/.claude/logs/prompt-improvements.jsonl`
- Documentation: `cheatsheets/prompt-improver-hook.md`

### Consequences

**Positive:**

- ✅ Eliminates external dependency risk
- ✅ Full control over evaluation logic and context
- ✅ Project-specific enhancements (VC domain knowledge)
- ✅ Audit trail for prompt patterns (documentation improvement)
- ✅ Simple installation (single Python file)
- ✅ Transparent operation (user sees evaluation)

**Negative:**

- ❌ Need to manually track upstream updates
- ❌ Additional ~350-400 token overhead per wrapped prompt (vs ~250 baseline)
- ❌ Python dependency (already present in project)

**Trade-offs Accepted:**

- Manual updates vs automatic upstream sync → Security & control over
  convenience
- Larger context vs vanilla → Better domain-specific clarification
- Internalized code vs external hook → Auditability over simplicity

### Implementation Details

**New Files Created:**

- `~/.claude/hooks/improve-prompt.py` - Hook script with project context (150
  lines)
- `~/.claude/settings.json` - Hook configuration
- `cheatsheets/prompt-improver-hook.md` - Comprehensive documentation
- `scripts/analyze-prompt-patterns.js` - Analytics for documentation gaps

**Configuration:**

- **Bypass prefixes:** `*` (explicit), `/` (slash commands), `#` (memorize)
- **Command patterns:** npm, git, docker, bash, node, python, npx, curl, etc.
- **Logging:** Enabled by default, JSONL format for analysis
- **Project context:** ~150 tokens of architecture/domain knowledge

**Project Context Included:**

```
- Architecture: /client, /server, /shared
- Engines: ReserveEngine, PacingEngine, CohortEngine
- Patterns: Waterfall types, waterfall helpers
- Commands: /test-smart, /fix-auto, /log-change, /log-decision
- Documentation: CLAUDE.md, CHANGELOG.md, DECISIONS.md, cheatsheets/
```

### Usage Examples

**Vague domain prompt:**

```bash
$ claude "fix the waterfall bug"
# Hook asks: Which waterfall? (AMERICAN/EUROPEAN, applyWaterfallChange/changeWaterfallType)
```

**Clear technical prompt:**

```bash
$ claude "Fix hurdle clamping in applyWaterfallChange line 42 to ensure [0,1] range"
# Proceeds immediately (no questions)
```

**Bypass for commands:**

```bash
$ claude "npm run test:quick"        # Auto-bypassed
$ claude "/test-smart"               # Auto-bypassed (slash command)
$ claude "* just try dark mode"      # Explicit bypass (*)
```

### Analytics & Documentation Improvement

**Log analysis:**

```bash
# Analyze prompt patterns
node scripts/analyze-prompt-patterns.js

# Last 7 days
node scripts/analyze-prompt-patterns.js --days 7

# JSON output for CI
node scripts/analyze-prompt-patterns.js --json
```

**Documentation feedback loop:**

1. Hook logs vague prompts that trigger clarification
2. Weekly analysis identifies most common patterns
3. Add patterns to CLAUDE.md or create cheatsheets
4. Reduce future clarification overhead

**Example insights:**

- If "fix the waterfall" triggers clarification 10x → Add waterfall
  troubleshooting guide
- If "update the engine" is vague 5x → Add engine selection guide
- If "add validation" needs clarification → Expand validation patterns in
  CLAUDE.md

### Security Measures

**Compared to external dependency:**

- ✅ All code version-controlled and auditable
- ✅ No remote execution risk
- ✅ Changes reviewed via git diff
- ✅ Consistent with AI Orchestrator security model

**Privacy:**

- Logs contain only prompt previews (first 100 chars)
- Full prompts not persisted (JSONL logs only metadata)
- No external network calls
- Local-only execution

### Future Considerations

1. **If upstream adds valuable features:**
   - Review changes on GitHub
   - Manually integrate if beneficial
   - Document changes in CHANGELOG.md

2. **If token overhead becomes problematic:**
   - Make project context configurable
   - Add lazy-loading (only inject when needed)
   - Cache common patterns

3. **If we need multi-language support:**
   - Port to Node.js (already in project)
   - Or Shell script (no Python dependency)

4. **If we want ML-based pattern learning:**
   - Train on historical prompt→clarification pairs
   - Auto-suggest CLAUDE.md improvements
   - Integration with /log-decision workflow

### References

- **Original project:**
  [severity1/claude-code-prompt-improver](https://github.com/severity1/claude-code-prompt-improver)
- **License:** MIT (attribution preserved in hook script)
- **Documentation:**
  [cheatsheets/prompt-improver-hook.md](cheatsheets/prompt-improver-hook.md)
- **Related decision:**
  [AI Orchestrator for Multi-Model Code Review](#ai-orchestrator-for-multi-model-code-review)

---

_For more architectural decisions, see individual decision records in
`docs/decisions/`_
