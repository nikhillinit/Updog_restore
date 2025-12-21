/**
 * Multi-AI Orchestrator
 *
 * Provides parallel querying of Claude, GPT, and Gemini with:
 * - File-based daily budget tracking
 * - Retry/timeout per model
 * - Cost calculation and audit logging
 * - No external dependencies (no Redis needed)
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import pLimit from 'p-limit';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  dailyCallLimit: parseInt(process.env['AI_DAILY_CALL_LIMIT'] ?? '200', 10),
  logPath: path.join(process.cwd(), 'logs', 'multi-ai.jsonl'),
  budgetPath: path.join(process.cwd(), 'logs', 'ai-budget.json'),
  timeout: parseInt(process.env['AI_TIMEOUT_MS'] ?? '90000', 10), // 90s default for complex prompts
  maxRetries: 2,
  concurrency: 3,
} as const;

// Initialize AI clients (only if API keys present)
const anthropic = process.env["ANTHROPIC_API_KEY"]
  ? new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })
  : null;

const openai = process.env["OPENAI_API_KEY"]
  ? new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] })
  : null;

const gemini = process.env["GOOGLE_API_KEY"]
  ? new GoogleGenerativeAI(process.env["GOOGLE_API_KEY"])
  : null;

const deepseek = process.env["DEEPSEEK_API_KEY"]
  ? new OpenAI({
      apiKey: process.env["DEEPSEEK_API_KEY"],
      baseURL: 'https://api.deepseek.com',
    })
  : null;

// ============================================================================
// Types
// ============================================================================

export type ModelName = 'claude' | 'gpt' | 'gemini' | 'deepseek';

export interface AskArgs {
  prompt: string;
  tags?: string[];
  models?: ModelName[];
}

export interface AIResponse {
  model: ModelName;
  text?: string;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost_usd?: number;
  elapsed_ms?: number;
}

interface BudgetData {
  date: string;
  count: number;
  total_cost_usd: number;
}

// ============================================================================
// Pricing (via environment variables for easy updates)
// ============================================================================

const PRICING = {
  claude: {
    input: parseFloat(process.env["CLAUDE_INPUT_COST"] ?? '0.003'),
    output: parseFloat(process.env["CLAUDE_OUTPUT_COST"] ?? '0.015'),
  },
  gpt: {
    input: parseFloat(process.env["GPT_INPUT_COST"] ?? '0.00015'),
    output: parseFloat(process.env["GPT_OUTPUT_COST"] ?? '0.0006'),
  },
  gemini: {
    input: parseFloat(process.env["GEMINI_INPUT_COST"] ?? '0'),
    output: parseFloat(process.env["GEMINI_OUTPUT_COST"] ?? '0'),
  },
  deepseek: {
    input: parseFloat(process.env["DEEPSEEK_INPUT_COST"] ?? '0.00014'),
    output: parseFloat(process.env["DEEPSEEK_OUTPUT_COST"] ?? '0.00028'),
  },
} as const;

function estimateCost(model: ModelName, usage?: AIResponse['usage']): number {
  if (!usage) return 0;
  const rates = PRICING[model];
  return (
    (usage.prompt_tokens / 1000) * rates.input +
    (usage.completion_tokens / 1000) * rates.output
  );
}

// ============================================================================
// File-Based Budget Tracking
// ============================================================================

async function ensureLogDir() {
  const dir = path.dirname(CONFIG.logPath);
  await fs.mkdir(dir, { recursive: true });
}

async function getBudgetData(): Promise<BudgetData> {
  try {
    const data = await fs.readFile(CONFIG.budgetPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { date: '', count: 0, total_cost_usd: 0 };
  }
}

async function getTodaysCalls(): Promise<number> {
  const budget = await getBudgetData();
  const today = new Date().toISOString().split('T')[0];
  return budget.date === today ? budget.count : 0;
}

async function incrementBudget(calls: number, cost: number): Promise<number> {
  await ensureLogDir();
  const today = new Date().toISOString().split('T')[0];
  const current = await getBudgetData();

  const updated: BudgetData = {
    date: today,
    count: current.date === today ? current.count + calls : calls,
    total_cost_usd: current.date === today ? current.total_cost_usd + cost : cost,
  };

  await fs.writeFile(CONFIG.budgetPath, JSON.stringify(updated, null, 2));
  return updated.count;
}

// ============================================================================
// Audit Logging (JSONL)
// ============================================================================

async function auditLog(entry: Record<string, unknown>) {
  await ensureLogDir();
  const line = `${JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
  })  }\n`;
  await fs.appendFile(CONFIG.logPath, line);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// ============================================================================
// Provider Implementations with Retry Logic
// ============================================================================

async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  model: ModelName
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error(`Timeout after ${CONFIG.timeout}ms`))
          );
        }),
      ]);

      clearTimeout(timeoutId);
      return result;
    } catch (error: any) {
      lastError = error;

      // Don't retry on auth errors
      if (error.message?.includes('API key') || error.message?.includes('401')) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      if (attempt < CONFIG.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError || new Error('Unknown error');
}

export interface ClaudeOptions {
  enableMemory?: boolean;
  enableContextClearing?: boolean;
  tenantId?: string;
  threadId?: string;
}

async function askClaude(prompt: string, options?: ClaudeOptions): Promise<AIResponse> {
  if (!anthropic) {
    return { model: 'claude', error: 'ANTHROPIC_API_KEY not configured' };
  }

  const startTime = Date.now();

  try {
    // Configure tools (native memory tool)
    const tools: Anthropic.Tool[] = [];
    if (options?.enableMemory) {
      tools.push({
        type: 'memory_20250818' as any, // Native memory tool
        name: 'memory',
      } as any);
    }

    // Configure context management (context clearing)
    const contextManagement = options?.enableContextClearing ? {
      edits: [
        {
          type: 'clear_tool_uses_20250919' as any,
          trigger: {
            type: 'input_tokens' as any,
            value: 5000,
          },
          keep: {
            type: 'tool_uses' as any,
            value: 3,
          },
          clear_at_least: {
            type: 'input_tokens' as any,
            value: 3000,
          },
        },
      ],
    } : undefined;

    const response = await withRetryAndTimeout(
      () => anthropic.messages.create({
        model: process.env["CLAUDE_MODEL"] ?? 'claude-3-5-sonnet-latest',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
        tools: tools.length > 0 ? tools : undefined,
        betas: options?.enableContextClearing ? ['context-management-2025-06-27' as any] : undefined,
        ...(contextManagement ? { context_management: contextManagement as any } : {}),
      } as any),
      'claude'
    );

    const text = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as any).text)
      .join('\n');

    const usage = {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    return {
      model: 'claude',
      text,
      usage,
      cost_usd: estimateCost('claude', usage),
      elapsed_ms: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      model: 'claude',
      error: error.message ?? 'Unknown error',
      elapsed_ms: Date.now() - startTime,
    };
  }
}

async function askGPT(prompt: string): Promise<AIResponse> {
  if (!openai) {
    return { model: 'gpt', error: 'OPENAI_API_KEY not configured' };
  }

  const startTime = Date.now();

  try {
    const response = await withRetryAndTimeout(
      () => openai.chat.completions.create({
        model: process.env["OPENAI_MODEL"] ?? 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 16384,
      }),
      'gpt'
    );

    const text = response.choices[0]?.message?.content ?? '';
    const usage = response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : undefined;

    return {
      model: 'gpt',
      text,
      usage,
      cost_usd: estimateCost('gpt', usage),
      elapsed_ms: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      model: 'gpt',
      error: error.message ?? 'Unknown error',
      elapsed_ms: Date.now() - startTime,
    };
  }
}

async function askGemini(prompt: string): Promise<AIResponse> {
  if (!gemini) {
    return { model: 'gemini', error: 'GOOGLE_API_KEY not configured' };
  }

  const startTime = Date.now();

  try {
    const model = gemini.getGenerativeModel({
      model: process.env["GEMINI_MODEL"] ?? 'gemini-1.5-flash',
    });

    const response = await withRetryAndTimeout(
      () => model.generateContent(prompt),
      'gemini'
    );

    const text = response.response.text();
    const metadata = response.response.usageMetadata;
    const usage = metadata
      ? {
          prompt_tokens: metadata.promptTokenCount ?? 0,
          completion_tokens: metadata.candidatesTokenCount ?? 0,
          total_tokens: metadata.totalTokenCount ?? 0,
        }
      : undefined;

    return {
      model: 'gemini',
      text,
      usage,
      cost_usd: estimateCost('gemini', usage),
      elapsed_ms: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      model: 'gemini',
      error: error.message ?? 'Unknown error',
      elapsed_ms: Date.now() - startTime,
    };
  }
}

async function askDeepSeek(prompt: string): Promise<AIResponse> {
  if (!deepseek) {
    return { model: 'deepseek', error: 'DEEPSEEK_API_KEY not configured' };
  }

  const startTime = Date.now();

  try {
    const response = await withRetryAndTimeout(
      () => deepseek.chat.completions.create({
        model: process.env["DEEPSEEK_MODEL"] ?? 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8192,
      }),
      'deepseek'
    );

    const text = response.choices[0]?.message?.content ?? '';
    const usage = response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : undefined;

    return {
      model: 'deepseek',
      text,
      usage,
      cost_usd: estimateCost('deepseek', usage),
      elapsed_ms: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      model: 'deepseek',
      error: error.message ?? 'Unknown error',
      elapsed_ms: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Public API
// ============================================================================

export async function askAllAIs({
  prompt,
  tags = [],
  models = ['claude', 'gpt', 'gemini', 'deepseek'],
}: AskArgs): Promise<AIResponse[]> {
  // Budget gate
  const currentCalls = await getTodaysCalls();
  const requiredCalls = models.length;

  if (currentCalls + requiredCalls > CONFIG.dailyCallLimit) {
    const msg = `Daily AI call limit reached (${currentCalls}/${CONFIG.dailyCallLimit})`;
    await auditLog({
      level: 'warn',
      event: 'budget_exceeded',
      limit: CONFIG.dailyCallLimit,
      current: currentCalls,
    });
    throw new Error(msg);
  }

  const promptHash = sha256(prompt);
  const limit = pLimit(CONFIG.concurrency);

  // Build tasks for selected models
  const modelFns: Record<ModelName, () => Promise<AIResponse>> = {
    claude: () => askClaude(prompt),
    gpt: () => askGPT(prompt),
    gemini: () => askGemini(prompt),
    deepseek: () => askDeepSeek(prompt),
  };

  const tasks = models.map((model) => limit(modelFns[model]));

  const startedAt = Date.now();
  const results = await Promise.all(tasks);
  const elapsedMs = Date.now() - startedAt;

  // Calculate metrics
  const successfulCalls = results.filter((r) => !r.error).length;
  const totalCost = results.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);

  // Update budget
  const newCount = await incrementBudget(successfulCalls, totalCost);

  // Audit log
  await auditLog({
    level: 'info',
    event: 'ask_all_ais',
    prompt_hash: promptHash,
    models: results.map((r) => r.model),
    tags,
    elapsed_ms: elapsedMs,
    calls_today: newCount,
    total_cost_usd: totalCost,
    successful: successfulCalls,
    failed: results.filter((r) => r.error).length,
  });

  return results;
}

export async function getUsageStats() {
  const budget = await getBudgetData();
  const today = new Date().toISOString().split('T')[0];

  if (budget.date !== today) {
    return {
      calls_today: 0,
      limit: CONFIG.dailyCallLimit,
      remaining: CONFIG.dailyCallLimit,
      total_cost_usd: 0,
    };
  }

  return {
    calls_today: budget.count,
    limit: CONFIG.dailyCallLimit,
    remaining: CONFIG.dailyCallLimit - budget.count,
    total_cost_usd: budget.total_cost_usd,
  };
}

// ============================================================================
// Collaboration Methods
// ============================================================================

export interface DebateResult {
  topic: string;
  ai1: ModelName;
  ai2: ModelName;
  opening: AIResponse;
  counter: AIResponse;
  totalCost: number;
  elapsedMs: number;
}

export interface ConsensusResult {
  question: string;
  options?: string;
  responses: AIResponse[];
  consensus: string;
  totalCost: number;
  elapsedMs: number;
}

export interface CollaborativeResult {
  problem: string;
  approach: 'sequential' | 'parallel';
  steps: AIResponse[];
  totalCost: number;
  elapsedMs: number;
}

/**
 * AI Debate - Have two AIs debate a topic
 */
export async function aiDebate({
  topic,
  ai1 = 'claude',
  ai2 = 'gpt',
  tags = [],
}: {
  topic: string;
  ai1?: ModelName;
  ai2?: ModelName;
  tags?: string[];
}): Promise<DebateResult> {
  const startTime = Date.now();

  // Opening argument from AI1
  const openingPrompt = `You are debating the topic: "${topic}". Present your argument in favor of your position. Be persuasive and use examples.`;

  // Counter-argument from AI2
  const counterPrompt = `You are debating the topic: "${topic}". Present a counter-argument to the previous position. Be persuasive and use examples.`;

  // Run both in parallel
  const [opening, counter] = await Promise.all([
    askAllAIs({ prompt: openingPrompt, models: [ai1], tags: [...tags, 'debate', 'opening'] }),
    askAllAIs({ prompt: counterPrompt, models: [ai2], tags: [...tags, 'debate', 'counter'] }),
  ]);

  const totalCost = (opening[0].cost_usd ?? 0) + (counter[0].cost_usd ?? 0);

  return {
    topic,
    ai1,
    ai2,
    opening: opening[0],
    counter: counter[0],
    totalCost,
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * AI Consensus - Get consensus from all AIs
 */
export async function aiConsensus({
  question,
  options,
  models = ['claude', 'gpt', 'gemini', 'deepseek'],
  tags = [],
}: {
  question: string;
  options?: string;
  models?: ModelName[];
  tags?: string[];
}): Promise<ConsensusResult> {
  const startTime = Date.now();

  let prompt = `Question: ${question}`;
  if (options) {
    prompt += `\nAvailable options: ${options}`;
  }
  prompt += '\n\nProvide your recommendation and reasoning. Be concise but thorough.';

  // Get all responses in parallel
  const responses = await askAllAIs({
    prompt,
    models,
    tags: [...tags, 'consensus'],
  });

  // Generate consensus summary
  const successfulResponses = responses.filter(r => !r.error);
  const totalCost = responses.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);

  let consensus = '';
  if (successfulResponses.length === 0) {
    consensus = '❌ No successful responses from AIs';
  } else if (successfulResponses.length === models.length) {
    consensus = `✅ All ${models.length} AIs provided recommendations`;
  } else {
    consensus = `⚠️ ${successfulResponses.length}/${models.length} AIs responded successfully`;
  }

  return {
    question,
    options,
    responses,
    consensus,
    totalCost,
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Collaborative Solve - Multiple AIs collaborate to solve a problem
 */
export async function collaborativeSolve({
  problem,
  approach = 'sequential',
  models = ['claude', 'gpt', 'gemini', 'deepseek'],
  tags = [],
}: {
  problem: string;
  approach?: 'sequential' | 'parallel';
  models?: ModelName[];
  tags?: string[];
}): Promise<CollaborativeResult> {
  const startTime = Date.now();
  const steps: AIResponse[] = [];

  if (approach === 'sequential') {
    // Sequential: Each AI builds on previous insights
    let cumulativeInsights = '';

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      let prompt = `Step ${i + 1}: Analyze this problem: ${problem}.`;

      if (cumulativeInsights) {
        prompt += `\n\nPrevious insights:\n${cumulativeInsights}`;
        prompt += '\n\nBuild on these insights and provide your unique perspective and solution approach.';
      } else {
        prompt += ' Provide your unique perspective and solution approach.';
      }

      const result = await askAllAIs({
        prompt,
        models: [model],
        tags: [...tags, 'collaborative', 'sequential', `step-${i + 1}`],
      });

      steps.push(result[0]);

      // Accumulate insights for next AI
      if (result[0].text) {
        cumulativeInsights += `\n\n## ${model.toUpperCase()}:\n${result[0].text}`;
      }
    }
  } else {
    // Parallel: All AIs analyze independently
    const results = await askAllAIs({
      prompt: `Solve this complex problem: ${problem}. Provide your unique perspective and solution approach.`,
      models,
      tags: [...tags, 'collaborative', 'parallel'],
    });

    steps.push(...results);
  }

  const totalCost = steps.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);

  return {
    problem,
    approach,
    steps,
    totalCost,
    elapsedMs: Date.now() - startTime,
  };
}

// ============================================================================
// Multi-AI Review Integration
// ============================================================================
import type { ChatMessage } from '../../tools/ai-review/OrchestratorAdapter'; // relative import from server/

// Ollama support (optional - dynamic require)
let __ollama__: any = null;
try {
   
  const Ollama = require('ollama');
  __ollama__ = new Ollama({ host: process.env["OLLAMA_HOST"] ?? 'http://localhost:11434' });
} catch { /* not installed */ }

async function askOllama(prompt: string, model: string) {
  if (!__ollama__) throw new Error('ollama not available - install via: npm install ollama');
  const started = Date.now();
  const res = await __ollama__.chat({ model, messages: [{ role: 'user', content: prompt }] });
  return {
    text: res?.message?.content ?? '',
    usage: {
      inputTokens: res?.prompt_eval_count ?? 0,
      outputTokens: res?.eval_count ?? 0,
      costUsd: 0
    },
    elapsed: Date.now() - started
  };
}

// HuggingFace (native fetch)
async function askHuggingFace(prompt: string, model: string) {
  const started = Date.now();
  const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env["HF_TOKEN"] ?? ''}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { max_new_tokens: 2048, temperature: 0.3, return_full_text: false }
    })
  });
  if (!r.ok) throw new Error(`HF ${model} -> ${r.status}`);
  const j = await r["json"]();
  const text = Array.isArray(j) ? j[0]?.generated_text : j?.generated_text ?? '';
  return {
    text,
    usage: {
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil((text?.length ?? 0) / 4),
      costUsd: 0.15
    },
    elapsed: Date.now() - started
  };
}

const __userText = (messages: ChatMessage[]) =>
  messages.find(m => m.role === 'user')?.content ?? '';

export const AIRouter = {
  async call(providerId: string, messages: ChatMessage[], _opts?: any) {
    const prompt = __userText(messages);

    if (providerId.startsWith('ollama:')) {
      const model = providerId.slice('ollama:'.length);
      return askOllama(prompt, model);
    }

    if (providerId.startsWith('hf:')) {
      const model = providerId.slice('hf:'.length);
      return askHuggingFace(prompt, model);
    }

    // Wire to your existing cloud functions (budgeting/retry already there)
    if (providerId === 'gpt' || providerId === 'gpt4') {
      const r = await askGPT(prompt);
      return { text: r.text ?? '', usage: { inputTokens: r.usage?.prompt_tokens, outputTokens: r.usage?.completion_tokens, costUsd: r.cost_usd } };
    }
    if (providerId === 'gemini') {
      const r = await askGemini(prompt);
      return { text: r.text ?? '', usage: { inputTokens: r.usage?.prompt_tokens, outputTokens: r.usage?.completion_tokens, costUsd: r.cost_usd } };
    }
    if (providerId === 'deepseek') {
      const r = await askDeepSeek(prompt);
      return { text: r.text ?? '', usage: { inputTokens: r.usage?.prompt_tokens, outputTokens: r.usage?.completion_tokens, costUsd: r.cost_usd } };
    }
    if (providerId === 'claude') {
      const r = await askClaude(prompt);
      return { text: r.text ?? '', usage: { inputTokens: r.usage?.prompt_tokens, outputTokens: r.usage?.completion_tokens, costUsd: r.cost_usd } };
    }

    throw new Error(`Unknown providerId: ${providerId}`);
  }
};

export default AIRouter;
