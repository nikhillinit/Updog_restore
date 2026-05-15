import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  askAllAIs,
  getUsageStats,
  aiDebate,
  aiConsensus,
  collaborativeSolve,
} from '../services/ai-orchestrator';

const router = Router();

// Request validation schema
const askSchema = z.object({
  prompt: z.string().min(1).max(10000),
  models: z.array(z.enum(['claude', 'gpt', 'gemini', 'deepseek'])).optional(),
  tags: z.array(z.string()).optional(),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function respondWithRequestError(res: Response, error: unknown): boolean {
  if (!(error instanceof z.ZodError)) {
    return false;
  }

  res.status(400).json({
    success: false,
    error: 'Invalid request',
    details: error.errors,
  });
  return true;
}

function respondWithServerError(res: Response, error: unknown, includeSuccess = true) {
  const payload = {
    ...(includeSuccess ? { success: false } : {}),
    error: getErrorMessage(error),
  };

  res.status(500).json(payload);
}

// POST /api/ai/ask - Query multiple AI models
router['post']('/ask', async (req: Request, res: Response) => {
  try {
    const { prompt, models, tags } = askSchema.parse(req.body);

    const results = await askAllAIs({
      prompt,
      ...(models && { models }),
      ...(tags && { tags }),
    });

    res.json({
      success: true,
      results,
    });
  } catch (error: unknown) {
    if (respondWithRequestError(res, error)) {
      return;
    }
    respondWithServerError(res, error);
  }
});

// GET /api/ai/usage - Get current usage statistics
router['get']('/usage', async (req: Request, res: Response) => {
  try {
    const stats = await getUsageStats();
    res.json(stats);
  } catch (error: unknown) {
    respondWithServerError(res, error, false);
  }
});

// POST /api/ai/debate - Two AIs debate a topic
const debateSchema = z.object({
  topic: z.string().min(1).max(500),
  ai1: z.enum(['claude', 'gpt', 'gemini', 'deepseek']).optional(),
  ai2: z.enum(['claude', 'gpt', 'gemini', 'deepseek']).optional(),
  tags: z.array(z.string()).optional(),
});

router['post']('/debate', async (req: Request, res: Response) => {
  try {
    const { topic, ai1, ai2, tags } = debateSchema.parse(req.body);
    const result = await aiDebate({
      topic,
      ...(ai1 && { ai1 }),
      ...(ai2 && { ai2 }),
      ...(tags && { tags }),
    });
    res.json({ success: true, result });
  } catch (error: unknown) {
    if (respondWithRequestError(res, error)) {
      return;
    }
    respondWithServerError(res, error);
  }
});

// POST /api/ai/consensus - Get consensus from all AIs
const consensusSchema = z.object({
  question: z.string().min(1).max(1000),
  options: z.string().optional(),
  models: z.array(z.enum(['claude', 'gpt', 'gemini', 'deepseek'])).optional(),
  tags: z.array(z.string()).optional(),
});

router['post']('/consensus', async (req: Request, res: Response) => {
  try {
    const { question, options, models, tags } = consensusSchema.parse(req.body);
    const result = await aiConsensus({
      question,
      ...(options && { options }),
      ...(models && { models }),
      ...(tags && { tags }),
    });
    res.json({ success: true, result });
  } catch (error: unknown) {
    if (respondWithRequestError(res, error)) {
      return;
    }
    respondWithServerError(res, error);
  }
});

// POST /api/ai/collaborate - Multiple AIs collaborate to solve a problem
const collaborateSchema = z.object({
  problem: z.string().min(1).max(2000),
  approach: z.enum(['sequential', 'parallel']).optional(),
  models: z.array(z.enum(['claude', 'gpt', 'gemini', 'deepseek'])).optional(),
  tags: z.array(z.string()).optional(),
});

router['post']('/collaborate', async (req: Request, res: Response) => {
  try {
    const { problem, approach, models, tags } = collaborateSchema.parse(req.body);
    const result = await collaborativeSolve({
      problem,
      ...(approach && { approach }),
      ...(models && { models }),
      ...(tags && { tags }),
    });
    res.json({ success: true, result });
  } catch (error: unknown) {
    if (respondWithRequestError(res, error)) {
      return;
    }
    respondWithServerError(res, error);
  }
});

export default router;
