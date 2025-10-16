import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  askAllAIs,
  getUsageStats,
  aiDebate,
  aiConsensus,
  collaborativeSolve
} from '../services/ai-orchestrator';
import { spreadIfDefined } from '@shared/lib/ts/spreadIfDefined';

const router = Router();

// Request validation schema
const askSchema = z.object({
  prompt: z.string().min(1).max(10000),
  models: z.array(z.enum(['claude', 'gpt', 'gemini', 'deepseek'])).optional(),
  tags: z.array(z.string()).optional(),
});

// POST /api/ai/ask - Query multiple AI models
router.post('/ask', async (req: Request, res: Response) => {
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
const debateSchema = z.object({
  topic: z.string().min(1).max(500),
  ai1: z.enum(['claude', 'gpt', 'gemini', 'deepseek']).optional(),
  ai2: z.enum(['claude', 'gpt', 'gemini', 'deepseek']).optional(),
  tags: z.array(z.string()).optional(),
});

router.post('/debate', async (req: Request, res: Response) => {
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
const consensusSchema = z.object({
  question: z.string().min(1).max(1000),
  options: z.string().optional(),
  models: z.array(z.enum(['claude', 'gpt', 'gemini', 'deepseek'])).optional(),
  tags: z.array(z.string()).optional(),
});

router.post('/consensus', async (req: Request, res: Response) => {
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
const collaborateSchema = z.object({
  problem: z.string().min(1).max(2000),
  approach: z.enum(['sequential', 'parallel']).optional(),
  models: z.array(z.enum(['claude', 'gpt', 'gemini', 'deepseek'])).optional(),
  tags: z.array(z.string()).optional(),
});

router.post('/collaborate', async (req: Request, res: Response) => {
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

export default router;
