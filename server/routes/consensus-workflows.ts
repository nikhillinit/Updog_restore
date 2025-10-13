/**
 * Consensus Workflows API Routes
 *
 * Multi-agent workflows for common development scenarios
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  reviewCodeWithConsensus,
  generateADRWithConsensus,
  analyzeBugWithConsensus,
  generatePerfOptimizationStrategy,
  performSecurityAudit,
  type CodeReviewInput,
  type ADRInput,
  type BugAnalysisInput,
  type PerfOptimizationInput,
  type SecurityAuditInput
} from '../services/consensus-workflows.js';
import {
  iterativeRefinement,
  multiAgentDebate,
  type RefinementConfig,
  type DebateConfig
} from '../services/debate-refinement.js';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const codeReviewSchema = z.object({
  code: z.string().min(10).max(50000),
  language: z.string(),
  context: z.string().optional(),
  prDescription: z.string().optional()
});

const adrSchema = z.object({
  title: z.string().min(5).max(200),
  context: z.string().min(20),
  proposedSolution: z.string().min(20),
  alternatives: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional()
});

const bugAnalysisSchema = z.object({
  description: z.string().min(10),
  stackTrace: z.string().optional(),
  reproSteps: z.array(z.string()).optional(),
  affectedCode: z.string().optional(),
  recentChanges: z.string().optional()
});

const perfOptimizationSchema = z.object({
  currentMetrics: z.array(z.object({
    metric: z.string(),
    current: z.string(),
    target: z.string()
  })),
  profilerData: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  budget: z.string().optional()
});

const securityAuditSchema = z.object({
  component: z.string(),
  threatModel: z.string().optional(),
  recentChanges: z.string().optional(),
  complianceRequirements: z.array(z.string()).optional()
});

// ============================================================================
// Workflow 1: Code Review Consensus
// ============================================================================

/**
 * POST /api/workflows/code-review
 *
 * Multi-agent code review with consensus
 *
 * Example:
 * {
 *   "code": "function add(a, b) { return a + b; }",
 *   "language": "javascript",
 *   "context": "Utility function for calculator",
 *   "prDescription": "Add addition function"
 * }
 */
router.post('/code-review', async (req, res) => {
  const startTime = Date.now();

  try {
    const input = codeReviewSchema.parse(req.body) as CodeReviewInput;

    console.log(`[Code Review] Starting review (${input.language}, ${input.code.length} chars)`);

    const result = await reviewCodeWithConsensus(input);

    const durationMs = Date.now() - startTime;

    res.json({
      success: true,
      result,
      metrics: {
        durationMs,
        agentsUsed: Object.keys(result.byAgent).length,
        overallRating: result.consensus.overallRating,
        shouldMerge: result.consensus.shouldMerge
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

    console.error('[Code Review] Error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Review failed'
    });
  }
});

// ============================================================================
// Workflow 2: Architecture Decision Records
// ============================================================================

/**
 * POST /api/workflows/adr
 *
 * Generate ADR with multi-agent consensus
 *
 * Example:
 * {
 *   "title": "Use PostgreSQL for primary database",
 *   "context": "Need reliable RDBMS for financial data",
 *   "proposedSolution": "PostgreSQL 15 with TimescaleDB extension",
 *   "alternatives": ["MySQL", "MongoDB"],
 *   "constraints": ["Must support ACID", "Budget: $500/month"]
 * }
 */
router.post('/adr', async (req, res) => {
  const startTime = Date.now();

  try {
    const input = adrSchema.parse(req.body) as ADRInput;

    console.log(`[ADR] Generating ADR: ${input.title}`);

    const result = await generateADRWithConsensus(input);

    const durationMs = Date.now() - startTime;

    res.json({
      success: true,
      result,
      metrics: {
        durationMs,
        confidence: result.consensus.confidence,
        dissentCount: result.consensus.dissent.length
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

    console.error('[ADR] Error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'ADR generation failed'
    });
  }
});

// ============================================================================
// Workflow 3: Bug Root Cause Analysis
// ============================================================================

/**
 * POST /api/workflows/bug-analysis
 *
 * Multi-agent root cause analysis
 *
 * Example:
 * {
 *   "description": "Application crashes when user submits form",
 *   "stackTrace": "Error: Cannot read property 'value' of null\n  at ...",
 *   "reproSteps": ["Navigate to /form", "Fill in fields", "Click submit"],
 *   "affectedCode": "const value = form.querySelector('input').value;"
 * }
 */
router.post('/bug-analysis', async (req, res) => {
  const startTime = Date.now();

  try {
    const input = bugAnalysisSchema.parse(req.body) as BugAnalysisInput;

    console.log(`[Bug Analysis] Analyzing: ${input.description.substring(0, 50)}...`);

    const result = await analyzeBugWithConsensus(input);

    const durationMs = Date.now() - startTime;

    res.json({
      success: true,
      result,
      metrics: {
        durationMs,
        confidence: result.confidence,
        agentsUsed: Object.keys(result.byAgent).length
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

    console.error('[Bug Analysis] Error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Analysis failed'
    });
  }
});

// ============================================================================
// Workflow 4: Performance Optimization Strategy
// ============================================================================

/**
 * POST /api/workflows/perf-optimization
 *
 * Generate performance optimization strategy
 *
 * Example:
 * {
 *   "currentMetrics": [
 *     { "metric": "Page Load Time", "current": "3.5s", "target": "1.5s" },
 *     { "metric": "Time to Interactive", "current": "5.2s", "target": "2.5s" }
 *   ],
 *   "profilerData": "Main thread blocked 70% of time by heavy computations",
 *   "constraints": ["No budget for CDN", "Must stay on current hosting"],
 *   "budget": "40 hours of dev time"
 * }
 */
router.post('/perf-optimization', async (req, res) => {
  const startTime = Date.now();

  try {
    const input = perfOptimizationSchema.parse(req.body) as PerfOptimizationInput;

    console.log(`[Perf Optimization] Analyzing ${input.currentMetrics.length} metrics`);

    const result = await generatePerfOptimizationStrategy(input);

    const durationMs = Date.now() - startTime;

    res.json({
      success: true,
      result,
      metrics: {
        durationMs,
        quickWins: result.consensus.quickWins.length,
        longTermInvestments: result.consensus.longTermInvestments.length
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

    console.error('[Perf Optimization] Error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Optimization strategy failed'
    });
  }
});

// ============================================================================
// Workflow 5: Security Audit
// ============================================================================

/**
 * POST /api/workflows/security-audit
 *
 * Multi-agent security audit
 *
 * Example:
 * {
 *   "component": "User authentication system",
 *   "threatModel": "OWASP Top 10 focused on auth bypass",
 *   "recentChanges": "Added JWT token refresh endpoint",
 *   "complianceRequirements": ["SOC2", "GDPR"]
 * }
 */
router.post('/security-audit', async (req, res) => {
  const startTime = Date.now();

  try {
    const input = securityAuditSchema.parse(req.body) as SecurityAuditInput;

    console.log(`[Security Audit] Auditing: ${input.component}`);

    const result = await performSecurityAudit(input);

    const durationMs = Date.now() - startTime;

    res.json({
      success: true,
      result,
      metrics: {
        durationMs,
        overallRisk: result.overallRisk,
        criticalIssues: result.consensus.criticalIssues.length,
        complianceGaps: result.consensus.complianceGaps.length
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

    console.error('[Security Audit] Error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Security audit failed'
    });
  }
});

// ============================================================================
// Workflow 6: Iterative Refinement
// ============================================================================

/**
 * POST /api/workflows/refine
 *
 * Iterative refinement with proposal-critique-revise cycle
 *
 * Example:
 * {
 *   "problem": "Design a rate limiting algorithm for API endpoints",
 *   "context": "100K requests/day, need to prevent abuse while allowing bursts",
 *   "config": {
 *     "iterations": 3,
 *     "mainModel": "anthropic",
 *     "criticModel": "openai",
 *     "judgeModel": "google"
 *   }
 * }
 */
router.post('/refine', async (req, res) => {
  const startTime = Date.now();

  try {
    const { problem, context, config } = req.body;

    if (!problem || !context) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        details: 'problem and context are required'
      });
    }

    console.log(`[Refinement] Starting iterative refinement (${config?.iterations || 5} rounds)`);

    const result = await iterativeRefinement(problem, context, config);

    const durationMs = Date.now() - startTime;

    res.json({
      success: true,
      result,
      metrics: {
        durationMs,
        totalIterations: result.metrics.totalIterations,
        improvementRate: result.metrics.improvementRate,
        consensusReached: result.metrics.consensusReached
      }
    });
  } catch (error: any) {
    console.error('[Refinement] Error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Refinement failed'
    });
  }
});

// ============================================================================
// Workflow 7: Multi-Agent Debate
// ============================================================================

/**
 * POST /api/workflows/debate
 *
 * Multi-agent debate with opposing viewpoints
 *
 * Example:
 * {
 *   "topic": "Should we adopt microservices architecture?",
 *   "context": "Current monolith: 50K LOC, 5 developers, $10K/mo hosting",
 *   "config": {
 *     "rounds": 3,
 *     "agents": [
 *       { "name": "Proponent", "model": "anthropic", "perspective": "Argue FOR microservices" },
 *       { "name": "Opponent", "model": "openai", "perspective": "Argue AGAINST microservices" },
 *       { "name": "Pragmatist", "model": "google", "perspective": "Provide balanced cost-benefit analysis" }
 *     ],
 *     "judgeModel": "deepseek"
 *   }
 * }
 */
router.post('/debate', async (req, res) => {
  const startTime = Date.now();

  try {
    const { topic, context, config } = req.body;

    if (!topic || !context) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        details: 'topic and context are required'
      });
    }

    console.log(`[Debate] Starting multi-agent debate (${config?.rounds || 3} rounds)`);

    const result = await multiAgentDebate(topic, context, config);

    const durationMs = Date.now() - startTime;

    res.json({
      success: true,
      result,
      metrics: {
        durationMs,
        totalRounds: result.rounds.length,
        consensusReached: result.consensus.reached,
        winner: result.judgement.winner
      }
    });
  } catch (error: any) {
    console.error('[Debate] Error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Debate failed'
    });
  }
});

// ============================================================================
// List Available Workflows
// ============================================================================

/**
 * GET /api/workflows
 *
 * List all available consensus workflows
 */
router.get('/', (req, res) => {
  const workflows = [
    {
      name: 'code-review',
      endpoint: '/api/workflows/code-review',
      description: 'Multi-agent code review with consensus (Architect, QA, DevOps, PM)',
      inputSchema: 'CodeReviewInput',
      agents: ['architect', 'qa', 'devops', 'projectManager'],
      estimatedDuration: '30-60s',
      complexity: 'medium'
    },
    {
      name: 'adr',
      endpoint: '/api/workflows/adr',
      description: 'Generate Architecture Decision Records with multi-agent consensus',
      inputSchema: 'ADRInput',
      agents: ['architect', 'projectManager', 'devops', 'qa', 'securityEngineer'],
      estimatedDuration: '60-90s',
      complexity: 'high'
    },
    {
      name: 'bug-analysis',
      endpoint: '/api/workflows/bug-analysis',
      description: 'Root cause analysis with consensus from multiple perspectives',
      inputSchema: 'BugAnalysisInput',
      agents: ['architect', 'qa', 'devops', 'projectManager'],
      estimatedDuration: '45-75s',
      complexity: 'medium'
    },
    {
      name: 'perf-optimization',
      endpoint: '/api/workflows/perf-optimization',
      description: 'Generate phased performance optimization strategy',
      inputSchema: 'PerfOptimizationInput',
      agents: ['architect', 'devops', 'qa', 'projectManager'],
      estimatedDuration: '60-90s',
      complexity: 'high'
    },
    {
      name: 'security-audit',
      endpoint: '/api/workflows/security-audit',
      description: 'Comprehensive security audit with consensus',
      inputSchema: 'SecurityAuditInput',
      agents: ['securityEngineer', 'architect', 'devops', 'qa'],
      estimatedDuration: '60-120s',
      complexity: 'high'
    },
    {
      name: 'refine',
      endpoint: '/api/workflows/refine',
      description: 'Iterative refinement with proposal-critique-revise cycles',
      inputSchema: 'RefinementInput',
      agents: ['main', 'critic', 'judge'],
      estimatedDuration: '90-180s',
      complexity: 'very high',
      customizable: true
    },
    {
      name: 'debate',
      endpoint: '/api/workflows/debate',
      description: 'Multi-agent debate with opposing viewpoints',
      inputSchema: 'DebateInput',
      agents: ['configurable'],
      estimatedDuration: '60-150s',
      complexity: 'high',
      customizable: true
    }
  ];

  res.json({
    success: true,
    workflows,
    total: workflows.length
  });
});

export default router;
