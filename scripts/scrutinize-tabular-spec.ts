#!/usr/bin/env npx tsx
/**
 * Scrutinize Tabular Financial Modeling Specification using AI
 *
 * Usage:
 *   npx tsx scripts/scrutinize-tabular-spec.ts
 */

import { askAllAIs } from '../server/services/ai-orchestrator';
import fs from 'fs';

console.log('[AI] Engaging AI agents to scrutinize tabular financial modeling specification...\n');

const specSummary = `
TABULAR FINANCIAL MODELING SPECIFICATION - SCRUTINY REQUEST

OVERVIEW:
Proposal for Excel-like spreadsheet interface for VC fund modeling with:
- Formula-driven calculations (custom formula language)
- Time-series projections (quarterly/annual)
- Scenario analysis (best/base/worst case)
- Real-time calculation engine
- 6 core models: Fund Structure, Deployment, Portfolio, Cash Flow, Returns, Liquidity

TECHNICAL APPROACH:
- Custom formula parser (ANTLR/PEG.js)
- Dependency graph with topological sort
- React spreadsheet UI (editable cells)
- Backend calculation engine
- PostgreSQL for persistence
- 15-20 week timeline (3 phases)

CRITICAL QUESTIONS TO ANALYZE:

1. **Scope & Complexity:**
   - Is this too ambitious vs. the existing progressive wizard approach?
   - Does building a formula engine from scratch make sense?
   - Should we use existing libraries (formula.js, hot-formula-parser) instead?
   - Is the 15-20 week estimate realistic?

2. **Technical Decisions:**
   - Formula language: Custom vs. Excel-compatible vs. JavaScript expressions?
   - Dependency resolution: Build from scratch or use existing graph libraries?
   - UI: Build custom spreadsheet or use ag-Grid, Handsontable, or similar?
   - Circular dependency detection: How critical is this for MVP?

3. **User Experience:**
   - Do GPs actually want to write formulas, or do they prefer guided wizards?
   - Is spreadsheet UI intimidating vs. progressive calculation approach?
   - How does this integrate with existing wizard + dashboard?
   - Should tabular modeling be INSTEAD of or IN ADDITION to wizard?

4. **Integration with Existing Assets:**
   - How does this leverage 7 existing engines (DeterministicReserveEngine, etc.)?
   - Does this replace or complement the progressive wizard plan?
   - Can deterministic engines be exposed as formula functions?
   - How do we avoid rebuilding what exists?

5. **Prioritization:**
   - Should we implement progressive wizard FIRST (3-4 days) then tabular modeling?
   - Or go straight to tabular modeling (15-20 weeks)?
   - Can tabular modeling be phased more aggressively?
   - What's the minimal viable tabular interface?

PROVIDE:
- Critical analysis of scope/complexity
- Comparison: Tabular modeling vs. progressive wizard approach
- Recommendation: Which to build first, or hybrid approach?
- Technical risk assessment
- Timeline validation (15-20 weeks realistic?)
- Specific libraries/tools to evaluate
- What should be CUT from the spec to make it viable?

Be CRITICAL and HONEST. If this is over-engineered, say so. If there's a simpler path, recommend it.
`;

interface AIResult {
  model: string;
  text: string;
  usage?: { total_tokens: number };
  cost_usd?: number;
}

async function main() {
  try {
    const results: AIResult[] = await askAllAIs({
      prompt: specSummary,
      models: ['claude', 'gpt', 'gemini', 'deepseek'],
      tags: ['scrutiny', 'tabular-modeling', 'critical-analysis'],
    });

    console.log('\n[RESULTS] CRITICAL ANALYSIS RESULTS:\n');
    console.log('='.repeat(80));

    results.forEach((result) => {
      console.log(`\n[AI] ${result.model.toUpperCase()} Analysis:\n`);
      console.log(result.text);
      console.log('\n' + '-'.repeat(80));

      if (result.usage) {
        console.log(
          `Token usage: ${result.usage.total_tokens} | Cost: $${result.cost_usd?.toFixed(4) || '0'}`
        );
      }
    });

    console.log('\n[DONE] Scrutiny complete!');

    // Save results
    fs.mkdirSync('./temp', { recursive: true });
    fs.writeFileSync('./temp/tabular-spec-scrutiny.json', JSON.stringify(results, null, 2));
    console.log('\n[SAVED] Results saved to: ./temp/tabular-spec-scrutiny.json');
  } catch (error) {
    const err = error as Error;
    console.error('[ERROR]', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
