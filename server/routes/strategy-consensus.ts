/**
 * Strategy Consensus API
 *
 * Multi-agent analysis endpoint for CI/CD strategy evaluation
 */

import { Router } from 'express';
import { z } from 'zod';
import { analyzeStrategy, AGENT_ROLES } from '../services/metagpt-consensus.js';

const router = Router();

// Request validation
const strategyAnalysisSchema = z.object({
  strategy: z.string().min(100).max(50000), // Strategy document
  debateTopics: z.array(z.string()).optional(), // Specific topics to debate
  agents: z.array(z.enum(['projectManager', 'architect', 'devops', 'qa'])).optional() // Which agents to use
});

/**
 * POST /api/strategy/analyze
 *
 * Multi-round agent analysis of CI/CD strategy
 *
 * Request body:
 * {
 *   "strategy": "Your comprehensive CI/CD strategy document...",
 *   "debateTopics": ["Week 1 CI target", "Renovate strategy", ...],
 *   "agents": ["projectManager", "architect", "devops", "qa"]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "analysis": {
 *     "round1": { messages: [...], summary: "..." },
 *     "round2": { messages: [...], summary: "..." },
 *     "round3": { messages: [...], summary: "..." },
 *     "consensus": {
 *       "unanimous": [...],
 *       "majority": [...],
 *       "split": [...],
 *       "dissent": [...]
 *     }
 *   },
 *   "metrics": {
 *     "totalAgents": 4,
 *     "totalRounds": 4,
 *     "aiCallsUsed": 16,
 *     "durationMs": 45000
 *   }
 * }
 */
router.post('/analyze', async (req, res) => {
  const startTime = Date.now();

  try {
    const { strategy, debateTopics } = strategyAnalysisSchema.parse(req.body);

    console.log(`[Strategy Analysis] Starting multi-agent analysis (${strategy.length} chars)`);

    // Run full 4-round analysis
    const analysis = await analyzeStrategy(strategy, debateTopics);

    const durationMs = Date.now() - startTime;

    console.log(`[Strategy Analysis] Complete in ${durationMs}ms`);

    res.json({
      success: true,
      analysis,
      metrics: {
        totalAgents: Object.keys(AGENT_ROLES).length,
        totalRounds: 4,
        aiCallsUsed:
          analysis.round1.messages.length +
          analysis.round2.messages.length +
          analysis.round3.messages.length +
          1, // consensus synthesis
        durationMs
      }
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: error.errors
      });
    }

    console.error('[Strategy Analysis] Error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Analysis failed'
    });
  }
});

/**
 * GET /api/strategy/agents
 *
 * List available agent roles and their configuration
 */
router.get('/agents', (req, res) => {
  const agents = Object.entries(AGENT_ROLES).map(([key, config]) => ({
    id: key,
    name: config.name,
    provider: config.provider,
    focus: config.focus,
    reviewCriteria: config.reviewCriteria
  }));

  res.json({
    success: true,
    agents,
    total: agents.length
  });
});

/**
 * POST /api/strategy/quick-consensus
 *
 * Simplified 2-round consensus (no cross-review or debate)
 * Faster, uses fewer AI calls (~6 vs 16)
 */
router.post('/quick-consensus', async (req, res) => {
  const startTime = Date.now();

  try {
    const { strategy, debateTopics } = strategyAnalysisSchema.parse(req.body);

    console.log(`[Quick Consensus] Starting simplified analysis`);

    // Import consensus functions
    const {
      round1_independentAnalysis,
      round4_buildConsensus
    } = await import('../services/metagpt-consensus.js');

    // Only run Round 1 (independent) and Round 4 (consensus)
    const round1 = await round1_independentAnalysis(strategy);

    // Build consensus directly from Round 1
    const consensus = await round4_buildConsensus(
      round1,
      { round: 2, messages: [], summary: 'Skipped' }, // Empty round 2
      { round: 3, messages: [], summary: 'Skipped' }  // Empty round 3
    );

    const durationMs = Date.now() - startTime;

    console.log(`[Quick Consensus] Complete in ${durationMs}ms`);

    res.json({
      success: true,
      analysis: {
        round1,
        consensus
      },
      metrics: {
        totalAgents: Object.keys(AGENT_ROLES).length,
        totalRounds: 2, // Quick mode
        aiCallsUsed: round1.messages.length + 1, // +1 for consensus
        durationMs
      }
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: error.errors
      });
    }

    console.error('[Quick Consensus] Error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Analysis failed'
    });
  }
});

export default router;
