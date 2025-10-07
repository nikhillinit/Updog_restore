#!/usr/bin/env node
import { askAllAIs } from '../server/services/ai-orchestrator.ts';

console.log('🤖 Querying DeepSeek and Gemini for repo asset analysis...\n');

const prompt = `
Analyze this VC fund modeling platform repository for EXISTING ASSETS:

CONTEXT:
- Fund setup wizard exists (7 steps: general info, sectors, allocation, fees, waterfall, scenarios)
- Deterministic calculation engines exist: DeterministicReserveEngine, PacingEngine, XIRR calculator
- All engines have 100% test pass rates (136/136 tests passing)
- Portfolio/investment tracking UI exists
- Dashboard with metrics display exists
- Mode toggle (Construction/Current) exists via useFundToggle hook

YOUR TASK:
Review the codebase structure and provide:

1. **Calculation Assets Inventory:**
   - All existing engines, calculators, adapters (client & server)
   - Current integration points and data flow
   - Web Workers or background processing

2. **UI Component Inventory:**
   - Charts, tables, cards for data display
   - Dashboard components
   - Form components

3. **Progressive Calculation Strategy:**
   - How to trigger calculations AS USER FILLS WIZARD (not on submit)
   - Which calculations should run after each wizard step
   - How to show live feedback to user
   - Integration points in wizard state machine

4. **Connection Plan:**
   - Minimal changes needed to wire existing pieces
   - API endpoints to create/modify
   - State management updates

Focus on WHAT EXISTS and HOW TO CONNECT efficiently. Provide specific file paths and concrete recommendations.

Response format: Structured inventory with actionable recommendations.
`;

try {
  const results = await askAllAIs({
    prompt,
    models: ['gemini', 'deepseek'],
    tags: ['repo-analysis', 'asset-inventory', 'progressive-calculation'],
  });

  console.log('\n📊 ANALYSIS RESULTS:\n');
  console.log('='.repeat(80));

  results.forEach((result, idx) => {
    console.log(`\n🤖 ${result.model.toUpperCase()} Analysis:\n`);
    console.log(result.text);
    console.log('\n' + '-'.repeat(80));
  });

  console.log('\n✅ Analysis complete!');

  // Save results to file
  const fs = await import('fs');
  fs.writeFileSync(
    './temp/ai-repo-analysis.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\n💾 Results saved to: ./temp/ai-repo-analysis.json');

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
