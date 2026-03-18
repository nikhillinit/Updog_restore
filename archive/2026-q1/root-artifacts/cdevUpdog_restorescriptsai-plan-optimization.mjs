import { askAllAIs } from '../server/services/ai-orchestrator.js';

const context = `
PROJECT: Press On Ventures Fund Modeling Platform
- TypeScript/React/Node.js venture capital fund modeling SaaS
- 38 TypeScript errors blocking build
- Missing dependencies (cross-env, eslint in sidecar, xlsx)
- Environment not configured (DATABASE_URL placeholder, Redis URL incorrect)
- Goal: Get to testable state for internal QA

CURRENT PLAN (3 phases, 90 min):
Phase 1: Dependency Resolution (20 min)
- Fix sidecar deps with ensure-complete-local.mjs
- Install cross-env, xlsx packages
- Verify with doctor script

Phase 2: TypeScript Error Resolution (40 min)
- Fix 38 TypeScript errors across 8+ files
- Missing exports, type mismatches, import errors
- Incremental verification after each fix

Phase 3: Environment & Testing (30 min)
- Configure .env.local with local Postgres + memory Redis
- Start Docker Compose infrastructure
- Run db:push for schema migration
- Full validation: check, lint, test, dev server

CONSTRAINTS:
- Windows environment (PowerShell available)
- Sidecar dependency system in place (tools_local/)
- Docker Compose ready
- Must preserve existing AI orchestrator and schema work
- Internal tool (no production deployment yet)

TASK: Scrutinize this plan and provide an OPTIMIZED version specifically for delivering a testable internal SaaS tool. Consider:
1. Risk mitigation strategies
2. Parallel execution opportunities
3. Faster paths to testable state
4. What can be deferred vs. critical path
5. Validation checkpoints
6. Rollback strategies

Provide a specific, actionable plan with clear phases and time estimates.
`;

async function main() {
  try {
    console.log('🤖 Requesting AI optimization proposals...\n');
    
    const results = await askAllAIs({
      prompt: context,
      tags: ['development-plan', 'optimization'],
      models: ['claude', 'gpt', 'gemini', 'deepseek']
    });
    
    console.log('\n📊 OPTIMIZATION PROPOSALS:\n');
    console.log('='.repeat(80));
    
    for (const result of results) {
      console.log(`\n🤖 ${result.model.toUpperCase()}`);
      console.log('-'.repeat(80));
      if (result.error) {
        console.log(`❌ Error: ${result.error}`);
      } else {
        console.log(result.text);
      }
      console.log('-'.repeat(80));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
