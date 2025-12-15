# Multi-LLM Collaboration Development Strategy

**Status:** APPROVED STRATEGY
**Created:** 2025-12-15
**Updated:** 2025-12-15 (Skills Integration + Technical Corrections)
**Target:** Automate multi-LLM coding collaboration using paid subscriptions

---

## Skills-First Development Workflow

This strategy integrates the project's Skills Library to ensure systematic,
quality-gated development. Each phase activates specific skills.

### Master Skill Activation Matrix

| Phase | Primary Skills | Secondary Skills | Quality Gate |
|-------|---------------|------------------|--------------|
| **0: Foundation** | `task-decomposition`, `writing-plans` | `inversion-thinking` | Plan approved |
| **1: Gemini** | `test-driven-development`, `iterative-improvement` | `systematic-debugging` | Tests pass |
| **2: ChatGPT** | `test-driven-development`, `defense-in-depth` | `root-cause-tracing` | Browser stable |
| **3: Consensus** | `multi-model-consensus`, `pattern-recognition` | `ai-model-selection` | Math verified |
| **4: CLI** | `api-design-principles`, `iterative-improvement` | `continuous-improvement` | UX validated |
| **5: Testing** | `dispatching-parallel-agents`, `verification-before-completion` | `memory-management` | 90%+ coverage |

### Skill Workflow: Feature Development

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PRO BRIDGE DEVELOPMENT WORKFLOW                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ PHASE 0: PLANNING                                               │   │
│  │                                                                  │   │
│  │  1. inversion-thinking                                          │   │
│  │     └─ "What would make this integration catastrophically fail?"│   │
│  │     └─ Identify: stale selectors, auth expiry, quota overshoot  │   │
│  │                                                                  │   │
│  │  2. task-decomposition                                          │   │
│  │     └─ Break into 10-30 minute subtasks                         │   │
│  │     └─ Identify parallel vs sequential dependencies             │   │
│  │                                                                  │   │
│  │  3. writing-plans                                               │   │
│  │     └─ TDD steps (2-5 min each)                                 │   │
│  │     └─ Save to docs/plans/YYYY-MM-DD-pro-bridge-phaseN.md       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ PHASE 1-4: IMPLEMENTATION (Per Subtask)                         │   │
│  │                                                                  │   │
│  │  1. test-driven-development (auto-activates)                    │   │
│  │     └─ RED: Write failing test                                  │   │
│  │     └─ GREEN: Minimal implementation                            │   │
│  │     └─ REFACTOR: Improve design                                 │   │
│  │                                                                  │   │
│  │  2. iterative-improvement (3-iteration max)                     │   │
│  │     └─ Generate → Evaluate (3 criteria) → Optimize              │   │
│  │     └─ Criteria: Functional, Safe, Conventional                 │   │
│  │                                                                  │   │
│  │  3. IF failure: systematic-debugging                            │   │
│  │     └─ Iron Law: NO FIXES WITHOUT ROOT CAUSE                    │   │
│  │     └─ Phase 1: Investigate → Phase 2: Analyze                  │   │
│  │     └─ Phase 3: Hypothesis → Phase 4: Implement                 │   │
│  │                                                                  │   │
│  │  4. IF 3+ independent failures: dispatching-parallel-agents     │   │
│  │     └─ Spawn parallel investigation agents                      │   │
│  │     └─ Each uses systematic-debugging                           │   │
│  │     └─ Synthesize with pattern-recognition                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ PHASE 5: VALIDATION                                             │   │
│  │                                                                  │   │
│  │  1. multi-model-consensus (meta: test our own tool!)            │   │
│  │     └─ Cross-validate consensus math with MCP tools             │   │
│  │     └─ Gemini + Claude verify severity counting                 │   │
│  │                                                                  │   │
│  │  2. verification-before-completion                              │   │
│  │     └─ Run all tests, confirm output                            │   │
│  │     └─ Evidence before assertions                               │   │
│  │                                                                  │   │
│  │  3. continuous-improvement                                      │   │
│  │     └─ What worked? What was inefficient?                       │   │
│  │     └─ Update CHANGELOG.md, DECISIONS.md                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ONGOING: MEMORY MANAGEMENT                                      │   │
│  │                                                                  │   │
│  │  memory-management                                              │   │
│  │  └─ Track: consensus patterns, model response times             │   │
│  │  └─ Document: selector changes, auth issues                     │   │
│  │  └─ Confidence levels: HIGH/MEDIUM/LOW per finding              │   │
│  │                                                                  │   │
│  │  pattern-recognition                                            │   │
│  │  └─ Identify: common divergence patterns                        │   │
│  │  └─ Flag: repeated model disagreements                          │   │
│  │  └─ Link: cause-effect for consensus failures                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase-Specific Skill Checklists

#### Phase 0: Foundation Setup
```markdown
## Skill Checklist: Foundation

### inversion-thinking (Before Implementation)
- [ ] "What would make browser automation fail catastrophically?"
  - Stale selectors (ChatGPT UI updates weekly)
  - Cookie expiry without detection
  - Zombie Chrome processes locking profile
  - Quota overshoot from race conditions
- [ ] Convert to do-not checklist:
  - DO NOT hardcode selectors without fallbacks
  - DO NOT assume session persistence
  - DO NOT skip process lock acquisition
  - DO NOT check-then-act on quota (use atomic reserve)

### task-decomposition
- [ ] Complexity: COMPLEX (6 phases, >8 hours)
- [ ] Subtasks identified with 10-30 min granularity
- [ ] Dependencies mapped (Phase 1 || Phase 2, then Phase 3)
- [ ] Success criteria per subtask defined

### writing-plans
- [ ] TDD steps for each subtask (2-5 min each)
- [ ] Plan saved to docs/plans/
- [ ] Frequent commit points identified
```

#### Phase 1-2: Implementation
```markdown
## Skill Checklist: Implementation

### test-driven-development (Per Feature)
- [ ] RED: Test written first, fails as expected
- [ ] GREEN: Minimal code to pass
- [ ] REFACTOR: Clean up, no behavior change
- [ ] Commit after each GREEN

### iterative-improvement (Per Feature)
- [ ] Iteration 1: Basic implementation
- [ ] Evaluate against 3 criteria:
  - Functional: Does it work?
  - Safe: No regressions?
  - Conventional: Follows patterns?
- [ ] Iteration 2: Address feedback (if needed)
- [ ] Iteration 3: Final polish (if needed)
- [ ] Max 3 iterations (beyond = architectural issue)

### systematic-debugging (On Failure)
- [ ] Phase 1: Root Cause Investigation
  - What is the actual error?
  - Where does it originate?
- [ ] Phase 2: Pattern Analysis
  - Is this a known pattern?
  - Compare with working code
- [ ] Phase 3: Hypothesis Testing
  - Form hypothesis
  - Test minimally
- [ ] Phase 4: Implementation
  - Fix root cause, not symptom
  - Verify fix doesn't regress
```

#### Phase 3: Consensus Orchestrator
```markdown
## Skill Checklist: Consensus

### multi-model-consensus (Meta: Test Our Tool)
- [ ] Use mcp__multi-ai-collab__ai_consensus to validate:
  - Severity counting math
  - Issue overlap calculation
  - Merge logic correctness
- [ ] Cross-validate with Gemini + Claude
- [ ] Document divergences

### pattern-recognition (Consensus Patterns)
- [ ] Note repeated themes in model disagreements
- [ ] Flag: which issues always diverge?
- [ ] Link cause-effect: why do models disagree?
- [ ] Create cheatsheet: consensus-patterns.md

### ai-model-selection (Routing Logic)
- [ ] Verify routing decisions are optimal
- [ ] Complexity thresholds validated
- [ ] Cost optimization confirmed
```

#### Phase 5: Validation
```markdown
## Skill Checklist: Validation

### dispatching-parallel-agents (Test Coverage)
- [ ] Identify independent test domains:
  - Gemini adapter tests
  - ChatGPT session tests
  - Consensus math tests
  - CLI argument tests
- [ ] Dispatch parallel agents per domain
- [ ] Synthesize results with pattern-recognition

### verification-before-completion
- [ ] All tests pass (npm test)
- [ ] Integration tests pass (RUN_INTEGRATION_TESTS=1)
- [ ] Manual smoke test completed
- [ ] No console errors in browser automation
- [ ] Quota tracking verified

### continuous-improvement
- [ ] What worked well?
- [ ] What was inefficient?
- [ ] Any surprising insights?
- [ ] What will change next time?
- [ ] Update CHANGELOG.md
- [ ] Update DECISIONS.md if architectural
```

---

## Executive Summary

This strategy defines how to build a **Pro Subscription Bridge** that automates
collaboration between ChatGPT Pro ($200/mo) and Gemini Advanced subscriptions,
leveraging frontier model features not available via standard APIs.

### Core Principles

1. **Subscription-First**: Access GPT-5.2 Heavy Thinking and Gemini Deep Think via
   browser automation (these features have no API equivalent)
2. **API-Augmented**: Use official APIs where they provide equivalent functionality
   (faster, more reliable)
3. **Windows-Native**: No Docker, no Redis, no WSL2 requirements
4. **Infrastructure Reuse**: Build on existing `agent-core` (BaseAgent, withThinking,
   Router, Orchestrator)
5. **OSS Leverage**: Use battle-tested tools (Stagehand v3, official SDKs)

### What We're Building

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Pro Subscription Bridge                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    ReviewModel Interface                        │   │
│  │  - Abstracts LLM providers behind common contract               │   │
│  │  - Enables easy addition of new models                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│         ┌────────────────────┼────────────────────┐                    │
│         ▼                    ▼                    ▼                    │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐              │
│  │   Gemini    │     │   ChatGPT   │     │   Claude    │              │
│  │   Adapter   │     │   Adapter   │     │   Adapter   │              │
│  ├─────────────┤     ├─────────────┤     ├─────────────┤              │
│  │ Primary:    │     │ Primary:    │     │ Primary:    │              │
│  │ @google/    │     │ Stagehand   │     │ Claude Code │              │
│  │ genai API   │     │ Browser     │     │ (native)    │              │
│  │             │     │             │     │             │              │
│  │ Fallback:   │     │ Fallback:   │     │             │              │
│  │ Browser     │     │ OpenAI API  │     │             │              │
│  │ (Deep Think)│     │ (code_int)  │     │             │              │
│  └─────────────┘     └─────────────┘     └─────────────┘              │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                 ConsensusOrchestrator                           │   │
│  │  - Parallel execution across models                             │   │
│  │  - Structured JSON consensus measurement                        │   │
│  │  - Iterative refinement on disagreement                         │   │
│  │  - Critical issue blocking                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Technology Selection

### 1.1 OSS Tools Evaluation

| Tool | Purpose | Stars | Verdict | Rationale |
|------|---------|-------|---------|-----------|
| **@browserbasehq/stagehand** | ChatGPT browser automation | 19.5k | **USE** | Self-healing selectors, TypeScript native, active maintenance |
| **@google/genai** | Gemini API access | Official | **USE** | Stable, documented, supports thinking config |
| **browser-use** | General AI browser automation | 73.7k | **EVALUATE** | Python-only, but proven patterns |
| **gemini-webapi** (npm) | Gemini web scraping | N/A | **REJECT** | Package doesn't exist as documented |
| **Gemini-API** (PyPI) | Gemini cookie-based | 1.6k | **REJECT** | Python-only, auth complexity |
| **Playwright** | Raw browser control | 68k | **USE** | Peer dependency of Stagehand |

### 1.2 Feature-to-Implementation Mapping

| Feature | API Available? | Implementation Strategy |
|---------|---------------|------------------------|
| GPT-5.2 Pro Standard | No | Stagehand browser automation |
| GPT-5.2 Heavy Thinking | No | Stagehand browser automation |
| GPT-5.2 Code Interpreter | **Yes** (OpenAI API) | **Hybrid**: API for code exec, browser for UI-only |
| Gemini 3 Pro Standard | **Yes** (@google/genai) | Official API |
| Gemini 3 Pro Deep Think | **Partial** (thinkingLevel) | Try API first, browser fallback if needed |
| ChatGPT Projects | No | Stagehand browser automation |

### 1.3 Existing Project Infrastructure to Reuse

| Component | Location | Reuse Strategy |
|-----------|----------|----------------|
| BaseAgent | `packages/agent-core/src/BaseAgent.ts` | Extend for new adapters |
| withThinking | `packages/agent-core/src/ThinkingMixin.ts` | Apply to browser agents |
| AIRouter | `packages/agent-core/src/Router.ts` | Extend model types |
| Orchestrator | `packages/agent-core/src/Orchestrator.ts` | Pattern reference (don't extend directly) |
| MetricsCollector | `packages/agent-core/src/MetricsCollector.ts` | Add consensus metrics |
| PatternLearning | `packages/agent-core/src/PatternLearning.ts` | Learn successful consensus patterns |
| HybridMemoryManager | `packages/agent-core/src/HybridMemoryManager.ts` | **Evaluate** for quota tracking |

---

## Part 2: Architecture Design

### 2.1 Provider Interface (Core Abstraction)

```typescript
// packages/pro-bridge/src/interfaces/ReviewModel.ts

export interface ReviewOptions {
  reasoning?: 'standard' | 'extended' | 'heavy';
  tools?: ('code_interpreter' | 'web_search')[];
  temperature?: number;
  maxTokens?: number;
}

export interface ReviewResult {
  content: string;
  raw: string;                          // Unparsed response
  structured?: StructuredReview;        // Parsed if JSON
  reasoning?: string[];                 // Thinking trace if available
  metadata: {
    model: string;
    provider: string;
    reasoningLevel: string;
    duration: number;
    timestamp: number;
  };
}

export interface StructuredReview {
  issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    location?: string;
    recommendation?: string;
  }>;
  recommendations: string[];
  summary: string;
  confidence: number;
}

export interface ReviewModel {
  readonly name: string;
  readonly provider: string;

  initialize(): Promise<void>;
  execute(prompt: string, options?: ReviewOptions): Promise<ReviewResult>;
  healthCheck(): Promise<{ healthy: boolean; message: string }>;
  cleanup(): Promise<void>;
}
```

### 2.2 Adapter Architecture

```typescript
// Each adapter implements ReviewModel and handles provider-specific concerns

// packages/pro-bridge/src/adapters/GeminiAdapter.ts
export class GeminiAdapter implements ReviewModel {
  private apiClient: GoogleGenAI | null = null;
  private browserSession: GeminiBrowserSession | null = null;

  async execute(prompt: string, options?: ReviewOptions): Promise<ReviewResult> {
    // Strategy: API-first, browser fallback for Deep Think if API fails
    if (this.canUseApi(options)) {
      return this.executeViaApi(prompt, options);
    }
    return this.executeViaBrowser(prompt, options);
  }
}

// packages/pro-bridge/src/adapters/ChatGPTAdapter.ts
export class ChatGPTAdapter implements ReviewModel {
  private browserSession: ChatGPTBrowserSession;
  private apiClient: OpenAI | null = null;

  async execute(prompt: string, options?: ReviewOptions): Promise<ReviewResult> {
    // Strategy: Browser for Pro features, API for code interpreter
    if (options?.tools?.includes('code_interpreter') && this.apiClient) {
      return this.executeCodeViaApi(prompt, options);
    }
    return this.executeViaBrowser(prompt, options);
  }
}

// packages/pro-bridge/src/adapters/ClaudeAdapter.ts
export class ClaudeAdapter implements ReviewModel {
  // Thin wrapper - Claude Code is the native environment
  async execute(prompt: string, options?: ReviewOptions): Promise<ReviewResult> {
    // Use existing extended thinking infrastructure
    const result = await this.think(prompt, { depth: options?.reasoning });
    return this.formatResult(result);
  }
}
```

### 2.3 Browser Session Abstraction

Separate UI automation concerns from business logic:

```typescript
// packages/pro-bridge/src/sessions/ChatGPTBrowserSession.ts

export interface BrowserSessionConfig {
  userDataDir: string;
  headless: boolean;
  cacheDir: string;
  onLoginRequired?: () => Promise<void>;
}

export class ChatGPTBrowserSession {
  private stagehand: Stagehand | null = null;
  private isInitialized = false;

  constructor(private config: BrowserSessionConfig) {}

  async initialize(): Promise<void>;
  async ensureLoggedIn(): Promise<void>;
  async startNewChat(project?: string): Promise<void>;
  async selectModel(model: string): Promise<void>;
  async selectThinkingLevel(level: 'standard' | 'heavy' | 'extended'): Promise<void>;
  async sendPrompt(prompt: string): Promise<void>;
  async waitForResponse(timeout?: number): Promise<string>;
  async extractDownloads(): Promise<Array<{ name: string; path: string }>>;
  async takeDebugSnapshot(): Promise<{ screenshot: Buffer; html: string }>;
  async close(): Promise<void>;
}
```

### 2.4 Quota Management (File-Based, Windows-Safe)

```typescript
// packages/pro-bridge/src/quota/QuotaManager.ts

export interface QuotaConfig {
  provider: string;
  feature: string;
  dailyLimit: number;
  resetHour: number;        // UTC hour (0-23)
  configurable: boolean;    // Allow override via env var
}

export interface QuotaStatus {
  used: number;
  remaining: number;
  limit: number;
  resetsAt: Date;
  lastUpdated: Date;
}

export class FileQuotaManager {
  private readonly quotaDir: string;
  private readonly lockTimeout = 5000;

  constructor(baseDir?: string) {
    // Windows-friendly: ~/.config/povc/quota/
    this.quotaDir = baseDir || path.join(os.homedir(), '.config', 'povc', 'quota');
  }

  /**
   * Atomic reservation - prevents race conditions
   * Returns true if reservation succeeded, false if quota exhausted
   */
  async tryReserve(config: QuotaConfig): Promise<boolean> {
    return this.withFileLock(config, async () => {
      const status = await this.getStatus(config);
      if (status.remaining <= 0) return false;

      await this.incrementUsage(config);
      return true;
    });
  }

  async getStatus(config: QuotaConfig): Promise<QuotaStatus>;

  private async withFileLock<T>(config: QuotaConfig, fn: () => Promise<T>): Promise<T> {
    const lockFile = this.getLockPath(config);
    // Implementation: acquire lock, execute, release
  }

  private async atomicWrite(filePath: string, data: object): Promise<void> {
    // Write to temp file, then atomic rename
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
    await fs.rename(tempPath, filePath);  // Atomic on NTFS and POSIX
  }
}
```

### 2.5 Consensus Orchestrator

```typescript
// packages/pro-bridge/src/ConsensusOrchestrator.ts

export interface ConsensusConfig {
  models: ReviewModel[];
  minAgreement: number;           // 0-1, default 0.85
  maxIterations: number;          // default 3
  blockOnCritical: boolean;       // Force iteration if critical issues
  parallelExecution: boolean;     // Run models concurrently
  outputFormat: 'json' | 'markdown';
}

export interface ConsensusResult {
  success: boolean;
  consensusScore: number;
  iterations: number;
  modelResults: Map<string, ReviewResult>;
  mergedResult: StructuredReview;
  divergences: string[];
  timing: {
    totalDuration: number;
    perModel: Map<string, number>;
  };
}

export class ConsensusOrchestrator {
  private metrics: MetricsCollector;

  constructor(private config: ConsensusConfig) {
    this.metrics = MetricsCollector.getInstance();
  }

  async executeWithConsensus(prompt: string): Promise<ConsensusResult> {
    const structuredPrompt = this.addOutputInstructions(prompt);

    let iteration = 0;
    let currentPrompt = structuredPrompt;

    while (iteration < this.config.maxIterations) {
      // Execute all models (parallel or sequential)
      const results = await this.executeModels(currentPrompt);

      // Parse and measure consensus
      const parsed = this.parseResults(results);
      const consensus = this.measureConsensus(parsed);

      this.metrics.recordConsensusIteration(iteration, consensus.score);

      // Check exit conditions
      if (this.shouldExit(consensus, parsed)) {
        return this.buildResult(true, iteration + 1, results, consensus);
      }

      // Prepare refinement prompt
      currentPrompt = this.buildRefinementPrompt(prompt, parsed, consensus);
      iteration++;
    }

    // Return partial consensus
    return this.buildResult(false, iteration, results, consensus);
  }

  private measureConsensus(parsed: ParsedResult[]): ConsensusMetrics {
    // Fixed implementation: no NaN, proper severity handling
    const severityCounts = parsed.map(p => this.countSeverities(p.issues));
    const issueOverlap = this.calculateIssueOverlap(parsed);
    const severityAlignment = this.calculateSeverityAlignment(severityCounts);

    return {
      score: issueOverlap * 0.6 + severityAlignment * 0.4,
      divergences: this.findDivergences(parsed),
    };
  }

  private countSeverities(issues: Issue[]): SeverityCount {
    // Fixed: Initialize all keys to prevent NaN
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const issue of issues) {
      if (issue.severity in counts) {
        counts[issue.severity as keyof typeof counts]++;
      }
    }
    return counts;
  }

  private calculateIssueOverlap(parsed: ParsedResult[]): number {
    // Fixed: Key by description only, not severity
    const issueSets = parsed.map(p =>
      new Set(p.issues.map(i => this.normalizeDescription(i.description)))
    );

    // Pairwise Jaccard similarity, averaged
    let totalSimilarity = 0;
    let pairs = 0;

    for (let i = 0; i < issueSets.length; i++) {
      for (let j = i + 1; j < issueSets.length; j++) {
        totalSimilarity += this.jaccardSimilarity(issueSets[i], issueSets[j]);
        pairs++;
      }
    }

    return pairs > 0 ? totalSimilarity / pairs : 1;
  }

  private normalizeDescription(desc: string): string {
    return desc.toLowerCase().replace(/[^\w\s]/g, '').trim().slice(0, 80);
  }
}
```

---

## Part 3: Implementation Phases

### Phase 0: Foundation Setup (2 hours)

**Goal:** Create package structure and install correct dependencies

```bash
# Create package
mkdir -p packages/pro-bridge/src/{adapters,sessions,quota,interfaces}
cd packages/pro-bridge
npm init -y

# Install CORRECT dependencies
npm install @browserbasehq/stagehand@^3.0.0  # Note: browserbasehq, not browserbase
npm install @google/genai                      # Official Gemini SDK
npm install openai                             # For code interpreter fallback
npm install playwright                         # Peer dependency
npm install zod                                # Schema validation

# Dev dependencies
npm install -D typescript @types/node vitest

# Install browser
npx playwright install chromium
```

**Deliverables:**
- [ ] Package structure created
- [ ] Dependencies installed with correct package names
- [ ] TypeScript config extending project root
- [ ] Basic exports in `src/index.ts`

### Phase 1: Gemini Adapter (3 hours)

**Goal:** Working Gemini integration with API-first, browser-fallback strategy

**Implementation Order:**
1. `GeminiAdapter` class implementing `ReviewModel`
2. API client setup with `@google/genai`
3. Thinking level configuration (`thinkingConfig.thinkingLevel`)
4. Response parsing with balanced-brace JSON extraction
5. Browser fallback skeleton (defer full implementation)

```typescript
// packages/pro-bridge/src/adapters/GeminiAdapter.ts

import { GoogleGenAI } from '@google/genai';
import { ReviewModel, ReviewOptions, ReviewResult } from '../interfaces/ReviewModel';
import { FileQuotaManager } from '../quota/QuotaManager';

const GEMINI_QUOTA_CONFIG = {
  provider: 'gemini',
  feature: 'deep_think',
  dailyLimit: parseInt(process.env.GEMINI_DEEP_THINK_QUOTA || '5', 10),
  resetHour: 0,  // Midnight UTC (configurable)
  configurable: true,
};

export class GeminiAdapter implements ReviewModel {
  readonly name = 'gemini-3-pro';
  readonly provider = 'google';

  private client: GoogleGenAI | null = null;
  private quotaManager: FileQuotaManager;

  constructor() {
    this.quotaManager = new FileQuotaManager();
  }

  async initialize(): Promise<void> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY environment variable required');
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  async execute(prompt: string, options?: ReviewOptions): Promise<ReviewResult> {
    if (!this.client) await this.initialize();

    const startTime = Date.now();
    const useDeepThinking = options?.reasoning === 'heavy' || options?.reasoning === 'extended';

    // Check quota for deep thinking
    if (useDeepThinking) {
      const reserved = await this.quotaManager.tryReserve(GEMINI_QUOTA_CONFIG);
      if (!reserved) {
        console.warn('[Gemini] Deep Think quota exhausted, falling back to standard');
        options = { ...options, reasoning: 'standard' };
      }
    }

    // Build request with correct model ID and thinking config
    const model = this.client.getGenerativeModel({
      model: 'gemini-2.5-pro-preview-06-05',  // Or gemini-3-pro-preview when available
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 8192,
      },
      // Thinking configuration per Google docs
      ...(useDeepThinking && {
        thinkingConfig: {
          thinkingLevel: 'HIGH',  // 'LOW' or 'HIGH' per docs
        },
      }),
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Extract thinking trace if available
    const thinking = response.candidates?.[0]?.content?.parts
      ?.filter(p => p.thought)
      ?.map(p => p.text) || [];

    return {
      content: text,
      raw: text,
      structured: this.parseStructuredResponse(text),
      reasoning: thinking,
      metadata: {
        model: 'gemini-3-pro',
        provider: 'google',
        reasoningLevel: useDeepThinking ? 'high' : 'standard',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      },
    };
  }

  private parseStructuredResponse(content: string): StructuredReview | undefined {
    const json = this.extractJson(content);
    if (!json) return undefined;

    try {
      return StructuredReviewSchema.parse(JSON.parse(json));
    } catch {
      return undefined;
    }
  }

  private extractJson(content: string): string | null {
    // Try code block first
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Balanced brace extraction (fixed: not greedy)
    const start = content.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    for (let i = start; i < content.length; i++) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') depth--;
      if (depth === 0) return content.slice(start, i + 1);
    }

    return null;
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      await this.execute('Respond with just: "OK"', { reasoning: 'standard' });
      return { healthy: true, message: 'Gemini API responding' };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async cleanup(): Promise<void> {
    this.client = null;
  }
}
```

**Deliverables:**
- [ ] `GeminiAdapter` with API implementation
- [ ] Correct model ID (`gemini-2.5-pro-preview` or `gemini-3-pro-preview`)
- [ ] Thinking configuration via `thinkingConfig.thinkingLevel`
- [ ] File-based quota tracking with atomic operations
- [ ] Balanced-brace JSON extraction
- [ ] Unit tests for parsing logic

### Phase 2: ChatGPT Adapter (4 hours)

**Goal:** Working ChatGPT integration with Stagehand v3

**Implementation Order:**
1. `ChatGPTBrowserSession` with correct Stagehand v3 API
2. Login detection and human-in-loop handling
3. Model and thinking level selection via `stagehand.act()`
4. Prompt sending (fixed: no double-send)
5. Response extraction via `stagehand.extract()`
6. Download handling for Code Interpreter
7. `ChatGPTAdapter` wrapping session

```typescript
// packages/pro-bridge/src/sessions/ChatGPTBrowserSession.ts

import { Stagehand } from '@browserbasehq/stagehand';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const SESSION_DIR = path.join(os.homedir(), '.config', 'povc', 'chatgpt-session');
const CACHE_DIR = path.join(process.cwd(), '.cache', 'stagehand');
const DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads', 'ProBridge');

export class ChatGPTBrowserSession {
  private stagehand: Stagehand | null = null;

  async initialize(): Promise<void> {
    // Ensure directories exist
    for (const dir of [SESSION_DIR, CACHE_DIR, DOWNLOAD_DIR]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Kill any zombie Chrome processes holding our profile
    await this.killZombieProcesses();

    // Initialize Stagehand v3 with CORRECT configuration
    this.stagehand = new Stagehand({
      env: 'LOCAL',
      cacheDir: CACHE_DIR,
      localBrowserLaunchOptions: {
        headless: false,  // Required for login
        userDataDir: SESSION_DIR,
        downloadsPath: DOWNLOAD_DIR,
      },
      selfHeal: true,
      verbose: 1,
    });

    await this.stagehand.init();
  }

  async ensureLoggedIn(): Promise<void> {
    const page = this.stagehand!.context.pages()[0];
    await page.goto('https://chatgpt.com');

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Check for login indicators using correct Playwright syntax
    const loginButton = await page.locator('text=/Log in|Sign in|Welcome back/i').first();
    const isLoginPage = await loginButton.isVisible().catch(() => false);

    if (isLoginPage) {
      console.log('\x07');  // Terminal bell
      console.log('\n' + '='.repeat(60));
      console.log('MANUAL LOGIN REQUIRED');
      console.log('Please log in to ChatGPT in the browser window.');
      console.log('Press ENTER in this terminal when you see the chat interface.');
      console.log('='.repeat(60) + '\n');

      // Wait for user to complete login
      await new Promise<void>(resolve => {
        process.stdin.once('data', () => resolve());
      });

      // Verify login succeeded
      await page.waitForURL('**/chatgpt.com/**', { timeout: 60000 });
    }
  }

  async selectModelAndThinking(model: string, thinkingLevel: string): Promise<void> {
    // Use Stagehand's natural language actions (correct v3 API: string, not object)
    await this.stagehand!.act(
      `Click on the model selector dropdown and select "${model}"`
    );

    // Small delay for UI to update
    await this.delay(500);

    if (thinkingLevel !== 'standard') {
      await this.stagehand!.act(
        `Find and click the thinking time or reasoning selector, then choose "${thinkingLevel}" mode`
      );
    }

    // Verify selection
    const currentModel = await this.stagehand!.extract({
      instruction: 'What model is currently selected? Return just the model name.',
      schema: { type: 'object', properties: { model: { type: 'string' } } },
    });

    console.log(`[ChatGPT] Model selected: ${currentModel.model}`);
  }

  async sendPrompt(prompt: string): Promise<string> {
    const page = this.stagehand!.context.pages()[0];

    // FIXED: Don't double-send. Use direct fill for all prompts.
    // Stagehand act() with embedded text can have quoting issues for long prompts.

    // Find and focus the input
    await this.stagehand!.act('Click on the message input field');

    // Fill directly (handles any length)
    const textarea = page.locator('textarea, [contenteditable="true"]').first();
    await textarea.fill(prompt);

    // Send
    await this.stagehand!.act('Click the send button or press Enter to send the message');

    // Wait for response
    return this.waitForResponse();
  }

  private async waitForResponse(timeout = 180000): Promise<string> {
    const page = this.stagehand!.context.pages()[0];

    // Wait for streaming to complete (no more "Stop generating" button)
    await page.waitForFunction(
      () => !document.querySelector('[aria-label*="Stop"]'),
      { timeout }
    );

    // Extract response
    const result = await this.stagehand!.extract({
      instruction: 'Extract the complete text of the last assistant message in the conversation. Include all text, code blocks, and formatting.',
      schema: {
        type: 'object',
        properties: {
          response: { type: 'string', description: 'The full assistant response' },
          hasCode: { type: 'boolean', description: 'Whether the response contains code blocks' },
        },
        required: ['response'],
      },
    });

    return result.response;
  }

  async getDownloads(): Promise<Array<{ name: string; path: string }>> {
    const page = this.stagehand!.context.pages()[0];
    const downloads: Array<{ name: string; path: string }> = [];

    // Listen for download events
    page.on('download', async (download) => {
      const fileName = download.suggestedFilename();
      const filePath = path.join(DOWNLOAD_DIR, `${Date.now()}_${fileName}`);
      await download.saveAs(filePath);
      downloads.push({ name: fileName, path: filePath });
    });

    // Look for download buttons in Code Interpreter output
    const downloadButtons = await page.locator('[data-testid*="download"], a[download]').all();
    for (const button of downloadButtons) {
      await button.click();
      await this.delay(1000);  // Wait for download to start
    }

    return downloads;
  }

  private async killZombieProcesses(): Promise<void> {
    if (process.platform !== 'win32') return;

    try {
      const { execSync } = await import('child_process');
      // Kill Chrome processes that might be holding our profile
      execSync('taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq *chatgpt*"', {
        stdio: 'ignore',
      });
    } catch {
      // No matching processes - fine
    }

    // Remove lock file if present
    const lockFile = path.join(SESSION_DIR, 'lockfile');
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    if (this.stagehand) {
      await this.stagehand.close();
      this.stagehand = null;
    }
  }
}
```

```typescript
// packages/pro-bridge/src/adapters/ChatGPTAdapter.ts

import { ReviewModel, ReviewOptions, ReviewResult } from '../interfaces/ReviewModel';
import { ChatGPTBrowserSession } from '../sessions/ChatGPTBrowserSession';
import OpenAI from 'openai';

export class ChatGPTAdapter implements ReviewModel {
  readonly name = 'chatgpt-5.2-pro';
  readonly provider = 'openai';

  private session: ChatGPTBrowserSession;
  private apiClient: OpenAI | null = null;

  constructor() {
    this.session = new ChatGPTBrowserSession();

    // Optional: API client for code interpreter (more reliable)
    if (process.env.OPENAI_API_KEY) {
      this.apiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async initialize(): Promise<void> {
    await this.session.initialize();
    await this.session.ensureLoggedIn();
  }

  async execute(prompt: string, options?: ReviewOptions): Promise<ReviewResult> {
    const startTime = Date.now();

    // For code interpreter, prefer API if available (more reliable)
    if (options?.tools?.includes('code_interpreter') && this.apiClient) {
      return this.executeCodeViaApi(prompt, options, startTime);
    }

    // Browser automation for Pro features
    return this.executeViaBrowser(prompt, options, startTime);
  }

  private async executeViaBrowser(
    prompt: string,
    options: ReviewOptions | undefined,
    startTime: number
  ): Promise<ReviewResult> {
    // Map reasoning level to ChatGPT UI terminology
    const thinkingLevel = this.mapReasoningLevel(options?.reasoning);

    await this.session.selectModelAndThinking('GPT-5.2', thinkingLevel);
    const response = await this.session.sendPrompt(prompt);

    return {
      content: response,
      raw: response,
      structured: this.parseStructuredResponse(response),
      metadata: {
        model: 'gpt-5.2-pro',
        provider: 'openai',
        reasoningLevel: thinkingLevel,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      },
    };
  }

  private async executeCodeViaApi(
    prompt: string,
    options: ReviewOptions,
    startTime: number
  ): Promise<ReviewResult> {
    const response = await this.apiClient!.chat.completions.create({
      model: 'gpt-4o',  // Or gpt-4-turbo for code interpreter
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'code_interpreter' }],
    });

    const content = response.choices[0]?.message?.content || '';

    return {
      content,
      raw: JSON.stringify(response),
      structured: this.parseStructuredResponse(content),
      metadata: {
        model: 'gpt-4o',
        provider: 'openai-api',
        reasoningLevel: 'standard',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      },
    };
  }

  private mapReasoningLevel(level?: string): string {
    switch (level) {
      case 'heavy': return 'Heavy';
      case 'extended': return 'Extended';
      default: return 'Standard';
    }
  }

  private parseStructuredResponse(content: string): StructuredReview | undefined {
    // Same balanced-brace extraction as GeminiAdapter
    const json = this.extractJson(content);
    if (!json) return undefined;

    try {
      return StructuredReviewSchema.parse(JSON.parse(json));
    } catch {
      return undefined;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      await this.session.ensureLoggedIn();
      return { healthy: true, message: 'ChatGPT session active' };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async cleanup(): Promise<void> {
    await this.session.close();
  }
}
```

**Deliverables:**
- [ ] `ChatGPTBrowserSession` with Stagehand v3 correct API
- [ ] Human-in-loop login handling
- [ ] Model and thinking level selection
- [ ] Fixed prompt sending (no double-send)
- [ ] Response extraction
- [ ] Optional API fallback for code interpreter
- [ ] Zombie process cleanup for Windows

### Phase 3: Consensus Orchestrator (2 hours)

**Goal:** Multi-model orchestration with correct consensus math

**Key Fixes from Review:**
- Severity counting with initialized defaults (no NaN)
- Issue deduplication by description, prefer max severity
- Balanced-brace JSON extraction
- Configurable agreement thresholds

**Deliverables:**
- [ ] `ConsensusOrchestrator` with provider interface
- [ ] Fixed `countSeverities()` with default keys
- [ ] Fixed `calculateIssueOverlap()` keying by description
- [ ] Fixed JSON parsing with balanced braces
- [ ] Iteration loop with refinement prompts

### Phase 4: CLI Integration (1 hour)

**Goal:** Command-line interface with correct argument parsing

```typescript
// packages/pro-bridge/src/cli/consensus.ts

import { program } from 'commander';
import { ConsensusOrchestrator } from '../ConsensusOrchestrator';
import { GeminiAdapter } from '../adapters/GeminiAdapter';
import { ChatGPTAdapter } from '../adapters/ChatGPTAdapter';

program
  .name('consensus')
  .description('Multi-model consensus review')
  .argument('<task...>', 'Task description (can be multiple words)')
  .option('-t, --task-type <type>', 'Task type', 'code_review')
  .option('-a, --min-agreement <number>', 'Minimum agreement (0-1)', '0.85')
  .option('-i, --max-iterations <number>', 'Maximum iterations', '3')
  .option('--no-deep-think', 'Disable Gemini Deep Think')
  .option('--no-heavy', 'Disable ChatGPT Heavy Thinking')
  .option('--quota', 'Show quota status and exit')
  .action(async (taskParts, options) => {
    const task = taskParts.join(' ');  // Fixed: Join all positional args

    if (options.quota) {
      await showQuotaStatus();
      return;
    }

    const models = [
      new GeminiAdapter(),
      new ChatGPTAdapter(),
    ];

    const orchestrator = new ConsensusOrchestrator({
      models,
      minAgreement: parseFloat(options.minAgreement),
      maxIterations: parseInt(options.maxIterations, 10),
      blockOnCritical: true,
      parallelExecution: true,
      outputFormat: 'json',
    });

    try {
      for (const model of models) {
        await model.initialize();
      }

      const result = await orchestrator.executeWithConsensus(task);

      printResult(result);
    } finally {
      for (const model of models) {
        await model.cleanup();
      }
    }
  });

program.parse();
```

**Package.json scripts (consistent naming):**
```json
{
  "scripts": {
    "consensus": "tsx src/cli/consensus.ts",
    "quota": "tsx src/cli/consensus.ts --quota"
  },
  "bin": {
    "pro-bridge": "./dist/cli/consensus.js"
  }
}
```

**Root package.json:**
```json
{
  "scripts": {
    "ai:consensus": "npm run consensus --workspace=@povc/pro-bridge --",
    "ai:quota": "npm run quota --workspace=@povc/pro-bridge"
  }
}
```

**Deliverables:**
- [ ] CLI with `commander` (proper arg parsing)
- [ ] Consistent script naming (`ai:consensus`)
- [ ] Quota status command
- [ ] Proper task joining (multi-word support)

### Phase 5: Testing & Documentation (2 hours)

**Unit Tests (fast, no credentials):**
```typescript
// packages/pro-bridge/src/__tests__/consensus.test.ts

import { describe, it, expect } from 'vitest';
import { ConsensusOrchestrator } from '../ConsensusOrchestrator';

describe('ConsensusOrchestrator', () => {
  describe('countSeverities', () => {
    it('initializes all keys to prevent NaN', () => {
      const result = countSeverities([]);
      expect(result.critical).toBe(0);
      expect(result.high).toBe(0);
      expect(result.medium).toBe(0);
      expect(result.low).toBe(0);
    });

    it('counts severities correctly', () => {
      const issues = [
        { severity: 'critical', description: 'a' },
        { severity: 'critical', description: 'b' },
        { severity: 'medium', description: 'c' },
      ];
      const result = countSeverities(issues);
      expect(result.critical).toBe(2);
      expect(result.medium).toBe(1);
      expect(result.high).toBe(0);
    });
  });

  describe('extractJson', () => {
    it('extracts JSON from code block', () => {
      const content = 'Some text\n```json\n{"issues":[]}\n```\nMore text';
      expect(extractJson(content)).toBe('{"issues":[]}');
    });

    it('uses balanced braces for bare JSON', () => {
      const content = 'Here is the review: {"issues":[{"severity":"high"}]} done';
      expect(extractJson(content)).toBe('{"issues":[{"severity":"high"}]}');
    });

    it('handles nested braces', () => {
      const content = '{"a":{"b":{"c":1}}}';
      expect(extractJson(content)).toBe('{"a":{"b":{"c":1}}}');
    });
  });

  describe('calculateIssueOverlap', () => {
    it('returns 1 for identical issues', () => {
      const parsed = [
        { issues: [{ severity: 'high', description: 'Memory leak' }] },
        { issues: [{ severity: 'medium', description: 'memory leak' }] },  // Different severity, same desc
      ];
      expect(calculateIssueOverlap(parsed)).toBe(1);
    });

    it('returns 0 for completely different issues', () => {
      const parsed = [
        { issues: [{ severity: 'high', description: 'Memory leak' }] },
        { issues: [{ severity: 'high', description: 'SQL injection' }] },
      ];
      expect(calculateIssueOverlap(parsed)).toBe(0);
    });
  });
});
```

**Integration Tests (gated by env var):**
```typescript
// packages/pro-bridge/src/__tests__/integration.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { GeminiAdapter } from '../adapters/GeminiAdapter';

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === '1';

describe.skipIf(!RUN_INTEGRATION)('Gemini Integration', () => {
  let adapter: GeminiAdapter;

  beforeAll(async () => {
    adapter = new GeminiAdapter();
    await adapter.initialize();
  });

  it('responds to simple prompt', async () => {
    const result = await adapter.execute('Say "Hello" and nothing else');
    expect(result.content.toLowerCase()).toContain('hello');
  });
});
```

**Deliverables:**
- [ ] Unit tests for all parsing/consensus logic
- [ ] Integration tests gated by `RUN_INTEGRATION_TESTS`
- [ ] Updated POC document with fixes
- [ ] CHANGELOG entry

---

## Part 4: Security Considerations

### 4.1 Credential Management

```typescript
// packages/pro-bridge/src/config/secrets.ts

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const SECRETS_DIR = path.join(os.homedir(), '.config', 'povc', 'secrets');

export function getSecret(name: string): string | undefined {
  // Priority: env var > secrets file
  const envValue = process.env[name];
  if (envValue) return envValue;

  const filePath = path.join(SECRETS_DIR, `${name.toLowerCase()}.txt`);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8').trim();
  }

  return undefined;
}

export function setSecret(name: string, value: string): void {
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true });
  }

  const filePath = path.join(SECRETS_DIR, `${name.toLowerCase()}.txt`);
  fs.writeFileSync(filePath, value);

  // Restrict permissions on Unix
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o600);
  }
}
```

### 4.2 .gitignore Additions

```gitignore
# Pro Bridge secrets
.config/povc/secrets/
.config/povc/chatgpt-session/
.config/povc/quota/

# Stagehand cache
.cache/stagehand/

# Downloads from Code Interpreter
Downloads/ProBridge/
```

---

## Part 5: Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Gemini API response | < 30s standard, < 120s deep | MetricsCollector |
| ChatGPT browser response | < 60s standard, < 180s heavy | MetricsCollector |
| Consensus achievement | > 85% on 80% of tasks | Log analysis |
| Session persistence | Login once per day max | Manual observation |
| Quota accuracy | Zero overshoot | File inspection |
| JSON parse success | > 95% of responses | Unit test coverage |

---

## Part 6: Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 0: Setup | 2 hours | None |
| Phase 1: Gemini | 3 hours | Phase 0 |
| Phase 2: ChatGPT | 4 hours | Phase 0 |
| Phase 3: Consensus | 2 hours | Phase 1, 2 |
| Phase 4: CLI | 1 hour | Phase 3 |
| Phase 5: Testing | 2 hours | Phase 4 |
| **Total** | **14 hours** | |

---

## Part 7: Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Stagehand selector failure | Medium | High | Self-heal enabled, debug snapshots |
| ChatGPT UI change | High | Medium | Natural language actions adapt |
| Gemini API rate limit | Low | Medium | Quota tracking, backoff |
| Login session expires | Medium | Low | Human-in-loop re-auth |
| Consensus never reached | Low | Medium | Max iterations cap, partial result |
| Code Interpreter scraping fails | Medium | Low | API fallback available |

---

## Appendix A: Correct Package Versions

```json
{
  "dependencies": {
    "@browserbasehq/stagehand": "^3.0.6",
    "@google/genai": "^1.0.0",
    "openai": "^4.70.0",
    "playwright": "^1.48.0",
    "commander": "^12.0.0",
    "zod": "^3.23.0"
  }
}
```

## Appendix B: Environment Variables

```bash
# Required
GOOGLE_AI_API_KEY=your-gemini-api-key

# Optional (enables API fallback for code interpreter)
OPENAI_API_KEY=your-openai-api-key

# Optional (override defaults)
GEMINI_DEEP_THINK_QUOTA=5
POVC_DATA_DIR=~/.config/povc
```

## Appendix C: First-Run Checklist

```bash
# 1. Install dependencies
cd packages/pro-bridge
npm install

# 2. Install browser
npx playwright install chromium

# 3. Set API key
export GOOGLE_AI_API_KEY="your-key"

# 4. Test Gemini (no browser needed)
npm run consensus "Say hello"

# 5. First ChatGPT run (will prompt for login)
npm run consensus "Review this code" --no-deep-think

# 6. Verify quota tracking
npm run quota
```
