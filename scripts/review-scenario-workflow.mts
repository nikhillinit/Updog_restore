/**
 * Review Scenario Analysis Workflow with Multi-AI Orchestrator
 *
 * Queries GPT-4, Gemini 2.5 Pro, and DeepSeek for stability assessment
 *
 * IMPORTANT: Use .mts extension and dynamic import to load env vars BEFORE orchestrator
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local BEFORE importing orchestrator
config({ path: resolve(process.cwd(), '.env.local') });

// Verify env vars are loaded
console.log('🔑 API Keys Status:');
console.log(`   OPENAI: ${process.env.OPENAI_API_KEY ? '✅ Loaded' : '❌ Missing'}`);
console.log(`   GOOGLE: ${process.env.GOOGLE_API_KEY ? '✅ Loaded' : '❌ Missing'}`);
console.log(`   DEEPSEEK: ${process.env.DEEPSEEK_API_KEY ? '✅ Loaded' : '❌ Missing'}\n`);

// Dynamic import AFTER env vars are set
const { askAllAIs } = await import('../server/services/ai-orchestrator.js');

const WORKFLOW_PROMPT = `You are a senior software architect reviewing a Scenario Analysis integration plan for a VC fund management platform.

**Context:**
This is a TypeScript/React application with:
- Frontend: React 18, Vite, TanStack Query, shadcn/ui, Recharts
- Backend: Express.js, PostgreSQL, Drizzle ORM
- Existing features: DeterministicReserveEngine (reserves allocation), FundProvider context, scenario builder with hardcoded data
- Brand: Inter/Poppins fonts, charcoal/beige palette, decimal.js for precision math

**The Proposed Workflow:**

The plan integrates a **Scenario Analysis** feature with two main tabs:

### Tab 1: Portfolio View (Construction vs Actual vs Current)
- **ComparisonDashboard**: KPI cards showing Construction/Current/Δ for investments, capital, MOIC, IRR
- **ComparisonChart**: Stacked bar chart (Recharts) comparing Construction/Actual/Current across entry rounds
- **ComparisonTable**: Sortable variance table with Δ($) and Δ(%) columns, CSV export
- **API**: \`GET /api/funds/:fundId/portfolio-analysis?metric=&forecast_view=&time_bucket=\`

### Tab 2: Deal Modeling View (Scenario Cases + Weighted Analysis)
- **InvestmentTimeline**: Visual timeline of actual vs projected rounds
- **ScenarioManager**: Case editor with probability validation (sum must = 100%, with auto-normalize option)
- **WeightedCaseAnalysisTable**: Shows per-case MOIC + weighted row using Σ(value × probability)
- **ReservesOptimizationDrawer**: Integrates with existing DeterministicReserveEngine
- **API**:
  - \`GET /api/companies/:companyId/scenario-analysis?scenario_id=&include=rounds,cases,weighted_summary\`
  - \`PUT /api/companies/:companyId/scenario-analysis\` (upsert cases with validation)
  - \`POST /api/companies/:companyId/reserves/optimize\` (calls existing reserve engine)

### Key Technical Decisions:
1. **Math utilities** (\`shared/utils/scenario-math.ts\`): \`safeDiv\`, \`deltas\`, \`weighted\`, \`normalizeProbabilities\` using decimal.js
2. **Shared types** (\`shared/types/scenario.ts\`): \`ComparisonRow\`, \`ScenarioCase\`, \`WeightedSummary\`
3. **Database**: New tables \`scenarios\` and \`scenario_cases\`
4. **Validation**: Probability sum checking (soft warning + auto-normalize, optional strict mode)
5. **Navigation**: Replace \`/scenario-builder\` with \`/scenario-analysis\` in sidebar
6. **Bundle optimization**: Lazy load chart components

### Deployment Strategy:
8-phase rollout over 5 weeks (Backend → Portfolio View → Deal View → Reserves optimization → Polish)

---

**Your Task:**

Please analyze this workflow for **stability, scalability, and potential risks**. Focus on:

1. **Architecture Soundness**
   - Is the API design RESTful and maintainable?
   - Are the data flows (React → TanStack Query → Express → DB) properly structured?
   - Does the shared types strategy reduce coupling effectively?
   - Are there any circular dependency risks?

2. **Data Integrity & Math Precision**
   - Is decimal.js usage appropriate for all financial calculations?
   - Are there edge cases in division-by-zero handling?
   - Is the weighted aggregation formula correct?
   - Could probability normalization cause precision drift?

3. **Performance & Scalability**
   - Will the portfolio-analysis endpoint scale with 100+ companies?
   - Are there N+1 query risks in the deal modeling view?
   - Is lazy loading sufficient for bundle size management?
   - Should caching be added (React Query cache config, server-side)?

4. **Integration Risks**
   - Does the DeterministicReserveEngine integration introduce tight coupling?
   - Are there potential conflicts with the existing scenario builder?
   - Could the database schema changes break existing features?
   - Is the migration path from current → new scenario-analysis safe?

5. **UX & Validation Concerns**
   - Is the probability sum validation UX confusing (soft warning vs strict mode)?
   - Are there race conditions in the PUT /scenario-analysis endpoint?
   - Could the Δ(%) calculation mislead users when construction = 0?
   - Is CSV export prone to formatting issues with decimals?

6. **Testing & Monitoring**
   - Are the proposed test cases comprehensive enough?
   - What monitoring/observability should be added?
   - Are there rollback strategies if a phase fails?

7. **Missing Considerations**
   - Are there security concerns (authorization for scenario editing)?
   - Is audit logging needed for scenario changes?
   - Should there be versioning for scenario snapshots?
   - Are there accessibility concerns (keyboard navigation, screen readers)?

**Deliverable:**
Provide a **stability assessment report** with:
- ✅ **Strengths**: What's well-designed
- ⚠️ **Warnings**: Potential issues that need mitigation
- 🔴 **Blockers**: Critical risks that must be addressed before proceeding
- 💡 **Recommendations**: Specific improvements to enhance stability

Be thorough but concise. Prioritize actionable feedback. Focus on the most critical 3-5 issues per category.`;

console.log('🤖 Starting Multi-AI Workflow Review...\n');
console.log('Models: GPT-4o, Gemini 2.5 Pro, DeepSeek\n');
console.log('═'.repeat(80) + '\n');

try {
  const results = await askAllAIs({
    prompt: WORKFLOW_PROMPT,
    tags: ['scenario-analysis', 'architecture-review', 'stability'],
    models: ['gpt', 'gemini', 'deepseek'], // Exclude Claude since you're Claude
  });

  for (const result of results) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📊 ${result.model.toUpperCase()} REVIEW`);
    console.log(`${'═'.repeat(80)}\n`);

    if (result.error) {
      console.log(`❌ Error: ${result.error}`);
    } else {
      console.log(result.text);
      if (result.usage) {
        console.log(`\n📈 Tokens: ${result.usage.total_tokens} | Cost: $${result.cost_usd?.toFixed(4)} | Time: ${result.elapsed_ms}ms`);
      }
    }
  }

  console.log(`\n${'═'.repeat(80)}`);
  console.log('✅ Multi-AI Review Complete');
  console.log(`${'═'.repeat(80)}\n`);

  // Summary
  const successful = results.filter(r => !r.error).length;
  const totalCost = results.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
  console.log(`\n📊 Summary:`);
  console.log(`   Successful: ${successful}/${results.length} models`);
  console.log(`   Total Cost: $${totalCost.toFixed(4)}`);
  console.log(`   Models: ${results.map(r => r.model).join(', ')}\n`);

} catch (error: any) {
  console.error('❌ Review failed:', error.message);
  process.exit(1);
}
