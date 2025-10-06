#!/usr/bin/env node
/**
 * Multi-AI Development Plan Optimization
 *
 * Three-round orchestration:
 * 1. Scrutiny: All AIs review and optimize the development plan
 * 2. Debate: Top 2 approaches debate merits
 * 3. Sequential Planning: Winner gets detailed implementation plan
 */

// Load environment variables FIRST - before any imports that use them
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { promises as fs } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  console.error('❌ Failed to load .env.local:', result.error);
  process.exit(1);
}

console.log('🔑 Environment loaded from .env.local');
console.log('   ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Missing');
console.log('   OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Missing');
console.log('   GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? '✓ Set' : '✗ Missing');
console.log('   DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? '✓ Set' : '✗ Missing');

// Now dynamically import orchestrator AFTER env is loaded
const { askAllAIs } = await import('../server/services/ai-orchestrator.js');

const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'ai-optimization');

// Ensure output directory exists
await fs.mkdir(OUTPUT_DIR, { recursive: true });

console.log('🤖 MULTI-AI DEVELOPMENT PLAN OPTIMIZATION');
console.log('='.repeat(80));
console.log('');

// ============================================================================
// ROUND 1: SCRUTINY - Get optimization proposals from all AIs
// ============================================================================

const scrutinyPrompt = `
PROJECT CONTEXT: Press On Ventures Fund Modeling Platform
- TypeScript/React/Node.js venture capital fund modeling SaaS
- Internal tool for GP fund scenario modeling and analysis
- Current Status: 38 TypeScript compilation errors, missing dependencies, unconfigured environment

TECHNICAL DETAILS:
- Stack: React 18, Vite 5.4.11, TypeScript 5.9, Express, PostgreSQL, Redis
- Build System: Sidecar dependency isolation in tools_local/
- Environment: Windows 10, Node 20.19.0, PowerShell
- Docker Compose: PostgreSQL + Redis available
- Recent work: AI orchestrator, production-grade fund schemas, sidecar system

BLOCKING ISSUES:
1. TypeScript Errors (38): Missing exports, type mismatches, import path errors
   - client/src/adapters/kpiAdapter.ts (5 errors)
   - client/src/components/charts/* (3 errors)
   - client/src/hooks/useInvalidateQueries.ts (3 errors)
   - client/src/lib/* (4 errors)
   - client/src/pages/WaterfallStep.tsx (6 errors)
   - client/src/utils/export-reserves.ts, exporters.ts (xlsx imports)
   - client/src/workers/simulation.worker.ts (missing export)

2. Missing Dependencies:
   - cross-env (blocks test execution)
   - eslint in sidecar (blocks linting)
   - xlsx package (blocks export features)
   - Sidecar runtime: rollup, yargs, concurrently

3. Environment Not Configured:
   - .env.local has placeholder DATABASE_URL
   - REDIS_URL points to Upstash (needs local or memory://)
   - Database schema not pushed

CURRENT 3-PHASE PLAN (90 min total):

Phase 1: Dependency Resolution (20 min)
- Run node scripts/ensure-complete-local.mjs to fix sidecar
- Install cross-env@7, xlsx@0.18.5, @types/xlsx
- Verify with npm run doctor

Phase 2: TypeScript Error Resolution (40 min)
- Fix all 38 TypeScript errors systematically
- Add missing exports to shared contracts
- Fix type mismatches in chart components
- Resolve TanStack Query readonly array issues
- Fix waterfall policy discriminated unions
- Incremental verification: npm run check:client after each file

Phase 3: Environment & Testing (30 min)
- Update .env.local: DATABASE_URL=postgres://postgres:dev@localhost:5432/updog_dev
- Update .env.local: REDIS_URL=memory:// (or start Docker Redis)
- Start infrastructure: docker-compose -f docker-compose.dev.yml up -d
- Push schema: npm run db:push
- Full validation: npm run check && npm run lint && npm test && npm run dev
- Manual testing checklist in browser

OPTIMIZATION CRITERIA:
1. **Speed to Testable State** - How fast can internal QA start testing?
2. **Risk Mitigation** - What can go wrong? Fallback strategies?
3. **Parallel Execution** - What can run simultaneously?
4. **Critical Path** - What's blocking vs. nice-to-have?
5. **Validation Checkpoints** - How do we know each phase succeeded?
6. **Effort vs. Value** - What gives best ROI for internal tool?

YOUR TASK:
Provide an OPTIMIZED development plan that:
- Minimizes time to first testable state
- Identifies true blockers vs. deferrable work
- Suggests parallel execution opportunities
- Includes clear success criteria per phase
- Provides rollback/fallback strategies
- Is tailored for internal SaaS tool (not production release)

Format your response as:
1. **Key Insights** - What's the critical path analysis?
2. **Optimized Plan** - Phases with time estimates
3. **Validation Strategy** - How to verify success
4. **Risk Mitigation** - Fallbacks if things fail
5. **Rationale** - Why this approach is optimal
`;

console.log('📊 ROUND 1: SCRUTINY - Requesting optimization proposals...\n');

const round1Results = await askAllAIs({
  prompt: scrutinyPrompt,
  tags: ['development-plan', 'optimization', 'round-1-scrutiny'],
  models: ['claude', 'gpt', 'gemini', 'deepseek']
});

// Save Round 1 results
const round1Output = {
  timestamp: new Date().toISOString(),
  round: 'scrutiny',
  results: round1Results
};

await fs.writeFile(
  path.join(OUTPUT_DIR, '01-scrutiny-proposals.json'),
  JSON.stringify(round1Output, null, 2)
);

console.log('\n✅ Round 1 Complete - Proposals saved\n');
console.log('='.repeat(80));

// Display proposals
for (const result of round1Results) {
  console.log(`\n🤖 ${result.model.toUpperCase()} PROPOSAL:`);
  console.log('-'.repeat(80));
  if (result.error) {
    console.log(`❌ Error: ${result.error}`);
  } else {
    console.log(result.text.substring(0, 500) + '...\n[Full text in 01-scrutiny-proposals.json]');
  }
}

// ============================================================================
// ROUND 2: DEBATE - Top 2 approaches debate
// ============================================================================

console.log('\n\n📊 ROUND 2: DEBATE - Analyzing proposals to identify top 2 approaches...\n');

// Identify which AIs provided the most contrasting approaches
const successfulProposals = round1Results.filter(r => !r.error && r.text);

if (successfulProposals.length < 2) {
  console.error('❌ Not enough successful proposals for debate');
  process.exit(1);
}

// For simplicity, use Claude vs GPT (typically most comprehensive)
const claudeProposal = successfulProposals.find(r => r.model === 'claude');
const gptProposal = successfulProposals.find(r => r.model === 'gpt');

if (!claudeProposal || !gptProposal) {
  console.log('⚠️ Using first two available proposals for debate');
}

const proposal1 = claudeProposal || successfulProposals[0];
const proposal2 = gptProposal || successfulProposals[1];

const debatePrompt = `
You are participating in a structured debate about the optimal development plan for getting a TypeScript/React fund modeling SaaS to a testable state.

PROPOSAL 1 (${proposal1.model}):
${proposal1.text}

PROPOSAL 2 (${proposal2.model}):
${proposal2.text}

DEBATE STRUCTURE:
You will argue for ONE of these proposals. Defend its merits and critique the other approach.

Consider:
- Time to first testable state
- Risk of approach failing
- Maintainability of shortcuts taken
- Value for internal tool vs. production release
- Psychological factors (quick wins vs. solid foundation)
- Team productivity (parallel work vs. blocking dependencies)

Present your argument in this format:
1. **Position Statement** - Which proposal you support and why
2. **Key Strengths** - 3 strongest points of your proposal
3. **Opponent's Weaknesses** - 3 critical flaws in other approach
4. **Rebuttals** - Address predictable counterarguments
5. **Conclusion** - Final verdict on why your approach wins

Be specific, cite concrete examples from the proposals, and focus on practical outcomes.
`;

console.log(`🥊 Debate: ${proposal1.model.toUpperCase()} vs ${proposal2.model.toUpperCase()}\n`);

// Run debate in parallel
const debateResults = await askAllAIs({
  prompt: debatePrompt,
  tags: ['development-plan', 'debate', 'round-2'],
  models: ['claude', 'gpt']
});

// Save Round 2 results
const round2Output = {
  timestamp: new Date().toISOString(),
  round: 'debate',
  proposals: {
    proposal1: { model: proposal1.model, text: proposal1.text },
    proposal2: { model: proposal2.model, text: proposal2.text }
  },
  debate: debateResults
};

await fs.writeFile(
  path.join(OUTPUT_DIR, '02-debate-results.json'),
  JSON.stringify(round2Output, null, 2)
);

console.log('\n✅ Round 2 Complete - Debate saved\n');
console.log('='.repeat(80));

// Display debate
for (const result of debateResults) {
  console.log(`\n🎤 ${result.model.toUpperCase()} ARGUMENT:`);
  console.log('-'.repeat(80));
  if (result.error) {
    console.log(`❌ Error: ${result.error}`);
  } else {
    console.log(result.text.substring(0, 600) + '...\n[Full text in 02-debate-results.json]');
  }
}

// ============================================================================
// ROUND 3: JUDGE & SEQUENTIAL PLANNING - Determine winner and create plan
// ============================================================================

console.log('\n\n📊 ROUND 3: JUDGING & SEQUENTIAL PLANNING...\n');

// First, have Gemini judge the debate
const judgePrompt = `
You are judging a debate between two development plan proposals.

PROPOSAL 1 (${proposal1.model}):
${proposal1.text.substring(0, 2000)}

PROPOSAL 2 (${proposal2.model}):
${proposal2.text.substring(0, 2000)}

DEBATE ARGUMENTS:
${debateResults.map(r => `\n${r.model}: ${r.text?.substring(0, 1000) || 'N/A'}`).join('\n---\n')}

YOUR TASK:
1. Evaluate both proposals on:
   - Time efficiency to testable state
   - Risk management
   - Practicality for internal tool
   - Technical soundness
   - Maintainability

2. Declare a winner and explain why
3. Identify best elements from BOTH proposals to combine

Format:
**WINNER: [Proposal 1 or 2]**

**Rationale:** [Why this proposal wins]

**Best Elements to Combine:**
- From winning proposal: [key strengths to keep]
- From losing proposal: [valuable ideas to incorporate]

**Final Recommendation:** [Synthesized optimal approach]
`;

const judgeResult = await askAllAIs({
  prompt: judgePrompt,
  tags: ['development-plan', 'judge', 'round-3'],
  models: ['gemini']
});

console.log('\n⚖️ JUDGE VERDICT:\n');
console.log(judgeResult[0]?.text || judgeResult[0]?.error);

// Now create detailed implementation plan with sequential AI collaboration
const planningPrompt = `
Based on the winning approach from the debate, create a DETAILED IMPLEMENTATION PLAN.

WINNING APPROACH:
${judgeResult[0]?.text || proposal1.text}

CONTEXT REMINDER:
- Windows environment, PowerShell available
- Sidecar system in tools_local/
- 38 TypeScript errors, missing dependencies, unconfigured environment
- Goal: Internal testing-ready state

Create a step-by-step implementation plan with:

1. **Pre-Flight Checklist** - Verify before starting
2. **Phase Breakdown** - Numbered phases with exact commands
3. **Validation Points** - After each step, how to verify success
4. **Troubleshooting Guide** - Common failures and fixes
5. **Success Criteria** - Final checklist with expected outcomes
6. **Estimated Timeline** - Realistic time per phase

Format each step as:
## Step X: [Name] (Y min)
**Goal:** [What this achieves]
**Commands:**
\`\`\`powershell
[exact commands to run]
\`\`\`
**Validation:** [How to verify success]
**If Failed:** [Fallback action]

Make it executable - someone should be able to copy/paste commands and succeed.
`;

console.log('\n\n📝 SEQUENTIAL PLANNING - Each AI contributes to implementation plan...\n');

// Sequential planning: each AI builds on previous
const planners = ['claude', 'gpt', 'deepseek'];
const sequentialPlans = [];

for (const planner of planners) {
  console.log(`\n🤖 ${planner.toUpperCase()} is planning...`);

  const previousPlans = sequentialPlans.map(p =>
    `\n--- ${p.model} PLAN ---\n${p.text?.substring(0, 1500) || 'N/A'}`
  ).join('\n');

  const enhancedPrompt = planningPrompt + (previousPlans ?
    `\n\nPREVIOUS AI PLANS (build on these, add details they missed):\n${previousPlans}`
    : ''
  );

  const planResult = await askAllAIs({
    prompt: enhancedPrompt,
    tags: ['development-plan', 'implementation', `round-3-${planner}`],
    models: [planner]
  });

  sequentialPlans.push(planResult[0]);
  console.log(`✅ ${planner.toUpperCase()} plan complete`);
}

// Save Round 3 results
const round3Output = {
  timestamp: new Date().toISOString(),
  round: 'planning',
  judge: judgeResult[0],
  sequential_plans: sequentialPlans
};

await fs.writeFile(
  path.join(OUTPUT_DIR, '03-implementation-plan.json'),
  JSON.stringify(round3Output, null, 2)
);

console.log('\n\n✅ Round 3 Complete - Implementation plans saved\n');
console.log('='.repeat(80));

// ============================================================================
// FINAL SYNTHESIS
// ============================================================================

console.log('\n\n📄 FINAL SYNTHESIS - Creating unified implementation guide...\n');

const synthesisPrompt = `
Synthesize the best implementation plan from all AI contributions.

JUDGE VERDICT:
${judgeResult[0]?.text}

CLAUDE PLAN:
${sequentialPlans[0]?.text?.substring(0, 2000)}

GPT PLAN:
${sequentialPlans[1]?.text?.substring(0, 2000)}

DEEPSEEK PLAN:
${sequentialPlans[2]?.text?.substring(0, 2000)}

Create a FINAL, UNIFIED implementation guide that:
1. Combines best elements from all three plans
2. Eliminates redundancy
3. Orders steps logically
4. Provides exact PowerShell commands
5. Includes validation and troubleshooting
6. Has clear success criteria

Make it ready to execute immediately. Format as a complete markdown document.
`;

const synthesis = await askAllAIs({
  prompt: synthesisPrompt,
  tags: ['development-plan', 'synthesis', 'final'],
  models: ['claude']
});

// Save final synthesis
await fs.writeFile(
  path.join(OUTPUT_DIR, '04-FINAL-IMPLEMENTATION-PLAN.md'),
  `# Final Implementation Plan - AI-Optimized

**Generated:** ${new Date().toISOString()}
**Winning Approach:** Based on ${judgeResult[0]?.text?.match(/WINNER: (\w+)/)?.[1] || 'consensus'}

---

${synthesis[0]?.text || 'Error generating synthesis'}

---

## Full AI Collaboration Trail

See the following files for complete analysis:
- \`01-scrutiny-proposals.json\` - Initial optimization proposals from all AIs
- \`02-debate-results.json\` - Debate between top 2 approaches
- \`03-implementation-plan.json\` - Sequential planning by Claude→GPT→DeepSeek
- \`04-FINAL-IMPLEMENTATION-PLAN.md\` - This unified guide
`
);

console.log('\n✅ SYNTHESIS COMPLETE!\n');
console.log('='.repeat(80));
console.log('\n📁 All results saved to:', OUTPUT_DIR);
console.log('\n📄 Ready to execute:');
console.log(`   ${path.join(OUTPUT_DIR, '04-FINAL-IMPLEMENTATION-PLAN.md')}`);
console.log('\n🎉 Multi-AI orchestration complete!\n');

// Display final plan preview
console.log('\n📋 FINAL PLAN PREVIEW:\n');
console.log('-'.repeat(80));
console.log(synthesis[0]?.text?.substring(0, 1000) || synthesis[0]?.error);
console.log('-'.repeat(80));
console.log('\n[See full plan in 04-FINAL-IMPLEMENTATION-PLAN.md]\n');
