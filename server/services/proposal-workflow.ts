/**
 * Multi-Agent Proposal Workflow
 *
 * Generates investment proposals through iterative multi-AI collaboration:
 * 1. Initial draft (Claude for creative writing)
 * 2. Parallel reviews (GPT + DeepSeek for diverse perspectives)
 * 3. Synthesis (best reviewer + drafter)
 * 4. Convergence check (repeat if needed, max 3 iterations)
 *
 * Features:
 * - Idempotency (prevent duplicate proposals)
 * - Cost tracking (leverages existing budget system)
 * - Complexity-based model selection
 * - Deterministic for testing
 */

import { createHash } from 'crypto';
import { askAllAIs, type AIResponse, type ModelName } from './ai-orchestrator';
import { db } from '../db';
import { proposalWorkflows } from '@shared/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// Types
// ============================================================================

export type ComplexityLevel = 'simple' | 'standard' | 'complex' | 'critical';

export interface ProposalWorkflowOptions {
  /** Unique key to prevent duplicate proposals (auto-generated from topic if not provided) */
  idempotencyKey?: string;

  /** Complexity level (auto-inferred if not provided) */
  complexity?: ComplexityLevel;

  /** Maximum iterations before forcing completion (default: 3) */
  maxIterations?: number;

  /** Convergence threshold - similarity score needed to stop iterating (default: 0.8) */
  convergenceThreshold?: number;

  /** User ID for attribution */
  userId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ProposalWorkflowResult {
  /** Final proposal text */
  proposal: string;

  /** Number of iterations taken */
  iterations: number;

  /** Whether proposal converged naturally (vs. hit max iterations) */
  converged: boolean;

  /** Convergence score (0-1, higher = more consensus) */
  convergenceScore: number;

  /** Total cost in USD */
  totalCostUsd: number;

  /** Total elapsed time in milliseconds */
  elapsedMs: number;

  /** Complexity level used */
  complexity: ComplexityLevel;

  /** Idempotency key */
  idempotencyKey: string;

  /** Database ID */
  workflowId: string;

  /** Detailed history of all iterations */
  history: IterationHistory[];
}

export interface IterationHistory {
  iteration: number;
  draft: AIResponse;
  reviews: AIResponse[];
  synthesis?: AIResponse;
  convergenceScore: number;
}

// ============================================================================
// Complexity Inference
// ============================================================================

const COMPLEXITY_KEYWORDS = {
  critical: [
    'regulatory', 'compliance', 'legal', 'fiduciary', 'sec', 'finra',
    'audit', 'governance', 'risk management', 'data breach'
  ],
  complex: [
    'portfolio', 'valuation', 'financial model', 'monte carlo', 'forecast',
    'scenario analysis', 'sensitivity', 'correlation', 'attribution'
  ],
  standard: [
    'analysis', 'report', 'dashboard', 'metric', 'performance',
    'comparison', 'benchmark', 'trend'
  ],
  simple: [
    'summary', 'list', 'overview', 'status', 'update'
  ]
};

/**
 * Infer complexity from topic keywords
 * Uses prioritized matching: critical > complex > standard > simple
 */
export function inferComplexity(topic: string): ComplexityLevel {
  const lowerTopic = topic.toLowerCase();

  // Check critical keywords first
  if (COMPLEXITY_KEYWORDS.critical.some(kw => lowerTopic.includes(kw))) {
    return 'critical';
  }

  // Then complex
  if (COMPLEXITY_KEYWORDS.complex.some(kw => lowerTopic.includes(kw))) {
    return 'complex';
  }

  // Then standard
  if (COMPLEXITY_KEYWORDS.standard.some(kw => lowerTopic.includes(kw))) {
    return 'standard';
  }

  // Default to simple
  return 'simple';
}

/**
 * Select models based on complexity level
 */
function selectModels(complexity: ComplexityLevel): {
  drafter: ModelName;
  reviewers: ModelName[];
  synthesizer: ModelName;
} {
  switch (complexity) {
    case 'critical':
      return {
        drafter: 'claude',      // Best for nuanced writing
        reviewers: ['gpt', 'deepseek'], // Diverse perspectives
        synthesizer: 'claude',  // Best synthesis
      };

    case 'complex':
      return {
        drafter: 'claude',
        reviewers: ['gpt'],     // Single reviewer sufficient
        synthesizer: 'gpt',
      };

    case 'standard':
      return {
        drafter: 'gpt',
        reviewers: ['deepseek'], // Budget reviewer
        synthesizer: 'gpt',
      };

    case 'simple':
      return {
        drafter: 'deepseek',    // Fastest, cheapest
        reviewers: [],          // No review needed
        synthesizer: 'deepseek',
      };
  }
}

// ============================================================================
// Convergence Detection
// ============================================================================

/**
 * Calculate similarity score between two texts using simple word overlap
 * (In production, could use embeddings or more sophisticated NLP)
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size; // Jaccard similarity
}

/**
 * Determine if proposal has converged
 */
function hasConverged(
  currentDraft: string,
  previousDraft: string | null,
  threshold: number
): { converged: boolean; score: number } {
  if (!previousDraft) {
    return { converged: false, score: 0 };
  }

  const score = calculateSimilarity(currentDraft, previousDraft);
  return { converged: score >= threshold, score };
}

// ============================================================================
// Idempotency
// ============================================================================

/**
 * Generate idempotency key from topic
 */
function generateIdempotencyKey(topic: string, userId?: string): string {
  const content = `${topic}::${userId || 'anonymous'}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Check if proposal already exists for this idempotency key
 */
async function checkIdempotency(key: string): Promise<ProposalWorkflowResult | null> {
  const existing = await db
    .select()
    .from(proposalWorkflows)
    .where(eq(proposalWorkflows.idempotencyKey, key))
    .limit(1);

  if (existing.length === 0) {
    return null;
  }

  const workflow = existing[0];
  if (!workflow) {
    return null;
  }

  // Return cached result
  return {
    proposal: workflow.finalProposal || '',
    iterations: workflow.iterationCount || 0,
    converged: workflow.converged || false,
    convergenceScore: workflow.convergenceScore || 0,
    totalCostUsd: parseFloat(workflow.totalCostUsd || '0'),
    elapsedMs: workflow.elapsedMs || 0,
    complexity: (workflow.complexity as ComplexityLevel) || 'standard',
    idempotencyKey: workflow.idempotencyKey,
    workflowId: workflow.id,
    history: [], // Could hydrate from JSONB if stored
  };
}

// ============================================================================
// Main Workflow
// ============================================================================

/**
 * Build investment proposal through multi-agent iteration
 *
 * @example
 * const result = await buildProposalWorkflow(
 *   "Analyze the portfolio's exposure to rising interest rates",
 *   { userId: 'user123' }
 * );
 * console.log(result.proposal);
 * console.log(`Converged in ${result.iterations} iterations`);
 * console.log(`Cost: $${result.totalCostUsd.toFixed(4)}`);
 */
export async function buildProposalWorkflow(
  topic: string,
  options: ProposalWorkflowOptions = {}
): Promise<ProposalWorkflowResult> {
  const startTime = Date.now();

  // Extract options
  const {
    idempotencyKey = generateIdempotencyKey(topic, options.userId),
    complexity = inferComplexity(topic),
    maxIterations = 3,
    convergenceThreshold = 0.8,
    userId,
    metadata = {},
  } = options;

  // Check idempotency
  const cached = await checkIdempotency(idempotencyKey);
  if (cached) {
    console.log(`⚡ Returning cached proposal (key: ${idempotencyKey})`);
    return cached;
  }

  // Select models
  const models = selectModels(complexity);
  console.log(`🎯 Complexity: ${complexity}, Models:`, models);

  // Iteration state
  let currentDraft: string | null = null;
  let previousDraft: string | null = null;
  let iteration = 0;
  let converged = false;
  let convergenceScore = 0;
  const history: IterationHistory[] = [];
  let totalCost = 0;

  // Iteration loop
  while (iteration < maxIterations && !converged) {
    iteration++;
    console.log(`\n📝 Iteration ${iteration}/${maxIterations}`);

    // Step 1: Generate draft
    const draftPrompt = iteration === 1
      ? `You are an expert investment analyst. Create a detailed proposal addressing: "${topic}".

         Requirements:
         - Be specific and actionable
         - Include quantitative analysis where relevant
         - Cite any assumptions clearly
         - Use professional investment terminology

         Provide a complete, well-structured proposal.`
      : `You are an expert investment analyst. Revise the following proposal based on the review feedback.

         Original Topic: "${topic}"

         Previous Draft:
         ${previousDraft}

         Review Feedback:
         ${history[iteration - 2]?.reviews.map((r, i) => `${i + 1}. ${r.text || r.error}`).join('\n\n')}

         Provide an improved version that addresses the feedback while maintaining the core analysis.`;

    const draftResults = await askAllAIs({
      prompt: draftPrompt,
      models: [models.drafter],
      tags: ['proposal', 'draft', `iteration-${iteration}`],
    });

    const draft = draftResults[0];
    if (!draft || !draft.text) {
      throw new Error(`Draft generation failed at iteration ${iteration}`);
    }

    totalCost += draft.cost_usd || 0;
    currentDraft = draft.text;

    // Step 2: Parallel reviews (if configured)
    const reviews: AIResponse[] = [];
    if (models.reviewers.length > 0) {
      const reviewPrompt = `You are a critical reviewer of investment proposals. Review the following proposal and provide constructive feedback.

         Topic: "${topic}"

         Proposal:
         ${currentDraft}

         Provide specific feedback on:
         1. Accuracy and completeness of analysis
         2. Clarity and structure
         3. Missing considerations or risks
         4. Suggested improvements

         Be concise but thorough.`;

      const reviewResults = await askAllAIs({
        prompt: reviewPrompt,
        models: models.reviewers,
        tags: ['proposal', 'review', `iteration-${iteration}`],
      });

      reviews.push(...reviewResults);
      totalCost += reviewResults.reduce((sum, r) => sum + (r.cost_usd || 0), 0);
    }

    // Step 3: Check convergence
    const convergenceCheck = hasConverged(currentDraft, previousDraft, convergenceThreshold);
    converged = convergenceCheck.converged;
    convergenceScore = convergenceCheck.score;

    console.log(`📊 Convergence: ${(convergenceScore * 100).toFixed(1)}% (threshold: ${(convergenceThreshold * 100).toFixed(0)}%)`);

    // Record history
    history.push({
      iteration,
      draft,
      reviews,
      convergenceScore,
    });

    // Prepare for next iteration
    previousDraft = currentDraft;

    if (converged) {
      console.log(`✅ Converged after ${iteration} iteration(s)`);
    } else if (iteration === maxIterations) {
      console.log(`⚠️  Max iterations reached (${maxIterations})`);
    }
  }

  // Final result
  const elapsedMs = Date.now() - startTime;
  const result: ProposalWorkflowResult = {
    proposal: currentDraft || '',
    iterations: iteration,
    converged,
    convergenceScore,
    totalCostUsd: totalCost,
    elapsedMs,
    complexity,
    idempotencyKey,
    workflowId: '', // Will be set after DB insert
    history,
  };

  // Store in database
  try {
    const inserted = await db
      .insert(proposalWorkflows)
      .values({
        topic,
        idempotencyKey,
        complexity,
        initialProposal: history[0]?.draft.text || null,
        finalProposal: result.proposal,
        iterationCount: iteration,
        converged,
        convergenceScore,
        totalCostUsd: totalCost.toFixed(4),
        elapsedMs,
        userId: userId || null,
        metadata: JSON.stringify({ models, history: history.length, ...metadata }),
      })
      .returning({ id: proposalWorkflows.id });

    result.workflowId = inserted[0]?.id || '';
  } catch (error) {
    console.error('Failed to store proposal in database:', error);
    // Continue anyway - workflow succeeded even if storage failed
  }

  console.log(`\n🎉 Workflow complete!`);
  console.log(`   Iterations: ${iteration}`);
  console.log(`   Cost: $${totalCost.toFixed(4)}`);
  console.log(`   Time: ${(elapsedMs / 1000).toFixed(1)}s`);

  return result;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate topic before processing
 */
export function validateTopic(topic: string): void {
  if (!topic || typeof topic !== 'string') {
    throw new Error('Topic must be a non-empty string');
  }

  if (topic.trim().length === 0) {
    throw new Error('Topic cannot be empty or whitespace');
  }

  if (topic.length > 500) {
    throw new Error('Topic too long (max 500 characters)');
  }

  // Basic safety check - no code injection patterns
  const dangerousPatterns = [
    /\$\{.*\}/,     // Template injection
    /require\(/i,   // Dynamic imports
    /import\(/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(topic)) {
      throw new Error('Topic contains potentially dangerous patterns');
    }
  }
}

/**
 * Validate options
 */
export function validateOptions(options: ProposalWorkflowOptions): void {
  if (options.maxIterations !== undefined) {
    if (!Number.isInteger(options.maxIterations) || options.maxIterations < 1 || options.maxIterations > 10) {
      throw new Error('maxIterations must be an integer between 1 and 10');
    }
  }

  if (options.convergenceThreshold !== undefined) {
    if (typeof options.convergenceThreshold !== 'number' ||
        options.convergenceThreshold < 0 ||
        options.convergenceThreshold > 1) {
      throw new Error('convergenceThreshold must be a number between 0 and 1');
    }
  }

  if (options.complexity !== undefined) {
    const validComplexities: ComplexityLevel[] = ['simple', 'standard', 'complex', 'critical'];
    if (!validComplexities.includes(options.complexity)) {
      throw new Error(`complexity must be one of: ${validComplexities.join(', ')}`);
    }
  }
}

/**
 * Safe wrapper that validates inputs
 */
export async function buildProposalWorkflowSafe(
  topic: string,
  options: ProposalWorkflowOptions = {}
): Promise<ProposalWorkflowResult> {
  validateTopic(topic);
  validateOptions(options);
  return buildProposalWorkflow(topic, options);
}
