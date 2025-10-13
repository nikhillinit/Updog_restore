#!/usr/bin/env node
/**
 * Interactive CLI for Multi-AI Consensus Workflows
 *
 * Usage: node scripts/test-consensus-workflows.mjs [workflow]
 *
 * Workflows:
 * - strategy     : Multi-round strategy analysis (MetaGPT-inspired)
 * - code-review  : Code review consensus
 * - adr          : Architecture Decision Record generation
 * - bug-analysis : Root cause analysis
 * - perf         : Performance optimization strategy
 * - security     : Security audit consensus
 * - all          : Run all workflows (demo mode)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

// ============================================================================
// Workflow Definitions
// ============================================================================

const WORKFLOWS = {
  strategy: {
    name: 'CI/CD Strategy Analysis',
    endpoint: '/api/strategy/analyze',
    getPayload: () => ({
      strategy: readFileSync(join(__dirname, '../AI_SOLUTIONS_SUMMARY.md'), 'utf-8'),
      debateTopics: [
        'Week 1 CI target: 50% vs 70%',
        'Renovate: pause vs security-only',
        'Monitoring: daily vs hourly',
        'Quarantine: nightly vs weekly'
      ]
    }),
    estimatedDuration: '2-3 minutes'
  },

  'code-review': {
    name: 'Code Review Consensus',
    endpoint: '/api/workflows/code-review',
    getPayload: () => ({
      code: `
export async function calculateMetrics(data) {
  const result = {
    total: 0,
    average: 0,
    max: 0
  };

  for (const item of data) {
    result.total += item.value;
    if (item.value > result.max) {
      result.max = item.value;
    }
  }

  result.average = result.total / data.length;

  return result;
}
`,
      language: 'typescript',
      context: 'Utility function for metrics aggregation',
      prDescription: 'Add metrics calculation function for dashboard'
    }),
    estimatedDuration: '30-60 seconds'
  },

  adr: {
    name: 'Architecture Decision Record',
    endpoint: '/api/workflows/adr',
    getPayload: () => ({
      title: 'Adopt PostgreSQL for primary database',
      context: `
We need a reliable, ACID-compliant database for financial data with strong JSON support.
Current stack: Node.js/TypeScript backend, React frontend.
Scale: 10K users, 100K transactions/day initially.
Team: 3 developers familiar with SQL databases.
`,
      proposedSolution: `
Use PostgreSQL 15 with:
- TimescaleDB extension for time-series data
- JSONB columns for flexible schema fields
- Connection pooling via PgBouncer
- Read replicas for reporting queries
`,
      alternatives: [
        'MySQL 8.0 - Familiar but weaker JSON support',
        'MongoDB - Flexible schema but no ACID guarantees',
        'CockroachDB - Distributed but more expensive'
      ],
      constraints: [
        'Must support ACID transactions',
        'Budget: $500/month max',
        'Team must ramp up in 2 weeks',
        'Must integrate with existing Node.js ORM (Drizzle)'
      ]
    }),
    estimatedDuration: '60-90 seconds'
  },

  'bug-analysis': {
    name: 'Bug Root Cause Analysis',
    endpoint: '/api/workflows/bug-analysis',
    getPayload: () => ({
      description: 'Application crashes when user submits form with empty email field',
      stackTrace: `
TypeError: Cannot read property 'toLowerCase' of undefined
  at validateEmail (utils/validation.ts:42)
  at FormComponent.handleSubmit (components/Form.tsx:156)
  at HTMLFormElement.callCallback (react-dom.js:3945)
  at Object.invokeGuardedCallbackDev (react-dom.js:3994)
`,
      reproSteps: [
        'Navigate to /signup',
        'Fill in username field only',
        'Leave email field empty',
        'Click "Submit" button',
        'Application crashes with TypeError'
      ],
      affectedCode: `
function validateEmail(email) {
  const normalized = email.toLowerCase().trim();
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalized);
}
`,
      recentChanges: 'Added email validation 2 days ago in commit abc123'
    }),
    estimatedDuration: '45-75 seconds'
  },

  perf: {
    name: 'Performance Optimization Strategy',
    endpoint: '/api/workflows/perf-optimization',
    getPayload: () => ({
      currentMetrics: [
        { metric: 'Page Load Time', current: '3.5s', target: '1.5s' },
        { metric: 'Time to Interactive', current: '5.2s', target: '2.5s' },
        { metric: 'First Contentful Paint', current: '2.1s', target: '1.0s' },
        { metric: 'Largest Contentful Paint', current: '4.8s', target: '2.5s' }
      ],
      profilerData: `
Main thread analysis:
- Parsing/compilation: 800ms (20%)
- JavaScript execution: 2800ms (70%)
- Rendering: 400ms (10%)

Top bottlenecks:
1. Large bundle size: 1.2MB (uncompressed)
2. Heavy computation in ReserveEngine: 600ms
3. Synchronous API calls blocking UI: 400ms
4. Unoptimized re-renders in dashboard: 300ms
`,
      constraints: [
        'No budget for CDN or premium hosting',
        'Must stay on current Vite + React stack',
        'Cannot break existing functionality',
        'Team bandwidth: 40 hours this month'
      ],
      budget: '40 developer hours over 3 weeks'
    }),
    estimatedDuration: '60-90 seconds'
  },

  security: {
    name: 'Security Audit Consensus',
    endpoint: '/api/workflows/security-audit',
    getPayload: () => ({
      component: 'User authentication and session management',
      threatModel: `
OWASP Top 10 focus areas:
- A01:2021 – Broken Access Control
- A02:2021 – Cryptographic Failures
- A07:2021 – Identification and Authentication Failures

Attack scenarios:
1. JWT token tampering
2. Session fixation
3. Credential stuffing
4. Privilege escalation
`,
      recentChanges: `
- Added JWT refresh token endpoint
- Implemented role-based access control (RBAC)
- Switched from bcrypt to argon2 for password hashing
`,
      complianceRequirements: [
        'SOC 2 Type II',
        'GDPR (European users)',
        'PCI DSS Level 2 (payment processing)'
      ]
    }),
    estimatedDuration: '60-120 seconds'
  }
};

// ============================================================================
// CLI Helpers
// ============================================================================

function printBanner() {
  console.log('\n' + '='.repeat(80));
  console.log('  Multi-AI Consensus Workflows - Interactive Testing');
  console.log('='.repeat(80) + '\n');
}

function printWorkflowMenu() {
  console.log('Available workflows:\n');
  Object.entries(WORKFLOWS).forEach(([key, workflow]) => {
    console.log(`  ${key.padEnd(15)} - ${workflow.name} (~${workflow.estimatedDuration})`);
  });
  console.log(`  all            - Run all workflows (demo mode)`);
  console.log(`\nUsage: node scripts/test-consensus-workflows.mjs [workflow]\n`);
}

async function runWorkflow(key, workflow) {
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`🎭 Running: ${workflow.name}`);
  console.log(`   Endpoint: ${workflow.endpoint}`);
  console.log(`   Estimated: ${workflow.estimatedDuration}`);
  console.log(`${'─'.repeat(80)}\n`);

  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}${workflow.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflow.getPayload())
    });

    const data = await response.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.ok) {
      console.error(`❌ Workflow failed (${response.status})`);
      console.error(`   Error: ${data.error}`);
      console.error(`   Message: ${data.message}`);
      if (data.details) {
        console.error(`   Details:`, data.details);
      }
      return false;
    }

    console.log(`✅ Workflow completed in ${duration}s\n`);

    // Print workflow-specific results
    if (key === 'strategy') {
      printStrategyResults(data);
    } else if (key === 'code-review') {
      printCodeReviewResults(data);
    } else if (key === 'adr') {
      printADRResults(data);
    } else if (key === 'bug-analysis') {
      printBugAnalysisResults(data);
    } else if (key === 'perf') {
      printPerfResults(data);
    } else if (key === 'security') {
      printSecurityResults(data);
    }

    return true;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ Workflow failed after ${duration}s`);
    console.error(`   Error: ${error.message}`);

    if (error.cause) {
      console.error(`   Cause: ${error.cause.message}`);
    }

    // Check if server is running
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
      console.error(`\n⚠️  Server not responding at ${BASE_URL}`);
      console.error(`   Make sure the server is running: npm run dev\n`);
    }

    return false;
  }
}

// ============================================================================
// Result Printers
// ============================================================================

function printStrategyResults(data) {
  const { analysis, metrics } = data;

  console.log('📊 Metrics:');
  console.log(`   Total Agents: ${metrics.totalAgents}`);
  console.log(`   Total Rounds: ${metrics.totalRounds}`);
  console.log(`   AI Calls Used: ${metrics.aiCallsUsed}`);
  console.log(`   Duration: ${(metrics.durationMs / 1000).toFixed(1)}s\n`);

  if (analysis.consensus) {
    const { unanimous, majority, split } = analysis.consensus;

    console.log('🤝 Consensus Summary:');
    console.log(`   Unanimous decisions: ${unanimous.length}`);
    console.log(`   Majority consensus: ${majority.length}`);
    console.log(`   Split decisions: ${split.length}\n`);

    if (unanimous.length > 0) {
      console.log('✅ Unanimous Decisions:');
      unanimous.slice(0, 3).forEach(d => {
        console.log(`   • ${d.decision.substring(0, 80)}...`);
      });
      console.log();
    }
  }
}

function printCodeReviewResults(data) {
  const { result, metrics } = data;

  console.log('📊 Review Summary:');
  console.log(`   Overall Rating: ${result.consensus.overallRating}/10`);
  console.log(`   Decision: ${result.consensus.shouldMerge ? '✅ APPROVE' : '❌ REQUEST CHANGES'}`);
  console.log(`   Agents Reviewed: ${metrics.agentsUsed}`);
  console.log(`   Duration: ${(metrics.durationMs / 1000).toFixed(1)}s\n`);

  if (result.consensus.requiredChanges.length > 0) {
    console.log('🔧 Required Changes:');
    result.consensus.requiredChanges.slice(0, 3).forEach(change => {
      console.log(`   • ${change}`);
    });
    console.log();
  }

  if (result.consensus.optionalImprovements.length > 0) {
    console.log('💡 Optional Improvements:');
    result.consensus.optionalImprovements.slice(0, 3).forEach(improvement => {
      console.log(`   • ${improvement}`);
    });
    console.log();
  }
}

function printADRResults(data) {
  const { result, metrics } = data;

  console.log('📊 ADR Summary:');
  console.log(`   Confidence: ${result.consensus.confidence}%`);
  console.log(`   Dissenting Opinions: ${metrics.dissentCount}`);
  console.log(`   Duration: ${(metrics.durationMs / 1000).toFixed(1)}s\n`);

  console.log('📝 Decision:');
  console.log(`   ${result.decision.substring(0, 200)}...\n`);

  if (result.consequences.positive.length > 0) {
    console.log('✅ Positive Consequences:');
    result.consequences.positive.slice(0, 3).forEach(pro => {
      console.log(`   • ${pro}`);
    });
    console.log();
  }

  if (result.consequences.risks.length > 0) {
    console.log('⚠️  Risks to Monitor:');
    result.consequences.risks.slice(0, 3).forEach(risk => {
      console.log(`   • ${risk}`);
    });
    console.log();
  }
}

function printBugAnalysisResults(data) {
  const { result, metrics } = data;

  console.log('📊 Analysis Summary:');
  console.log(`   Confidence: ${result.confidence}%`);
  console.log(`   Agents Analyzed: ${metrics.agentsUsed}`);
  console.log(`   Duration: ${(metrics.durationMs / 1000).toFixed(1)}s\n`);

  console.log('🔍 Root Cause:');
  console.log(`   ${result.rootCause}\n`);

  if (result.consensus.contributingFactors.length > 0) {
    console.log('🧩 Contributing Factors:');
    result.consensus.contributingFactors.slice(0, 3).forEach(factor => {
      console.log(`   • ${factor}`);
    });
    console.log();
  }

  if (result.consensus.recommendedFix) {
    console.log('🔧 Recommended Fix:');
    console.log(`   ${result.consensus.recommendedFix.substring(0, 200)}...\n`);
  }
}

function printPerfResults(data) {
  const { result, metrics } = data;

  console.log('📊 Optimization Summary:');
  console.log(`   Quick Wins: ${metrics.quickWins}`);
  console.log(`   Long-term Investments: ${metrics.longTermInvestments}`);
  console.log(`   Duration: ${(metrics.durationMs / 1000).toFixed(1)}s\n`);

  if (result.strategy.phase1.length > 0) {
    console.log('🚀 Phase 1 (This Week):');
    result.strategy.phase1.slice(0, 3).forEach(action => {
      console.log(`   • ${action}`);
    });
    console.log();
  }

  if (result.strategy.phase2.length > 0) {
    console.log('📅 Phase 2 (This Month):');
    result.strategy.phase2.slice(0, 3).forEach(action => {
      console.log(`   • ${action}`);
    });
    console.log();
  }
}

function printSecurityResults(data) {
  const { result, metrics } = data;

  console.log('📊 Security Audit Summary:');
  console.log(`   Overall Risk: ${result.overallRisk}`);
  console.log(`   Critical Issues: ${metrics.criticalIssues}`);
  console.log(`   Compliance Gaps: ${metrics.complianceGaps}`);
  console.log(`   Duration: ${(metrics.durationMs / 1000).toFixed(1)}s\n`);

  if (result.consensus.criticalIssues.length > 0) {
    console.log('🚨 Critical Issues:');
    result.consensus.criticalIssues.slice(0, 3).forEach(issue => {
      console.log(`   • ${issue}`);
    });
    console.log();
  }

  if (result.consensus.recommendedActions.length > 0) {
    console.log('🔒 Recommended Actions:');
    result.consensus.recommendedActions.slice(0, 3).forEach(action => {
      console.log(`   • ${action}`);
    });
    console.log();
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  printBanner();

  const workflow = process.argv[2];

  if (!workflow) {
    printWorkflowMenu();
    process.exit(0);
  }

  if (workflow === 'all') {
    console.log('🎬 Running all workflows (demo mode)...\n');

    let successCount = 0;
    let failCount = 0;

    for (const [key, wf] of Object.entries(WORKFLOWS)) {
      const success = await runWorkflow(key, wf);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Wait 2s between workflows
      if (key !== Object.keys(WORKFLOWS)[Object.keys(WORKFLOWS).length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`  Summary: ${successCount} succeeded, ${failCount} failed`);
    console.log('='.repeat(80) + '\n');

    process.exit(failCount > 0 ? 1 : 0);
  }

  const selectedWorkflow = WORKFLOWS[workflow];

  if (!selectedWorkflow) {
    console.error(`❌ Unknown workflow: ${workflow}\n`);
    printWorkflowMenu();
    process.exit(1);
  }

  const success = await runWorkflow(workflow, selectedWorkflow);
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
