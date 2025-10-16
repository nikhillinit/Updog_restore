import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  askAllAIs,
  getUsageStats,
  aiDebate,
  aiConsensus,
  collaborativeSolve
} from '../services/ai-orchestrator';
import {
  buildProposalWorkflow,
  validateTopic,
  validateOptions,
  type ComplexityLevel,
} from '../services/proposal-workflow';
import { spreadIfDefined } from '@shared/lib/ts/spreadIfDefined';

const router = Router();

// ============================================================================
// Rate Limiting Configuration (P1 Security Control)
// ============================================================================

/**
 * Proposal Rate Limiter - Most Expensive Endpoint
 *
 * Why 10/hour:
 * - Proposals can cost $0.01-$0.50 each (complex/critical tier)
 * - 10/hour = max $5/hour = $120/day worst case
 * - Prevents "denial-of-wallet" attacks
 * - Prevents data exfiltration via repeated queries
 *
 * P1 Control: Mitigates compromised account / malicious insider risk
 */
const proposalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // Max 10 requests per hour
  message: {
    success: false,
    error: 'Rate limit exceeded for proposal generation',
    limit: 10,
    windowMinutes: 60,
    retryAfter: 'Wait 1 hour before creating more proposals',
  },
  standardHeaders: true, // Return RateLimit-* headers
  legacyHeaders: false,
  // Use user ID if available, fallback to IP
  keyGenerator: (req) => {
    return (req as any).user?.id?.toString() || req.ip || 'anonymous';
  },
  // Skip rate limiting in test environment
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * General AI Query Limiter - Less Expensive
 *
 * Why 30/hour:
 * - Ask/debate/consensus typically cost $0.01-$0.05
 * - 30/hour = max $1.50/hour = $36/day worst case
 * - More generous for exploratory queries
 */
const generalAILimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: {
    success: false,
    error: 'Rate limit exceeded for AI queries',
    limit: 30,
    windowMinutes: 60,
    retryAfter: 'Wait before making more AI requests',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id?.toString() || req.ip || 'anonymous';
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * Collaboration Limiter - Most Expensive Multi-Model
 *
 * Why 5/hour:
 * - Collaboration involves 3-4 models in sequence/parallel
 * - Can cost $0.10-$1.00 per request
 * - 5/hour = max $5/hour = $120/day worst case
 */
const collaborationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Rate limit exceeded for AI collaboration',
    limit: 5,
    windowMinutes: 60,
    retryAfter: 'Collaboration is resource-intensive. Wait 1 hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id?.toString() || req.ip || 'anonymous';
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

// ============================================================================
// Request Validation Schemas
// ============================================================================

const askSchema = z.object({
  prompt: z.string().min(1).max(10000),
  models: z.array(z.enum(['claude', 'gpt', 'gemini', 'deepseek'])).optional(),
  tags: z.array(z.string()).optional(),
});

const debateSchema = z.object({
  topic: z.string().min(1).max(500),
  ai1: z.enum(['claude', 'gpt', 'gemini', 'deepseek']).optional(),
  ai2: z.enum(['claude', 'gpt', 'gemini', 'deepseek']).optional(),
  tags: z.array(z.string()).optional(),
});

const consensusSchema = z.object({
  question: z.string().min(1).max(1000),
  options: z.string().optional(),
  models: z.array(z.enum(['claude', 'gpt', 'gemini', 'deepseek'])).optional(),
  tags: z.array(z.string()).optional(),
});

const collaborateSchema = z.object({
  problem: z.string().min(1).max(2000),
  approach: z.enum(['sequential', 'parallel']).optional(),
  models: z.array(z.enum(['claude', 'gpt', 'gemini', 'deepseek'])).optional(),
  tags: z.array(z.string()).optional(),
});

const proposalSchema = z.object({
  topic: z.string().min(1).max(500),
  complexity: z.enum(['simple', 'standard', 'complex', 'critical']).optional(),
  maxIterations: z.number().int().min(1).max(10).optional(),
  convergenceThreshold: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Routes
// ============================================================================

// POST /api/ai/ask - Query multiple AI models
router.post('/ask', generalAILimiter, async (req: Request, res: Response) => {
  try {
    const { prompt, models, tags } = askSchema.parse(req.body);

    const results = await askAllAIs({
      prompt,
      ...spreadIfDefined('models', models),
      ...spreadIfDefined('tags', tags),
    });

    res.json({
      success: true,
      results,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message ?? 'Unknown error',
    });
  }
});

// GET /api/ai/usage - Get current usage statistics
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const stats = await getUsageStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({
      error: error.message ?? 'Unknown error',
    });
  }
});

// POST /api/ai/debate - Two AIs debate a topic
router.post('/debate', generalAILimiter, async (req: Request, res: Response) => {
  try {
    const { topic, ai1, ai2, tags } = debateSchema.parse(req.body);
    const result = await aiDebate({
      topic,
      ...spreadIfDefined('ai1', ai1),
      ...spreadIfDefined('ai2', ai2),
      ...spreadIfDefined('tags', tags),
    });
    res.json({ success: true, result });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      error: error.message ?? 'Unknown error',
    });
  }
});

// POST /api/ai/consensus - Get consensus from all AIs
router.post('/consensus', generalAILimiter, async (req: Request, res: Response) => {
  try {
    const { question, options, models, tags } = consensusSchema.parse(req.body);
    const result = await aiConsensus({
      question,
      ...spreadIfDefined('options', options),
      ...spreadIfDefined('models', models),
      ...spreadIfDefined('tags', tags),
    });
    res.json({ success: true, result });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      error: error.message ?? 'Unknown error',
    });
  }
});

// POST /api/ai/collaborate - Multiple AIs collaborate to solve a problem
router.post('/collaborate', collaborationLimiter, async (req: Request, res: Response) => {
  try {
    const { problem, approach, models, tags } = collaborateSchema.parse(req.body);
    const result = await collaborativeSolve({
      problem,
      ...spreadIfDefined('approach', approach),
      ...spreadIfDefined('models', models),
      ...spreadIfDefined('tags', tags),
    });
    res.json({ success: true, result });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: error.errors,
      });
    }
    res.status(500).json({
      success: false,
      error: error.message ?? 'Unknown error',
    });
  }
});

// ============================================================================
// POST /api/ai/proposals - Generate Investment Proposal (NEW)
// ============================================================================

router.post('/proposals', proposalLimiter, async (req: Request, res: Response) => {
  try {
    const { topic, complexity, maxIterations, convergenceThreshold, metadata } = proposalSchema.parse(req.body);

    // Validate inputs (throws on error)
    validateTopic(topic);
    validateOptions({ complexity, maxIterations, convergenceThreshold });

    // Get user ID from request (if authenticated)
    const userId = (req as any).user?.id?.toString();

    // Execute workflow
    const result = await buildProposalWorkflow(topic, {
      userId,
      complexity: complexity as ComplexityLevel | undefined,
      maxIterations,
      convergenceThreshold,
      metadata,
    });

    // Return result
    res.json({
      success: true,
      proposal: result.proposal,
      metadata: {
        workflowId: result.workflowId,
        complexity: result.complexity,
        iterations: result.iterations,
        converged: result.converged,
        convergenceScore: result.convergenceScore,
        totalCostUsd: result.totalCostUsd,
        elapsedMs: result.elapsedMs,
        idempotencyKey: result.idempotencyKey,
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: error.errors,
      });
    }

    // Validation errors
    if (error.message?.includes('Topic') || error.message?.includes('must be')) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message ?? 'Unknown error',
    });
  }
});

export default router;
