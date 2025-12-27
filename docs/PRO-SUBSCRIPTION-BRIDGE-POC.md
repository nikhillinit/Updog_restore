# Pro Subscription Bridge - POC Integration Plan

**Status:** DRAFT
**Created:** 2025-12-14
**Estimated Effort:** 1 day (6-8 hours)

## Executive Summary

This POC integrates frontier AI models (ChatGPT 5.2 Pro, Gemini 3 Pro) into the existing
agent infrastructure using:

1. **Gemini-API** (cookie-based) - No browser automation needed
2. **Stagehand** (AI-resilient browser) - For ChatGPT Pro features
3. **Existing agent-core** - Reuse BaseAgent, withThinking, Router, Orchestrator

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VS Code Hub                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │  Claude Code    │  │   AI Toolkit    │  │ Pro Subscription    │ │
│  │  (Primary)      │  │   (API models)  │  │ Bridge              │ │
│  └─────────────────┘  └─────────────────┘  └──────────┬──────────┘ │
│                                                       │            │
│  ┌────────────────────────────────────────────────────▼──────────┐ │
│  │                    packages/pro-bridge/                       │ │
│  │  ┌──────────────────────┐  ┌──────────────────────┐          │ │
│  │  │   GeminiProAgent     │  │   ChatGPTProAgent    │          │ │
│  │  │   (gemini-webapi)    │  │   (stagehand)        │          │ │
│  │  │                      │  │                      │          │ │
│  │  │   - Deep Think       │  │   - Pro Standard     │          │ │
│  │  │   - 3.0 Pro          │  │   - Heavy Thinking   │          │ │
│  │  │   - Cookie auth      │  │   - Code Interpreter │          │ │
│  │  │   - No browser!      │  │   - Self-healing     │          │ │
│  │  └──────────────────────┘  └──────────────────────┘          │ │
│  │                                                               │ │
│  │  ┌──────────────────────────────────────────────────────────┐│ │
│  │  │              ConsensusOrchestrator                       ││ │
│  │  │  - Parallel execution                                    ││ │
│  │  │  - Structured JSON consensus                             ││ │
│  │  │  - Critical issue blocking                               ││ │
│  │  │  - Quota management (Redis)                              ││ │
│  │  └──────────────────────────────────────────────────────────┘│ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Phase 1: Gemini Pro Agent (2-3 hours)

### 1.1 Install Dependencies

```bash
# In packages/pro-bridge/
npm init -y
npm install gemini-webapi        # Cookie-based Gemini API
npm install @anthropic-ai/sdk    # For fallback
npm install ioredis              # Quota tracking
```

### 1.2 GeminiProAgent Implementation

**File:** `packages/pro-bridge/src/GeminiProAgent.ts`

```typescript
import { BaseAgent, withThinking, AgentExecutionContext } from '@povc/agent-core';
import { createHybridMemoryManager } from '@povc/agent-core';
import { GeminiClient } from 'gemini-webapi';
import Redis from 'ioredis';

export interface GeminiProInput {
  prompt: string;
  useDeepThink?: boolean;
  model?: 'gemini-3-pro' | 'gemini-2.5-pro' | 'gemini-2.5-flash';
  images?: string[];
  context?: string;
}

export interface GeminiProOutput {
  content: string;
  thoughts?: string[];        // Deep Think reasoning trace
  model: string;
  deepThinkUsed: boolean;
  deepThinkRemaining: number;
  timestamp: number;
}

const DEEP_THINK_DAILY_QUOTA = 5;

export class GeminiProAgent extends withThinking(BaseAgent)<GeminiProInput, GeminiProOutput> {
  private client: GeminiClient | null = null;
  private redis: Redis;

  constructor() {
    super({
      name: 'gemini-3-pro-agent',
      maxRetries: 2,
      timeout: 180000, // 3 min for Deep Think
      enableNativeMemory: true,
      enablePatternLearning: true,
      tenantId: 'agent:gemini-pro',
      memoryScope: 'project',
    });

    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async initialize(): Promise<void> {
    // Initialize Gemini client with cookies
    // Cookies auto-refresh in background
    this.client = new GeminiClient({
      cookies: process.env.GEMINI_COOKIES, // Or auto-import from browser
      autoRefresh: true,
    });

    this.logger.info('GeminiProAgent initialized with cookie auth');
  }

  protected async performOperation(
    input: GeminiProInput,
    context: AgentExecutionContext
  ): Promise<GeminiProOutput> {
    if (!this.client) {
      await this.initialize();
    }

    // Check Deep Think quota
    const quota = await this.checkDeepThinkQuota();
    const useDeepThink = input.useDeepThink && quota.available;

    if (input.useDeepThink && !quota.available) {
      this.logger.warn(`Deep Think quota exhausted (${quota.used}/${DEEP_THINK_DAILY_QUOTA}), using standard`);
    }

    // Select model and mode
    const model = input.model || 'gemini-3-pro';

    this.logger.info(`Executing with ${model}, Deep Think: ${useDeepThink}`);

    // Make request
    const response = await this.client!.ask(input.prompt, {
      model,
      thinking: useDeepThink ? 'deep' : 'standard',
      images: input.images,
    });

    // Record Deep Think usage
    if (useDeepThink) {
      await this.recordDeepThinkUsage();
    }

    // Extract thoughts if available
    const thoughts = response.thoughts || [];

    return {
      content: response.text,
      thoughts,
      model,
      deepThinkUsed: useDeepThink,
      deepThinkRemaining: useDeepThink ? quota.remaining - 1 : quota.remaining,
      timestamp: Date.now(),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Quota Management (Redis-backed, survives restarts)
  // ─────────────────────────────────────────────────────────────────

  private async checkDeepThinkQuota(): Promise<{ available: boolean; used: number; remaining: number }> {
    const today = new Date().toISOString().split('T')[0];
    const key = `gemini:deep_think:${today}`;

    const used = parseInt(await this.redis.get(key) || '0', 10);
    const remaining = DEEP_THINK_DAILY_QUOTA - used;

    return {
      available: remaining > 0,
      used,
      remaining: Math.max(0, remaining),
    };
  }

  private async recordDeepThinkUsage(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const key = `gemini:deep_think:${today}`;

    await this.redis.incr(key);

    // Set expiry at midnight UTC
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    const secondsUntilMidnight = Math.floor((midnight.getTime() - now.getTime()) / 1000);

    await this.redis.expire(key, secondsUntilMidnight);

    const quota = await this.checkDeepThinkQuota();
    this.logger.info(`Deep Think used. Remaining today: ${quota.remaining}/${DEEP_THINK_DAILY_QUOTA}`);
  }

  async getQuotaStatus(): Promise<{ used: number; remaining: number; resetsAt: string }> {
    const quota = await this.checkDeepThinkQuota();
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);

    return {
      used: quota.used,
      remaining: quota.remaining,
      resetsAt: tomorrow.toISOString(),
    };
  }

  async cleanup(): Promise<void> {
    await this.redis.quit();
  }
}
```

### 1.3 Cookie Setup Helper

**File:** `packages/pro-bridge/src/setup-gemini-cookies.ts`

```typescript
#!/usr/bin/env npx ts-node

/**
 * Helper script to extract Gemini cookies from browser
 * Run: npx ts-node packages/pro-bridge/src/setup-gemini-cookies.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function extractGeminiCookies() {
  console.log('Launching browser to extract Gemini cookies...');
  console.log('Please log in to Gemini if prompted.\n');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome', // Use installed Chrome
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://gemini.google.com');

  console.log('Waiting for login (press Enter when logged in)...');
  await new Promise(resolve => process.stdin.once('data', resolve));

  const cookies = await context.cookies();

  // Extract the required cookies
  const requiredCookies = ['__Secure-1PSID', '__Secure-1PSIDTS', '__Secure-1PSIDCC'];
  const geminiCookies = cookies
    .filter(c => requiredCookies.includes(c.name))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  // Save to .env file
  const envPath = path.join(process.cwd(), '.env');
  const envContent = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf-8')
    : '';

  const updatedEnv = envContent.includes('GEMINI_COOKIES=')
    ? envContent.replace(/GEMINI_COOKIES=.*/, `GEMINI_COOKIES="${geminiCookies}"`)
    : `${envContent}\nGEMINI_COOKIES="${geminiCookies}"`;

  fs.writeFileSync(envPath, updatedEnv.trim() + '\n');

  console.log('\nCookies extracted and saved to .env');
  console.log('GEMINI_COOKIES has been set.');

  await browser.close();
}

extractGeminiCookies().catch(console.error);
```

---

## Phase 2: ChatGPT Pro Agent (3-4 hours)

### 2.1 Install Dependencies

```bash
npm install @anthropic-ai/sdk    # Already installed
npm install @browserbase/stagehand  # AI-resilient browser automation
npm install playwright              # Peer dependency
npx playwright install chromium     # Install browser
```

### 2.2 ChatGPTProAgent Implementation

**File:** `packages/pro-bridge/src/ChatGPTProAgent.ts`

```typescript
import { BaseAgent, withThinking, AgentExecutionContext } from '@povc/agent-core';
import { Stagehand } from '@browserbase/stagehand';
import * as path from 'path';

export type ChatGPTMode =
  | 'pro_standard'      // GPT-5.2 Pro default
  | 'heavy_thinking'    // Deep reasoning, faster than extended
  | 'extended_thinking' // Maximum reasoning depth
  | 'code_interpreter'; // With code execution

export interface ChatGPTProInput {
  prompt: string;
  mode?: ChatGPTMode;
  project?: string;          // ChatGPT Project name
  executeCode?: boolean;     // Trigger Code Interpreter
  files?: string[];          // Files to upload
}

export interface ChatGPTProOutput {
  content: string;
  mode: ChatGPTMode;
  codeExecution?: {
    code: string;
    output: string;
    files?: Array<{ name: string; url: string }>;
    success: boolean;
  };
  timestamp: number;
}

export class ChatGPTProAgent extends withThinking(BaseAgent)<ChatGPTProInput, ChatGPTProOutput> {
  private stagehand: Stagehand | null = null;
  private sessionActive = false;
  private userDataDir: string;

  constructor() {
    super({
      name: 'chatgpt-5.2-pro-agent',
      maxRetries: 2,
      timeout: 300000, // 5 min for Heavy Thinking + Code Interpreter
      enableNativeMemory: true,
      enablePatternLearning: true,
      tenantId: 'agent:chatgpt-pro',
      memoryScope: 'project',
    });

    // Persistent session directory (survives restarts)
    this.userDataDir = path.join(
      process.env.LOCALAPPDATA || process.env.HOME || '',
      '.chatgpt-pro-session'
    );
  }

  async initialize(): Promise<void> {
    if (this.stagehand) return;

    this.stagehand = new Stagehand({
      env: 'LOCAL',
      enableCaching: true,        // Cache successful action paths
      headless: false,            // Keep visible for debugging
      userDataDir: this.userDataDir, // Persist login
    });

    await this.stagehand.init();
    this.logger.info('ChatGPTProAgent initialized with Stagehand');
  }

  protected async performOperation(
    input: ChatGPTProInput,
    context: AgentExecutionContext
  ): Promise<ChatGPTProOutput> {
    if (!this.stagehand) {
      await this.initialize();
    }

    const page = this.stagehand!.page;
    const mode = input.mode || 'pro_standard';

    // Navigate to ChatGPT (or project)
    await this.navigateToChatGPT(input.project);

    // Select mode using natural language (Stagehand's strength)
    await this.selectMode(mode);

    // Send prompt
    const response = await this.sendPromptAndGetResponse(input.prompt, mode);

    // Handle Code Interpreter if requested
    let codeExecution: ChatGPTProOutput['codeExecution'];
    if (input.executeCode || mode === 'code_interpreter') {
      codeExecution = await this.extractCodeExecution();
    }

    return {
      content: response,
      mode,
      codeExecution,
      timestamp: Date.now(),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Stagehand-Powered Browser Automation (Self-Healing)
  // ─────────────────────────────────────────────────────────────────

  private async navigateToChatGPT(project?: string): Promise<void> {
    const page = this.stagehand!.page;

    if (project) {
      // Navigate to specific project
      await page.goto('https://chatgpt.com');
      await this.stagehand!.act({
        action: `Click on the project named "${project}" in the sidebar`,
      });
    } else if (!this.sessionActive) {
      await page.goto('https://chatgpt.com');
      this.sessionActive = true;
    }

    // Start new chat
    await this.stagehand!.act({
      action: 'Click the "New chat" button to start a fresh conversation',
    });
  }

  private async selectMode(mode: ChatGPTMode): Promise<void> {
    const modeInstructions: Record<ChatGPTMode, string> = {
      'pro_standard': 'Select the GPT-5.2 Pro model from the model selector dropdown',
      'heavy_thinking': 'Select GPT-5.2 Pro with Heavy Thinking mode enabled',
      'extended_thinking': 'Select GPT-5.2 Pro with Extended Thinking mode for maximum reasoning',
      'code_interpreter': 'Select GPT-5.2 Pro and enable Code Interpreter / Advanced Data Analysis',
    };

    await this.stagehand!.act({
      action: modeInstructions[mode],
    });

    this.logger.debug(`Mode selected: ${mode}`);
  }

  private async sendPromptAndGetResponse(prompt: string, mode: ChatGPTMode): Promise<string> {
    const page = this.stagehand!.page;

    // Type the prompt (Stagehand handles textarea finding)
    await this.stagehand!.act({
      action: `Type the following message in the chat input and press Enter to send: "${prompt.slice(0, 100)}..."`,
    });

    // For longer prompts, use direct input
    if (prompt.length > 100) {
      await page.fill('textarea', prompt);
      await page.press('textarea', 'Enter');
    }

    // Wait for response with mode-appropriate timeout
    const timeouts: Record<ChatGPTMode, number> = {
      'pro_standard': 60000,
      'heavy_thinking': 120000,
      'extended_thinking': 180000,
      'code_interpreter': 180000,
    };

    // Use Stagehand's extract for structured response
    const response = await this.stagehand!.extract({
      instruction: 'Extract the complete assistant response from the last message in the conversation',
      schema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The full response text' },
          hasCodeBlock: { type: 'boolean', description: 'Whether the response contains code' },
        },
        required: ['content'],
      },
      timeout: timeouts[mode],
    });

    return response.content;
  }

  private async extractCodeExecution(): Promise<ChatGPTProOutput['codeExecution'] | undefined> {
    try {
      const result = await this.stagehand!.extract({
        instruction: 'Extract the Code Interpreter execution results including the code, output, and any generated files',
        schema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'The executed Python code' },
            output: { type: 'string', description: 'The execution output/results' },
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  url: { type: 'string' },
                },
              },
              description: 'Any files generated by the code',
            },
            success: { type: 'boolean', description: 'Whether execution succeeded' },
          },
          required: ['code', 'output', 'success'],
        },
        timeout: 30000,
      });

      return result;
    } catch (error) {
      this.logger.warn('No Code Interpreter output found');
      return undefined;
    }
  }

  async cleanup(): Promise<void> {
    // Don't close browser - maintain session for speed
    // Only close on explicit shutdown
    this.sessionActive = false;
  }

  async shutdown(): Promise<void> {
    if (this.stagehand) {
      await this.stagehand.close();
      this.stagehand = null;
    }
  }
}
```

---

## Phase 3: Consensus Orchestrator (2 hours)

### 3.1 ConsensusOrchestrator Implementation

**File:** `packages/pro-bridge/src/ConsensusOrchestrator.ts`

```typescript
import { Orchestrator, MetricsCollector } from '@povc/agent-core';
import { GeminiProAgent, GeminiProOutput } from './GeminiProAgent';
import { ChatGPTProAgent, ChatGPTProOutput } from './ChatGPTProAgent';
import { z } from 'zod';

// Structured output schema for consensus
const ConsensusResponseSchema = z.object({
  issues: z.array(z.object({
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    description: z.string(),
    location: z.string().optional(),
    recommendation: z.string().optional(),
  })),
  recommendations: z.array(z.string()),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
});

type ConsensusResponse = z.infer<typeof ConsensusResponseSchema>;

export interface ConsensusConfig {
  minAgreement: number;        // 0-1, default 0.85
  maxIterations: number;       // default 3
  useDeepThink: boolean;       // Use Gemini Deep Think on first pass
  useChatGPTHeavy: boolean;    // Use ChatGPT Heavy Thinking
  blockOnCritical: boolean;    // Force iteration if critical issues found
  taskType: 'code_review' | 'architecture' | 'math_validation' | 'general';
}

export interface ConsensusResult {
  success: boolean;
  consensusScore: number;
  iterations: number;
  geminiResponse: GeminiProOutput;
  chatgptResponse: ChatGPTProOutput;
  mergedResult: ConsensusResponse;
  divergences: string[];
}

export class ConsensusOrchestrator {
  private geminiAgent: GeminiProAgent;
  private chatgptAgent: ChatGPTProAgent;
  private metrics: MetricsCollector;

  constructor() {
    this.geminiAgent = new GeminiProAgent();
    this.chatgptAgent = new ChatGPTProAgent();
    this.metrics = MetricsCollector.getInstance();
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.geminiAgent.initialize(),
      this.chatgptAgent.initialize(),
    ]);
  }

  async executeWithConsensus(
    prompt: string,
    config: Partial<ConsensusConfig> = {}
  ): Promise<ConsensusResult> {
    const fullConfig: ConsensusConfig = {
      minAgreement: 0.85,
      maxIterations: 3,
      useDeepThink: true,
      useChatGPTHeavy: true,
      blockOnCritical: true,
      taskType: 'code_review',
      ...config,
    };

    // Add JSON output instruction
    const structuredPrompt = this.addStructuredOutputInstruction(prompt);

    let iteration = 0;
    let currentPrompt = structuredPrompt;
    let lastGeminiResult: GeminiProOutput | null = null;
    let lastChatGPTResult: ChatGPTProOutput | null = null;

    while (iteration < fullConfig.maxIterations) {
      console.log(`\n[Consensus] Iteration ${iteration + 1}/${fullConfig.maxIterations}`);

      // Parallel execution
      const [geminiResult, chatgptResult] = await Promise.all([
        this.geminiAgent.execute({
          prompt: currentPrompt,
          useDeepThink: iteration === 0 && fullConfig.useDeepThink,
          model: 'gemini-3-pro',
        }),
        this.chatgptAgent.execute({
          prompt: currentPrompt,
          mode: fullConfig.useChatGPTHeavy ? 'heavy_thinking' : 'pro_standard',
        }),
      ]);

      lastGeminiResult = geminiResult.data!;
      lastChatGPTResult = chatgptResult.data!;

      // Parse structured responses
      const geminiParsed = this.parseStructuredResponse(lastGeminiResult.content);
      const chatgptParsed = this.parseStructuredResponse(lastChatGPTResult.content);

      // Measure consensus
      const consensus = this.measureConsensus(geminiParsed, chatgptParsed);

      console.log(`  Gemini Deep Think: ${lastGeminiResult.deepThinkUsed} (${lastGeminiResult.deepThinkRemaining} remaining)`);
      console.log(`  ChatGPT Mode: ${lastChatGPTResult.mode}`);
      console.log(`  Agreement: ${(consensus.score * 100).toFixed(1)}%`);
      console.log(`  Divergences: ${consensus.divergences.length}`);

      // Check for critical issues
      const hasCritical = this.hasCriticalIssues(geminiParsed, chatgptParsed);

      // Record metrics
      this.metrics.recordExecution(
        'consensus-orchestrator',
        fullConfig.taskType,
        consensus.score >= fullConfig.minAgreement ? 'success' : 'partial',
        0,
        iteration
      );

      // Exit conditions
      if (consensus.score >= fullConfig.minAgreement && !hasCritical) {
        console.log('[Consensus] ACHIEVED - High agreement, no critical issues');
        return {
          success: true,
          consensusScore: consensus.score,
          iterations: iteration + 1,
          geminiResponse: lastGeminiResult,
          chatgptResponse: lastChatGPTResult,
          mergedResult: this.mergeResponses(geminiParsed, chatgptParsed),
          divergences: consensus.divergences,
        };
      }

      if (fullConfig.blockOnCritical && hasCritical && iteration < fullConfig.maxIterations - 1) {
        console.log('[Consensus] Critical issues found - requesting clarification');
        currentPrompt = this.buildClarificationPrompt(
          prompt,
          geminiParsed,
          chatgptParsed,
          consensus.divergences
        );
        iteration++;
        continue;
      }

      // Low agreement - build refinement prompt
      if (consensus.score < fullConfig.minAgreement && iteration < fullConfig.maxIterations - 1) {
        console.log('[Consensus] Low agreement - requesting refinement');
        currentPrompt = this.buildRefinementPrompt(
          prompt,
          geminiParsed,
          chatgptParsed,
          consensus.divergences
        );
        iteration++;
        continue;
      }

      break;
    }

    // Return partial consensus
    const geminiParsed = this.parseStructuredResponse(lastGeminiResult!.content);
    const chatgptParsed = this.parseStructuredResponse(lastChatGPTResult!.content);
    const finalConsensus = this.measureConsensus(geminiParsed, chatgptParsed);

    return {
      success: false,
      consensusScore: finalConsensus.score,
      iterations: iteration + 1,
      geminiResponse: lastGeminiResult!,
      chatgptResponse: lastChatGPTResult!,
      mergedResult: this.mergeResponses(geminiParsed, chatgptParsed),
      divergences: finalConsensus.divergences,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Consensus Measurement (Structured JSON, no ML dependencies)
  // ─────────────────────────────────────────────────────────────────

  private measureConsensus(
    response1: ConsensusResponse | null,
    response2: ConsensusResponse | null
  ): { score: number; divergences: string[] } {
    if (!response1 || !response2) {
      return { score: 0, divergences: ['Failed to parse one or both responses'] };
    }

    const divergences: string[] = [];

    // Issue overlap (Jaccard similarity)
    const issues1 = new Set(response1.issues.map(i => this.normalizeIssue(i)));
    const issues2 = new Set(response2.issues.map(i => this.normalizeIssue(i)));

    const intersection = new Set([...issues1].filter(x => issues2.has(x)));
    const union = new Set([...issues1, ...issues2]);
    const issueOverlap = union.size > 0 ? intersection.size / union.size : 1;

    // Severity alignment
    const severity1 = this.countSeverities(response1.issues);
    const severity2 = this.countSeverities(response2.issues);
    const severityDiff = Math.abs(severity1.critical - severity2.critical) * 3 +
                         Math.abs(severity1.high - severity2.high) * 2 +
                         Math.abs(severity1.medium - severity2.medium);
    const severityAlignment = Math.max(0, 1 - severityDiff / 10);

    // Confidence alignment
    const confidenceAlignment = 1 - Math.abs(response1.confidence - response2.confidence);

    // Track divergences
    const uniqueToGemini = [...issues1].filter(x => !issues2.has(x));
    const uniqueToChatGPT = [...issues2].filter(x => !issues1.has(x));

    if (uniqueToGemini.length > 0) {
      divergences.push(`Gemini-only issues: ${uniqueToGemini.slice(0, 3).join(', ')}`);
    }
    if (uniqueToChatGPT.length > 0) {
      divergences.push(`ChatGPT-only issues: ${uniqueToChatGPT.slice(0, 3).join(', ')}`);
    }
    if (severity1.critical !== severity2.critical) {
      divergences.push(`Critical count: Gemini=${severity1.critical}, ChatGPT=${severity2.critical}`);
    }

    // Weighted score
    const score = issueOverlap * 0.5 + severityAlignment * 0.3 + confidenceAlignment * 0.2;

    return { score, divergences };
  }

  private normalizeIssue(issue: { severity: string; description: string }): string {
    // Normalize for comparison (lowercase, remove punctuation, first 50 chars)
    return `${issue.severity}:${issue.description.toLowerCase().replace(/[^\w\s]/g, '').slice(0, 50)}`;
  }

  private countSeverities(issues: Array<{ severity: string }>): Record<string, number> {
    return issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private hasCriticalIssues(
    response1: ConsensusResponse | null,
    response2: ConsensusResponse | null
  ): boolean {
    const critical1 = response1?.issues.filter(i => i.severity === 'critical').length || 0;
    const critical2 = response2?.issues.filter(i => i.severity === 'critical').length || 0;
    return critical1 > 0 || critical2 > 0;
  }

  // ─────────────────────────────────────────────────────────────────
  // Response Parsing & Merging
  // ─────────────────────────────────────────────────────────────────

  private parseStructuredResponse(content: string): ConsensusResponse | null {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
                        content.match(/\{[\s\S]*"issues"[\s\S]*\}/);

      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return ConsensusResponseSchema.parse(json);
      }

      return null;
    } catch (error) {
      console.warn('Failed to parse structured response:', error);
      return null;
    }
  }

  private mergeResponses(
    response1: ConsensusResponse | null,
    response2: ConsensusResponse | null
  ): ConsensusResponse {
    if (!response1 && !response2) {
      return { issues: [], recommendations: [], summary: 'Failed to get responses', confidence: 0 };
    }
    if (!response1) return response2!;
    if (!response2) return response1;

    // Merge issues (deduplicate, prefer higher severity)
    const issueMap = new Map<string, typeof response1.issues[0]>();

    for (const issue of [...response1.issues, ...response2.issues]) {
      const key = this.normalizeIssue(issue);
      const existing = issueMap.get(key);

      if (!existing || this.severityRank(issue.severity) > this.severityRank(existing.severity)) {
        issueMap.set(key, issue);
      }
    }

    // Merge recommendations (deduplicate)
    const recommendations = [...new Set([...response1.recommendations, ...response2.recommendations])];

    return {
      issues: [...issueMap.values()],
      recommendations,
      summary: `Consensus from ${response1.issues.length} (Gemini) + ${response2.issues.length} (ChatGPT) issues`,
      confidence: (response1.confidence + response2.confidence) / 2,
    };
  }

  private severityRank(severity: string): number {
    const ranks: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return ranks[severity] || 0;
  }

  // ─────────────────────────────────────────────────────────────────
  // Prompt Engineering
  // ─────────────────────────────────────────────────────────────────

  private addStructuredOutputInstruction(prompt: string): string {
    return `${prompt}

IMPORTANT: Respond with a JSON object in the following format:

\`\`\`json
{
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "description": "Description of the issue",
      "location": "file:line or general area (optional)",
      "recommendation": "How to fix (optional)"
    }
  ],
  "recommendations": ["General recommendation 1", "General recommendation 2"],
  "summary": "Brief overall assessment",
  "confidence": 0.0-1.0
}
\`\`\``;
  }

  private buildRefinementPrompt(
    originalPrompt: string,
    response1: ConsensusResponse | null,
    response2: ConsensusResponse | null,
    divergences: string[]
  ): string {
    return `${originalPrompt}

Previous analysis showed disagreement between reviewers:
${divergences.map(d => `- ${d}`).join('\n')}

Gemini found: ${response1?.issues.length || 0} issues
ChatGPT found: ${response2?.issues.length || 0} issues

Please re-analyze with focus on the divergent areas. Consider whether the disagreements
represent genuine concerns or false positives.

Respond in the same JSON format.`;
  }

  private buildClarificationPrompt(
    originalPrompt: string,
    response1: ConsensusResponse | null,
    response2: ConsensusResponse | null,
    divergences: string[]
  ): string {
    const criticalIssues = [
      ...(response1?.issues.filter(i => i.severity === 'critical') || []),
      ...(response2?.issues.filter(i => i.severity === 'critical') || []),
    ];

    return `${originalPrompt}

CRITICAL ISSUES IDENTIFIED:
${criticalIssues.map(i => `- ${i.description}`).join('\n')}

These critical issues require careful verification. Please:
1. Confirm or refute each critical issue
2. Provide specific evidence for your assessment
3. Suggest immediate remediation if confirmed

Respond in the same JSON format.`;
  }

  async cleanup(): Promise<void> {
    await Promise.all([
      this.geminiAgent.cleanup(),
      this.chatgptAgent.cleanup(),
    ]);
  }
}
```

---

## Phase 4: CLI & VS Code Integration (1 hour)

### 4.1 CLI Command

**File:** `scripts/ai-tools/consensus.js`

```javascript
#!/usr/bin/env node

/**
 * CLI for Pro Subscription Bridge consensus workflow
 *
 * Usage:
 *   npm run ai consensus "Review this code for production readiness"
 *   npm run ai consensus --task-type architecture --deep-think "Design distributed cache"
 *   npm run ai consensus --code-interpreter "Validate this formula" --min-agreement 0.95
 */

const { ConsensusOrchestrator } = require('../../packages/pro-bridge/dist/ConsensusOrchestrator');
const { GeminiProAgent } = require('../../packages/pro-bridge/dist/GeminiProAgent');

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const options = {
    task: '',
    taskType: 'code_review',
    minAgreement: 0.85,
    maxIterations: 3,
    useDeepThink: true,
    useChatGPTHeavy: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--task-type' && args[i + 1]) {
      options.taskType = args[++i];
    } else if (arg === '--min-agreement' && args[i + 1]) {
      options.minAgreement = parseFloat(args[++i]);
    } else if (arg === '--max-iterations' && args[i + 1]) {
      options.maxIterations = parseInt(args[++i], 10);
    } else if (arg === '--no-deep-think') {
      options.useDeepThink = false;
    } else if (arg === '--no-heavy') {
      options.useChatGPTHeavy = false;
    } else if (arg === '--quota') {
      // Show quota status
      const gemini = new GeminiProAgent();
      await gemini.initialize();
      const quota = await gemini.getQuotaStatus();
      console.log('\nGemini Deep Think Quota:');
      console.log(`  Used today: ${quota.used}/5`);
      console.log(`  Remaining: ${quota.remaining}`);
      console.log(`  Resets at: ${quota.resetsAt}`);
      await gemini.cleanup();
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      options.task = arg;
    }
  }

  if (!options.task) {
    console.log('Usage: npm run ai consensus "Your task here" [options]');
    console.log('\nOptions:');
    console.log('  --task-type TYPE      code_review|architecture|math_validation|general');
    console.log('  --min-agreement N     Consensus threshold (0-1, default 0.85)');
    console.log('  --max-iterations N    Max refinement rounds (default 3)');
    console.log('  --no-deep-think       Disable Gemini Deep Think');
    console.log('  --no-heavy            Disable ChatGPT Heavy Thinking');
    console.log('  --quota               Show Gemini Deep Think quota status');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Pro Subscription Bridge - Multi-Model Consensus');
  console.log('='.repeat(70));
  console.log(`Task: ${options.task.slice(0, 60)}...`);
  console.log(`Type: ${options.taskType}`);
  console.log(`Min Agreement: ${(options.minAgreement * 100).toFixed(0)}%`);
  console.log(`Deep Think: ${options.useDeepThink ? 'enabled' : 'disabled'}`);
  console.log(`Heavy Thinking: ${options.useChatGPTHeavy ? 'enabled' : 'disabled'}`);
  console.log('='.repeat(70));

  const orchestrator = new ConsensusOrchestrator();

  try {
    await orchestrator.initialize();

    const result = await orchestrator.executeWithConsensus(options.task, {
      taskType: options.taskType,
      minAgreement: options.minAgreement,
      maxIterations: options.maxIterations,
      useDeepThink: options.useDeepThink,
      useChatGPTHeavy: options.useChatGPTHeavy,
      blockOnCritical: true,
    });

    console.log('\n' + '='.repeat(70));
    console.log('RESULT');
    console.log('='.repeat(70));
    console.log(`Status: ${result.success ? 'CONSENSUS ACHIEVED' : 'PARTIAL CONSENSUS'}`);
    console.log(`Score: ${(result.consensusScore * 100).toFixed(1)}%`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Gemini Deep Think Remaining: ${result.geminiResponse.deepThinkRemaining}/5`);

    if (result.divergences.length > 0) {
      console.log('\nDivergences:');
      result.divergences.forEach(d => console.log(`  - ${d}`));
    }

    console.log('\nMerged Issues:');
    result.mergedResult.issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.description}`);
    });

    console.log('\nSummary:');
    console.log(`  ${result.mergedResult.summary}`);
    console.log('='.repeat(70) + '\n');

    return result;
  } finally {
    await orchestrator.cleanup();
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
```

### 4.2 Package.json Script

**Add to root `package.json`:**

```json
{
  "scripts": {
    "ai:consensus": "node scripts/ai-tools/consensus.js",
    "ai:quota": "node scripts/ai-tools/consensus.js --quota",
    "ai:setup-gemini": "npx ts-node packages/pro-bridge/src/setup-gemini-cookies.ts"
  }
}
```

### 4.3 VS Code Task

**File:** `.vscode/tasks.json` (add to existing)

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "AI: Consensus Review",
      "type": "shell",
      "command": "npm run ai:consensus -- \"${input:consensusTask}\" --task-type ${input:taskType}",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    },
    {
      "label": "AI: Check Deep Think Quota",
      "type": "shell",
      "command": "npm run ai:quota",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always"
      }
    }
  ],
  "inputs": [
    {
      "id": "consensusTask",
      "type": "promptString",
      "description": "Task/prompt for consensus review"
    },
    {
      "id": "taskType",
      "type": "pickString",
      "description": "Task type",
      "options": ["code_review", "architecture", "math_validation", "general"],
      "default": "code_review"
    }
  ]
}
```

### 4.4 Slash Command

**File:** `.claude/commands/consensus.md`

```markdown
---
description: Run multi-model consensus with ChatGPT Pro and Gemini Pro
---

Run a multi-model consensus workflow using the Pro Subscription Bridge.

**Available Models:**
- Gemini 3 Pro (with Deep Think - 5/day quota)
- ChatGPT 5.2 Pro (with Heavy Thinking)

**Usage:**
1. For code review: `npm run ai:consensus "Review src/waterfall-policy.ts"`
2. For architecture: `npm run ai:consensus --task-type architecture "Design caching layer"`
3. Check quota: `npm run ai:quota`

**The user's request:**
$ARGUMENTS

**Instructions:**
1. Determine the appropriate task type based on the request
2. Run the consensus command with appropriate options
3. Report the consensus score and any divergences
4. Highlight critical issues that both models agree on
```

---

## Phase 5: Package Structure

### 5.1 Directory Layout

```
packages/pro-bridge/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Exports
│   ├── GeminiProAgent.ts           # Gemini 3 Pro (cookie-based)
│   ├── ChatGPTProAgent.ts          # ChatGPT 5.2 Pro (Stagehand)
│   ├── ConsensusOrchestrator.ts    # Multi-model consensus
│   ├── setup-gemini-cookies.ts     # Cookie extraction helper
│   └── types.ts                    # Shared types
├── dist/                           # Compiled output
└── __tests__/
    ├── GeminiProAgent.test.ts
    ├── ChatGPTProAgent.test.ts
    └── ConsensusOrchestrator.test.ts
```

### 5.2 Package.json

**File:** `packages/pro-bridge/package.json`

```json
{
  "name": "@povc/pro-bridge",
  "version": "0.1.0",
  "description": "Pro Subscription Bridge for ChatGPT 5.2 Pro and Gemini 3 Pro",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "setup:gemini": "ts-node src/setup-gemini-cookies.ts"
  },
  "dependencies": {
    "@povc/agent-core": "workspace:*",
    "@browserbase/stagehand": "^3.0.6",
    "gemini-webapi": "^1.0.0",
    "ioredis": "^5.3.0",
    "playwright": "^1.40.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

---

## Setup Instructions

### First-Time Setup (10 minutes)

```bash
# 1. Create package
mkdir -p packages/pro-bridge/src
cd packages/pro-bridge

# 2. Initialize and install dependencies
npm init -y
npm install @browserbase/stagehand gemini-webapi ioredis playwright zod
npm install -D typescript vitest

# 3. Install Playwright browser
npx playwright install chromium

# 4. Extract Gemini cookies (one-time, auto-refreshes)
npm run setup:gemini
# Follow prompts to log in to Gemini

# 5. Build
npm run build

# 6. Test quota
npm run ai:quota
```

### Daily Usage

```bash
# Code review with consensus
npm run ai:consensus "Review src/components/WaterfallChart.tsx for performance issues"

# Architecture decision
npm run ai:consensus --task-type architecture "Design caching strategy for Monte Carlo"

# Math validation (uses both Heavy Thinking + Deep Think)
npm run ai:consensus --task-type math_validation "Validate GP catch-up formula"

# Check Deep Think quota
npm run ai:quota
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Gemini response time | < 60s (standard), < 180s (Deep Think) |
| ChatGPT response time | < 60s (standard), < 180s (Heavy Thinking) |
| Consensus achievement | > 85% on 80% of tasks |
| Deep Think quota tracking | Accurate, survives restarts |
| Browser session persistence | Maintains login across runs |
| Selector resilience | Handles UI changes gracefully |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Gemini cookie expiry | Auto-refresh enabled, re-run setup if needed |
| ChatGPT UI changes | Stagehand's natural language actions adapt |
| Deep Think quota exhaustion | Redis tracking + fallback to standard |
| Browser session loss | Persistent userDataDir maintains login |
| Consensus never reached | Max iterations cap, return partial result |

---

## Future Enhancements (Post-POC)

1. **VS Code Extension** - Native sidebar for consensus results
2. **Webhook notifications** - Alert on critical issues
3. **Historical tracking** - Store consensus history in DB
4. **Cost optimization** - Track token/time usage per model
5. **Circuit breaker** - Auto-disable if repeated failures
