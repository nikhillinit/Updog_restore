#!/usr/bin/env node

/**
 * Collaborative Roadmap Refinement Script
 *
 * Each AI sequentially refines the roadmap based on their specialty:
 * 1. Claude (Architecture) - Overall structure and component design
 * 2. GPT (Best Practices) - Industry standards and systematic approaches
 * 3. Gemini (Technical Precision) - Type safety, mathematical accuracy, edge cases
 * 4. DeepSeek (Performance) - Optimization, scalability, efficiency
 *
 * Each AI receives the original plan + all previous refinements and adds their specialized improvements.
 */

// Load environment variables BEFORE any imports
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

// Dynamic import to ensure environment is loaded first
const { askAI } = await import('../server/services/ai-orchestrator.ts');
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// AI Specialties
const AI_PIPELINE = [
  {
    model: 'claude',
    specialty: 'Architecture & Component Design',
    focus: 'Overall structure, component boundaries, state management patterns, integration strategy',
    prompt_suffix: `
As an architecture specialist, review this roadmap and refine it with focus on:
- Component boundaries and responsibilities
- State management architecture (XState, React Context)
- Integration patterns between existing engines and new UI
- API design and data flow
- Error handling and resilience patterns

Provide your refined roadmap with architectural improvements. Keep the overall structure but add architectural details, patterns, and best practices.
`
  },
  {
    model: 'gpt',
    specialty: 'Best Practices & Systematic Approaches',
    focus: 'Industry standards, testing strategies, documentation, maintainability',
    prompt_suffix: `
As a best practices specialist, review the roadmap (including Claude's architectural refinements) and enhance it with:
- Industry-standard patterns and conventions
- Comprehensive testing strategies (unit, integration, E2E)
- Documentation requirements
- Code review checkpoints
- Maintainability and technical debt prevention
- Team collaboration workflows

Build on the previous refinements and add systematic approaches to ensure long-term maintainability.
`
  },
  {
    model: 'gemini',
    specialty: 'Technical Precision & Edge Cases',
    focus: 'Type safety, mathematical accuracy, error handling, edge cases',
    prompt_suffix: `
As a technical precision specialist, review the roadmap (including all previous refinements) and strengthen it with:
- Type safety guarantees (TypeScript strict mode compliance)
- Mathematical precision in financial calculations
- Edge case handling (null/undefined, boundary conditions, race conditions)
- Data validation and sanitization
- Error recovery strategies
- Performance edge cases

Add precise technical specifications and edge case handling to the refined roadmap.
`
  },
  {
    model: 'deepseek',
    specialty: 'Performance & Optimization',
    focus: 'Scalability, efficiency, bundle size, rendering performance',
    prompt_suffix: `
As a performance specialist, review the complete roadmap (including all previous refinements) and optimize it with:
- Performance bottleneck identification and mitigation
- Bundle size optimization strategies
- Rendering performance (React.memo, useMemo, lazy loading)
- Database query optimization
- Caching strategies (Redis, React Query)
- Scalability considerations

Finalize the roadmap with performance optimizations and scalability improvements.
`
  }
];

async function main() {
  console.log('🚀 Starting Collaborative Roadmap Refinement\n');
  console.log('Pipeline:');
  AI_PIPELINE.forEach((ai, idx) => {
    console.log(`  ${idx + 1}. ${ai.model.toUpperCase()} - ${ai.specialty}`);
  });
  console.log('\n' + '='.repeat(80) + '\n');

  // Load the initial roadmap
  const promptPath = join(__dirname, '../temp/roadmap-analysis-prompt.md');
  let currentRoadmap = readFileSync(promptPath, 'utf-8');

  const refinements = [];
  let totalCost = 0;
  let totalTime = 0;

  // Sequential refinement by each AI
  for (let i = 0; i < AI_PIPELINE.length; i++) {
    const ai = AI_PIPELINE[i];
    const isFirst = i === 0;
    const isLast = i === AI_PIPELINE.length - 1;

    console.log('─'.repeat(80));
    console.log(`🤖 ${ai.model.toUpperCase()}: ${ai.specialty}`);
    console.log(`   Focus: ${ai.focus}`);
    console.log('─'.repeat(80) + '\n');

    // Build prompt with context from previous refinements
    let prompt = '';

    if (isFirst) {
      // First AI sees original roadmap
      prompt = currentRoadmap + '\n\n' + ai.prompt_suffix;
    } else {
      // Subsequent AIs see original + all previous refinements
      prompt = `# Original Roadmap\n\n${currentRoadmap}\n\n`;
      prompt += `# Previous Refinements\n\n`;
      refinements.forEach((ref, idx) => {
        prompt += `## Refinement ${idx + 1}: ${AI_PIPELINE[idx].model.toUpperCase()} (${AI_PIPELINE[idx].specialty})\n\n`;
        prompt += ref + '\n\n';
      });
      prompt += ai.prompt_suffix;
    }

    try {
      console.log(`⏳ Querying ${ai.model}... (this may take 30-60 seconds)\n`);

      const result = await askAI({
        model: ai.model,
        prompt,
        tags: ['roadmap', 'refinement', ai.specialty.toLowerCase().replace(/ /g, '-')]
      });

      if (result.error) {
        console.error(`❌ ERROR: ${result.error}\n`);
        console.log(`⚠️  Skipping ${ai.model} refinement\n`);
        continue;
      }

      // Store refinement
      refinements.push(result.text);

      // Update stats
      totalCost += result.cost_usd || 0;
      totalTime += result.elapsed_ms || 0;

      // Display result
      console.log('✅ Refinement received:\n');
      console.log(result.text.substring(0, 500) + '...\n'); // Preview
      console.log(`📊 Cost: $${result.cost_usd?.toFixed(4)} | ⏱️  Time: ${result.elapsed_ms}ms`);
      if (result.usage) {
        console.log(`📈 Tokens: ${result.usage.total_tokens} (${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out)`);
      }
      console.log('');

      // Save intermediate result
      const intermediatePath = join(__dirname, `../temp/roadmap-refined-${i + 1}-${ai.model}.md`);
      writeFileSync(intermediatePath, result.text, 'utf-8');
      console.log(`💾 Saved to: ${intermediatePath}\n`);

    } catch (error) {
      console.error(`❌ Error querying ${ai.model}:`, error.message);
      console.log(`⚠️  Skipping ${ai.model} refinement\n`);
      continue;
    }
  }

  // Generate final consensus roadmap
  console.log('\n' + '='.repeat(80));
  console.log('📝 GENERATING FINAL CONSENSUS ROADMAP');
  console.log('='.repeat(80) + '\n');

  const finalRoadmap = generateConsensusRoadmap(currentRoadmap, refinements);

  // Save final roadmap
  const finalPath = join(__dirname, '../ROADMAP_COMPONENTS_1_2_FINAL.md');
  writeFileSync(finalPath, finalRoadmap, 'utf-8');

  console.log('✅ Final consensus roadmap generated!\n');
  console.log(`📄 Saved to: ${finalPath}\n`);

  // Summary
  console.log('='.repeat(80));
  console.log('REFINEMENT SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Successful refinements: ${refinements.length}/${AI_PIPELINE.length}`);
  console.log(`💰 Total Cost: $${totalCost.toFixed(4)}`);
  console.log(`⏱️  Total Time: ${(totalTime / 1000).toFixed(1)} seconds`);
  console.log(`📊 Average time per AI: ${(totalTime / refinements.length / 1000).toFixed(1)} seconds`);
  console.log('='.repeat(80) + '\n');

  console.log('🎯 Next Steps:');
  console.log('1. Review final roadmap: ROADMAP_COMPONENTS_1_2_FINAL.md');
  console.log('2. Review individual refinements: temp/roadmap-refined-*.md');
  console.log('3. Make go/no-go decision');
  console.log('4. Begin implementation or iterate on plan\n');
}

function generateConsensusRoadmap(originalRoadmap, refinements) {
  let consensus = `# FINAL CONSENSUS ROADMAP: Components 1 & 2\n`;
  consensus += `**Generated:** ${new Date().toISOString()}\n`;
  consensus += `**Refinements:** ${refinements.length} AI specialists\n\n`;
  consensus += `---\n\n`;

  consensus += `# Original Roadmap\n\n`;
  consensus += originalRoadmap + '\n\n';
  consensus += `---\n\n`;

  consensus += `# Collaborative Refinements\n\n`;
  consensus += `This roadmap has been sequentially refined by ${refinements.length} AI specialists, each adding their domain expertise:\n\n`;

  refinements.forEach((refinement, idx) => {
    const ai = AI_PIPELINE[idx];
    consensus += `## Refinement ${idx + 1}: ${ai.model.toUpperCase()} - ${ai.specialty}\n\n`;
    consensus += `**Focus:** ${ai.focus}\n\n`;
    consensus += refinement + '\n\n';
    consensus += `---\n\n`;
  });

  consensus += `# Implementation Guide\n\n`;
  consensus += `Use this final roadmap as your implementation guide. It incorporates:\n\n`;
  consensus += `- ✅ Architectural best practices (Claude)\n`;
  consensus += `- ✅ Industry standards and testing strategies (GPT)\n`;
  consensus += `- ✅ Technical precision and edge case handling (Gemini)\n`;
  consensus += `- ✅ Performance optimization and scalability (DeepSeek)\n\n`;
  consensus += `Each refinement builds on the previous one, creating a comprehensive, battle-tested plan.\n`;

  return consensus;
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
