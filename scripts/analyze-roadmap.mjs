#!/usr/bin/env node

/**
 * Roadmap Analysis Script
 * Queries all AI providers for comprehensive roadmap analysis
 */

// Load environment variables BEFORE any imports
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

// Dynamic import to ensure environment is loaded first
const { askAllAIs } = await import('../server/services/ai-orchestrator.ts');
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the analysis prompt
const promptPath = join(__dirname, '../temp/roadmap-analysis-prompt.md');
const prompt = readFileSync(promptPath, 'utf-8');

async function main() {
  console.log('🚀 Analyzing Components 1 & 2 Roadmap with all AI providers...\n');
  console.log('📋 Prompt length:', prompt.length, 'characters\n');

  try {
    const results = await askAllAIs({
      prompt,
      models: ['claude', 'gpt', 'gemini', 'deepseek'],
      tags: ['roadmap', 'analysis', 'risk-assessment', 'architecture']
    });

    console.log('\n' + '='.repeat(80));
    console.log('MULTI-AI ROADMAP ANALYSIS RESULTS');
    console.log('='.repeat(80) + '\n');

    for (const result of results) {
      console.log('\n' + '─'.repeat(80));
      console.log(`🤖 ${result.model.toUpperCase()}`);
      console.log('─'.repeat(80) + '\n');

      if (result.error) {
        console.log(`❌ ERROR: ${result.error}\n`);
      } else {
        console.log(result.text);
        console.log(`\n📊 Cost: $${result.cost_usd?.toFixed(4)} | ⏱️  Time: ${result.elapsed_ms}ms`);
        if (result.usage) {
          console.log(`📈 Tokens: ${result.usage.total_tokens} (${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out)`);
        }
      }
    }

    // Summary
    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);
    const totalCost = results.reduce((sum, r) => sum + (r.cost_usd || 0), 0);
    const avgTime = results.reduce((sum, r) => sum + (r.elapsed_ms || 0), 0) / results.length;

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Successful: ${successful.length}/${results.length}`);
    console.log(`❌ Failed: ${failed.length}/${results.length}`);
    console.log(`💰 Total Cost: $${totalCost.toFixed(4)}`);
    console.log(`⏱️  Average Time: ${avgTime.toFixed(0)}ms`);
    console.log('='.repeat(80) + '\n');

    // Extract key insights
    console.log('📊 KEY INSIGHTS SUMMARY');
    console.log('─'.repeat(80));

    const insights = extractKeyInsights(results);
    console.log(insights);

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function extractKeyInsights(results) {
  const insights = [];

  // Look for common themes across AI responses
  for (const result of results) {
    if (result.error || !result.text) continue;

    const text = result.text.toLowerCase();

    // Extract risk scores
    const riskMatch = text.match(/risk score[:\s]+(\d+)\/10/i);
    if (riskMatch) {
      insights.push(`${result.model}: Risk Score ${riskMatch[1]}/10`);
    }

    // Extract timeline confidence
    const timelineMatch = text.match(/timeline confidence[:\s]+(\d+)%/i);
    if (timelineMatch) {
      insights.push(`${result.model}: ${timelineMatch[1]}% timeline confidence`);
    }

    // Extract recommendation
    if (text.includes('proceed')) {
      insights.push(`${result.model}: ✅ PROCEED recommendation`);
    } else if (text.includes('modify')) {
      insights.push(`${result.model}: ⚠️ MODIFY recommendation`);
    } else if (text.includes('defer')) {
      insights.push(`${result.model}: ❌ DEFER recommendation`);
    }
  }

  return insights.length > 0
    ? insights.join('\n')
    : 'No structured insights extracted. See detailed analysis above.';
}

main();
